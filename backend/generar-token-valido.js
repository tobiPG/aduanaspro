const jwt = require('jsonwebtoken');
const { connectDB, getDB } = require('./config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'clasificador-arancelario-secret-key-2025';

async function generarTokenValido() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔑 Generando token válido para usuario demo...\n');
        
        // Obtener el usuario demo
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        if (!usuario) {
            console.log('❌ Usuario demo no encontrado');
            process.exit(1);
        }
        
        // Obtener la sesión activa más reciente (o crear una nueva)
        let sesion = await db.collection('sesiones').findOne(
            { 
                usuario_id: usuario.usuario_id,
                activo: true
            },
            { sort: { ts_login: -1 } }
        );
        
        // SIEMPRE crear una nueva sesión con el fingerprint correcto
        console.log('🆕 Creando nueva sesión con fingerprint del usuario...');
        
        const generarId = require('./models/schemas').generarId;
        
        // Desactivar sesiones antiguas primero
        await db.collection('sesiones').updateMany(
            { 
                usuario_id: usuario.usuario_id,
                activo: true
            },
            { $set: { activo: false } }
        );
        
        // Crear nueva sesión
        const sesionId = generarId('ses');
        const ahora = new Date().toISOString();
        
        const nuevaSesion = {
            sesion_id: sesionId,
            empresa_id: usuario.empresa_id,
            usuario_id: usuario.usuario_id,
            device_fingerprint: 'fp_jpm5eb', // Usar el fingerprint real del usuario
            ip: '127.0.0.1',
            activo: true,
            ts_login: ahora,
            ts_ultima_actividad: ahora
        };
        
        await db.collection('sesiones').insertOne(nuevaSesion);
        sesion = nuevaSesion;
        
        console.log('✅ Nueva sesión creada:', sesionId);
        
        // Obtener empresa
        const empresa = await db.collection('empresas').findOne({
            empresa_id: sesion.empresa_id
        });
        
        // Generar JWT
        const tokenPayload = {
            usuario_id: sesion.usuario_id,
            empresa_id: sesion.empresa_id,
            sesion_id: sesion.sesion_id,
            device_fingerprint: sesion.device_fingerprint
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        
        console.log('\n📋 INFORMACIÓN DE LA SESIÓN:');
        console.log('  - Usuario:', usuario.nombre, `(${usuario.correo})`);
        console.log('  - Empresa:', empresa.nombre);
        console.log('  - Sesión ID:', sesion.sesion_id);
        console.log('  - Device Fingerprint:', sesion.device_fingerprint);
        console.log('  - Activo:', sesion.activo ? '✅' : '❌');
        
        console.log('\n🔑 TOKEN JWT (copia esto):');
        console.log('─'.repeat(80));
        console.log(token);
        console.log('─'.repeat(80));
        
        console.log('\n📝 INSTRUCCIONES:');
        console.log('1. Abre la consola del navegador (F12)');
        console.log('2. Ejecuta: localStorage.setItem("authToken", "' + token + '")');
        console.log('3. Ejecuta: localStorage.setItem("deviceFingerprint", "' + sesion.device_fingerprint + '")');
        console.log('4. Recarga la página (F5)');
        
        console.log('\n✅ Listo! La sesión debería funcionar ahora.\n');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

generarTokenValido();
