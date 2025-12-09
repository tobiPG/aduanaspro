/**
 * Debug: Ver todas las sesiones activas con sus tokens
 */

const { connectDB, getDB } = require('./config/database');
const jwt = require('jsonwebtoken');

async function debugSesiones() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Sesiones activas del usuario demo...\n');
        
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        if (!usuario) {
            console.log('❌ Usuario no encontrado');
            process.exit(1);
        }
        
        const sesiones = await db.collection('sesiones').find({
            usuario_id: usuario.usuario_id,
            activo: true
        }).sort({ ts_login: -1 }).toArray();
        
        console.log(`📋 Sesiones activas: ${sesiones.length}\n`);
        
        if (sesiones.length === 0) {
            console.log('⚠️ NO HAY SESIONES ACTIVAS');
            console.log('El usuario debe iniciar sesión.');
        } else {
            sesiones.forEach((sesion, i) => {
                console.log(`${i + 1}. Sesión: ${sesion.sesion_id}`);
                console.log(`   Device: ${sesion.device_fingerprint}`);
                console.log(`   IP: ${sesion.ip}`);
                console.log(`   Login: ${sesion.ts_login}`);
                console.log(`   Última actividad: ${sesion.ts_ultima_actividad}`);
                
                // Calcular tiempo desde última actividad
                const ahora = Date.now();
                const ultimaActividad = new Date(sesion.ts_ultima_actividad).getTime();
                const tiempoInactivo = (ahora - ultimaActividad) / 1000 / 60; // en minutos
                console.log(`   Tiempo inactivo: ${tiempoInactivo.toFixed(2)} minutos`);
                
                // Decodificar el token (si existe en la sesión)
                if (sesion.token) {
                    try {
                        const decoded = jwt.decode(sesion.token);
                        console.log(`   Token expira: ${new Date(decoded.exp * 1000).toISOString()}`);
                    } catch (e) {
                        console.log('   Token: no se pudo decodificar');
                    }
                }
                console.log('');
            });
        }
        
        // Ver también las sesiones marcadas como inactivas recientemente
        const sesionesInactivas = await db.collection('sesiones').find({
            usuario_id: usuario.usuario_id,
            activo: false
        }).sort({ ts_login: -1 }).limit(3).toArray();
        
        if (sesionesInactivas.length > 0) {
            console.log(`\n🚫 Últimas 3 sesiones INACTIVAS:`);
            sesionesInactivas.forEach((sesion, i) => {
                console.log(`${i + 1}. ${sesion.sesion_id} - Device: ${sesion.device_fingerprint} - Login: ${sesion.ts_login}`);
            });
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugSesiones();
