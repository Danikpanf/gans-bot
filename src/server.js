const http = require('http');
const { loadOrders } = require('./handlers/ordersHandler');
const fs = require('fs');
const path = require('path');

const ordersPath = path.join(__dirname, '../data/orders.json');

function saveOrders(orders) {
  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
}

function createOrderDirect(userId, items, totalAmount, gameUsername) {
  let orders = [];
  try {
    if (fs.existsSync(ordersPath)) {
      orders = JSON.parse(fs.readFileSync(ordersPath, 'utf8'));
    }
  } catch (e) {}

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
  return newOrder;
}

function startServer(bot) {
  const server = http.createServer((req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check для Railway
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, status: 'running' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/products') {
      try {
        const data = fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/order') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { items, totalAmount, gameUsername, userId, userName } = data;

          const order = createOrderDirect(
            userId,
            items.map(i => `${i.name} x${i.qty}`),
            totalAmount,
            gameUsername
          );

          // Подтверждение покупателю
          if (userId && userId !== 'unknown') {
            bot.telegram.sendMessage(userId,
              `✅ Заказ #${order.id} оформлен!\n\n` +
              `Товары:\n${items.map(i => `• ${i.name} x${i.qty} — ${i.price * i.qty} ₽`).join('\n')}\n\n` +
              `Итого: ${totalAmount} ₽\n` +
              `Игровой ник: ${gameUsername}\n\n` +
              `Ожидай — администратор свяжется с тобой!`
            ).catch(e => console.error('Ошибка отправки покупателю:', e.message));
          }

          // Уведомление админам и продавцам
          const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
          const sellerIds = (process.env.SELLER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
          const notifyIds = [...new Set([...adminIds, ...sellerIds])];

          const adminMsg =
            `🛒 Новый заказ #${order.id}!\n\n` +
            `👤 Покупатель: ${userName || 'Неизвестен'} (ID: ${userId})\n` +
            `🎮 Игровой ник: ${gameUsername}\n\n` +
            `Товары:\n${items.map(i => `• ${i.name} x${i.qty} — ${i.price * i.qty} ₽`).join('\n')}\n\n` +
            `💰 Итого: ${totalAmount} ₽\n\n` +
            `Используй /seller для управления заказами`;

          notifyIds.forEach(id => {
            bot.telegram.sendMessage(id, adminMsg).catch(e => {
              console.error(`Ошибка отправки уведомления ${id}:`, e.message);
            });
          });

          console.log(`📦 Новый заказ #${order.id} от ${userId}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, orderId: order.id }));
        } catch (e) {
          console.error('Ошибка обработки заказа:', e.message);
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const PORT = process.env.PORT || 3002;
  server.listen(PORT, () => {
    console.log(`🌐 API сервер запущен на порту ${PORT}`);
  });
}

module.exports = { startServer };
