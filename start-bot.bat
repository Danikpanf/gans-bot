@echo off
cd /d "C:\Users\Danik\Desktop\бот ганс\bot"
pm2 start src/bot.js --name "solor-bot"
pm2 save
