# Script para iniciar el servidor de forma estable
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SERVIDOR ADUANAS PRO" -ForegroundColor Yellow
Write-Host "  Puerto: 3050" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Cambiar al directorio del script
Set-Location $PSScriptRoot

Write-Host "📂 Directorio: " -NoNewline
Write-Host (Get-Location) -ForegroundColor Green
Write-Host ""

Write-Host "🚀 Iniciando servidor..." -ForegroundColor Cyan
Write-Host "   (Presiona Ctrl+C para detener)" -ForegroundColor Gray
Write-Host ""

# Ejecutar servidor
try {
    node server.js
} catch {
    Write-Host ""
    Write-Host "❌ Error al iniciar servidor:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Presiona cualquier tecla para cerrar..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
