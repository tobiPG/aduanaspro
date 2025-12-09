/**
 * Script: Verificar clasificaciones en historial
 * Propósito: Ver qué empresa_id tienen las clasificaciones
 */

const { connectDB, getDB } = require('./config/database');

async function verificarHistorial() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('📋 Verificando clasificaciones en historial...\n');
        
        const clasificaciones = await db.collection('clasificaciones')
            .find({})
            .project({
                clasificacion_id: 1,
                empresa_id: 1,
                usuario_id: 1,
                nombre_archivo: 1,
                fecha_creacion: 1
            })
            .limit(20)
            .sort({ fecha_creacion: -1 })
            .toArray();
        
        console.log(`Total de clasificaciones encontradas: ${clasificaciones.length}\n`);
        
        clasificaciones.forEach((clf, index) => {
            console.log(`${index + 1}. Clasificación ID: ${clf.clasificacion_id}`);
            console.log(`   Empresa ID: ${clf.empresa_id || 'NO DEFINIDO'}`);
            console.log(`   Usuario ID: ${clf.usuario_id || 'NO DEFINIDO'}`);
            console.log(`   Archivo: ${clf.nombre_archivo}`);
            console.log(`   Fecha: ${clf.fecha_creacion}`);
            console.log('');
        });
        
        // Contar por empresa
        const porEmpresa = await db.collection('clasificaciones').aggregate([
            {
                $group: {
                    _id: '$empresa_id',
                    total: { $sum: 1 }
                }
            }
        ]).toArray();
        
        console.log('📊 Clasificaciones por empresa:');
        porEmpresa.forEach(item => {
            console.log(`   Empresa ${item._id || 'SIN EMPRESA'}: ${item.total} clasificaciones`);
        });
        
        // Ver empresas disponibles
        console.log('\n🏢 Empresas registradas:');
        const empresas = await db.collection('empresas')
            .find({})
            .project({ empresa_id: 1, nombre: 1 })
            .toArray();
        
        empresas.forEach(emp => {
            console.log(`   ${emp.empresa_id} - ${emp.nombre}`);
        });
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verificarHistorial();
