const { connectDB, closeDB, getDB } = require('./config/database');

async function sincronizarPlanes() {
    try {
        console.log('🔄 Conectando a MongoDB...');
        await connectDB();
        const db = getDB();
        
        // Crear/Actualizar planes para que coincidan con el frontend
        console.log('\n📋 Actualizando planes...');
        
        const planesActualizados = [
            {
                id: 'plan-gratuito',
                nombre: 'Plan Gratuito',
                tokens_mes: 100,
                dispositivos_concurrentes: 1,
                precio_mensual_usd: 0,
                features: ['Para probar el sistema', 'Soporte por email']
            },
            {
                id: 'plan-basico',
                nombre: 'Plan Básico',
                tokens_mes: 1000,
                dispositivos_concurrentes: 3,
                precio_mensual_usd: 29.99,
                features: ['Perfecto para pequeñas empresas', 'Soporte prioritario']
            },
            {
                id: 'plan-profesional',
                nombre: 'Plan Profesional',
                tokens_mes: 5000,
                dispositivos_concurrentes: 8,
                precio_mensual_usd: 59.99,
                features: ['Ideal para empresas medianas', 'Soporte 24/7', 'API access']
            }
        ];
        
        for (const plan of planesActualizados) {
            await db.collection('planes').updateOne(
                { id: plan.id },
                { $set: plan },
                { upsert: true }
            );
            console.log(`✅ Plan actualizado: ${plan.nombre} (${plan.tokens_mes.toLocaleString()} tokens, ${plan.dispositivos_concurrentes} dispositivos)`);
        }
        
        // Actualizar empresa "Importadora Demo SRL" para usar el plan Profesional
        console.log('\n\n🏢 Actualizando plan de empresa...');
        
        const resultado = await db.collection('empresas').updateOne(
            { nombre: 'Importadora Demo SRL' },
            { 
                $set: { 
                    plan_id: 'plan-profesional',
                    tokens_limite_mensual: 5000,
                    // Mantener tokens_consumidos actual
                } 
            }
        );
        
        if (resultado.modifiedCount > 0) {
            console.log('✅ Empresa actualizada a Plan Profesional');
            console.log('   Tokens límite: 5,000');
            console.log('   Dispositivos: 8');
        }
        
        // Verificar cambios
        console.log('\n\n📊 VERIFICACIÓN FINAL:');
        const empresa = await db.collection('empresas').findOne({ nombre: 'Importadora Demo SRL' });
        const plan = await db.collection('planes').findOne({ id: empresa.plan_id });
        
        console.log(`\n🏢 ${empresa.nombre}`);
        console.log(`   Plan: ${plan.nombre}`);
        console.log(`   Tokens: ${empresa.tokens_consumidos.toLocaleString()} / ${empresa.tokens_limite_mensual.toLocaleString()}`);
        console.log(`   Dispositivos: ${plan.dispositivos_concurrentes}`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await closeDB();
        console.log('\n✅ Proceso completado');
    }
}

sincronizarPlanes();
