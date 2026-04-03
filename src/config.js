require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN,
  webAppUrl: process.env.WEB_APP_URL || 'https://your-domain.com',
  adminChatId: process.env.ADMIN_CHAT_ID,
  database: {
    type: 'json',
    path: './data/users.json',
    ordersPath: './data/orders.json'
  }
};
