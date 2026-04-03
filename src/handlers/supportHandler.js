const { Markup } = require('telegraf');

function supportHandler(ctx) {
  const supportMessage = `
💬 Поддержка

Если у вас возникли вопросы или проблемы, вы можете:
• Написать в наш чат поддержки
• Связаться с администратором
• Оставить заявку на решение проблемы

Нажмите на кнопку ниже, чтобы связаться с поддержкой:
  `;
  
  ctx.reply(supportMessage, Markup.inlineKeyboard([
    Markup.button.url('💬 Чат поддержки', 'https://t.me/solor_piece_support'),
    Markup.button.callback('⬅️ Назад', 'back_to_menu')
  ]));
}

module.exports = { supportHandler };
