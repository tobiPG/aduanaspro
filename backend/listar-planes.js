/**
 * Script: Listar todos los planes de la base de datos
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'clasificador_arancelario';

async function listarPlanes() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    const planes = await db.collection('planes').find({}).toArray();
    
    console.log(`\n📋 Planes encontrados: ${planes.length}\n`);
    console.log('='.repeat(80));
    
    planes.forEach((plan, index) => {
      console.log(`\n${index + 1}. ${plan.nombre}`);
      console.log(`   ID: ${plan.id}`);
      console.log(`   Precio: $${plan.precio_mensual}/mes`);
      console.log(`   Tokens: ${plan.tokens_mes.toLocaleString()}`);
      console.log(`   Dispositivos: ${plan.dispositivos_concurrentes}`);
      console.log(`   Activo: ${plan.activo ? '✅' : '❌'}`);
      if (plan.descripcion) {
        console.log(`   Descripción: ${plan.descripcion}`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    
    // Ver qué plan tiene la empresa demo
    const empresa = await db.collection('empresas').findOne({ empresa_id: 'demo-empresa-001' });
    if (empresa) {
      console.log(`\n👤 Empresa Demo actual:`);
      console.log(`   Plan ID: ${empresa.plan_id}`);
      const planActual = planes.find(p => p.id === empresa.plan_id);
      if (planActual) {
        console.log(`   Plan Nombre: ${planActual.nombre}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

listarPlanes();
