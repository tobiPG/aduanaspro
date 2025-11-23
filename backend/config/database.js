const { MongoClient } = require('mongodb');

// Configuración de la base de datos
const DATABASE_CONFIG = {
    url: 'mongodb://localhost:27017',
    dbName: 'clasificador_arancelario',
    options: {
        useUnifiedTopology: true,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
    }
};

let db = null;
let client = null;

// Conexión a MongoDB
async function connectDB() {
    try {
        console.log('🔌 Conectando a MongoDB...');
        client = new MongoClient(DATABASE_CONFIG.url, DATABASE_CONFIG.options);
        await client.connect();
        db = client.db(DATABASE_CONFIG.dbName);
        
        console.log(`✅ Conectado a MongoDB: ${DATABASE_CONFIG.dbName}`);
        
        // Crear índices necesarios
        await createIndexes();
        
        return db;
    } catch (error) {
        console.error('❌ Error conectando a MongoDB:', error);
        throw error;
    }
}

// Crear índices para optimizar consultas
async function createIndexes() {
    try {
        // Índices para empresas
        await db.collection('empresas').createIndex({ empresa_id: 1 }, { unique: true });
        
        // Índices para usuarios
        await db.collection('usuarios').createIndex({ usuario_id: 1 }, { unique: true });
        await db.collection('usuarios').createIndex({ correo: 1 }, { unique: true });
        await db.collection('usuarios').createIndex({ empresa_id: 1 });
        
        // Índices para sesiones
        await db.collection('sesiones').createIndex({ sesion_id: 1 }, { unique: true });
        await db.collection('sesiones').createIndex({ empresa_id: 1 });
        await db.collection('sesiones').createIndex({ device_fingerprint: 1 });
        await db.collection('sesiones').createIndex({ activo: 1 });
        await db.collection('sesiones').createIndex({ ts_ultima_actividad: 1 });
        
        // Índices para consumos
        await db.collection('consumos').createIndex({ empresa_id: 1 });
        await db.collection('consumos').createIndex({ usuario_id: 1 });
        await db.collection('consumos').createIndex({ ts: -1 });
        
        // Índices para planes
        await db.collection('planes').createIndex({ id: 1 }, { unique: true });
        
        console.log('📋 Índices creados correctamente');
    } catch (error) {
        console.error('⚠️ Error creando índices:', error);
    }
}

// Obtener instancia de la base de datos
function getDB() {
    if (!db) {
        throw new Error('Base de datos no inicializada. Llama a connectDB() primero.');
    }
    return db;
}

// Cerrar conexión
async function closeDB() {
    if (client) {
        await client.close();
        console.log('🔌 Conexión a MongoDB cerrada');
    }
}

module.exports = {
    connectDB,
    getDB,
    closeDB,
    DATABASE_CONFIG
};