const { connectDB, getDB } = require('./config/database');

async function verTodasSesiones() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('📋 Todas las sesiones del usuario demo:\n');
        
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        const sesiones = await db.collection('sesiones')
            .find({ usuario_id: usuario.usuario_id })
            .sort({ ts_login: -1 })
            .limit(10)
            .toArray();
        
        sesiones.forEach((s, i) => {
            console.log(`${i + 1}. ${s.sesion_id}`);
            console.log(`   - Device: ${s.device_fingerprint}`);
            console.log(`   - Activo: ${s.activo ? '✅' : '❌'}`);
            console.log(`   - Login: ${s.ts_login}`);
            console.log(`   - Última actividad: ${s.ts_ultima_actividad}`);
            
            const minutosInactivo = (Date.now() - new Date(s.ts_ultima_actividad).getTime()) / 1000 / 60;
            console.log(`   - Inactivo: ${minutosInactivo.toFixed(2)} minutos`);
            console.log('');
        });
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verTodasSesiones();
