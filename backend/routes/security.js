const express = require('express');
const router = express.Router();
const SecurityService = require('../services/securityService');
const TwoFactorService = require('../services/twoFactorService');
const { verificarAuth } = require('../middleware/auth');
const { passwordResetLimiter, strictLimiter } = require('../middleware/rateLimiter');

// ============================================
// RECUPERACIÓN DE CONTRASEÑA
// ============================================

// Solicitar recuperación de contraseña
router.post('/request-reset', passwordResetLimiter, async (req, res) => {
    try {
        const { correo } = req.body;
        
        if (!correo) {
            return res.status(400).json({ error: 'Correo requerido' });
        }
        
        // Siempre responde éxito por seguridad (no revelar si el email existe)
        await SecurityService.solicitarRecuperacion(correo);
        
        res.json({ 
            success: true, 
            mensaje: 'Si el correo existe, recibirás instrucciones para recuperar tu contraseña' 
        });
        
    } catch (error) {
        console.error('Error en request-reset:', error);
        res.status(500).json({ error: 'Error al procesar la solicitud' });
    }
});

// Verificar token de recuperación
router.get('/verify-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        const resultado = await SecurityService.verificarTokenRecuperacion(token);
        
        if (!resultado.valido) {
            return res.status(400).json({ 
                valido: false, 
                error: resultado.error || 'Token inválido o expirado' 
            });
        }
        
        res.json({ valido: true });
        
    } catch (error) {
        console.error('Error en verify-reset-token:', error);
        res.status(500).json({ error: 'Error al verificar el token' });
    }
});

// Restablecer contraseña
router.post('/reset-password', async (req, res) => {
    try {
        const { token, nuevaContrasena } = req.body;
        
        if (!token || !nuevaContrasena) {
            return res.status(400).json({ error: 'Token y nueva contraseña requeridos' });
        }
        
        if (nuevaContrasena.length < 6) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }
        
        const resultado = await SecurityService.restablecerContrasena(token, nuevaContrasena);
        
        if (!resultado.success) {
            return res.status(400).json({ error: resultado.error || 'Error al restablecer contraseña' });
        }
        
        res.json({ success: true, mensaje: 'Contraseña restablecida correctamente' });
        
    } catch (error) {
        console.error('Error en reset-password:', error);
        res.status(500).json({ error: 'Error al restablecer la contraseña' });
    }
});

// ============================================
// VERIFICACIÓN DE EMAIL
// ============================================

// Verificar email con token
router.get('/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        const resultado = await SecurityService.verificarEmail(token);
        
        if (!resultado.success) {
            return res.status(400).json({ error: resultado.error || 'Token inválido o expirado' });
        }
        
        res.json({ success: true, mensaje: 'Email verificado correctamente' });
        
    } catch (error) {
        console.error('Error en verify-email:', error);
        res.status(500).json({ error: 'Error al verificar el email' });
    }
});

// Reenviar email de verificación
router.post('/resend-verification', verificarAuth, strictLimiter, async (req, res) => {
    try {
        const usuarioId = req.usuario.usuario_id;
        const correo = req.usuario.correo;
        const nombre = req.usuario.nombre;
        
        // Verificar que el email no esté ya verificado
        const { getDB } = require('../config/database');
        const db = getDB();
        const usuario = await db.collection('usuarios').findOne({ usuario_id: usuarioId });
        
        if (usuario.email_verificado) {
            return res.status(400).json({ error: 'El email ya está verificado' });
        }
        
        const resultado = await SecurityService.enviarVerificacionEmail(usuarioId, correo, nombre);
        
        if (!resultado.success) {
            return res.status(500).json({ error: 'Error al enviar el email de verificación' });
        }
        
        res.json({ success: true, mensaje: 'Email de verificación enviado' });
        
    } catch (error) {
        console.error('Error en resend-verification:', error);
        res.status(500).json({ error: 'Error al reenviar la verificación' });
    }
});

// ============================================
// AUTENTICACIÓN DE DOS FACTORES (2FA)
// ============================================

// Habilitar 2FA (generar secret y QR)
router.post('/2fa/enable', verificarAuth, async (req, res) => {
    try {
        const usuarioId = req.usuario.usuario_id;
        const correo = req.usuario.correo;
        const nombre = req.usuario.nombre || correo;
        
        const resultado = await TwoFactorService.habilitarTwoFactor(usuarioId, nombre, correo);
        
        if (!resultado.success) {
            return res.status(500).json({ error: 'Error al habilitar 2FA' });
        }
        
        res.json({ 
            success: true, 
            qrCode: resultado.qrCode,
            secret: resultado.secret,
            backupCodes: resultado.backupCodes
        });
        
    } catch (error) {
        console.error('Error en 2fa/enable:', error);
        res.status(500).json({ error: 'Error al habilitar 2FA' });
    }
});

// Verificar código y activar 2FA
router.post('/2fa/verify', verificarAuth, async (req, res) => {
    try {
        const usuarioId = req.usuario.usuario_id;
        const { codigo } = req.body;
        
        if (!codigo) {
            return res.status(400).json({ error: 'Código requerido' });
        }
        
        const resultado = await TwoFactorService.verificarYActivarTwoFactor(usuarioId, codigo);
        
        if (!resultado.success) {
            return res.status(400).json({ error: resultado.error || 'Código inválido' });
        }
        
        res.json({ success: true, mensaje: '2FA activado correctamente' });
        
    } catch (error) {
        console.error('Error en 2fa/verify:', error);
        res.status(500).json({ error: 'Error al verificar el código' });
    }
});

// Deshabilitar 2FA
router.post('/2fa/disable', verificarAuth, async (req, res) => {
    try {
        const usuarioId = req.usuario.usuario_id;
        const { contrasena } = req.body;
        
        if (!contrasena) {
            return res.status(400).json({ error: 'Contraseña requerida' });
        }
        
        const resultado = await TwoFactorService.deshabilitarTwoFactor(usuarioId, contrasena);
        
        if (!resultado.success) {
            return res.status(400).json({ error: resultado.error || 'Error al deshabilitar 2FA' });
        }
        
        res.json({ success: true, mensaje: '2FA deshabilitado correctamente' });
        
    } catch (error) {
        console.error('Error en 2fa/disable:', error);
        res.status(500).json({ error: 'Error al deshabilitar 2FA' });
    }
});

// Validar código 2FA (usado en login)
router.post('/2fa/validate', async (req, res) => {
    try {
        const { usuarioId, codigo, esBackupCode } = req.body;
        
        if (!usuarioId || !codigo) {
            return res.status(400).json({ error: 'Usuario ID y código requeridos' });
        }
        
        const resultado = await TwoFactorService.verificarCodigoTwoFactor(
            usuarioId, 
            codigo, 
            esBackupCode || false
        );
        
        if (!resultado.valid) {
            return res.status(400).json({ valid: false, error: resultado.error || 'Código inválido' });
        }
        
        res.json({ valid: true, backup_code_used: resultado.backup_code_used || false });
        
    } catch (error) {
        console.error('Error en 2fa/validate:', error);
        res.status(500).json({ error: 'Error al validar el código' });
    }
});

// Regenerar códigos de respaldo
router.post('/2fa/regenerate-backup-codes', verificarAuth, strictLimiter, async (req, res) => {
    try {
        const usuarioId = req.usuario.usuario_id;
        
        const resultado = await TwoFactorService.regenerarBackupCodes(usuarioId);
        
        if (!resultado.success) {
            return res.status(400).json({ error: resultado.error || 'Error al regenerar códigos' });
        }
        
        res.json({ success: true, backupCodes: resultado.backupCodes });
        
    } catch (error) {
        console.error('Error en regenerate-backup-codes:', error);
        res.status(500).json({ error: 'Error al regenerar códigos de respaldo' });
    }
});

// Obtener estado de 2FA del usuario
router.get('/2fa/status', verificarAuth, async (req, res) => {
    try {
        const usuarioId = req.usuario.usuario_id;
        const { getDB } = require('../config/database');
        const db = getDB();
        
        const usuario = await db.collection('usuarios').findOne(
            { usuario_id: usuarioId },
            { projection: { 
                two_factor_enabled: 1, 
                two_factor_activated_at: 1,
                two_factor_backup_codes: 1
            }}
        );
        
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        const backupCodesRestantes = usuario.two_factor_backup_codes?.filter(bc => !bc.used).length || 0;
        
        res.json({ 
            enabled: usuario.two_factor_enabled || false,
            activatedAt: usuario.two_factor_activated_at || null,
            backupCodesRemaining: backupCodesRestantes
        });
        
    } catch (error) {
        console.error('Error en 2fa/status:', error);
        res.status(500).json({ error: 'Error al obtener estado de 2FA' });
    }
});

module.exports = router;
