const { connectDB, closeDB } = require('./config/database');
const { insertarSeedData } = require('./seed');

async function ejecutar() {
    try {
        console.log('🌱 Ejecutando seed data...\n');
        await connectDB();
        await insertarSeedData();
        await closeDB();
        console.log('\n✅ Proceso completado');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

ejecutar();
