const fs = require('fs');
const path = require('path');

const botProductsPath = path.join(__dirname, '../data/products.json');
const webAppProductsPath = path.join(__dirname, '../../web-app/public/products.json');

try {
  const products = fs.readFileSync(botProductsPath, 'utf8');
  fs.writeFileSync(webAppProductsPath, products);
  console.log('✅ Товары синхронизированы!');
} catch (err) {
  console.error('❌ Ошибка синхронизации:', err.message);
}
