/**
 * Script: Actualizar planes en la BD con información completa
 */

const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://127.0.0.1:27017';
const DB_NAME = 'clasificador_arancelario';

async function actualizarPlanes() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    // Eliminar planes antiguos
    console.log('🗑️ Eliminando planes antiguos...');
    await db.collection('planes').deleteMany({});
    
    // Definir planes actualizados
    const planes = [
      {
        id: 'plan-gratuito',
        nombre: 'Plan Gratuito',
        descripcion: 'Para probar el sistema',
        precio_mensual: 0,
        tokens_mes: 100,
        dispositivos_concurrentes: 1,
        activo: true,
        caracteristicas: [
          '100 tokens/mes',
          '1 dispositivo',
          'Soporte por email',
          'Funciones básicas'
        ]
      },
      {
        id: 'plan-basico',
        nombre: 'Plan Básico',
        descripcion: 'Perfecto para pequeñas empresas',
        precio_mensual: 29.99,
        tokens_mes: 1000,
        dispositivos_concurrentes: 3,
        activo: true,
        caracteristicas: [
          '1K tokens/mes',
          '3 dispositivos',
          'Soporte prioritario',
          'Exportación XML/JSON',
          'Historial completo'
        ]
      },
      {
        id: 'plan-profesional',
        nombre: 'Plan Profesional',
        descripcion: 'Ideal para empresas medianas',
        precio_mensual: 59.99,
        tokens_mes: 5000,
        dispositivos_concurrentes: 8,
        activo: true,
        caracteristicas: [
          '5K tokens/mes',
          '8 dispositivos',
          'Soporte 24/7',
          'API access',
          'Integraciones avanzadas',
          'Reportes personalizados'
        ]
      },
      {
        id: 'plan-empresarial',
        nombre: 'Plan Empresarial',
        descripcion: 'Para grandes importadoras',
        precio_mensual: 149.99,
        tokens_mes: 15000,
        dispositivos_concurrentes: 25,
        activo: true,
        caracteristicas: [
          '15K tokens/mes',
          '25 dispositivos',
          'Soporte dedicado',
          'SLA garantizado',
          'Capacitación incluida',
          'Integraciones personalizadas'
        ]
      },
      {
        id: 'plan-corporativo',
        nombre: 'Plan Corporativo',
        descripcion: 'Para corporaciones grandes',
        precio_mensual: 299.99,
        tokens_mes: 50000,
        dispositivos_concurrentes: 100,
        activo: true,
        caracteristicas: [
          '50K tokens/mes',
          '100 dispositivos',
          'Gerente de cuenta',
          'Implementación personalizada',
          'Auditorías de cumplimiento',
          'Integración ERP'
        ]
      },
      {
        id: 'plan-ilimitado',
        nombre: 'Plan Ilimitado',
        descripcion: 'Sin límites para grandes corporaciones',
        precio_mensual: 599.99,
        tokens_mes: -1, // -1 significa ilimitado
        dispositivos_concurrentes: -1, // -1 significa ilimitado
        activo: true,
        caracteristicas: [
          'Ilimitados tokens/mes',
          'Ilimitados dispositivos',
          'Servicio white-label',
          'Infraestructura dedicada',
          'Consultoría aduanera',
          'Desarrollo a medida'
        ]
      }
    ];
    
    // Insertar planes nuevos
    console.log('\n📋 Insertando planes nuevos...\n');
    for (const plan of planes) {
      await db.collection('planes').insertOne(plan);
      const tokensDisplay = plan.tokens_mes === -1 ? 'Ilimitados' : plan.tokens_mes.toLocaleString();
      const dispositivosDisplay = plan.dispositivos_concurrentes === -1 ? 'Ilimitados' : plan.dispositivos_concurrentes;
      console.log(`✅ ${plan.nombre}`);
      console.log(`   - Precio: $${plan.precio_mensual}/mes`);
      console.log(`   - Tokens: ${tokensDisplay}`);
      console.log(`   - Dispositivos: ${dispositivosDisplay}`);
    }
    
    console.log('\n✅ Planes actualizados correctamente');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

actualizarPlanes();
