const fs = require('fs');
const path = require('path');
const { loadUsers } = require('./startHandler');

const ordersPath = path.join(__dirname, '../../data/orders.json');

// Создание папки data если её нет
const dataDir = path.dirname(ordersPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Загрузка заказов
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

// Сохранение заказов
function saveOrders(orders) {
  try {
    fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
  } catch (err) {
    console.error('Ошибка сохранения заказов:', err);
  }
}

// Создание нового заказа
function createOrder(userId, items, totalAmount, gameUsername) {
  const orders = loadOrders();
  const newOrder = {
    id: Date.now().toString(),
    userId,
    items,
    totalAmount,
    gameUsername,
    status: 'В обработке',
    createdAt: new Date().toISOString()
  };
  orders.push(newOrder);
  saveOrders(orders);
  
  // Обновление заказов у пользователя
  const users = loadUsers();
  if (users[userId]) {
    users[userId].orders.push(newOrder.id);
    // Сохранение пользователей происходит в startHandler
    fs.writeFileSync(path.join(__dirname, '../../data/users.json'), JSON.stringify(users, null, 2));
  }
  
  return newOrder;
}

// Получение заказов пользователя
function getUserOrders(userId) {
  const orders = loadOrders();
  return orders.filter(order => order.userId === userId);
}

// Обработчик кнопки "Мои заказы"
function ordersHandler(ctx) {
  const userId = ctx.from.id;
  const userOrders = getUserOrders(userId);
  
  if (userOrders.length === 0) {
    ctx.reply('📦 У вас пока нет заказов.');
    return;
  }
  
  let message = '📦 Ваши заказы:\n\n';
  
  userOrders.forEach(order => {
    const statusEmoji = {
      'В обработке': '⏳',
      'Выполнен': '✅',
      'Отменен': '❌'
    }[order.status] || '❓';
    
    message += `${statusEmoji} Заказ #${order.id}\n`;
    message += `Товары: ${order.items.join(', ')}\n`;
    message += `Сумма: ${order.totalAmount} ₽\n`;
    message += `Игровой ник: ${order.gameUsername}\n`;
    message += `Статус: ${order.status}\n`;
    message += `Создан: ${new Date(order.createdAt).toLocaleDateString('ru-RU')}\n\n`;
  });
  
  ctx.reply(message);
}

module.exports = { ordersHandler, createOrder, getUserOrders, loadOrders };
