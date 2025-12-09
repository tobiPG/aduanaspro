/**
 * Script: Desactivar todas las sesiones activas de una empresa
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'clasificador_arancelario';

async function desactivarSesiones() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    console.log('\n🔍 Buscando sesiones activas de demo-empresa-001...\n');
    
    const sesiones = await db.collection('sesiones').find({
      empresa_id: 'demo-empresa-001',
      activo: true
    }).toArray();
    
    console.log(`Sesiones activas encontradas: ${sesiones.length}`);
    
    if (sesiones.length > 0) {
      sesiones.forEach((s, i) => {
        console.log(`  ${i+1}. ${s.sesion_id} - Device: ${s.device_fingerprint}`);
      });
      
      const result = await db.collection('sesiones').updateMany(
        { empresa_id: 'demo-empresa-001', activo: true },
        { $set: { activo: false } }
      );
      
      console.log(`\n✅ Sesiones desactivadas: ${result.modifiedCount}`);
    } else {
      console.log('\n✅ No hay sesiones activas');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

desactivarSesiones();
