/**
 * Test rápido: Simular la carga de historial
 */

async function testHistorialHTTP() {
    const fetch = require('node-fetch');
    const AuthService = require('./services/authService');
    const { connectDB } = require('./config/database');
    
    await connectDB();
    
    // Login
    const login = await AuthService.iniciarSesion(
        'demo@importadora.com',
        'demo123',
        'test-fp-001',
        '127.0.0.1'
    );
    
    if (!login.success) {
        console.log('❌ Login falló');
        return;
    }
    
    console.log('✅ Login exitoso');
    console.log('🔑 Token empresa_id:', login.usuario.empresa_id);
    
    // Hacer request al historial
    const response = await fetch('http://127.0.0.1:3050/api/historial?limite=50', {
        headers: {
            'Authorization': `Bearer ${login.token}`,
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    
    console.log('\n📋 Respuesta del endpoint:');
    console.log('Status:', response.status);
    console.log('Total clasificaciones:', data.paginacion?.total);
    
    if (data.clasificaciones) {
        console.log('\n📄 Clasificaciones recibidas:');
        data.clasificaciones.forEach((clf, i) => {
            console.log(`${i+1}. ${clf.nombre_archivo} - Empresa: ${clf.empresa_id || 'NO DEFINIDO'}`);
        });
    }
    
    process.exit(0);
}

testHistorialHTTP().catch(console.error);
