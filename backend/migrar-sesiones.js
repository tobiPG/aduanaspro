/**
 * Script: Migración para arreglar el campo activo en sesiones
 * Propósito: Actualizar todas las sesiones que no tienen el campo 'activo'
 */

const { connectDB, getDB } = require('./config/database');

async function migrarSesiones() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔧 Iniciando migración de sesiones...\n');
        
        // 1. Contar sesiones sin el campo 'activo'
        const sesionesSinCampo = await db.collection('sesiones').countDocuments({
            activo: { $exists: false }
        });
        
        console.log(`📊 Sesiones sin campo 'activo': ${sesionesSinCampo}`);
        
        if (sesionesSinCampo === 0) {
            console.log('✅ Todas las sesiones ya tienen el campo activo');
            process.exit(0);
        }
        
        // 2. Actualizar sesiones sin el campo (ponerlas como activas por defecto)
        const result = await db.collection('sesiones').updateMany(
            { activo: { $exists: false } },
            { $set: { activo: true } }
        );
        
        console.log(`\n✅ Actualizadas ${result.modifiedCount} sesiones`);
        
        // 3. Verificar el resultado
        const ahora = new Date();
        const hace24Horas = new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString();
        
        // Marcar como inactivas las sesiones antiguas (más de 24 horas sin actividad)
        const resultInactivas = await db.collection('sesiones').updateMany(
            {
                activo: true,
                ts_ultima_actividad: { $lt: hace24Horas }
            },
            { $set: { activo: false } }
        );
        
        console.log(`🔒 Marcadas como inactivas: ${resultInactivas.modifiedCount} sesiones antiguas`);
        
        // 4. Mostrar resumen
        const totalActivas = await db.collection('sesiones').countDocuments({ activo: true });
        const totalInactivas = await db.collection('sesiones').countDocuments({ activo: false });
        
        console.log('\n📊 Resumen:');
        console.log(`   Sesiones activas: ${totalActivas}`);
        console.log(`   Sesiones inactivas: ${totalInactivas}`);
        console.log(`   Total: ${totalActivas + totalInactivas}`);
        
        console.log('\n✅ Migración completada exitosamente');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error en migración:', error);
        process.exit(1);
    }
}

migrarSesiones();
