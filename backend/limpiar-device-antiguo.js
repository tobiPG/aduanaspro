const { connectDB, closeDB, getDB } = require('./config/database');

async function limpiarSesionesViejas() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Eliminando sesiones con device fingerprints antiguos...');
        
        // Eliminar sesiones que NO usan el formato fp_xxxxx
        const resultado = await db.collection('sesiones').deleteMany({
            device_fingerprint: { $regex: '^device-' }
        });
        
        console.log(`✅ Sesiones con device fingerprint antiguo eliminadas: ${resultado.deletedCount}`);
        
        // Mostrar sesiones restantes
        const sesionesRestantes = await db.collection('sesiones')
            .find({ activo: true })
            .toArray();
        
        console.log(`\n📊 Sesiones activas restantes: ${sesionesRestantes.length}`);
        for (const sesion of sesionesRestantes) {
            console.log(`  - ${sesion.sesion_id} | Device: ${sesion.device_fingerprint}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await closeDB();
        console.log('\n✅ Proceso completado');
    }
}

limpiarSesionesViejas();
