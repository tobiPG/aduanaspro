const AuthService = require('./services/authService');
const { connectDB } = require('./config/database');

async function testLimpieza() {
    try {
        console.log('🧪 Probando limpieza manual de sesiones...\n');
        
        await connectDB();
        
        const cleaned = await AuthService.limpiarSesionesInactivas();
        
        console.log(`\n✅ Limpieza completada: ${cleaned} sesiones desactivadas`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testLimpieza();
