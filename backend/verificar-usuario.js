const { connectDB, getDB } = require('./config/database');

async function verificarUsuario() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Verificando usuario demo...\n');
        
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        if (usuario) {
            console.log('✅ Usuario demo existe:');
            console.log('  - ID:', usuario.usuario_id);
            console.log('  - Nombre:', usuario.nombre);
            console.log('  - Correo:', usuario.correo);
            console.log('  - Empresa ID:', usuario.empresa_id);
            console.log('  - Activo:', usuario.activo);
        } else {
            console.log('❌ Usuario demo NO existe');
            console.log('\n💡 Ejecuta este comando para recrearlo:');
            console.log('   node seed.js');
        }
        
        // Verificar todas las empresas
        const empresas = await db.collection('empresas').find({}).toArray();
        console.log('\n📋 Empresas en la base de datos:', empresas.length);
        empresas.forEach(e => {
            console.log(`  - ${e.nombre} (${e.empresa_id})`);
        });
        
        // Verificar todos los usuarios
        const usuarios = await db.collection('usuarios').find({}).toArray();
        console.log('\n👥 Usuarios en la base de datos:', usuarios.length);
        usuarios.forEach(u => {
            console.log(`  - ${u.nombre} (${u.correo})`);
        });
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verificarUsuario();
