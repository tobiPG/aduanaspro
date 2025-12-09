/**
 * Debug: Ver estructura real de las sesiones
 */

const { connectDB, getDB } = require('./config/database');

async function debugSesiones() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Obteniendo sesiones reales...\n');
        
        const sesiones = await db.collection('sesiones')
            .find({})
            .sort({ _id: -1 })
            .limit(3)
            .toArray();
        
        sesiones.forEach((sesion, i) => {
            console.log(`\n${i + 1}. Sesión completa:`);
            console.log(JSON.stringify(sesion, null, 2));
        });
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugSesiones();
