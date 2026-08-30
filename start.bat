@echo off
chcp 65001 >nul
title 打工人账本
echo.
echo   正在启动打工人账本...
node "%~dp0server.js" %1
pause
