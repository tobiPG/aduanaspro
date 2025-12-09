/**
 * Script: Test del endpoint de historial
 */

const { connectDB } = require('./config/database');
const AuthService = require('./services/authService');

async function testHistorial() {
    try {
        await connectDB();
        
        // Iniciar sesión con el usuario demo
        console.log('🔐 Iniciando sesión como demo@importadora.com...\n');
        
        const loginResult = await AuthService.iniciarSesion(
            'demo@importadora.com',
            'demo123',
            'test-fingerprint-historial',
            '127.0.0.1'
        );
        
        if (!loginResult.success) {
            console.log('❌ Error en login:', loginResult);
            process.exit(1);
        }
        
        console.log('✅ Login exitoso');
        console.log(`   Token: ${loginResult.token.substring(0, 30)}...`);
        console.log(`   Usuario ID: ${loginResult.usuario.usuario_id}`);
        console.log(`   Empresa ID: ${loginResult.usuario.empresa_id}`);
        
        // Verificar el token
        const tokenVerification = await AuthService.verificarToken(loginResult.token);
        
        console.log('\n📋 Verificación de token:');
        console.log(`   Valid: ${tokenVerification.valid}`);
        console.log(`   Usuario ID: ${tokenVerification.usuario_id}`);
        console.log(`   Empresa ID: ${tokenVerification.empresa_id}`);
        
        // Ahora probar el endpoint de historial
        const HistorialService = require('./services/historialService');
        
        console.log('\n📚 Cargando historial para empresa:', tokenVerification.empresa_id);
        
        const historial = await HistorialService.obtenerHistorial(
            tokenVerification.empresa_id,
            { limite: 50 }
        );
        
        if (historial.success) {
            console.log(`\n✅ Historial cargado exitosamente`);
            console.log(`   Total: ${historial.paginacion.total} clasificaciones`);
            console.log(`   Página: ${historial.paginacion.pagina}`);
            console.log(`\n📋 Clasificaciones:`);
            historial.clasificaciones.forEach((clf, index) => {
                console.log(`   ${index + 1}. ${clf.nombre_archivo} (${clf.clasificacion_id})`);
            });
        } else {
            console.log('❌ Error cargando historial:', historial);
        }
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testHistorial();
