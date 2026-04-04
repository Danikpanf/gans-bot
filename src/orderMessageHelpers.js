/** Текст блока «покупатель в Telegram» из initDataUnsafe.user или fallback */
function formatBuyerFromTelegram(telegramUser, userId, userName) {
  const lines = [];
  const id = telegramUser?.id != null ? telegramUser.id : userId;
  lines.push('📱 Покупатель в Telegram:');
  lines.push(`🆔 ID: ${id ?? 'неизвестно'}`);
  if (telegramUser?.username) lines.push(`📛 Username: @${telegramUser.username}`);
  const name = [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(' ').trim();
  if (name) lines.push(`👤 Имя: ${name}`);
  else if (userName && String(userName).trim()) lines.push(`👤 Отображаемое имя: ${userName}`);
  if (telegramUser?.language_code) lines.push(`🌐 Язык: ${telegramUser.language_code}`);
  if (telegramUser?.is_premium) lines.push('⭐ Telegram Premium');
  return lines.join('\n');
}

function sumQty(items) {
  return items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
}

/** Сообщение продавцу: Telegram-профиль, игровой ник, количества, список товаров, суммы */
function formatSellerNotification({
  orderId,
  telegramUser,
  userId,
  userName,
  gameUsername,
  sellerLines,
  totalAmount,
  allOrderQty
}) {
  const sellerSubtotal = sellerLines.reduce(
    (s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0),
    0
  );
  const sellerItemQty = sumQty(sellerLines);
  const cartTotalQty = allOrderQty != null ? allOrderQty : sellerItemQty;
  const buyer = formatBuyerFromTelegram(telegramUser, userId, userName);
  const itemsText = sellerLines
    .map(i => `• ${i.name} — ${i.qty} шт. × ${i.price} ₽ = ${i.price * i.qty} ₽`)
    .join('\n');
  const idPart = orderId != null ? ` #${orderId}` : '';

  return (
    `🔔 Новый заказ${idPart} (твой товар)!\n\n` +
    `${buyer}\n\n` +
    `🎮 Игровой ник (указал покупатель): ${gameUsername}\n\n` +
    `📦 Количество твоих позиций в заказе: ${sellerItemQty} шт.\n` +
    `📦 Всего единиц товара в корзине: ${cartTotalQty} шт.\n\n` +
    `🛒 Товары:\n${itemsText}\n\n` +
    `💰 По твоим товарам: ${sellerSubtotal} ₽\n` +
    `💰 Весь заказ (итого): ${totalAmount} ₽\n\n` +
    `Свяжись с покупателем и выдай товар!`
  );
}

module.exports = { formatBuyerFromTelegram, sumQty, formatSellerNotification };
