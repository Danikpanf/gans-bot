const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

const usersPath = path.join(__dirname, '../../data/users.json');

// Создание папки data если её нет
const dataDir = path.dirname(usersPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Загрузка пользователей
function loadUsers() {
  try {
    if (fs.existsSync(usersPath)) {
      return JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    }
  } catch (err) {
    console.error('Ошибка загрузки пользователей:', err);
  }
  return {};
}

// Сохранение пользователей
function saveUsers(users) {
  try {
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  } catch (err) {
    console.error('Ошибка сохранения пользователей:', err);
  }
}

// Регистрация пользователя
function registerUser(userId, username) {
  const users = loadUsers();
  if (!users[userId]) {
    users[userId] = {
      userId,
      username,
      registeredAt: new Date().toISOString(),
      orders: []
    };
    saveUsers(users);
    return true;
  }
  return false;
}

// Обработчик команды /start
function startHandler(ctx) {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  
  // Регистрация пользователя
  const isNewUser = registerUser(userId, username);
  
  const welcomeMessage = `
👋 Добро пожаловать в Solor Piece!

Если нужна помощь — нажми кнопку ниже.
  `;

  ctx.reply(welcomeMessage, Markup.inlineKeyboard([
    [Markup.button.callback('💬 Поддержка', 'support')]
  ]));
  
  if (isNewUser) {
    ctx.reply('✅ Вы успешно зарегистрированы!');
  }
}

module.exports = { startHandler, registerUser, loadUsers };
