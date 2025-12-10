const express = require('express');
const AdminService = require('../services/adminService');
const { verificarAuthYAdmin } = require('../middleware/adminAuth');
const { strictLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Todas las rutas requieren autenticación de administrador
// ==================== DASHBOARD Y ESTADÍSTICAS ====================

/**
 * GET /api/admin/stats/global
 * Obtener estadísticas globales del sistema
 */
router.get('/stats/global', verificarAuthYAdmin, async (req, res) => {
    try {
        const resultado = await AdminService.obtenerEstadisticasGlobales();
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            res.status(500).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en /api/admin/stats/global:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * GET /api/admin/stats/graficas
 * Obtener datos para gráficas del dashboard
 * Query params: periodo (7d, 30d, 90d, 1y)
 */
router.get('/stats/graficas', verificarAuthYAdmin, async (req, res) => {
    try {
        const periodo = req.query.periodo || '30d';
        const resultado = await AdminService.obtenerDatosGraficas(periodo);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            res.status(500).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en /api/admin/stats/graficas:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// ==================== GESTIÓN DE EMPRESAS ====================

/**
 * GET /api/admin/empresas
 * Listar todas las empresas
 * Query params: activa (true/false), plan_id
 */
router.get('/empresas', verificarAuthYAdmin, async (req, res) => {
    try {
        const filtros = {};
        
        if (req.query.activa !== undefined) {
            filtros.activa = req.query.activa === 'true';
        }
        if (req.query.plan_id) {
            filtros.plan_id = req.query.plan_id;
        }
        
        const resultado = await AdminService.listarEmpresas(filtros);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            res.status(500).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en GET /api/admin/empresas:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * GET /api/admin/empresas/:empresaId
 * Obtener detalle completo de una empresa
 */
router.get('/empresas/:empresaId', verificarAuthYAdmin, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const resultado = await AdminService.obtenerDetalleEmpresa(empresaId);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en GET /api/admin/empresas/:empresaId:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * POST /api/admin/empresas
 * Crear nueva empresa
 */
router.post('/empresas', verificarAuthYAdmin, strictLimiter, async (req, res) => {
    try {
        const resultado = await AdminService.crearEmpresa(req.body);
        
        if (resultado.success) {
            res.status(201).json(resultado);
        } else {
            const statusCode = resultado.error === 'validation_error' ? 400 : 
                              resultado.error === 'plan_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en POST /api/admin/empresas:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * PUT /api/admin/empresas/:empresaId
 * Actualizar empresa
 */
router.put('/empresas/:empresaId', verificarAuthYAdmin, strictLimiter, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const resultado = await AdminService.actualizarEmpresa(empresaId, req.body);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en PUT /api/admin/empresas/:empresaId:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * PATCH /api/admin/empresas/:empresaId/toggle
 * Activar/Desactivar empresa
 */
router.patch('/empresas/:empresaId/toggle', verificarAuthYAdmin, strictLimiter, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const { activa } = req.body;
        
        if (activa === undefined) {
            return res.status(400).json({
                success: false,
                error: 'missing_field',
                mensaje: 'Campo "activa" requerido.'
            });
        }
        
        const resultado = await AdminService.toggleEmpresa(empresaId, activa);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en PATCH /api/admin/empresas/:empresaId/toggle:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * POST /api/admin/empresas/:empresaId/resetear-consumo
 * Resetear consumo mensual de tokens
 */
router.post('/empresas/:empresaId/resetear-consumo', verificarAuthYAdmin, strictLimiter, async (req, res) => {
    try {
        const { empresaId } = req.params;
        const resultado = await AdminService.resetearConsumoEmpresa(empresaId);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            const statusCode = resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en POST /api/admin/empresas/:empresaId/resetear-consumo:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// ==================== GESTIÓN DE USUARIOS ====================

/**
 * GET /api/admin/usuarios
 * Listar todos los usuarios
 * Query params: activo (true/false), rol (admin/user), empresa_id
 */
router.get('/usuarios', verificarAuthYAdmin, async (req, res) => {
    try {
        const filtros = {};
        
        if (req.query.activo !== undefined) {
            filtros.activo = req.query.activo === 'true';
        }
        if (req.query.rol) {
            filtros.rol = req.query.rol;
        }
        if (req.query.empresa_id) {
            filtros.empresa_id = req.query.empresa_id;
        }
        
        const resultado = await AdminService.listarUsuarios(filtros);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            res.status(500).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en GET /api/admin/usuarios:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * POST /api/admin/usuarios
 * Crear nuevo usuario
 */
router.post('/usuarios', verificarAuthYAdmin, strictLimiter, async (req, res) => {
    try {
        const resultado = await AdminService.crearUsuario(req.body);
        
        if (resultado.success) {
            res.status(201).json(resultado);
        } else {
            const statusCode = resultado.error === 'email_exists' ? 400 : 
                              resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en POST /api/admin/usuarios:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * PUT /api/admin/usuarios/:usuarioId
 * Actualizar usuario
 */
router.put('/usuarios/:usuarioId', verificarAuthYAdmin, strictLimiter, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const resultado = await AdminService.actualizarUsuario(usuarioId, req.body);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            const statusCode = resultado.error === 'user_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en PUT /api/admin/usuarios/:usuarioId:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * PATCH /api/admin/usuarios/:usuarioId/toggle
 * Activar/Desactivar usuario
 */
router.patch('/usuarios/:usuarioId/toggle', verificarAuthYAdmin, strictLimiter, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        const { activo } = req.body;
        
        if (activo === undefined) {
            return res.status(400).json({
                success: false,
                error: 'missing_field',
                mensaje: 'Campo "activo" requerido.'
            });
        }
        
        const resultado = await AdminService.toggleUsuario(usuarioId, activo);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            const statusCode = resultado.error === 'user_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en PATCH /api/admin/usuarios/:usuarioId/toggle:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// ==================== HISTORIAL ====================

/**
 * GET /api/admin/historial
 * Obtener historial de todas las clasificaciones del sistema
 * Query params: pagina, limite, empresa_id, tipo_operacion, desde, hasta
 */
router.get('/historial', verificarAuthYAdmin, async (req, res) => {
    try {
        const {
            pagina = 1,
            limite = 50,
            empresa_id,
            tipo_operacion,
            desde,
            hasta
        } = req.query;
        
        const db = require('../config/database').getDB();
        
        // Construir filtro
        const filtro = {};
        if (empresa_id) filtro.empresa_id = empresa_id;
        if (tipo_operacion) filtro.tipo_operacion = tipo_operacion;
        
        if (desde || hasta) {
            filtro.fecha_creacion = {};
            if (desde) filtro.fecha_creacion.$gte = new Date(desde).toISOString();
            if (hasta) filtro.fecha_creacion.$lte = new Date(hasta).toISOString();
        }
        
        // Obtener clasificaciones con paginación
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        const clasificaciones = await db.collection('clasificaciones')
            .find(filtro)
            .sort({ fecha_creacion: -1 })
            .skip(skip)
            .limit(parseInt(limite))
            .toArray();
        
        // Enriquecer con información de empresa y usuario
        for (let clf of clasificaciones) {
            const empresa = await db.collection('empresas').findOne({ empresa_id: clf.empresa_id });
            const usuario = await db.collection('usuarios').findOne({ usuario_id: clf.usuario_id });
            
            clf.empresa_nombre = empresa?.nombre;
            clf.usuario_nombre = usuario?.nombre;
        }
        
        // Obtener estadísticas
        const totalClasificaciones = await db.collection('clasificaciones').countDocuments(filtro);
        const empresasActivas = await db.collection('empresas').countDocuments({ activa: true });
        
        const statsTokens = await db.collection('clasificaciones').aggregate([
            { $match: filtro },
            { $group: { _id: null, total: { $sum: '$tokens_consumidos' } } }
        ]).toArray();
        
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const clasificacionesHoy = await db.collection('clasificaciones').countDocuments({
            ...filtro,
            fecha_creacion: { $gte: hoy.toISOString() }
        });
        
        res.json({
            success: true,
            clasificaciones,
            estadisticas: {
                total_clasificaciones: totalClasificaciones,
                empresas_activas: empresasActivas,
                tokens_consumidos: statsTokens[0]?.total || 0,
                clasificaciones_hoy: clasificacionesHoy
            },
            paginacion: {
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                total: totalClasificaciones,
                paginas: Math.ceil(totalClasificaciones / parseInt(limite))
            }
        });
        
    } catch (error) {
        console.error('Error en GET /api/admin/historial:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * GET /api/admin/historial/:clasificacionId
 * Obtener detalle de una clasificación específica
 */
router.get('/historial/:clasificacionId', verificarAuthYAdmin, async (req, res) => {
    try {
        const { clasificacionId } = req.params;
        const db = require('../config/database').getDB();
        
        const clasificacion = await db.collection('clasificaciones').findOne({
            clasificacion_id: clasificacionId
        });
        
        if (!clasificacion) {
            return res.status(404).json({
                success: false,
                error: 'not_found',
                mensaje: 'Clasificación no encontrada'
            });
        }
        
        // Enriquecer con información de empresa y usuario
        const empresa = await db.collection('empresas').findOne({ empresa_id: clasificacion.empresa_id });
        const usuario = await db.collection('usuarios').findOne({ usuario_id: clasificacion.usuario_id });
        
        clasificacion.empresa_nombre = empresa?.nombre;
        clasificacion.usuario_nombre = usuario?.nombre;
        
        res.json({
            success: true,
            clasificacion
        });
        
    } catch (error) {
        console.error('Error en GET /api/admin/historial/:clasificacionId:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// ==================== GESTIÓN DE SESIONES ====================

/**
 * POST /api/admin/sesiones/limpiar-todas
 * Cerrar todas las sesiones activas del sistema (excepto la del admin)
 */
router.post('/sesiones/limpiar-todas', verificarAuthYAdmin, async (req, res) => {
    try {
        const resultado = await AdminService.cerrarTodasLasSesiones(req.auth.sesion_id);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            res.status(500).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en POST /api/admin/sesiones/limpiar-todas:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * GET /api/admin/sesiones/activas
 * Obtener lista de todas las sesiones activas
 */
router.get('/sesiones/activas', verificarAuthYAdmin, async (req, res) => {
    try {
        const resultado = await AdminService.obtenerSesionesActivas();
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            res.status(500).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en GET /api/admin/sesiones/activas:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

/**
 * DELETE /api/admin/sesiones/:sesionId
 * Cerrar una sesión específica
 */
router.delete('/sesiones/:sesionId', verificarAuthYAdmin, async (req, res) => {
    try {
        const { sesionId } = req.params;
        const resultado = await AdminService.cerrarSesion(sesionId);
        
        if (resultado.success) {
            res.json(resultado);
        } else {
            res.status(404).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en DELETE /api/admin/sesiones/:sesionId:', error);
        res.status(500).json({
            success: false,
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

module.exports = router;
