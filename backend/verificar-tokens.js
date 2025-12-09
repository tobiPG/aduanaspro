const { connectDB, closeDB, getDB } = require('./config/database');

async function verificarTokens() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await connectDB();
        const db = getDB();
        
        // Ver estado de empresas
        console.log('\n📊 ESTADO DE EMPRESAS:');
        const empresas = await db.collection('empresas').find({}).toArray();
        
        for (const empresa of empresas) {
            console.log(`\n🏢 ${empresa.nombre}`);
            console.log(`   ID: ${empresa.empresa_id}`);
            console.log(`   Plan: ${empresa.plan_id}`);
            console.log(`   Tokens consumidos: ${empresa.tokens_consumidos || 0}`);
            console.log(`   Tokens límite: ${empresa.tokens_limite_mensual || 0}`);
        }
        
        // Ver clasificaciones recientes
        console.log('\n\n📝 CLASIFICACIONES RECIENTES:');
        const clasificaciones = await db.collection('clasificaciones')
            .find({})
            .sort({ fecha_creacion: -1 })
            .limit(5)
            .toArray();
        
        for (const clf of clasificaciones) {
            console.log(`\n- ${clf.nombre_archivo}`);
            console.log(`  ID: ${clf.clasificacion_id}`);
            console.log(`  Empresa: ${clf.empresa_id}`);
            console.log(`  Tokens: ${clf.tokens_consumidos || 0}`);
            console.log(`  Fecha: ${clf.fecha_creacion}`);
        }
        
        // Ver sesiones activas
        console.log('\n\n👥 SESIONES ACTIVAS:');
        const sesiones = await db.collection('sesiones')
            .find({ activo: true })
            .toArray();
        
        for (const sesion of sesiones) {
            const empresa = await db.collection('empresas').findOne({ empresa_id: sesion.empresa_id });
            console.log(`\n- ${sesion.sesion_id}`);
            console.log(`  Empresa: ${empresa?.nombre || sesion.empresa_id}`);
            console.log(`  Device: ${sesion.device_fingerprint}`);
            console.log(`  Fecha: ${sesion.fecha_creacion}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await closeDB();
        console.log('\n✅ Proceso completado');
    }
}

verificarTokens();
