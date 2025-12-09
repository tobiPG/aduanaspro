const { connectDB, getDB } = require('./config/database');

async function verificarDatos() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Verificando datos después del seed...\n');
        
        // Verificar usuario
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        if (usuario) {
            console.log('✅ Usuario demo:');
            console.log('  - ID:', usuario.usuario_id);
            console.log('  - Empresa ID:', usuario.empresa_id);
            console.log('  - Activo:', usuario.activo);
        } else {
            console.log('❌ Usuario demo NO existe');
        }
        
        // Verificar empresa
        const empresa = await db.collection('empresas').findOne({
            empresa_id: usuario?.empresa_id
        });
        
        if (empresa) {
            console.log('\n✅ Empresa:');
            console.log('  - ID:', empresa.empresa_id);
            console.log('  - Nombre:', empresa.nombre);
            console.log('  - Plan ID:', empresa.plan_id);
            console.log('  - Activa:', empresa.activa);
        } else {
            console.log('\n❌ Empresa NO existe');
        }
        
        // Verificar plan
        const plan = await db.collection('planes').findOne({
            id: empresa?.plan_id
        });
        
        if (plan) {
            console.log('\n✅ Plan:');
            console.log('  - ID:', plan.id);
            console.log('  - Tokens/mes:', plan.tokens_mes);
            console.log('  - Dispositivos:', plan.dispositivos_concurrentes);
        } else {
            console.log('\n❌ Plan NO existe para plan_id:', empresa?.plan_id);
            
            // Listar todos los planes
            const planes = await db.collection('planes').find({}).toArray();
            console.log('\n📋 Planes disponibles en BD:', planes.length);
            planes.forEach(p => {
                console.log(`  - ${p.id || p._id} (tokens: ${p.tokens_mes})`);
            });
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verificarDatos();
