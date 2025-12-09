const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Crear transporter dinámico
// Soporta servicio transaccional centralizado O configuración por empresa
function createTransporter(empresaConfig = null) {
    // Si la empresa tiene configuración propia de SMTP, usarla
    if (empresaConfig && empresaConfig.smtp_host) {
        return nodemailer.createTransport({
            host: empresaConfig.smtp_host,
            port: empresaConfig.smtp_port || 587,
            secure: empresaConfig.smtp_secure || false,
            auth: {
                user: empresaConfig.smtp_user,
                pass: empresaConfig.smtp_password
            }
        });
    }
    
    // Usar servicio transaccional centralizado (SendGrid, AWS SES, etc)
    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.sendgrid.net',
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER || 'apikey',
            pass: process.env.EMAIL_PASSWORD
        }
    });
}

// Generar token aleatorio seguro
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Enviar email de verificación
async function enviarEmailVerificacion(correo, nombre, token, empresaConfig = null) {
        try {
            const transporter = createTransporter(empresaConfig);
            const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3050'}/verificar-email?token=${token}`;
            
            // Determinar el remitente (from)
            const fromEmail = empresaConfig?.email_from || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@clasificador.com';
            const fromName = empresaConfig?.nombre || process.env.APP_NAME || 'Clasificador Arancelario';
            
            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: correo,
                subject: 'Verifica tu correo electrónico',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                            .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🚀 Bienvenido ${nombre}</h1>
                            </div>
                            <div class="content">
                                <h2>Verifica tu correo electrónico</h2>
                                <p>Gracias por registrarte en nuestro sistema de Clasificación Arancelaria.</p>
                                <p>Para completar tu registro y activar tu cuenta, haz clic en el siguiente botón:</p>
                                <center>
                                    <a href="${verificationUrl}" class="button">Verificar Email</a>
                                </center>
                                <p>O copia y pega este enlace en tu navegador:</p>
                                <p style="background: white; padding: 15px; border-radius: 5px; word-break: break-all;">
                                    ${verificationUrl}
                                </p>
                                <p><strong>Este enlace expirará en 24 horas.</strong></p>
                                <p>Si no te registraste en nuestra plataforma, puedes ignorar este mensaje.</p>
                            </div>
                            <div class="footer">
                                <p>Este es un mensaje automático, por favor no respondas.</p>
                                <p>&copy; 2025 Clasificador Arancelario RD</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            const info = await transporter.sendMail(mailOptions);
            console.log('✉️ Email de verificación enviado:', info.messageId);
            return { success: true, messageId: info.messageId };

        } catch (error) {
            console.error('❌ Error enviando email de verificación:', error);
            return { success: false, error: error.message };
        }
}

// Enviar email de recuperación de contraseña
async function enviarEmailRecuperacion(correo, nombre, token, empresaConfig = null) {
        try {
            const transporter = createTransporter(empresaConfig);
            const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3050'}/reset-password?token=${token}`;
            
            const fromEmail = empresaConfig?.email_from || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@clasificador.com';
            const fromName = empresaConfig?.nombre || process.env.APP_NAME || 'Clasificador Arancelario';
            
            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: correo,
                subject: 'Recuperación de contraseña',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                            .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
                            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🔐 Recuperación de Contraseña</h1>
                            </div>
                            <div class="content">
                                <h2>Hola ${nombre},</h2>
                                <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
                                <p>Si fuiste tú quien lo solicitó, haz clic en el siguiente botón para crear una nueva contraseña:</p>
                                <center>
                                    <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
                                </center>
                                <p>O copia y pega este enlace en tu navegador:</p>
                                <p style="background: white; padding: 15px; border-radius: 5px; word-break: break-all;">
                                    ${resetUrl}
                                </p>
                                <div class="warning">
                                    <strong>⚠️ Importante:</strong>
                                    <ul>
                                        <li>Este enlace expirará en 1 hora.</li>
                                        <li>Solo se puede usar una vez.</li>
                                        <li>Si no solicitaste este cambio, ignora este mensaje.</li>
                                    </ul>
                                </div>
                                <p>Por seguridad, tu contraseña actual seguirá siendo válida hasta que establezcas una nueva.</p>
                            </div>
                            <div class="footer">
                                <p>Este es un mensaje automático, por favor no respondas.</p>
                                <p>&copy; 2025 Clasificador Arancelario RD</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            const info = await transporter.sendMail(mailOptions);
            console.log('✉️ Email de recuperación enviado:', info.messageId);
            return { success: true, messageId: info.messageId };

        } catch (error) {
            console.error('❌ Error enviando email de recuperación:', error);
            return { success: false, error: error.message };
        }
}

// Enviar email de confirmación de cambio de contraseña
async function enviarEmailCambioExitoso(correo, nombre, empresaConfig = null) {
        try {
            const transporter = createTransporter(empresaConfig);
            const fromEmail = empresaConfig?.email_from || process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@clasificador.com';
            const fromName = empresaConfig?.nombre || process.env.APP_NAME || 'Clasificador Arancelario';
            
            const mailOptions = {
                from: `"${fromName}" <${fromEmail}>`,
                to: correo,
                subject: 'Contraseña actualizada exitosamente',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                            .success { background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 5px; }
                            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>✅ Contraseña Actualizada</h1>
                            </div>
                            <div class="content">
                                <h2>Hola ${nombre},</h2>
                                <div class="success">
                                    <p><strong>Tu contraseña ha sido cambiada exitosamente.</strong></p>
                                </div>
                                <p>Este es un email de confirmación para informarte que tu contraseña fue actualizada el <strong>${new Date().toLocaleString('es-DO')}</strong>.</p>
                                <p>Si no realizaste este cambio, contacta inmediatamente a soporte técnico.</p>
                                <p>Ya puedes iniciar sesión con tu nueva contraseña.</p>
                            </div>
                            <div class="footer">
                                <p>Este es un mensaje automático, por favor no respondas.</p>
                                <p>&copy; 2025 Clasificador Arancelario RD</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            const info = await transporter.sendMail(mailOptions);
            console.log('✉️ Email de confirmación enviado:', info.messageId);
            return { success: true, messageId: info.messageId };

        } catch (error) {
            console.error('❌ Error enviando email de confirmación:', error);
            return { success: false, error: error.message };
        }
}

module.exports = {
    generateToken,
    enviarEmailVerificacion,
    enviarEmailRecuperacion,
    enviarEmailCambioExitoso
};
