const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const productsPath = path.join(__dirname, '../../data/products.json');
const ordersPath = path.join(__dirname, '../../data/orders.json');
const webAppProductsPath = path.join(__dirname, '../../../web-app/public/products.json');

const addingProductState = new Map();
const settingStockState = new Map();

function loadProducts() {
  try {
    if (fs.existsSync(productsPath)) {
      return JSON.parse(fs.readFileSync(productsPath, 'utf8'));
    }
  } catch (err) {
    console.error('Ошибка загрузки товаров:', err);
  }
  return [];
}

function saveProducts(products) {
  fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
  syncToWebApp();
}

function syncToWebApp() {
  try {
    const data = fs.readFileSync(productsPath, 'utf8');
    fs.writeFileSync(webAppProductsPath, data);
    console.log('✅ Синхронизировано с web-app');
  } catch (err) {
    console.error('⚠️ Ошибка синхронизации:', err.message);
  }
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

function isAdmin(ctx) {
  const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
  return adminIds.includes(String(ctx.from.id));
}

function adminMenu(ctx) {
  ctx.reply('⚙️ Админ-панель', Markup.inlineKeyboard([
    [Markup.button.callback('📋 Список товаров', 'admin_list')],
    [Markup.button.callback('➕ Добавить товар', 'admin_add')],
    [Markup.button.callback('📦 Все заказы', 'admin_orders')]
  ]));
}

function adminListOrders(ctx) {
  const orders = loadOrders();
  if (orders.length === 0) {
    ctx.reply('📦 Заказов пока нет.');
    return;
  }
  let message = '📦 Все заказы:\n\n';
  orders.forEach(order => {
    const statusEmoji = { 'В обработке': '⏳', 'Выполнен': '✅', 'Отменен': '❌' }[order.status] || '❓';
    message += `${statusEmoji} Заказ #${order.id}\n`;
    message += `Пользователь: ${order.userId}\n`;
    message += `Товары: ${order.items.join(', ')}\n`;
    message += `Сумма: ${order.totalAmount} ₽\n`;
    message += `Статус: ${order.status}\n`;
    message += `Создан: ${new Date(order.createdAt).toLocaleDateString('ru-RU')}\n\n`;
  });
  ctx.reply(message, Markup.inlineKeyboard([[Markup.button.callback('⬅️ Назад', 'admin_back')]]));
}

function adminListProducts(ctx) {
  const products = loadProducts();
  if (products.length === 0) {
    ctx.reply('Товаров нет. Добавь первый товар через кнопку "Добавить товар"');
    return;
  }
  let message = '📋 Список товаров:\n\n';
  products.forEach(p => {
    const hit = p.hit ? ' 🔥' : '';
    const stock = p.stock !== undefined ? `📦 В наличии: ${p.stock} шт.` : '📦 Наличие: не указано';
    message += `${p.active ? '✅' : '❌'} ID:${p.id} | ${p.name}${hit}\n`;
    message += `   Цена: ${p.price} ₽ | ${stock}\n\n`;
  });
  const buttons = products.flatMap(p => [
    [
      Markup.button.callback(`${p.active ? '❌ Скрыть' : '✅ Показать'} "${p.name.slice(0, 10)}"`, `admin_toggle_${p.id}`),
      Markup.button.callback(p.hit ? '🔥 Убрать хит' : '🔥 Хит', `admin_hit_${p.id}`),
      Markup.button.callback('🗑', `admin_delete_${p.id}`)
    ],
    [
      Markup.button.callback(`📦 Кол-во: ${p.stock ?? '?'} → изменить`, `admin_stock_${p.id}`)
    ]
  ]);
  ctx.reply(message, Markup.inlineKeyboard(buttons));
}

function toggleHit(ctx, productId) {
  const products = loadProducts();
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) { ctx.reply('Товар не найден'); return; }
  product.hit = !product.hit;
  saveProducts(products);
  ctx.reply(`${product.hit ? '🔥 Товар помечен как хит продаж' : '✅ Метка хит продаж убрана'}: ${product.name}`);
}

function toggleProduct(ctx, productId) {
  const products = loadProducts();
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) { ctx.reply('Товар не найден'); return; }
  product.active = !product.active;
  saveProducts(products);
  ctx.reply(`${product.active ? '✅ Товар показан' : '❌ Товар скрыт'}: ${product.name}`);
}

function startSetStock(ctx, productId) {
  const products = loadProducts();
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) { ctx.reply('Товар не найден'); return; }
  settingStockState.set(ctx.from.id, { productId: parseInt(productId) });
  const current = product.stock !== null && product.stock !== undefined ? product.stock : '∞';
  ctx.reply(`📦 Товар: ${product.name}\nТекущее количество: ${current}\n\nВведи новое количество (число или "∞" для неограниченного):`);
}

function continueSetStock(ctx) {
  const userId = ctx.from.id;
  const state = settingStockState.get(userId);
  if (!state) return false;
  const text = ctx.message?.text || '';
  if (text === '/cancel') {
    settingStockState.delete(userId);
    ctx.reply('❌ Отменено');
    return true;
  }
  let newStock;
  if (text === '∞' || text.toLowerCase() === 'inf') {
    newStock = null;
  } else {
    newStock = parseInt(text);
    if (isNaN(newStock) || newStock < 0) {
      ctx.reply('❌ Введи число или "∞". Попробуй снова:');
      return true;
    }
  }
  const products = loadProducts();
  const product = products.find(p => p.id === state.productId);
  if (!product) { settingStockState.delete(userId); ctx.reply('Товар не найден'); return true; }
  product.stock = newStock;
  saveProducts(products);
  settingStockState.delete(userId);
  ctx.reply(`✅ Количество обновлено!\n${product.name}: ${newStock !== null ? newStock + ' шт.' : '∞ (неограниченно)'}`,
    Markup.inlineKeyboard([[Markup.button.callback('📋 Список товаров', 'admin_list')]])
  );
  return true;
}

function deleteProduct(ctx, productId) {
  const products = loadProducts();
  const index = products.findIndex(p => p.id === parseInt(productId));
  if (index === -1) { ctx.reply('Товар не найден'); return; }
  const name = products[index].name;
  products.splice(index, 1);
  saveProducts(products);
  ctx.reply(`🗑 Товар удалён: ${name}`);
}

function startAddProduct(ctx) {
  addingProductState.set(ctx.from.id, { step: 'name' });
  ctx.reply('📝 Отправь название товара:\n(или /cancel для отмены)');
}

function continueAddProduct(ctx) {
  const userId = ctx.from.id;
  const state = addingProductState.get(userId);
  if (!state) return false;

  const text = ctx.message?.text || '';
  const photo = ctx.message?.photo;

  if (text === '/cancel') {
    addingProductState.delete(userId);
    ctx.reply('❌ Добавление отменено');
    adminMenu(ctx);
    return true;
  }

  if (state.step === 'name') {
    state.name = text; state.step = 'price';
    ctx.reply('💰 Отправь цену (число):');
    return true;
  }
  if (state.step === 'price') {
    const price = parseInt(text);
    if (isNaN(price) || price < 0) { ctx.reply('❌ Цена должна быть числом. Попробуй снова:'); return true; }
    state.price = price; state.step = 'description';
    ctx.reply('📝 Отправь описание:');
    return true;
  }
  if (state.step === 'description') {
    state.description = text; state.step = 'seller';
    ctx.reply('👤 Укажи ID или @username продавца для этого товара:\n(например: 7341189557 или @username)\nИли напиши "нет" если уведомлять всех продавцов');
    return true;
  }
  if (state.step === 'seller') {
    state.sellerNotify = text.toLowerCase() === 'нет' ? null : text.replace('@', '').trim();
    state.step = 'stock';
    ctx.reply('📦 Укажи количество товара в наличии (число):\n(или напиши "∞" для неограниченного количества)');
    return true;
  }
  if (state.step === 'stock') {
    if (text === '∞' || text.toLowerCase() === 'inf') {
      state.stock = null;
    } else {
      const stock = parseInt(text);
      if (isNaN(stock) || stock < 0) { ctx.reply('❌ Введи число или "∞". Попробуй снова:'); return true; }
      state.stock = stock;
    }
    state.step = 'image';
    ctx.reply('🖼 Отправь картинку товара или эмодзи (например ⚔️):\n(можно отправить фото или просто написать эмодзи)');
    return true;
  }
  if (state.step === 'image') {
    if (photo && photo.length > 0) {
      state.fileId = photo[photo.length - 1].file_id;
      state.emoji = null;
    } else {
      state.emoji = text;
      state.fileId = null;
    }
    state.step = 'type';
    ctx.reply('🏷 Выбери категорию товара:', Markup.inlineKeyboard([
      [Markup.button.callback('⚔️ Мечи', 'cat_sword'), Markup.button.callback('🥋 Стили боя', 'cat_style')],
      [Markup.button.callback('🎁 Предметы', 'cat_item'), Markup.button.callback('📦 Кейсы', 'cat_currency')]
    ]));
    return true;
  }
  if (state.step === 'type') {
    // тип устанавливается через callback кнопок, не через текст
    return false;
  }
  return false;
}

function finishAddProduct(ctx, state) {
  const products = loadProducts();
  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  const newProduct = {
    id: newId,
    name: state.name,
    price: state.price,
    description: state.description,
    emoji: state.emoji || '🎁',
    image: state.fileId ? `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${state.fileId}` : null,
    fileId: state.fileId || null,
    type: state.type,
    sellerNotify: state.sellerNotify || null,
    stock: state.stock !== undefined ? state.stock : null,
    active: true
  };

  // Если есть фото — получаем реальный URL через Telegram API
  if (state.fileId) {
    const https = require('https');
    https.get(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${state.fileId}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.ok) {
            newProduct.image = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${result.result.file_path}`;
          }
        } catch (e) {}
        products.push(newProduct);
        saveProducts(products);
      });
    }).on('error', () => {
      products.push(newProduct);
      saveProducts(products);
    });
  } else {
    products.push(newProduct);
    saveProducts(products);
  }

  ctx.reply(
    `✅ Товар добавлен!\n\nID: ${newProduct.id}\nНазвание: ${newProduct.name}\nЦена: ${newProduct.price} ₽\nТип: ${newProduct.type}`,
    Markup.inlineKeyboard([[Markup.button.callback('📋 Список товаров', 'admin_list')]])
  );
}

function addProduct(ctx) {
  if (ctx.callbackQuery) { startAddProduct(ctx); return; }
  const params = (ctx.message?.text || '').replace('/addproduct', '').trim();
  if (params) {
    const parts = params.split('|').map(s => s.trim());
    if (parts.length < 3) {
      ctx.reply('❌ Формат: /addproduct Название | Цена | Описание | Эмодзи | Тип');
      return;
    }
    const products = loadProducts();
    const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
    const newProduct = { id: newId, name: parts[0], price: parseInt(parts[1]) || 0, description: parts[2] || '', emoji: parts[3] || '🎁', type: parts[4] || 'item', active: true };
    products.push(newProduct);
    saveProducts(products);
    ctx.reply(`✅ Товар добавлен: ${newProduct.name}`);
    return;
  }
  startAddProduct(ctx);
}

// Обработка выбора категории через кнопку
function selectCategory(ctx, type) {
  const userId = ctx.from.id;
  const state = addingProductState.get(userId);
  if (!state || state.step !== 'type') {
    ctx.reply('❌ Сначала начни добавление товара через /admin');
    return;
  }
  state.type = type;
  addingProductState.delete(userId);
  finishAddProduct(ctx, state);
}

module.exports = { isAdmin, adminMenu, adminListProducts, adminListOrders, toggleProduct, toggleHit, deleteProduct, addProduct, loadProducts, continueAddProduct, selectCategory, startSetStock, continueSetStock };
