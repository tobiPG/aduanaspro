const express = require('express');
const ConfigService = require('../services/configService');
const { verificarAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener defaults de la empresa
router.get('/defaults', verificarAuth, async (req, res) => {
    try {
        const resultado = await ConfigService.obtenerDefaults(req.auth.empresa_id);
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json({
                error: resultado.error,
                mensaje: 'Error al obtener configuración'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de defaults:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Actualizar todos los defaults
router.put('/defaults', verificarAuth, async (req, res) => {
    try {
        const nuevosDefaults = req.body;
        
        const resultado = await ConfigService.actualizarDefaults(
            req.auth.empresa_id,
            nuevosDefaults
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 :
                              resultado.error === 'invalid_format' || 
                              resultado.error === 'validation_error' ? 400 : 500;
            res.status(statusCode).json({
                error: resultado.error,
                mensaje: resultado.error === 'validation_error' 
                    ? resultado.errores.join(', ')
                    : 'Error al actualizar configuración',
                errores: resultado.errores
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de actualización de defaults:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Actualizar un campo específico
router.patch('/defaults/:campo', verificarAuth, async (req, res) => {
    try {
        const { campo } = req.params;
        const { valor } = req.body;
        
        if (valor === undefined) {
            return res.status(400).json({
                error: 'missing_value',
                mensaje: 'Se requiere el campo "valor" en el body'
            });
        }
        
        const resultado = await ConfigService.actualizarCampoDefault(
            req.auth.empresa_id,
            campo,
            valor
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json({
                error: resultado.error,
                mensaje: 'Error al actualizar campo'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de actualización de campo:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Eliminar un campo específico
router.delete('/defaults/:campo', verificarAuth, async (req, res) => {
    try {
        const { campo } = req.params;
        
        const resultado = await ConfigService.eliminarCampoDefault(
            req.auth.empresa_id,
            campo
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json({
                error: resultado.error,
                mensaje: 'Error al eliminar campo'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de eliminación de campo:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

module.exports = router;
