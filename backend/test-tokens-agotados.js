/**
 * Script de prueba: Verificar que el login funciona cuando los tokens están agotados
 * pero que la clasificación es bloqueada
 */

const fetch = require('node-fetch');

const API_BASE_URL = 'http://127.0.0.1:3050';

async function testLoginConTokensAgotados() {
  console.log('\n🧪 TEST: Login y clasificación con tokens agotados');
  console.log('='.repeat(60));
  
  try {
    // Paso 1: Login (debería funcionar incluso con tokens agotados)
    console.log('\n1️⃣ Intentando login con demo@importadora.com...');
    
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Fingerprint': 'fp_test_' + Date.now()
      },
      body: JSON.stringify({
        correo: 'demo@importadora.com',
        contrasena: 'demo123'
      })
    });
    
    const loginData = await loginResponse.json();
    
    console.log(`\nStatus: ${loginResponse.status}`);
    console.log('Respuesta:', JSON.stringify(loginData, null, 2));
    
    if (!loginResponse.ok) {
      console.log('\n❌ ERROR: El login falló!');
      console.log('Esto no debería ocurrir incluso con tokens agotados.');
      return;
    }
    
    if (!loginData.token) {
      console.log('\n❌ ERROR: No se recibió token de autenticación');
      return;
    }
    
    console.log('\n✅ Login exitoso!');
    console.log(`📊 Tokens: ${loginData.limites.tokens_consumidos} / ${loginData.limites.tokens_limite_mensual}`);
    console.log(`📱 Dispositivos: ${loginData.limites.sesiones_activas} / ${loginData.plan.dispositivos_concurrentes}`);
    
    const authToken = loginData.token;
    
    // Paso 2: Verificar estado de tokens
    const tokensRestantes = loginData.limites.tokens_limite_mensual - loginData.limites.tokens_consumidos;
    console.log(`\n🔍 Tokens restantes: ${tokensRestantes}`);
    
    if (tokensRestantes > 0) {
      console.log('\n⚠️ ADVERTENCIA: Aún hay tokens disponibles.');
      console.log('Este test está diseñado para verificar el comportamiento con tokens agotados.');
      console.log('Considera agotar los tokens primero para ver el comportamiento completo.');
    }
    
    // Paso 3: Intentar clasificar (debería fallar si tokens <= 0)
    console.log('\n2️⃣ Intentando clasificar con tokens agotados...');
    
    const clasificarResponse = await fetch(`${API_BASE_URL}/clasificar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        producto: 'Laptop Dell Inspiron 15',
        solo_hs: false
      })
    });
    
    const clasificarData = await clasificarResponse.json();
    
    console.log(`\nStatus: ${clasificarResponse.status}`);
    console.log('Respuesta:', JSON.stringify(clasificarData, null, 2));
    
    if (tokensRestantes <= 0) {
      // Tokens agotados: debería fallar con 403
      if (clasificarResponse.status === 403 && clasificarData.error === 'no_tokens_available') {
        console.log('\n✅ CORRECTO: Clasificación bloqueada por falta de tokens');
        console.log('El sistema está funcionando como se espera.');
      } else {
        console.log('\n❌ ERROR: Se esperaba un error 403 con no_tokens_available');
        console.log('Pero se recibió:', clasificarResponse.status, clasificarData.error);
      }
    } else {
      // Tokens disponibles: debería funcionar
      if (clasificarResponse.ok) {
        console.log('\n✅ CORRECTO: Clasificación exitosa con tokens disponibles');
      } else {
        console.log('\n❌ ERROR: La clasificación debería funcionar con tokens disponibles');
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 Test completado');
    
  } catch (error) {
    console.error('\n❌ Error durante el test:', error.message);
    console.error(error);
  }
}

// Ejecutar el test
testLoginConTokensAgotados();
