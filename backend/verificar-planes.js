const { connectDB, closeDB, getDB } = require('./config/database');

async function verificarPlanes() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await connectDB();
        const db = getDB();
        
        // Ver planes disponibles
        console.log('\n📋 PLANES DISPONIBLES:');
        const planes = await db.collection('planes').find({}).toArray();
        
        for (const plan of planes) {
            console.log(`\n📦 ${plan.nombre}`);
            console.log(`   ID: ${plan.id}`);
            console.log(`   Tokens/mes: ${plan.tokens_mes.toLocaleString()}`);
            console.log(`   Dispositivos: ${plan.dispositivos_concurrentes}`);
            console.log(`   Precio: $${plan.precio_mensual_usd}/mes`);
        }
        
        // Ver empresas y sus planes
        console.log('\n\n🏢 EMPRESAS Y SUS PLANES:');
        const empresas = await db.collection('empresas').find({}).toArray();
        
        for (const empresa of empresas) {
            const plan = await db.collection('planes').findOne({ id: empresa.plan_id });
            console.log(`\n🏢 ${empresa.nombre}`);
            console.log(`   Plan asignado: ${empresa.plan_id}`);
            console.log(`   Tokens límite en empresa: ${empresa.tokens_limite_mensual.toLocaleString()}`);
            console.log(`   Tokens consumidos: ${empresa.tokens_consumidos.toLocaleString()}`);
            
            if (plan) {
                console.log(`   ✅ Plan encontrado: ${plan.nombre}`);
                console.log(`      Tokens del plan: ${plan.tokens_mes.toLocaleString()}`);
                console.log(`      Dispositivos del plan: ${plan.dispositivos_concurrentes}`);
                
                if (empresa.tokens_limite_mensual !== plan.tokens_mes) {
                    console.log(`   ⚠️  DESINCRONIZADO: empresa tiene ${empresa.tokens_limite_mensual.toLocaleString()} pero plan tiene ${plan.tokens_mes.toLocaleString()}`);
                }
            } else {
                console.log(`   ❌ Plan no encontrado`);
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await closeDB();
        console.log('\n✅ Proceso completado');
    }
}

verificarPlanes();
