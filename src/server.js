const http = require('http');
const { createOrder } = require('./handlers/ordersHandler');
const { formatSellerNotification, sumQty } = require('./orderMessageHelpers');
const fs = require('fs');
const path = require('path');

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

    if (req.method === 'GET' && req.url === '/orders') {
      try {
        const ordersPath = path.join(__dirname, '../data/orders.json');
        const data = fs.existsSync(ordersPath) ? fs.readFileSync(ordersPath, 'utf8') : '[]';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/orders/update-status') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { orderId, status } = JSON.parse(body);
          const ordersPath = path.join(__dirname, '../data/orders.json');
          const orders = JSON.parse(fs.existsSync(ordersPath) ? fs.readFileSync(ordersPath, 'utf8') : '[]');
          const order = orders.find(o => o.id === orderId);
          if (order) order.status = status;
          fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
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

    if (req.method === 'POST' && req.url === '/update-stock') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { items } = JSON.parse(body);
          const productsPath = path.join(__dirname, '../data/products.json');
          const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
          items.forEach(item => {
            const product = products.find(p => p.id === item.id);
            if (product && product.stock !== null && product.stock !== undefined) {
              product.stock = Math.max(0, product.stock - item.qty);
            }
          });
          fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/webhook') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const update = JSON.parse(body);
          bot.handleUpdate(update);
          res.writeHead(200);
          res.end('ok');
        } catch (e) {
          res.writeHead(500);
          res.end();
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/order') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const { items, totalAmount, gameUsername, userId, userName, telegramUser } = data;
          if (!items || !Array.isArray(items)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'items (array) required' }));
            return;
          }

          const order = createOrder(
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

          // Уведомление админам
          const adminIds = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim()).filter(Boolean);

          const adminMsg =
            `🛒 Новый заказ #${order.id}!\n\n` +
            `👤 Покупатель: ${userName || 'Неизвестен'} (ID: ${userId})\n` +
            `🎮 Игровой ник: ${gameUsername}\n\n` +
            `Товары:\n${items.map(i => `• ${i.name} x${i.qty} — ${i.price * i.qty} ₽`).join('\n')}\n\n` +
            `💰 Итого: ${totalAmount} ₽\n\n` +
            `Используй /seller для управления заказами`;

          adminIds.forEach(id => {
            bot.telegram.sendMessage(id, adminMsg).catch(e => {
              console.error(`Ошибка отправки уведомления ${id}:`, e.message);
            });
          });

          // Уведомление конкретным продавцам товаров
          const sellerIds = (process.env.SELLER_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
          const notifiedSellers = new Set();
          const allOrderQty = sumQty(items);

          items.forEach(item => {
            const sellersToNotify = item.sellerNotify
              ? [item.sellerNotify]
              : sellerIds;

            sellersToNotify.forEach(sellerId => {
              if (!sellerId || notifiedSellers.has(sellerId) || adminIds.includes(sellerId)) return;
              notifiedSellers.add(sellerId);

              const sellerLines = items.filter(i =>
                item.sellerNotify ? i.sellerNotify === item.sellerNotify : true
              );
              const sellerMsg = formatSellerNotification({
                orderId: order.id,
                telegramUser,
                userId,
                userName,
                gameUsername,
                sellerLines,
                totalAmount,
                allOrderQty
              });

              bot.telegram.sendMessage(sellerId, sellerMsg).catch(e => {
                console.error(`Ошибка отправки продавцу ${sellerId}:`, e.message);
              });
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
      return;
    }

    res.writeHead(404);
    res.end();
  });

  const PORT = process.env.PORT || 3002;
  server.listen(PORT, () => {
    console.log(`🌐 API сервер запущен на порту ${PORT}`);
  });
}

module.exports = { startServer };
