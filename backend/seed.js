const { connectDB, getDB, closeDB } = require('./config/database');
const bcrypt = require('bcryptjs');
const { generarId } = require('./models/schemas');

// Datos semilla para inicializar la base de datos
const seedData = {
    // Planes de suscripción
    planes: [
        {
            id: "Starter",
            nombre: "Plan Starter",
            tokens_mes: 100000,
            precio_mensual_usd: 10,
            dispositivos_concurrentes: 1,
            descripcion: "Ideal para comenzar",
            activo: true
        },
        {
            id: "Pro", 
            nombre: "Plan Pro",
            tokens_mes: 1000000,
            precio_mensual_usd: 45,
            dispositivos_concurrentes: 2,
            descripcion: "Para profesionales",
            activo: true
        },
        {
            id: "Business",
            nombre: "Plan Business",
            tokens_mes: 5000000,
            precio_mensual_usd: 215,
            dispositivos_concurrentes: 5,
            descripcion: "Para empresas en crecimiento",
            activo: true
        },
        {
            id: "Enterprise",
            nombre: "Plan Enterprise",
            tokens_mes: 20000000,
            precio_mensual_usd: 860,
            dispositivos_concurrentes: 10,
            descripcion: "Para grandes corporaciones",
            activo: true
        }
    ],
    
    // Empresa de prueba
    empresaPrueba: {
        empresa_id: "demo-empresa-001",
        nombre: "Importadora Demo SRL",
        plan_id: "Pro",
        tokens_limite_mensual: 1000000,
        tokens_consumidos: 0,
        periodo_inicio: "2025-10-01",
        periodo_fin: "2025-10-31",
        activa: true,
        fecha_creacion: new Date().toISOString(),
        // Configuración opcional de SMTP por empresa (si no se especifica, usa el servicio centralizado)
        // smtp_host: "smtp.empresa.com",
        // smtp_port: 587,
        // smtp_user: "noreply@empresa.com",
        // smtp_password: "password_empresa",
        // smtp_secure: false,
        // email_from: "noreply@importadorademo.com"
    },
    
    // Usuario de prueba (contraseña: demo123)
    usuarioPrueba: {
        usuario_id: "demo-user-001",
        empresa_id: "demo-empresa-001",
        nombre: "Usuario Demo",
        correo: "demo@importadora.com",
        contrasena_hash: "", // Se generará en runtime
        rol: "user",
        activo: true,
        fecha_creacion: new Date().toISOString()
    },
    
    // Usuario administrador (contraseña: admin123)
    usuarioAdmin: {
        usuario_id: "admin-user-001",
        empresa_id: "demo-empresa-001",
        nombre: "Administrador",
        correo: "admin@clasificador.com",
        contrasena_hash: "", // Se generará en runtime
        rol: "admin",
        activo: true,
        fecha_creacion: new Date().toISOString()
    }
};

async function insertarSeedData() {
    try {
        console.log('🌱 Iniciando inserción de datos semilla...');
        
        const db = getDB();
        
        // 1. Insertar planes
        console.log('📋 Insertando planes...');
        const planesCollection = db.collection('planes');
        
        // Limpiar planes existentes
        await planesCollection.deleteMany({});
        
        // Insertar nuevos planes
        const resultPlanes = await planesCollection.insertMany(seedData.planes);
        console.log(`✅ ${resultPlanes.insertedCount} planes insertados`);
        
        // 2. Generar hash de contraseñas
        console.log('🔐 Generando hash de contraseñas...');
        const saltRounds = 12;
        seedData.usuarioPrueba.contrasena_hash = await bcrypt.hash('demo123', saltRounds);
        seedData.usuarioAdmin.contrasena_hash = await bcrypt.hash('admin123', saltRounds);
        
        // 3. Insertar empresa de prueba
        console.log('🏢 Insertando empresa de prueba...');
        const empresasCollection = db.collection('empresas');
        
        // Verificar si ya existe
        const empresaExistente = await empresasCollection.findOne({ 
            empresa_id: seedData.empresaPrueba.empresa_id 
        });
        
        if (!empresaExistente) {
            await empresasCollection.insertOne(seedData.empresaPrueba);
            console.log('✅ Empresa de prueba insertada');
        } else {
            console.log('⚠️ Empresa de prueba ya existe');
        }
        // 4. Insertar usuarios de prueba
        console.log('👤 Insertando usuarios de prueba...');
        const usuariosCollection = db.collection('usuarios');
        
        // Usuario regular
        const usuarioExistente = await usuariosCollection.findOne({ 
            correo: seedData.usuarioPrueba.correo 
        });
        
        if (!usuarioExistente) {
            await usuariosCollection.insertOne(seedData.usuarioPrueba);
            console.log('✅ Usuario de prueba insertado');
        } else {
            console.log('⚠️ Usuario de prueba ya existe');
        }
        
        // Usuario administrador
        const adminExistente = await usuariosCollection.findOne({ 
            correo: seedData.usuarioAdmin.correo 
        });
        
        if (!adminExistente) {
            await usuariosCollection.insertOne(seedData.usuarioAdmin);
            console.log('✅ Usuario administrador insertado');
        } else {
            console.log('⚠️ Usuario administrador ya existe');
        }
        
        // 5. Mostrar resumen
        console.log('\n📊 RESUMEN DE DATOS INICIALES:');
        console.log('================================');
        console.log(`📋 Planes disponibles: ${seedData.planes.length}`);
        seedData.planes.forEach(plan => {
            console.log(`   • ${plan.id}: ${plan.tokens_mes.toLocaleString()} tokens/mes - $${plan.precio_mensual_usd} USD`);
        });
        
        console.log(`\n🏢 Empresa demo: ${seedData.empresaPrueba.nombre}`);
        console.log(`   • ID: ${seedData.empresaPrueba.empresa_id}`);
        console.log(`   • Plan: ${seedData.empresaPrueba.plan_id}`);
        console.log(`   • Tokens disponibles: ${seedData.empresaPrueba.tokens_limite_mensual.toLocaleString()}`);
        
        console.log(`\n👤 Usuario demo: ${seedData.usuarioPrueba.nombre}`);
        console.log(`   • Email: ${seedData.usuarioPrueba.correo}`);
        console.log(`   • Contraseña: demo123`);
        console.log(`   • Rol: user`);
        
        console.log(`\n👑 Usuario administrador: ${seedData.usuarioAdmin.nombre}`);
        console.log(`   • Email: ${seedData.usuarioAdmin.correo}`);
        console.log(`   • Contraseña: admin123`);
        console.log(`   • Rol: admin`);
        
        console.log('\n🎉 Datos semilla insertados correctamente!');
        
    } catch (error) {
        console.error('❌ Error insertando datos semilla:', error);
        throw error;
    }
}

// Función para limpiar todas las colecciones
async function limpiarBaseDatos() {
    try {
        console.log('🧽 Limpiando base de datos...');
        const db = getDB();
        
        const colecciones = ['planes', 'empresas', 'usuarios', 'sesiones', 'consumos'];
        
        for (const nombreColeccion of colecciones) {
            const result = await db.collection(nombreColeccion).deleteMany({});
            console.log(`🗑️ ${nombreColeccion}: ${result.deletedCount} documentos eliminados`);
        }
        
        console.log('✅ Base de datos limpiada');
    } catch (error) {
        console.error('❌ Error limpiando base de datos:', error);
        throw error;
    }
}

// Script principal
async function main() {
    try {
        // Conectar a la base de datos
        await connectDB();
        
        // Verificar argumentos de línea de comandos
        const args = process.argv.slice(2);
        
        if (args.includes('--clean')) {
            await limpiarBaseDatos();
        }
        
        // Insertar datos semilla
        await insertarSeedData();
        
    } catch (error) {
        console.error('❌ Error en script seed:', error);
        process.exit(1);
    } finally {
        await closeDB();
    }
}

// Ejecutar solo si se llama directamente
if (require.main === module) {
    main();
}

module.exports = {
    insertarSeedData,
    limpiarBaseDatos,
    seedData
};