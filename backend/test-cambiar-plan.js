// Script para probar el endpoint de planes
const fetch = require('node-fetch');

async function probarEndpoint() {
    try {
        console.log('🔍 Probando endpoint /api/planes/cambiar...\n');
        
        // Primero hacer login para obtener un token
        console.log('1️⃣ Haciendo login...');
        const loginResponse = await fetch('http://127.0.0.1:3050/api/auth/login', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': 'fp_test123'
            },
            body: JSON.stringify({
                correo: 'demo@importadora.com',
                contrasena: 'demo123'
            })
        });
        
        const loginData = await loginResponse.json();
        
        if (!loginData.token) {
            console.error('❌ Error en login:', loginData);
            return;
        }
        
        console.log('✅ Login exitoso');
        console.log('Token:', loginData.token.substring(0, 20) + '...\n');
        
        // Ahora probar cambiar plan
        console.log('2️⃣ Intentando cambiar plan...');
        const cambiarResponse = await fetch('http://127.0.0.1:3050/api/planes/cambiar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${loginData.token}`
            },
            body: JSON.stringify({
                plan_id: 'plan-basico'
            })
        });
        
        console.log('Status:', cambiarResponse.status);
        const cambiarData = await cambiarResponse.json();
        console.log('Respuesta:', JSON.stringify(cambiarData, null, 2));
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

probarEndpoint();
