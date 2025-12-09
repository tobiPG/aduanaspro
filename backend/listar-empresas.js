/**
 * Script: Listar todas las empresas
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'clasificador_arancelario';

async function listarEmpresas() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    const empresas = await db.collection('empresas').find({}).toArray();
    
    console.log(`\n📊 Empresas encontradas: ${empresas.length}\n`);
    console.log('='.repeat(60));
    
    empresas.forEach((emp, index) => {
      console.log(`\n${index + 1}. ${emp.nombre}`);
      console.log(`   ID: ${emp.empresa_id}`);
      console.log(`   Plan: ${emp.plan_id}`);
      console.log(`   Tokens: ${emp.tokens_consumidos} / ${emp.tokens_limite_mensual}`);
      console.log(`   Restantes: ${emp.tokens_limite_mensual - emp.tokens_consumidos}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

listarEmpresas();
