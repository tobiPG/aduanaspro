@echo off
title Servidor Aduanas Pro - Puerto 3050
cd /d "%~dp0"
echo.
echo ========================================
echo   SERVIDOR ADUANAS PRO
echo   Puerto: 3050
echo ========================================
echo.
echo Iniciando servidor...
echo.
node server.js
echo.
echo El servidor se detuvo.
echo Presiona cualquier tecla para cerrar...
pause >nul
