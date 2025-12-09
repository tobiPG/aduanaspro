/**
 * Script simple: Verificar estado actual de la empresa demo
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'clasificador_arancelario';

async function verificarEstadoEmpresa() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    console.log('✅ Conectado a MongoDB');
    
    const db = client.db(DB_NAME);
    
    // Buscar empresa demo
    const empresa = await db.collection('empresas').findOne({ 
      empresa_id: 'demo-empresa-001' 
    });
    
    if (!empresa) {
      console.log('❌ No se encontró la empresa demo');
      return;
    }
    
    console.log('\n📊 Estado de la Empresa Demo:');
    console.log('='.repeat(50));
    console.log(`Nombre: ${empresa.nombre}`);
    console.log(`Plan: ${empresa.plan_id}`);
    console.log(`Tokens consumidos: ${empresa.tokens_consumidos}`);
    console.log(`Tokens límite: ${empresa.tokens_limite_mensual}`);
    console.log(`Tokens restantes: ${empresa.tokens_limite_mensual - empresa.tokens_consumidos}`);
    
    // Buscar plan
    const plan = await db.collection('planes').findOne({ id: empresa.plan_id });
    if (plan) {
      console.log(`\n📋 Plan: ${plan.nombre}`);
      console.log(`   - Tokens mensuales: ${plan.tokens_mes}`);
      console.log(`   - Dispositivos: ${plan.dispositivos_concurrentes}`);
    }
    
    // Buscar sesiones activas
    const sesionesActivas = await db.collection('sesiones').countDocuments({
      empresa_id: empresa.empresa_id,
      activo: true
    });
    console.log(`\n📱 Sesiones activas: ${sesionesActivas}`);
    
    // Estado de tokens
    const tokensRestantes = empresa.tokens_limite_mensual - empresa.tokens_consumidos;
    if (tokensRestantes <= 0) {
      console.log('\n⚠️ TOKENS AGOTADOS - El usuario NO debería poder clasificar');
      console.log('✅ Pero SÍ debería poder iniciar sesión');
    } else {
      console.log(`\n✅ Tokens disponibles: ${tokensRestantes}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

verificarEstadoEmpresa();
