/**
 * Script: Verificar datos del usuario demo
 */

const { connectDB, getDB } = require('./config/database');

async function verificarUsuarioDemo() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('👤 Buscando usuario demo@importadora.com...\n');
        
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        if (!usuario) {
            console.log('❌ Usuario no encontrado');
            process.exit(1);
        }
        
        console.log('✅ Usuario encontrado:');
        console.log(`   Usuario ID: ${usuario.usuario_id}`);
        console.log(`   Nombre: ${usuario.nombre}`);
        console.log(`   Correo: ${usuario.correo}`);
        console.log(`   Empresa ID: ${usuario.empresa_id}`);
        console.log(`   Rol: ${usuario.rol || 'user'}`);
        console.log(`   Activo: ${usuario.activo}`);
        
        // Buscar la empresa
        const empresa = await db.collection('empresas').findOne({
            empresa_id: usuario.empresa_id
        });
        
        if (empresa) {
            console.log(`\n🏢 Empresa asociada:`);
            console.log(`   Empresa ID: ${empresa.empresa_id}`);
            console.log(`   Nombre: ${empresa.nombre}`);
            console.log(`   Plan: ${empresa.plan_id}`);
            console.log(`   Tokens límite: ${empresa.tokens_limite_mensual}`);
            console.log(`   Tokens consumidos: ${empresa.tokens_consumidos}`);
        }
        
        // Contar clasificaciones de esta empresa
        const totalClasificaciones = await db.collection('clasificaciones').countDocuments({
            empresa_id: usuario.empresa_id
        });
        
        console.log(`\n📊 Total clasificaciones de esta empresa: ${totalClasificaciones}`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

verificarUsuarioDemo();
