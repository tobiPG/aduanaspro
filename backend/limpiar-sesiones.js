const { connectDB, closeDB, getDB } = require('./config/database');

async function limpiarSesionesInactivas() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Buscando sesiones inactivas...');
        
        // Listar todas las sesiones
        const todasSesiones = await db.collection('sesiones').find({}).toArray();
        console.log(`📊 Total de sesiones en BD: ${todasSesiones.length}`);
        
        todasSesiones.forEach(sesion => {
            console.log(`  - ${sesion.sesion_id} | Empresa: ${sesion.empresa_id} | Activo: ${sesion.activo} | Device: ${sesion.device_fingerprint}`);
        });
        
        // Eliminar sesiones inactivas (activo: false)
        const resultadoInactivas = await db.collection('sesiones').deleteMany({
            activo: false
        });
        
        console.log(`✅ Sesiones inactivas eliminadas: ${resultadoInactivas.deletedCount}`);
        
        // Opcional: Eliminar sesiones antiguas (más de 30 días)
        const hace30Dias = new Date();
        hace30Dias.setDate(hace30Dias.getDate() - 30);
        
        const resultadoAntiguas = await db.collection('sesiones').deleteMany({
            fecha_creacion: { $lt: hace30Dias.toISOString() }
        });
        
        console.log(`✅ Sesiones antiguas (>30 días) eliminadas: ${resultadoAntiguas.deletedCount}`);
        
        // Mostrar resumen final
        const sesionesRestantes = await db.collection('sesiones').countDocuments({});
        const sesionesActivas = await db.collection('sesiones').countDocuments({ activo: true });
        
        console.log('\n📊 RESUMEN FINAL:');
        console.log(`  Total de sesiones: ${sesionesRestantes}`);
        console.log(`  Sesiones activas: ${sesionesActivas}`);
        console.log(`  Sesiones inactivas: ${sesionesRestantes - sesionesActivas}`);
        
        // Mostrar sesiones por empresa
        console.log('\n👥 SESIONES POR EMPRESA:');
        const sesionesPorEmpresa = await db.collection('sesiones').aggregate([
            {
                $group: {
                    _id: '$empresa_id',
                    total: { $sum: 1 },
                    activas: {
                        $sum: { $cond: [{ $eq: ['$activo', true] }, 1, 0] }
                    }
                }
            }
        ]).toArray();
        
        for (const grupo of sesionesPorEmpresa) {
            const empresa = await db.collection('empresas').findOne({ empresa_id: grupo._id });
            console.log(`  ${empresa?.nombre || grupo._id}: ${grupo.activas} activas / ${grupo.total} total`);
        }
        
    } catch (error) {
        console.error('❌ Error al limpiar sesiones:', error);
    } finally {
        await closeDB();
        console.log('\n✅ Proceso completado');
    }
}

// Ejecutar
limpiarSesionesInactivas();
