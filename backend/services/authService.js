const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');
const { validarUsuario, validarSesion, generarId } = require('../models/schemas');

// Clave secreta para JWT (en producción debería estar en variables de entorno)
const JWT_SECRET = process.env.JWT_SECRET || 'clasificador-arancelario-secret-key-2025';
const JWT_EXPIRES_IN = '24h';

// Tiempo de inactividad para logout automático (30 minutos)
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutos en millisegundos

class AuthService {
    
    // Registrar nuevo usuario
    static async registrarUsuario(datosUsuario) {
        try {
            const db = getDB();
            
            // Validar datos del usuario
            const errores = validarUsuario(datosUsuario);
            if (errores.length > 0) {
                return { success: false, error: 'validation_error', mensaje: errores.join(', ') };
            }
            
            // Verificar que la empresa existe
            const empresa = await db.collection('empresas').findOne({ 
                empresa_id: datosUsuario.empresa_id 
            });
            if (!empresa) {
                return { success: false, error: 'company_not_found', mensaje: 'La empresa especificada no existe.' };
            }
            
            // Verificar que el correo no esté en uso
            const usuarioExistente = await db.collection('usuarios').findOne({ 
                correo: datosUsuario.correo 
            });
            if (usuarioExistente) {
                return { success: false, error: 'email_exists', mensaje: 'El correo electrónico ya está registrado.' };
            }
            
            // Generar hash de contraseña
            const saltRounds = 12;
            const contrasenaHash = await bcrypt.hash(datosUsuario.contrasena, saltRounds);
            
            // Crear usuario
            const nuevoUsuario = {
                usuario_id: generarId('usr'),
                empresa_id: datosUsuario.empresa_id,
                nombre: datosUsuario.nombre,
                correo: datosUsuario.correo.toLowerCase(),
                contrasena_hash: contrasenaHash,
                activo: true,
                fecha_creacion: new Date().toISOString()
            };
            
            const result = await db.collection('usuarios').insertOne(nuevoUsuario);
            
            // Remover hash de contraseña de la respuesta
            delete nuevoUsuario.contrasena_hash;
            
            return { 
                success: true, 
                usuario: nuevoUsuario,
                mensaje: 'Usuario registrado correctamente.' 
            };
            
        } catch (error) {
            console.error('Error registrando usuario:', error);
            return { success: false, error: 'server_error', mensaje: 'Error interno del servidor.' };
        }
    }
    
    // Iniciar sesión
    static async iniciarSesion(correo, contrasena, deviceFingerprint, ip) {
        try {
            const db = getDB();
            
            // Buscar usuario por correo
            const usuario = await db.collection('usuarios').findOne({ 
                correo: correo.toLowerCase(),
                activo: true 
            });
            
            if (!usuario) {
                return { success: false, error: 'auth_failed', mensaje: 'Credenciales inválidas.' };
            }
            
            // Verificar contraseña
            const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash);
            if (!contrasenaValida) {
                return { success: false, error: 'auth_failed', mensaje: 'Credenciales inválidas.' };
            }
            
            // Obtener información de la empresa y plan
            const empresa = await db.collection('empresas').findOne({ 
                empresa_id: usuario.empresa_id 
            });
            
            if (!empresa || !empresa.activa) {
                return { success: false, error: 'company_inactive', mensaje: 'La empresa está inactiva.' };
            }
            
            const plan = await db.collection('planes').findOne({ 
                id: empresa.plan_id 
            });
            
            if (!plan) {
                return { success: false, error: 'plan_not_found', mensaje: 'El plan asignado a tu empresa no existe o no está activo.' };
            }
            
            // Verificar tokens restantes
            const tokensRestantes = empresa.tokens_limite_mensual - empresa.tokens_consumidos;
            if (tokensRestantes <= 0) {
                return { 
                    success: false, 
                    error: 'quota_exceeded', 
                    mensaje: 'Has agotado tus tokens mensuales. Actualiza tu plan o espera el siguiente ciclo.' 
                };
            }
            
            // Verificar límite de dispositivos concurrentes
            const sesionesActivas = await db.collection('sesiones').countDocuments({
                empresa_id: empresa.empresa_id,
                activo: true
            });
            
            // Verificar si este dispositivo ya tiene una sesión activa
            const sesionExistente = await db.collection('sesiones').findOne({
                empresa_id: empresa.empresa_id,
                device_fingerprint: deviceFingerprint,
                activo: true
            });
            
            if (!sesionExistente && sesionesActivas >= plan.dispositivos_concurrentes) {
                return { 
                    success: false, 
                    error: 'devices_limit', 
                    mensaje: 'Has alcanzado el límite de dispositivos concurrentes de tu plan.' 
                };
            }
            
            // Crear o actualizar sesión
            const ahora = new Date().toISOString();
            let sesionId;
            
            if (sesionExistente) {
                // Actualizar sesión existente
                sesionId = sesionExistente.sesion_id;
                await db.collection('sesiones').updateOne(
                    { sesion_id: sesionId },
                    { 
                        $set: { 
                            ts_ultima_actividad: ahora,
                            ip: ip,
                            activo: true
                        } 
                    }
                );
            } else {
                // Crear nueva sesión
                sesionId = generarId('ses');
                const nuevaSesion = {
                    sesion_id: sesionId,
                    empresa_id: empresa.empresa_id,
                    usuario_id: usuario.usuario_id,
                    device_fingerprint: deviceFingerprint,
                    ip: ip,
                    activo: true,
                    ts_login: ahora,
                    ts_ultima_actividad: ahora
                };
                
                await db.collection('sesiones').insertOne(nuevaSesion);
            }
            
            // Generar JWT token
            const tokenPayload = {
                usuario_id: usuario.usuario_id,
                empresa_id: empresa.empresa_id,
                sesion_id: sesionId,
                device_fingerprint: deviceFingerprint
            };
            
            const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
            
            // Preparar respuesta (sin datos sensibles)
            const respuesta = {
                success: true,
                token: token,
                usuario: {
                    usuario_id: usuario.usuario_id,
                    nombre: usuario.nombre,
                    correo: usuario.correo,
                    empresa_id: empresa.empresa_id
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
                },
                mensaje: 'Sesión iniciada correctamente.'
            };
            
            return respuesta;
            
        } catch (error) {
            console.error('Error iniciando sesión:', error);
            return { success: false, error: 'server_error', mensaje: 'Error interno del servidor.' };
        }
    }
    
    // Verificar token JWT y validar sesión
    static async verificarToken(token) {
        try {
            // Decodificar token
            const decoded = jwt.verify(token, JWT_SECRET);
            
            const db = getDB();
            
            // Verificar que la sesión sigue activa
            const sesion = await db.collection('sesiones').findOne({
                sesion_id: decoded.sesion_id,
                usuario_id: decoded.usuario_id,
                empresa_id: decoded.empresa_id,
                device_fingerprint: decoded.device_fingerprint,
                activo: true
            });
            
            if (!sesion) {
                return { valid: false, error: 'session_invalid', mensaje: 'Sesión inválida o expirada.' };
            }
            
            // Verificar tiempo de inactividad
            const tiempoInactividad = Date.now() - new Date(sesion.ts_ultima_actividad).getTime();
            if (tiempoInactividad > INACTIVITY_TIMEOUT) {
                // Marcar sesión como inactiva
                await db.collection('sesiones').updateOne(
                    { sesion_id: sesion.sesion_id },
                    { $set: { activo: false } }
                );
                
                return { valid: false, error: 'session_expired', mensaje: 'Sesión expirada por inactividad.' };
            }
            
            // Actualizar última actividad
            await db.collection('sesiones').updateOne(
                { sesion_id: sesion.sesion_id },
                { $set: { ts_ultima_actividad: new Date().toISOString() } }
            );
            
            return { 
                valid: true, 
                usuario_id: decoded.usuario_id,
                empresa_id: decoded.empresa_id,
                sesion_id: decoded.sesion_id,
                device_fingerprint: decoded.device_fingerprint
            };
            
        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                return { valid: false, error: 'token_invalid', mensaje: 'Token inválido.' };
            } else if (error.name === 'TokenExpiredError') {
                return { valid: false, error: 'token_expired', mensaje: 'Token expirado.' };
            } else {
                console.error('Error verificando token:', error);
                return { valid: false, error: 'server_error', mensaje: 'Error interno del servidor.' };
            }
        }
    }
    
    // Cerrar sesión
    static async cerrarSesion(sesionId) {
        try {
            const db = getDB();
            
            const result = await db.collection('sesiones').updateOne(
                { sesion_id: sesionId },
                { $set: { activo: false } }
            );
            
            return { success: result.modifiedCount > 0 };
            
        } catch (error) {
            console.error('Error cerrando sesión:', error);
            return { success: false };
        }
    }
    
    // Limpiar sesiones inactivas
    static async limpiarSesionesInactivas() {
        try {
            const db = getDB();
            const tiempoLimite = new Date(Date.now() - INACTIVITY_TIMEOUT).toISOString();
            
            const result = await db.collection('sesiones').updateMany(
                { 
                    ts_ultima_actividad: { $lt: tiempoLimite },
                    activo: true 
                },
                { $set: { activo: false } }
            );
            
            console.log(`🧽 ${result.modifiedCount} sesiones inactivas limpiadas`);
            return result.modifiedCount;
            
        } catch (error) {
            console.error('Error limpiando sesiones:', error);
            return 0;
        }
    }
}

module.exports = AuthService;