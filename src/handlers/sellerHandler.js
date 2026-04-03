const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const ordersPath = path.join(__dirname, '../../data/orders.json');

function isSeller(ctx) {
  const sellerIds = (process.env.SELLER_IDS || '').split(',').map(id => id.trim());
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  return sellerIds.includes(String(ctx.from.id)) || adminIds.includes(String(ctx.from.id));
}

function loadOrders() {
  try {
    if (fs.existsSync(ordersPath)) {
      return JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    }
  } catch (err) {
    console.error('Ошибка загрузки заказов:', err);
  }
  return [];
}

function saveOrders(orders) {
  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
}

function sellerMenu(ctx) {
  ctx.reply('🏪 Панель продавца', Markup.inlineKeyboard([
    [Markup.button.callback('📦 Новые заказы', 'seller_new_orders')],
    [Markup.button.callback('✅ Выполненные заказы', 'seller_done_orders')],
    [Markup.button.callback('📋 Все заказы', 'seller_all_orders')],
  ]));
}

function sellerListOrders(ctx, filter) {
  const orders = loadOrders();

  const filtered = filter === 'all'
    ? orders
    : filter === 'new'
      ? orders.filter(o => o.status === 'В обработке')
      : orders.filter(o => o.status === 'Выполнен');

  if (filtered.length === 0) {
    ctx.reply('📭 Заказов нет.', Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'seller_back')]]));
    return;
  }

  // Отправляем каждый заказ отдельным сообщением с кнопками управления
  filtered.slice(-10).forEach(order => {
    const statusEmoji = { 'В обработке': '⏳', 'Выполнен': '✅', 'Отменен': '❌' }[order.status] || '❓';
    const msg =
      `${statusEmoji} Заказ #${order.id}\n` +
      `👤 ID покупателя: ${order.userId}\n` +
      `🎮 Ник: ${order.gameUsername}\n` +
      `🛒 Товары: ${order.items.join(', ')}\n` +
      `💰 Сумма: ${order.totalAmount} ₽\n` +
      `📅 Дата: ${new Date(order.createdAt).toLocaleDateString('ru-RU')}\n` +
      `Статус: ${order.status}`;

    const buttons = [];
    if (order.status === 'В обработке') {
      buttons.push([
        Markup.button.callback('✅ Выполнен', `seller_complete_${order.id}`),
        Markup.button.callback('❌ Отменить', `seller_cancel_${order.id}`)
      ]);
    }
    buttons.push([Markup.button.callback('⬅️ Назад', 'seller_back')]);

    ctx.reply(msg, Markup.inlineKeyboard(buttons));
  });
}

function completeOrder(ctx, orderId) {
  const orders = loadOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) { ctx.reply('Заказ не найден'); return; }
  order.status = 'Выполнен';
  saveOrders(orders);
  ctx.reply(`✅ Заказ #${orderId} отмечен как выполненный!`);
}

function cancelOrder(ctx, orderId) {
  const orders = loadOrders();
  const order = orders.find(o => o.id === orderId);
  if (!order) { ctx.reply('Заказ не найден'); return; }
  order.status = 'Отменен';
  saveOrders(orders);
  ctx.reply(`❌ Заказ #${orderId} отменён.`);
}

module.exports = { isSeller, sellerMenu, sellerListOrders, completeOrder, cancelOrder };
