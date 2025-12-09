const jwt = require('jsonwebtoken');
const { connectDB, getDB } = require('./config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'clave-secreta-clasificador-2024';

async function debugJWT() {
    try {
        await connectDB();
        const db = getDB();
        
        console.log('🔍 Analizando última sesión activa del usuario demo...\n');
        
        // Obtener el usuario demo
        const usuario = await db.collection('usuarios').findOne({
            correo: 'demo@importadora.com'
        });
        
        if (!usuario) {
            console.log('❌ Usuario demo no encontrado');
            return;
        }
        
        console.log('✅ Usuario demo encontrado:', usuario.usuario_id);
        
        // Obtener la sesión activa más reciente
        const sesion = await db.collection('sesiones').findOne(
            { 
                usuario_id: usuario.usuario_id,
                activo: true
            },
            { sort: { ts_login: -1 } }
        );
        
        if (!sesion) {
            console.log('❌ No hay sesión activa para el usuario demo');
            return;
        }
        
        console.log('\n📋 Sesión activa encontrada:');
        console.log('  - sesion_id:', sesion.sesion_id);
        console.log('  - usuario_id:', sesion.usuario_id);
        console.log('  - empresa_id:', sesion.empresa_id);
        console.log('  - device_fingerprint:', sesion.device_fingerprint);
        console.log('  - activo:', sesion.activo);
        console.log('  - ts_login:', sesion.ts_login);
        console.log('  - ts_ultima_actividad:', sesion.ts_ultima_actividad);
        
        // Generar un JWT con los mismos datos
        const tokenPayload = {
            usuario_id: sesion.usuario_id,
            empresa_id: sesion.empresa_id,
            sesion_id: sesion.sesion_id,
            device_fingerprint: sesion.device_fingerprint
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });
        
        console.log('\n🔑 JWT generado (copialo al localStorage como authToken):');
        console.log(token);
        
        // Decodificar y verificar
        const decoded = jwt.verify(token, JWT_SECRET);
        
        console.log('\n🔓 JWT decodificado:');
        console.log('  - usuario_id:', decoded.usuario_id);
        console.log('  - empresa_id:', decoded.empresa_id);
        console.log('  - sesion_id:', decoded.sesion_id);
        console.log('  - device_fingerprint:', decoded.device_fingerprint);
        console.log('  - exp:', new Date(decoded.exp * 1000).toISOString());
        
        // Verificar tipos
        console.log('\n📊 Tipos de datos en sesión:');
        console.log('  - typeof sesion_id:', typeof sesion.sesion_id);
        console.log('  - typeof usuario_id:', typeof sesion.usuario_id);
        console.log('  - typeof empresa_id:', typeof sesion.empresa_id);
        console.log('  - typeof device_fingerprint:', typeof sesion.device_fingerprint);
        console.log('  - typeof activo:', typeof sesion.activo);
        
        console.log('\n📊 Tipos de datos en JWT:');
        console.log('  - typeof sesion_id:', typeof decoded.sesion_id);
        console.log('  - typeof usuario_id:', typeof decoded.usuario_id);
        console.log('  - typeof empresa_id:', typeof decoded.empresa_id);
        console.log('  - typeof device_fingerprint:', typeof decoded.device_fingerprint);
        
        // Intentar buscar la sesión como lo hace verificarToken
        console.log('\n🔍 Intentando buscar sesión con findOne (como verificarToken):');
        const sesionEncontrada = await db.collection('sesiones').findOne({
            sesion_id: decoded.sesion_id,
            usuario_id: decoded.usuario_id,
            empresa_id: decoded.empresa_id,
            device_fingerprint: decoded.device_fingerprint,
            activo: true
        });
        
        if (sesionEncontrada) {
            console.log('✅ Sesión encontrada correctamente con findOne');
        } else {
            console.log('❌ Sesión NO encontrada con findOne - investigando...');
            
            // Buscar por cada campo individualmente
            const porSesionId = await db.collection('sesiones').findOne({ sesion_id: decoded.sesion_id });
            console.log('  - Por sesion_id:', porSesionId ? '✅' : '❌');
            
            if (porSesionId) {
                console.log('    Sesión encontrada:');
                console.log('    - usuario_id match:', porSesionId.usuario_id === decoded.usuario_id);
                console.log('    - empresa_id match:', porSesionId.empresa_id === decoded.empresa_id);
                console.log('    - device_fingerprint match:', porSesionId.device_fingerprint === decoded.device_fingerprint);
                console.log('    - activo:', porSesionId.activo);
                
                // Comparación estricta byte por byte
                console.log('\n    Comparación de strings (con length):');
                console.log('    - usuario_id:', `"${porSesionId.usuario_id}" (${porSesionId.usuario_id.length}) vs "${decoded.usuario_id}" (${decoded.usuario_id.length})`);
                console.log('    - empresa_id:', `"${porSesionId.empresa_id}" (${porSesionId.empresa_id.length}) vs "${decoded.empresa_id}" (${decoded.empresa_id.length})`);
                console.log('    - device_fingerprint:', `"${porSesionId.device_fingerprint}" (${porSesionId.device_fingerprint.length}) vs "${decoded.device_fingerprint}" (${decoded.device_fingerprint.length})`);
            }
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugJWT();
