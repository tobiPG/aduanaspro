const { getDB } = require('../config/database');
const { generarId } = require('../models/schemas');
const bcrypt = require('bcryptjs');
const { generateToken, enviarEmailVerificacion, enviarEmailRecuperacion, enviarEmailCambioExitoso } = require('./emailService');

class SecurityService {
    
    // Solicitar recuperación de contraseña
    static async solicitarRecuperacion(correo) {
        try {
            const db = getDB();
            
            // Buscar usuario
            const usuario = await db.collection('usuarios').findOne({ correo: correo });
            
            if (!usuario) {
                // Por seguridad, no revelar si el email existe o no
                return { 
                    success: true, 
                    mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.' 
                };
            }
            
            // Generar token de recuperación
            const token = generateToken();
            const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
            
            // Guardar token en la base de datos
            await db.collection('password_resets').insertOne({
                reset_id: generarId('rst'),
                usuario_id: usuario.usuario_id,
                correo: correo,
                token: token,
                expires: expires.toISOString(),
                used: false,
                created_at: new Date().toISOString()
            });
            
            // Enviar email
            await enviarEmailRecuperacion(correo, usuario.nombre, token);
            
            return { 
                success: true, 
                mensaje: 'Si el correo existe, recibirás instrucciones para restablecer tu contraseña.' 
            };
            
        } catch (error) {
            console.error('Error solicitando recuperación:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Verificar token de recuperación
    static async verificarTokenRecuperacion(token) {
        try {
            const db = getDB();
            
            const reset = await db.collection('password_resets').findOne({
                token: token,
                used: false
            });
            
            if (!reset) {
                return { valid: false, error: 'token_invalid' };
            }
            
            // Verificar expiración
            const now = new Date();
            const expires = new Date(reset.expires);
            
            if (now > expires) {
                return { valid: false, error: 'token_expired' };
            }
            
            return { valid: true, usuario_id: reset.usuario_id, correo: reset.correo };
            
        } catch (error) {
            console.error('Error verificando token:', error);
            return { valid: false, error: 'server_error' };
        }
    }
    
    // Restablecer contraseña
    static async restablecerContrasena(token, nuevaContrasena) {
        try {
            const db = getDB();
            
            // Verificar token
            const verificacion = await this.verificarTokenRecuperacion(token);
            
            if (!verificacion.valid) {
                return { success: false, error: verificacion.error };
            }
            
            // Hashear nueva contraseña
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(nuevaContrasena, salt);
            
            // Actualizar contraseña
            await db.collection('usuarios').updateOne(
                { usuario_id: verificacion.usuario_id },
                { 
                    $set: { 
                        contrasena: hashedPassword,
                        updated_at: new Date().toISOString()
                    } 
                }
            );
            
            // Marcar token como usado
            await db.collection('password_resets').updateOne(
                { token: token },
                { $set: { used: true, used_at: new Date().toISOString() } }
            );
            
            // Invalidar todas las sesiones activas del usuario (por seguridad)
            await db.collection('sesiones').updateMany(
                { usuario_id: verificacion.usuario_id, activa: true },
                { $set: { activa: false, logout_at: new Date().toISOString() } }
            );
            
            // Obtener nombre del usuario
            const usuario = await db.collection('usuarios').findOne({ usuario_id: verificacion.usuario_id });
            
            // Enviar email de confirmación
            if (usuario) {
                await enviarEmailCambioExitoso(verificacion.correo, usuario.nombre);
            }
            
            return { 
                success: true, 
                mensaje: 'Contraseña restablecida exitosamente. Todas las sesiones activas han sido cerradas.' 
            };
            
        } catch (error) {
            console.error('Error restableciendo contraseña:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Enviar email de verificación al registrarse
    static async enviarVerificacionEmail(usuarioId, correo, nombre) {
        try {
            const db = getDB();
            
            // Generar token de verificación
            const token = generateToken();
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
            
            // Guardar token
            await db.collection('email_verifications').insertOne({
                verification_id: generarId('ver'),
                usuario_id: usuarioId,
                correo: correo,
                token: token,
                expires: expires.toISOString(),
                verified: false,
                created_at: new Date().toISOString()
            });
            
            // Enviar email
            await enviarEmailVerificacion(correo, nombre, token);
            
            return { success: true };
            
        } catch (error) {
            console.error('Error enviando verificación:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Verificar email con token
    static async verificarEmail(token) {
        try {
            const db = getDB();
            
            const verification = await db.collection('email_verifications').findOne({
                token: token,
                verified: false
            });
            
            if (!verification) {
                return { success: false, error: 'token_invalid' };
            }
            
            // Verificar expiración
            const now = new Date();
            const expires = new Date(verification.expires);
            
            if (now > expires) {
                return { success: false, error: 'token_expired' };
            }
            
            // Marcar email como verificado
            await db.collection('email_verifications').updateOne(
                { token: token },
                { 
                    $set: { 
                        verified: true, 
                        verified_at: new Date().toISOString() 
                    } 
                }
            );
            
            // Actualizar usuario
            await db.collection('usuarios').updateOne(
                { usuario_id: verification.usuario_id },
                { $set: { email_verificado: true } }
            );
            
            return { success: true, mensaje: 'Email verificado exitosamente.' };
            
        } catch (error) {
            console.error('Error verificando email:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Limpiar tokens expirados (ejecutar periódicamente)
    static async limpiarTokensExpirados() {
        try {
            const db = getDB();
            const now = new Date().toISOString();
            
            // Limpiar tokens de password reset expirados
            const resetResult = await db.collection('password_resets').deleteMany({
                expires: { $lt: now }
            });
            
            // Limpiar tokens de verificación expirados
            const verifyResult = await db.collection('email_verifications').deleteMany({
                expires: { $lt: now }
            });
            
            console.log(`🧹 Limpieza de tokens: ${resetResult.deletedCount} reset, ${verifyResult.deletedCount} verificación`);
            
            return { success: true };
            
        } catch (error) {
            console.error('Error limpiando tokens:', error);
            return { success: false };
        }
    }
}

module.exports = SecurityService;
