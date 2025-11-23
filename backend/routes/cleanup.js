const express = require('express');
const CleanupService = require('../services/cleanupService');
const { verificarAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener estadísticas de limpieza
router.get('/stats', verificarAuth, async (req, res) => {
    try {
        const stats = await CleanupService.getCleanupStats();
        
        if (stats.error) {
            return res.status(500).json({
                error: 'cleanup_stats_error',
                mensaje: 'Error obteniendo estadísticas de limpieza.',
                details: stats.error
            });
        }
        
        res.json({
            success: true,
            estadisticas: stats
        });
        
    } catch (error) {
        console.error('Error obteniendo estadísticas de limpieza:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// Ejecutar limpieza manual completa (solo para administradores)
router.post('/run', verificarAuth, async (req, res) => {
    try {
        // En un sistema real, aquí verificaríamos que el usuario sea administrador
        // Por ahora, permitimos a cualquier usuario autenticado
        
        const results = await CleanupService.runFullCleanup();
        
        res.json({
            success: true,
            mensaje: 'Limpieza completa ejecutada exitosamente.',
            resultados: results
        });
        
    } catch (error) {
        console.error('Error ejecutando limpieza manual:', error);
        res.status(500).json({
            error: 'cleanup_error',
            mensaje: 'Error ejecutando limpieza manual.',
            details: error.message
        });
    }
});

// Limpiar solo sesiones inactivas
router.post('/sessions', verificarAuth, async (req, res) => {
    try {
        const AuthService = require('../services/authService');
        const cleaned = await AuthService.limpiarSesionesInactivas();
        
        res.json({
            success: true,
            mensaje: `${cleaned} sesiones inactivas limpiadas.`,
            sesiones_limpiadas: cleaned
        });
        
    } catch (error) {
        console.error('Error limpiando sesiones:', error);
        res.status(500).json({
            error: 'session_cleanup_error',
            mensaje: 'Error limpiando sesiones inactivas.',
            details: error.message
        });
    }
});

// Forzar reset mensual
router.post('/reset-monthly', verificarAuth, async (req, res) => {
    try {
        const TokenService = require('../services/tokenService');
        const result = await TokenService.resetearConsumoMensual();
        
        if (result.success) {
            res.json({
                success: true,
                mensaje: `Reset mensual completado: ${result.empresas_actualizadas} empresas actualizadas.`,
                empresas_actualizadas: result.empresas_actualizadas
            });
        } else {
            res.status(500).json({
                error: 'monthly_reset_error',
                mensaje: 'Error en reset mensual.',
                details: result.mensaje
            });
        }
        
    } catch (error) {
        console.error('Error en reset mensual:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

module.exports = router;