const { connectDB, getDB } = require('./config/database');
const bcrypt = require('bcryptjs');

async function resetearPassword() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔐 Reseteando contraseña del usuario demo...\n');
        
        // Generar nuevo hash para demo123
        const saltRounds = 12;
        const nuevoHash = await bcrypt.hash('demo123', saltRounds);
        
        // Actualizar el usuario
        const resultado = await db.collection('usuarios').updateOne(
            { correo: 'demo@importadora.com' },
            { $set: { contrasena_hash: nuevoHash } }
        );
        
        if (resultado.modifiedCount > 0) {
            console.log('✅ Contraseña actualizada correctamente');
            console.log('\n📋 Credenciales:');
            console.log('  Correo: demo@importadora.com');
            console.log('  Contraseña: demo123');
            
            // Verificar que funciona
            const usuario = await db.collection('usuarios').findOne({ 
                correo: 'demo@importadora.com' 
            });
            
            const esValida = await bcrypt.compare('demo123', usuario.contrasena_hash);
            
            if (esValida) {
                console.log('\n✅ Verificación exitosa - la contraseña funciona correctamente');
            } else {
                console.log('\n❌ ERROR - La contraseña no verifica correctamente');
            }
            
        } else {
            console.log('❌ No se pudo actualizar (usuario no encontrado?)');
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

resetearPassword();
