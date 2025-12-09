const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'clasificador-arancelario-secret-key-2025';

/**
 * Middleware para verificar que el usuario es administrador
 * Debe usarse después de verificarAuth
 */
async function verificarAdmin(req, res, next) {
    try {
        // Verificar que req.auth existe (viene de verificarAuth)
        if (!req.auth || !req.auth.usuario_id) {
            return res.status(401).json({
                error: 'unauthorized',
                mensaje: 'No autenticado. Token requerido.'
            });
        }
        
        const db = getDB();
        
        // Obtener usuario completo para verificar rol
        const usuario = await db.collection('usuarios').findOne({
            usuario_id: req.auth.usuario_id
        });
        
        if (!usuario) {
            return res.status(404).json({
                error: 'user_not_found',
                mensaje: 'Usuario no encontrado.'
            });
        }
        
        // Verificar que el usuario es admin
        if (usuario.rol !== 'admin') {
            return res.status(403).json({
                error: 'forbidden',
                mensaje: 'Acceso denegado. Se requieren permisos de administrador.'
            });
        }
        
        // Agregar información del admin al request
        req.admin = {
            usuario_id: usuario.usuario_id,
            nombre: usuario.nombre,
            correo: usuario.correo,
            empresa_id: usuario.empresa_id
        };
        
        next();
        
    } catch (error) {
        console.error('Error en middleware verificarAdmin:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
}

/**
 * Middleware combinado: verifica autenticación Y rol de admin en un solo paso
 */
async function verificarAuthYAdmin(req, res, next) {
    try {
        // 1. Extraer token
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'unauthorized',
                mensaje: 'Token no proporcionado. Formato: Bearer <token>'
            });
        }
        
        const token = authHeader.split(' ')[1];
        
        // 2. Verificar token JWT
        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({
                error: 'invalid_token',
                mensaje: 'Token inválido o expirado.'
            });
        }
        
        const db = getDB();
        
        // 3. Verificar que la sesión existe y está activa
        const sesion = await db.collection('sesiones').findOne({
            sesion_id: payload.sesion_id,
            activo: true
        });
        
        if (!sesion) {
            return res.status(401).json({
                error: 'session_not_found',
                mensaje: 'Sesión no encontrada o inactiva.'
            });
        }
        
        // 4. Obtener usuario y verificar rol
        const usuario = await db.collection('usuarios').findOne({
            usuario_id: payload.usuario_id
        });
        
        if (!usuario) {
            return res.status(404).json({
                error: 'user_not_found',
                mensaje: 'Usuario no encontrado.'
            });
        }
        
        if (!usuario.activo) {
            return res.status(403).json({
                error: 'user_inactive',
                mensaje: 'Usuario desactivado.'
            });
        }
        
        // 5. Verificar que es admin
        if (usuario.rol !== 'admin') {
            return res.status(403).json({
                error: 'forbidden',
                mensaje: 'Acceso denegado. Se requieren permisos de administrador.'
            });
        }
        
        // 6. Actualizar última actividad
        await db.collection('sesiones').updateOne(
            { sesion_id: sesion.sesion_id },
            { $set: { ts_ultima_actividad: new Date().toISOString() } }
        );
        
        // 7. Agregar información al request
        req.auth = {
            sesion_id: sesion.sesion_id,
            usuario_id: usuario.usuario_id,
            empresa_id: usuario.empresa_id
        };
        
        req.admin = {
            usuario_id: usuario.usuario_id,
            nombre: usuario.nombre,
            correo: usuario.correo,
            empresa_id: usuario.empresa_id,
            rol: usuario.rol
        };
        
        next();
        
    } catch (error) {
        console.error('Error en middleware verificarAuthYAdmin:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
}

module.exports = {
    verificarAdmin,
    verificarAuthYAdmin
};
