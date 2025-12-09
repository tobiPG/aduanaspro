// Script de prueba para las nuevas APIs
// Nota: Requiere que MongoDB esté corriendo y el servidor iniciado

const BASE_URL = 'http://localhost:3050';

// Función auxiliar para hacer requests
async function request(method, endpoint, data = null, token = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(BASE_URL + endpoint, options);
        const json = await response.json();
        return { status: response.status, data: json };
    } catch (error) {
        return { status: 0, error: error.message };
    }
}

async function testAPIs() {
    console.log('🧪 Probando nuevas APIs...\n');
    
    // 1. Health Check
    console.log('1️⃣ Health Check:');
    const health = await request('GET', '/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Data:`, health.data);
    console.log('');
    
    // 2. Probar rutas sin autenticación (deberían retornar 401)
    console.log('2️⃣ Historial (sin auth - debería fallar):');
    const historial = await request('GET', '/api/historial');
    console.log(`   Status: ${historial.status} (esperado: 401)`);
    console.log(`   Data:`, historial.data);
    console.log('');
    
    console.log('3️⃣ Alertas de Tokens (sin auth - debería fallar):');
    const alertas = await request('GET', '/api/alertas/tokens');
    console.log(`   Status: ${alertas.status} (esperado: 401)`);
    console.log(`   Data:`, alertas.data);
    console.log('');
    
    console.log('4️⃣ Config Defaults (sin auth - debería fallar):');
    const config = await request('GET', '/api/config/defaults');
    console.log(`   Status: ${config.status} (esperado: 401)`);
    console.log(`   Data:`, config.data);
    console.log('');
    
    // 5. Probar registro (necesita MongoDB)
    console.log('5️⃣ Registro de usuario (necesita MongoDB):');
    const registro = await request('POST', '/api/auth/registro', {
        nombre: 'Usuario Test',
        correo: 'test@example.com',
        contrasena: 'test123456',
        empresa_id: 'emp-test-001'
    });
    console.log(`   Status: ${registro.status}`);
    console.log(`   Data:`, registro.data);
    console.log('');
    
    console.log('✅ Pruebas completadas\n');
    console.log('📝 Notas:');
    console.log('   - Las rutas protegidas deben retornar 401 sin token');
    console.log('   - Las rutas de auth necesitan MongoDB corriendo');
    console.log('   - Para pruebas completas, iniciar MongoDB primero');
}

// Ejecutar pruebas
testAPIs().catch(console.error);
