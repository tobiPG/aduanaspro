const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getDB } = require('../config/database');
const crypto = require('crypto');

class TwoFactorService {
    
    // Generar secret para 2FA
    static async habilitarTwoFactor(usuarioId, nombreUsuario, correoUsuario) {
        try {
            const db = getDB();
            
            // Generar secret
            const secret = speakeasy.generateSecret({
                name: `Clasificador Arancelario (${correoUsuario})`,
                issuer: 'Clasificador Arancelario RD',
                length: 32
            });
            
            // Generar códigos de respaldo
            const backupCodes = this.generateBackupCodes();
            
            // Guardar en la base de datos (pero aún no activado)
            await db.collection('usuarios').updateOne(
                { usuario_id: usuarioId },
                { 
                    $set: { 
                        two_factor_secret: secret.base32,
                        two_factor_enabled: false,
                        two_factor_backup_codes: backupCodes.map(code => ({
                            code: code,
                            used: false
                        })),
                        two_factor_setup_at: new Date().toISOString()
                    } 
                }
            );
            
            // Generar QR code
            const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);
            
            return { 
                success: true, 
                secret: secret.base32,
                qrCode: qrCodeUrl,
                backupCodes: backupCodes
            };
            
        } catch (error) {
            console.error('Error habilitando 2FA:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Verificar código 2FA y activar
    static async verificarYActivarTwoFactor(usuarioId, codigo) {
        try {
            const db = getDB();
            
            // Obtener secret del usuario
            const usuario = await db.collection('usuarios').findOne({ usuario_id: usuarioId });
            
            if (!usuario || !usuario.two_factor_secret) {
                return { success: false, error: 'two_factor_not_setup' };
            }
            
            // Verificar código
            const verified = speakeasy.totp.verify({
                secret: usuario.two_factor_secret,
                encoding: 'base32',
                token: codigo,
                window: 2 // Permite 2 pasos antes y después (60 segundos de margen)
            });
            
            if (!verified) {
                return { success: false, error: 'codigo_invalido' };
            }
            
            // Activar 2FA
            await db.collection('usuarios').updateOne(
                { usuario_id: usuarioId },
                { 
                    $set: { 
                        two_factor_enabled: true,
                        two_factor_activated_at: new Date().toISOString()
                    } 
                }
            );
            
            return { success: true, mensaje: '2FA activado correctamente' };
            
        } catch (error) {
            console.error('Error verificando 2FA:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Deshabilitar 2FA
    static async deshabilitarTwoFactor(usuarioId, contrasena) {
        try {
            const bcrypt = require('bcryptjs');
            const db = getDB();
            
            // Obtener usuario
            const usuario = await db.collection('usuarios').findOne({ usuario_id: usuarioId });
            
            if (!usuario) {
                return { success: false, error: 'user_not_found' };
            }
            
            // Verificar contraseña
            const passwordMatch = await bcrypt.compare(contrasena, usuario.contrasena);
            
            if (!passwordMatch) {
                return { success: false, error: 'password_incorrect' };
            }
            
            // Deshabilitar 2FA
            await db.collection('usuarios').updateOne(
                { usuario_id: usuarioId },
                { 
                    $unset: { 
                        two_factor_secret: '',
                        two_factor_backup_codes: ''
                    },
                    $set: {
                        two_factor_enabled: false,
                        two_factor_disabled_at: new Date().toISOString()
                    }
                }
            );
            
            return { success: true, mensaje: '2FA deshabilitado correctamente' };
            
        } catch (error) {
            console.error('Error deshabilitando 2FA:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Verificar código 2FA en login
    static async verificarCodigoTwoFactor(usuarioId, codigo, esBackupCode = false) {
        try {
            const db = getDB();
            
            // Obtener usuario
            const usuario = await db.collection('usuarios').findOne({ usuario_id: usuarioId });
            
            if (!usuario || !usuario.two_factor_enabled) {
                return { valid: false, error: 'two_factor_not_enabled' };
            }
            
            // Si es código de respaldo
            if (esBackupCode) {
                const backupCodeIndex = usuario.two_factor_backup_codes?.findIndex(
                    bc => bc.code === codigo && !bc.used
                );
                
                if (backupCodeIndex === -1) {
                    return { valid: false, error: 'backup_code_invalid' };
                }
                
                // Marcar código como usado
                await db.collection('usuarios').updateOne(
                    { usuario_id: usuarioId },
                    { 
                        $set: { 
                            [`two_factor_backup_codes.${backupCodeIndex}.used`]: true,
                            [`two_factor_backup_codes.${backupCodeIndex}.used_at`]: new Date().toISOString()
                        } 
                    }
                );
                
                return { valid: true, backup_code_used: true };
            }
            
            // Verificar código TOTP
            const verified = speakeasy.totp.verify({
                secret: usuario.two_factor_secret,
                encoding: 'base32',
                token: codigo,
                window: 2
            });
            
            if (!verified) {
                return { valid: false, error: 'codigo_invalido' };
            }
            
            return { valid: true };
            
        } catch (error) {
            console.error('Error verificando código 2FA:', error);
            return { valid: false, error: 'server_error' };
        }
    }
    
    // Generar códigos de respaldo
    static generateBackupCodes(count = 8) {
        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generar código de 8 caracteres alfanuméricos
            const code = crypto.randomBytes(4).toString('hex').toUpperCase();
            codes.push(code);
        }
        return codes;
    }
    
    // Regenerar códigos de respaldo
    static async regenerarBackupCodes(usuarioId) {
        try {
            const db = getDB();
            
            // Verificar que el usuario tiene 2FA activado
            const usuario = await db.collection('usuarios').findOne({ usuario_id: usuarioId });
            
            if (!usuario || !usuario.two_factor_enabled) {
                return { success: false, error: 'two_factor_not_enabled' };
            }
            
            // Generar nuevos códigos
            const backupCodes = this.generateBackupCodes();
            
            // Actualizar en la base de datos
            await db.collection('usuarios').updateOne(
                { usuario_id: usuarioId },
                { 
                    $set: { 
                        two_factor_backup_codes: backupCodes.map(code => ({
                            code: code,
                            used: false
                        })),
                        backup_codes_regenerated_at: new Date().toISOString()
                    } 
                }
            );
            
            return { success: true, backupCodes: backupCodes };
            
        } catch (error) {
            console.error('Error regenerando códigos de respaldo:', error);
            return { success: false, error: 'server_error' };
        }
    }
}

module.exports = TwoFactorService;
