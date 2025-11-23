const AuthService = require('../services/authService');

// Middleware para verificar autenticación
async function verificarAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'auth_required',
                mensaje: 'Token de autenticación requerido.'
            });
        }
        
        const token = authHeader.substring(7); // Remover 'Bearer '
        
        const verificacion = await AuthService.verificarToken(token);
        
        if (!verificacion.valid) {
            return res.status(401).json({
                error: verificacion.error,
                mensaje: verificacion.mensaje
            });
        }
        
        // Agregar información del usuario a la request
        req.auth = {
            usuario_id: verificacion.usuario_id,
            empresa_id: verificacion.empresa_id,
            sesion_id: verificacion.sesion_id,
            device_fingerprint: verificacion.device_fingerprint
        };
        
        next();
        
    } catch (error) {
        console.error('Error en middleware de autenticación:', error);
        return res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor.'
        });
    }
}

// Middleware para extraer device fingerprint
function extraerDeviceFingerprint(req, res, next) {
    // Intentar obtener device fingerprint del header personalizado
    const deviceFingerprint = req.headers['x-device-fingerprint'];
    
    if (!deviceFingerprint) {
        return res.status(400).json({
            error: 'device_fingerprint_required',
            mensaje: 'Device fingerprint requerido en header X-Device-Fingerprint.'
        });
    }
    
    req.deviceFingerprint = deviceFingerprint;
    next();
}

// Middleware para obtener IP del cliente
function extraerIP(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
               '127.0.0.1';
    
    req.clientIP = ip;
    next();
}

module.exports = {
    verificarAuth,
    extraerDeviceFingerprint,
    extraerIP
};