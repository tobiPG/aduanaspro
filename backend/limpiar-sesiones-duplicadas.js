const { connectDB, closeDB, getDB } = require('./config/database');

async function limpiarSesionesDuplicadas() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Buscando sesiones duplicadas por empresa...');
        
        // Obtener todas las empresas
        const empresas = await db.collection('empresas').find({}).toArray();
        
        for (const empresa of empresas) {
            console.log(`\n📊 Procesando empresa: ${empresa.nombre}`);
            
            // Obtener todas las sesiones de esta empresa ordenadas por fecha
            const sesiones = await db.collection('sesiones')
                .find({ empresa_id: empresa.empresa_id })
                .sort({ fecha_creacion: -1 }) // Más reciente primero
                .toArray();
            
            console.log(`  Total de sesiones: ${sesiones.length}`);
            
            if (sesiones.length > 1) {
                // Mantener solo la sesión más reciente
                const sesionMasReciente = sesiones[0];
                const sesionesAEliminar = sesiones.slice(1);
                
                console.log(`  ✅ Manteniendo sesión más reciente: ${sesionMasReciente.sesion_id}`);
                console.log(`     Device: ${sesionMasReciente.device_fingerprint}`);
                console.log(`     Fecha: ${sesionMasReciente.fecha_creacion}`);
                console.log(`     Activa: ${sesionMasReciente.activo}`);
                
                // Asegurarse de que la sesión más reciente esté activa
                if (!sesionMasReciente.activo) {
                    await db.collection('sesiones').updateOne(
                        { sesion_id: sesionMasReciente.sesion_id },
                        { $set: { activo: true } }
                    );
                    console.log(`  🔄 Sesión más reciente marcada como activa`);
                }
                
                // Eliminar sesiones antiguas
                for (const sesion of sesionesAEliminar) {
                    console.log(`  🗑️  Eliminando sesión antigua: ${sesion.sesion_id} (${sesion.fecha_creacion})`);
                    await db.collection('sesiones').deleteOne({ sesion_id: sesion.sesion_id });
                }
                
                console.log(`  ✅ ${sesionesAEliminar.length} sesiones antiguas eliminadas`);
            } else if (sesiones.length === 1) {
                console.log(`  ✅ Solo hay 1 sesión (OK)`);
                // Asegurarse de que esté activa
                if (!sesiones[0].activo) {
                    await db.collection('sesiones').updateOne(
                        { sesion_id: sesiones[0].sesion_id },
                        { $set: { activo: true } }
                    );
                    console.log(`  🔄 Sesión marcada como activa`);
                }
            } else {
                console.log(`  ℹ️  No hay sesiones para esta empresa`);
            }
        }
        
        // Mostrar resumen final
        console.log('\n📊 RESUMEN FINAL:');
        const sesionesPorEmpresa = await db.collection('sesiones').aggregate([
            {
                $lookup: {
                    from: 'empresas',
                    localField: 'empresa_id',
                    foreignField: 'empresa_id',
                    as: 'empresa'
                }
            },
            { $unwind: '$empresa' },
            {
                $group: {
                    _id: '$empresa_id',
                    nombre: { $first: '$empresa.nombre' },
                    total: { $sum: 1 },
                    activas: {
                        $sum: { $cond: [{ $eq: ['$activo', true] }, 1, 0] }
                    }
                }
            }
        ]).toArray();
        
        for (const grupo of sesionesPorEmpresa) {
            console.log(`  ${grupo.nombre}: ${grupo.activas} activas / ${grupo.total} total`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await closeDB();
        console.log('\n✅ Proceso completado');
    }
}

// Ejecutar
limpiarSesionesDuplicadas();
