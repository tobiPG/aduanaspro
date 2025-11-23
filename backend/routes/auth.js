const express = require('express');
const AuthService = require('../services/authService');
const { extraerDeviceFingerprint, extraerIP, verificarAuth } = require('../middleware/auth');

const router = express.Router();

// Registro de nuevos usuarios
router.post('/registro', extraerDeviceFingerprint, extraerIP, async (req, res) => {
    try {
        const { nombre, correo, contrasena, empresa_id } = req.body;
        
        // Validar datos requeridos
        if (!nombre || !correo || !contrasena || !empresa_id) {
            return res.status(400).json({
                error: 'missing_fields',
                mensaje: 'Todos los campos son requeridos: nombre, correo, contrasena, empresa_id.'
            });
        }
        
        // Validar longitud de contraseña
        if (contrasena.length < 6) {
            return res.status(400).json({
                error: 'weak_password',
                mensaje: 'La contraseña debe tener al menos 6 caracteres.'
            });
        }
        
        const resultado = await AuthService.registrarUsuario({
            nombre: nombre.trim(),
            correo: correo.trim(),
            contrasena: contrasena,
            empresa_id: empresa_id.trim()
        });
        
        if (resultado.success) {
            res.status(201).json(resultado);
        } else {
            const statusCode = resultado.error === 'validation_error' || 
                              resultado.error === 'email_exists' ? 400 : 
                              resultado.error === 'company_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en endpoint de registro:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// Inicio de sesión
router.post('/login', extraerDeviceFingerprint, extraerIP, async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        
        // Validar datos requeridos
        if (!correo || !contrasena) {
            return res.status(400).json({
                error: 'missing_credentials',
                mensaje: 'Correo y contraseña son requeridos.'
            });
        }
        
        const resultado = await AuthService.iniciarSesion(
            correo.trim(),
            contrasena,
            req.deviceFingerprint,
            req.clientIP
        );
        
        if (resultado.success) {
            res.status(200).json(resultado);
        } else {
            const statusCode = resultado.error === 'auth_failed' ? 401 :
                              resultado.error === 'devices_limit' || 
                              resultado.error === 'quota_exceeded' ? 403 :
                              resultado.error === 'plan_not_found' ? 404 : 500;
            res.status(statusCode).json(resultado);
        }
        
    } catch (error) {
        console.error('Error en endpoint de login:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// Cerrar sesión
router.post('/logout', verificarAuth, async (req, res) => {
    try {
        const resultado = await AuthService.cerrarSesion(req.auth.sesion_id);
        
        if (resultado.success) {
            res.status(200).json({
                success: true,
                mensaje: 'Sesión cerrada correctamente.'
            });
        } else {
            res.status(500).json({
                error: 'logout_failed',
                mensaje: 'Error al cerrar sesión.'
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint de logout:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// Verificar sesión actual
router.get('/verificar', verificarAuth, async (req, res) => {
    try {
        const { getDB } = require('../config/database');
        const db = getDB();
        
        // Obtener información actualizada del usuario, empresa y plan
        const usuario = await db.collection('usuarios').findOne({ 
            usuario_id: req.auth.usuario_id 
        }, { projection: { contrasena_hash: 0 } });
        
        const empresa = await db.collection('empresas').findOne({ 
            empresa_id: req.auth.empresa_id 
        });
        
        const plan = await db.collection('planes').findOne({ 
            id: empresa.plan_id 
        });
        
        const sesionesActivas = await db.collection('sesiones').countDocuments({
            empresa_id: empresa.empresa_id,
            activo: true
        });
        
        const tokensRestantes = empresa.tokens_limite_mensual - empresa.tokens_consumidos;
        
        res.status(200).json({
            success: true,
            usuario: {
                usuario_id: usuario.usuario_id,
                nombre: usuario.nombre,
                correo: usuario.correo,
                empresa_id: usuario.empresa_id
            },
            empresa: {
                empresa_id: empresa.empresa_id,
                nombre: empresa.nombre,
                plan_id: empresa.plan_id
            },
            plan: {
                id: plan.id,
                tokens_mes: plan.tokens_mes,
                dispositivos_concurrentes: plan.dispositivos_concurrentes
            },
            limites: {
                tokens_limite_mensual: empresa.tokens_limite_mensual,
                tokens_consumidos: empresa.tokens_consumidos,
                tokens_restantes: tokensRestantes,
                dispositivos_activos: sesionesActivas,
                dispositivos_limite: plan.dispositivos_concurrentes
            }
        });
        
    } catch (error) {
        console.error('Error verificando sesión:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

// Obtener información de sesiones activas (para administradores)
router.get('/sesiones', verificarAuth, async (req, res) => {
    try {
        const { getDB } = require('../config/database');
        const db = getDB();
        
        const sesiones = await db.collection('sesiones').find({
            empresa_id: req.auth.empresa_id,
            activo: true
        }).toArray();
        
        // Enriquecer con información de usuarios
        const sesionesEnriquecidas = await Promise.all(
            sesiones.map(async (sesion) => {
                const usuario = await db.collection('usuarios').findOne({
                    usuario_id: sesion.usuario_id
                }, { projection: { nombre: 1, correo: 1 } });
                
                return {
                    sesion_id: sesion.sesion_id,
                    usuario: {
                        nombre: usuario?.nombre || 'Usuario eliminado',
                        correo: usuario?.correo || 'N/A'
                    },
                    device_fingerprint: sesion.device_fingerprint,
                    ip: sesion.ip,
                    ts_login: sesion.ts_login,
                    ts_ultima_actividad: sesion.ts_ultima_actividad,
                    es_sesion_actual: sesion.sesion_id === req.auth.sesion_id
                };
            })
        );
        
        res.status(200).json({
            success: true,
            sesiones: sesionesEnriquecidas,
            total: sesionesEnriquecidas.length
        });
        
    } catch (error) {
        console.error('Error obteniendo sesiones:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
});

module.exports = router;