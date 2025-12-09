const express = require('express');
const AlertasService = require('../services/alertasService');
const { verificarAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener estado actual de tokens y alertas
router.get('/tokens', verificarAuth, async (req, res) => {
    try {
        const resultado = await AlertasService.verificarTokens(req.auth.empresa_id);
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json({
                error: resultado.error,
                mensaje: 'Error al verificar tokens'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de alertas de tokens:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Obtener historial de alertas
router.get('/historial', verificarAuth, async (req, res) => {
    try {
        const limite = req.query.limite ? parseInt(req.query.limite) : 10;
        
        const resultado = await AlertasService.obtenerHistorialAlertas(
            req.auth.empresa_id,
            limite
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            res.status(500).json({
                error: resultado.error,
                mensaje: 'Error al obtener historial de alertas'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de historial de alertas:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

module.exports = router;
