/**
 * Test: Verificar por qué el token es rechazado
 */

const { connectDB, getDB } = require('./config/database');

async function testTokenValidation() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Buscando sesiones activas del usuario demo...\n');
        
        // Buscar usuario demo
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        if (!usuario) {
            console.log('❌ Usuario no encontrado');
            process.exit(1);
        }
        
        console.log('👤 Usuario encontrado:', usuario.usuario_id);
        
        // Buscar sesiones activas
        const sesiones = await db.collection('sesiones').find({
            usuario_id: usuario.usuario_id,
            activa: true
        }).toArray();
        
        console.log(`\n📋 Sesiones activas: ${sesiones.length}`);
        
        if (sesiones.length === 0) {
            console.log('\n⚠️ NO HAY SESIONES ACTIVAS');
            console.log('Esto explica por qué el token es rechazado.');
            console.log('\nSolución: El usuario debe iniciar sesión nuevamente.');
        } else {
            sesiones.forEach((sesion, i) => {
                console.log(`\n${i + 1}. Sesión: ${sesion.sesion_id}`);
                console.log(`   Token: ${sesion.token.substring(0, 50)}...`);
                console.log(`   Device: ${sesion.device_fingerprint}`);
                console.log(`   IP: ${sesion.ip}`);
                console.log(`   Creada: ${sesion.fecha_creacion}`);
                console.log(`   Última actividad: ${sesion.ultima_actividad}`);
                console.log(`   Expira: ${sesion.fecha_expiracion}`);
            });
        }
        
        // Verificar todas las sesiones (activas e inactivas)
        const todasSesiones = await db.collection('sesiones').find({
            usuario_id: usuario.usuario_id
        }).sort({ fecha_creacion: -1 }).limit(10).toArray();
        
        console.log(`\n📊 Últimas 10 sesiones (activas e inactivas):`);
        todasSesiones.forEach((sesion, i) => {
            console.log(`${i + 1}. ${sesion.sesion_id} - Activa: ${sesion.activa} - Device: ${sesion.device_fingerprint}`);
        });
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testTokenValidation();
