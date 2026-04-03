const { Telegraf, Markup } = require('telegraf');
const { botToken, webAppUrl } = require('./config');
const { startHandler } = require('./handlers/startHandler');
const { ordersHandler } = require('./handlers/ordersHandler');
const { supportHandler } = require('./handlers/supportHandler');
const {
  isAdmin, adminMenu, adminListProducts, adminListOrders,
  toggleProduct, toggleHit, deleteProduct, addProduct, continueAddProduct, selectCategory,
  startSetStock, continueSetStock
} = require('./handlers/adminHandler');
const { isSeller, sellerMenu, sellerListOrders, completeOrder, cancelOrder } = require('./handlers/sellerHandler');
const { startServer } = require('./server');

if (!botToken) {
  console.error('❌ BOT_TOKEN не найден в .env файле!');
  process.exit(1);
}

const bot = new Telegraf(botToken);

// Обработка необработанных ошибок чтобы бот не падал
bot.catch((err, ctx) => {
  console.error('❌ Ошибка бота:', err.message);
});

// /start
bot.command('start', startHandler);

// Админ команды
bot.command('admin', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  adminMenu(ctx);
});

bot.command('addproduct', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  addProduct(ctx);
});

bot.command('products', (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  adminListProducts(ctx);
});

// Команда продавца
bot.command('seller', (ctx) => {
  if (!isSeller(ctx)) return ctx.reply('❌ Нет доступа');
  sellerMenu(ctx);
});

// Кнопки продавца
bot.action('seller_new_orders', (ctx) => {
  ctx.answerCbQuery();
  if (!isSeller(ctx)) return ctx.reply('❌ Нет доступа');
  sellerListOrders(ctx, 'new');
});

bot.action('seller_done_orders', (ctx) => {
  ctx.answerCbQuery();
  if (!isSeller(ctx)) return ctx.reply('❌ Нет доступа');
  sellerListOrders(ctx, 'done');
});

bot.action('seller_all_orders', (ctx) => {
  ctx.answerCbQuery();
  if (!isSeller(ctx)) return ctx.reply('❌ Нет доступа');
  sellerListOrders(ctx, 'all');
});

bot.action('seller_back', (ctx) => {
  ctx.answerCbQuery();
  if (!isSeller(ctx)) return ctx.reply('❌ Нет доступа');
  sellerMenu(ctx);
});

bot.action(/seller_complete_(.+)/, (ctx) => {
  ctx.answerCbQuery();
  if (!isSeller(ctx)) return ctx.reply('❌ Нет доступа');
  completeOrder(ctx, ctx.match[1]);
});

bot.action(/seller_cancel_(.+)/, (ctx) => {
  ctx.answerCbQuery();
  if (!isSeller(ctx)) return ctx.reply('❌ Нет доступа');
  cancelOrder(ctx, ctx.match[1]);
});
bot.on('text', (ctx) => {
  if (ctx.message.text.startsWith('/')) return;
  if (continueSetStock(ctx)) return;
  continueAddProduct(ctx);
});

// Фото (для добавления картинки товара)
bot.on('photo', (ctx) => {
  continueAddProduct(ctx);
});

// Кнопки
bot.action('open_shop', (ctx) => {
  ctx.answerCbQuery();
  ctx.reply('Открываю магазин...', Markup.inlineKeyboard([
    Markup.button.webApp('🛒 Открыть магазин', webAppUrl)
  ]));
});

bot.action('my_orders', (ctx) => {
  ctx.answerCbQuery();
  ordersHandler(ctx);
});

bot.action('support', (ctx) => {
  ctx.answerCbQuery();
  supportHandler(ctx);
});

bot.action('back_to_menu', (ctx) => {
  ctx.answerCbQuery();
  startHandler(ctx);
});

// Админ кнопки
bot.action('admin_list', (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  adminListProducts(ctx);
});

bot.action('admin_add', (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  addProduct(ctx);
});

bot.action('admin_orders', (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  adminListOrders(ctx);
});

bot.action('admin_back', (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  adminMenu(ctx);
});

// Выбор категории при добавлении товара
bot.action(/cat_(.+)/, (ctx) => {
  ctx.answerCbQuery();
  selectCategory(ctx, ctx.match[1]);
});

bot.action(/admin_hit_(.+)/, (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  toggleHit(ctx, ctx.match[1]);
});

bot.action(/admin_toggle_(.+)/, (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  toggleProduct(ctx, ctx.match[1]);
});

bot.action(/admin_delete_(.+)/, (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  deleteProduct(ctx, ctx.match[1]);
});

bot.action(/admin_stock_(.+)/, (ctx) => {
  ctx.answerCbQuery();
  if (!isAdmin(ctx)) return ctx.reply('❌ Нет доступа');
  startSetStock(ctx, ctx.match[1]);
});

// Web App данные
bot.on('web_app_data', (ctx) => {
  console.log('📩 Получены данные из WebApp:', ctx.webAppData?.data);
  try {
    const data = JSON.parse(ctx.webAppData.data);
    const { items, totalAmount, gameUsername, userId } = data;

    // Сохраняем заказ
    const { createOrder } = require('./handlers/ordersHandler');
    const order = createOrder(
      ctx.from.id,
      items.map(i => `${i.name} x${i.qty}`),
      totalAmount,
      gameUsername
    );

    // Подтверждение пользователю
    ctx.reply(
      `✅ Заказ #${order.id} оформлен!\n\n` +
      `Товары:\n${items.map(i => `• ${i.name} x${i.qty} — ${i.price * i.qty} ₽`).join('\n')}\n\n` +
      `Итого: ${totalAmount} ₽\n` +
      `Игровой ник: ${gameUsername}\n\n` +
      `Ожидай — администратор свяжется с тобой!`
    );

    // Уведомление всем админам и продавцам
    const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
    const sellerIds = (process.env.SELLER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
    const notifyIds = [...new Set([...adminIds, ...sellerIds])];
    const user = ctx.from;
    const userName = user.username ? `@${user.username}` : user.first_name;
    const adminMsg =
      `🛒 Новый заказ #${order.id}!\n\n` +
      `👤 Покупатель: ${userName} (ID: ${user.id})\n` +
      `🎮 Игровой ник: ${gameUsername}\n\n` +
      `Товары:\n${items.map(i => `• ${i.name} x${i.qty} — ${i.price * i.qty} ₽`).join('\n')}\n\n` +
      `💰 Итого: ${totalAmount} ₽\n\n` +
      `Используй /seller для управления заказами`;

    notifyIds.forEach(id => {
      bot.telegram.sendMessage(id, adminMsg).catch(err => {
        console.error(`Не удалось отправить уведомление ${id}:`, err.message);
      });
    });

  } catch (err) {
    console.error('Ошибка обработки заказа:', err.message);
    ctx.reply('❌ Ошибка при оформлении заказа. Попробуй снова.');
  }
});

// Запуск
console.log('⏳ Запускаю бота...');
console.log('🔑 Токен:', botToken.slice(0, 10) + '...');

bot.launch()
  .then(() => {
    console.log('🤖 Бот запущен и работает! Не закрывай это окно.');
    startServer(bot);
  })
  .catch((err) => {
    console.error('❌ Ошибка запуска:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => { console.log('Останавливаю бота...'); bot.stop('SIGINT'); });
process.once('SIGTERM', () => { console.log('Останавливаю бота...'); bot.stop('SIGTERM'); });
