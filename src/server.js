const http = require('http');
const https = require('https');
const { URL } = require('url');
const { createOrder } = require('./handlers/ordersHandler');
const { formatSellerNotification, sumQty } = require('./orderMessageHelpers');
const fs = require('fs');
const path = require('path');

function httpsGetBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      const chunks = [];
      r.on('data', c => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

/** Убираем из API ссылки с токеном бота — картинки грузим через /tg-photo по fileId */
function sanitizeProductsJson(raw) {
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return raw;
    const next = list.map((p) => {
      const img = p.image && String(p.image).includes('api.telegram.org/file/bot');
      return img ? { ...p, image: null } : p;
    });
    return JSON.stringify(next);
  } catch {
    return raw;
  }
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

    // Прокси картинок из Telegram по fileId
    if (req.method === 'GET' && req.url.startsWith('/tg-photo')) {
      const fileId = new URL(req.url, 'http://localhost').searchParams.get('file_id');
      if (!fileId) { res.writeHead(400); res.end(); return; }
      const BOT_TOKEN = process.env.BOT_TOKEN;
      https.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`, (r) => {
        let data = '';
        r.on('data', c => data += c);
        r.on('end', () => {
          try {
            const { result } = JSON.parse(data);
            if (!result?.file_path) { res.writeHead(404); res.end(); return; }
            const imgUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${result.file_path}`;
            https.get(imgUrl, (imgRes) => {
              res.writeHead(200, { 'Content-Type': imgRes.headers['content-type'] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
              imgRes.pipe(res);
            }).on('error', () => { res.writeHead(500); res.end(); });
          } catch { res.writeHead(500); res.end(); }
        });
      }).on('error', () => { res.writeHead(500); res.end(); });
      return;
    }

    // Проверка промокода
    if (req.method === 'POST' && req.url === '/promo/check') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { code } = JSON.parse(body);
          const promoPath = path.join(__dirname, '../data/promo_codes.json');
          const promos = JSON.parse(fs.existsSync(promoPath) ? fs.readFileSync(promoPath, 'utf8') : '[]');
          const promo = promos.find(p => p.code === code.trim().toUpperCase());
          if (!promo) { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'Промокод не найден' })); return; }
          if (promo.used >= promo.limit) { res.writeHead(200); res.end(JSON.stringify({ ok: false, error: 'Промокод исчерпан' })); return; }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, discount: promo.discount, remaining: promo.limit - promo.used }));
        } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    // Использование промокода (вызывается при оформлении заказа)
    if (req.method === 'POST' && req.url === '/promo/use') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          const { code } = JSON.parse(body);
          const promoPath = path.join(__dirname, '../data/promo_codes.json');
          const promos = JSON.parse(fs.existsSync(promoPath) ? fs.readFileSync(promoPath, 'utf8') : '[]');
          const promo = promos.find(p => p.code === code.trim().toUpperCase());
          if (!promo || promo.used >= promo.limit) { res.writeHead(200); res.end(JSON.stringify({ ok: false })); return; }
          promo.used += 1;
          fs.writeFileSync(promoPath, JSON.stringify(promos, null, 2));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, remaining: promo.limit - promo.used }));
        } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
      });
      return;
    }

    // Список промокодов (для админа)
    if (req.method === 'GET' && req.url === '/promo/list') {
      try {
        const promoPath = path.join(__dirname, '../data/promo_codes.json');
        const promos = JSON.parse(fs.existsSync(promoPath) ? fs.readFileSync(promoPath, 'utf8') : '[]');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(promos));
      } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: e.message })); }
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

    if (req.method === 'GET' && req.url.startsWith('/tg-photo')) {
      (async () => {
        try {
          const u = new URL(req.url, 'http://localhost');
          const fileId = u.searchParams.get('file_id');
          const token = process.env.BOT_TOKEN;
          if (!fileId || !token) {
            res.writeHead(fileId ? 500 : 400);
            res.end();
            return;
          }
          const meta = await httpsGetBuffer(
            `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
          );
          if (meta.status !== 200) {
            res.writeHead(502);
            res.end();
            return;
          }
          let json;
          try {
            json = JSON.parse(meta.body.toString('utf8'));
          } catch {
            res.writeHead(502);
            res.end();
            return;
          }
          if (!json.ok || !json.result?.file_path) {
            res.writeHead(404);
            res.end();
            return;
          }
          const fileUrl = `https://api.telegram.org/file/bot${token}/${json.result.file_path}`;
          const fileRes = await httpsGetBuffer(fileUrl);
          if (fileRes.status !== 200) {
            res.writeHead(fileRes.status === 404 ? 404 : 502);
            res.end();
            return;
          }
          const ct = fileRes.headers['content-type'] || 'image/jpeg';
          res.writeHead(200, {
            'Content-Type': ct,
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(fileRes.body);
        } catch {
          if (!res.writableEnded) {
            res.writeHead(502);
            res.end();
          }
        }
      })();
      return;
    }

    if (req.method === 'GET' && req.url === '/products') {
      try {
        const data = fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(sanitizeProductsJson(data));
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
