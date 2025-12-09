const express = require('express');
const HistorialService = require('../services/historialService');
const { verificarAuth } = require('../middleware/auth');

const router = express.Router();

// Obtener historial con filtros y paginación
router.get('/', verificarAuth, async (req, res) => {
    try {
        const { pagina, limite, busqueda, tipo_operacion, desde, hasta } = req.query;
        
        console.log('📋 Cargando historial para empresa_id:', req.auth.empresa_id);
        
        const opciones = {
            pagina: pagina ? parseInt(pagina) : 1,
            limite: limite ? parseInt(limite) : 50,
            busqueda: busqueda || '',
            tipoOperacion: tipo_operacion || null,
            desde: desde || null,
            hasta: hasta || null
        };
        
        const resultado = await HistorialService.obtenerHistorial(
            req.auth.empresa_id,
            opciones
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            res.status(500).json({
                error: resultado.error,
                mensaje: 'Error al obtener el historial'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de historial:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Obtener una clasificación específica
router.get('/:clasificacion_id', verificarAuth, async (req, res) => {
    try {
        const { clasificacion_id } = req.params;
        
        const resultado = await HistorialService.obtenerClasificacion(
            clasificacion_id,
            req.auth.empresa_id
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            const statusCode = resultado.error === 'not_found' ? 404 : 500;
            res.status(statusCode).json({
                error: resultado.error,
                mensaje: resultado.error === 'not_found' 
                    ? 'Clasificación no encontrada' 
                    : 'Error al obtener la clasificación'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de clasificación:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Eliminar clasificación
router.delete('/:clasificacion_id', verificarAuth, async (req, res) => {
    try {
        const { clasificacion_id } = req.params;
        
        const resultado = await HistorialService.eliminarClasificacion(
            clasificacion_id,
            req.auth.empresa_id
        );
        
        if (resultado.success) {
            res.status(200).json({
                success: true,
                mensaje: 'Clasificación eliminada correctamente'
            });
        } else {
            res.status(500).json({
                error: 'delete_failed',
                mensaje: 'Error al eliminar la clasificación'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de eliminación:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Obtener estadísticas
router.get('/stats/resumen', verificarAuth, async (req, res) => {
    try {
        const resultado = await HistorialService.obtenerEstadisticas(
            req.auth.empresa_id
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            res.status(500).json({
                error: resultado.error,
                mensaje: 'Error al obtener estadísticas'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de estadísticas:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

module.exports = router;
