// Script para poblar MongoDB con datos de prueba
const { connectDB, closeDB } = require('./config/database');
const bcrypt = require('bcryptjs');
const { generarId } = require('./models/schemas');

async function seedDatabase() {
    try {
        console.log('🌱 Iniciando seed de base de datos...\n');
        
        const db = await connectDB();
        
        // 1. Crear planes
        console.log('📋 Creando planes...');
        const planes = [
            {
                id: 'plan-free',
                tokens_mes: 10000,
                precio_mensual_usd: 0,
                dispositivos_concurrentes: 1
            },
            {
                id: 'plan-basic',
                tokens_mes: 50000,
                precio_mensual_usd: 29,
                dispositivos_concurrentes: 3
            },
            {
                id: 'plan-pro',
                tokens_mes: 200000,
                precio_mensual_usd: 99,
                dispositivos_concurrentes: 10
            }
        ];
        
        await db.collection('planes').deleteMany({});
        await db.collection('planes').insertMany(planes);
        console.log(`   ✅ ${planes.length} planes creados\n`);
        
        // 2. Crear empresa de prueba
        console.log('🏢 Creando empresa de prueba...');
        const empresa = {
            empresa_id: 'emp-test-001',
            nombre: 'Empresa Demo',
            plan_id: 'plan-pro',
            tokens_limite_mensual: 200000,
            tokens_consumidos: 50000, // 25% consumido
            periodo_inicio: new Date('2025-12-01').toISOString(),
            periodo_fin: new Date('2025-12-31').toISOString(),
            activa: true,
            fecha_creacion: new Date().toISOString(),
            config_defaults: {
                ImporterCode: 'RNC123456789',
                DeclarantCode: 'RNC123456789',
                ClearanceType: 'IC38-002',
                RegimenCode: '1'
            }
        };
        
        await db.collection('empresas').deleteMany({ empresa_id: 'emp-test-001' });
        await db.collection('empresas').insertOne(empresa);
        console.log('   ✅ Empresa creada\n');
        
        // 3. Crear usuario de prueba
        console.log('👤 Creando usuario de prueba...');
        const contrasenaHash = await bcrypt.hash('test123', 12);
        const usuario = {
            usuario_id: 'usr-test-001',
            empresa_id: 'emp-test-001',
            nombre: 'Usuario Demo',
            correo: 'demo@test.com',
            contrasena_hash: contrasenaHash,
            activo: true,
            fecha_creacion: new Date().toISOString()
        };
        
        await db.collection('usuarios').deleteMany({ correo: 'demo@test.com' });
        await db.collection('usuarios').insertOne(usuario);
        console.log('   ✅ Usuario creado');
        console.log('   📧 Email: demo@test.com');
        console.log('   🔑 Password: test123\n');
        
        // 4. Crear algunas clasificaciones de ejemplo
        console.log('📦 Creando clasificaciones de ejemplo...');
        const clasificaciones = [
            {
                clasificacion_id: generarId('clf'),
                empresa_id: 'emp-test-001',
                usuario_id: 'usr-test-001',
                nombre_archivo: 'factura_ceramica.txt',
                tipo_operacion: 'import',
                resultado: {
                    ImportDUA: {
                        ImpDeclaration: {
                            ClearanceType: 'IC38-002',
                            ImporterCode: 'RNC123456789',
                            ImpDeclarationProduct: {
                                HSCode: '68022100',
                                ProductName: 'Baldosas cerámicas',
                                Qty: 1000,
                                FOBValue: 5000
                            }
                        }
                    }
                },
                productos: [
                    { HSCode: '68022100', ProductName: 'Baldosas cerámicas', ProductCode: '1' }
                ],
                fecha_creacion: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
                editado: false,
                exportado: true,
                fecha_exportacion: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
                clasificacion_id: generarId('clf'),
                empresa_id: 'emp-test-001',
                usuario_id: 'usr-test-001',
                nombre_archivo: 'factura_textil.txt',
                tipo_operacion: 'import',
                resultado: {
                    ImportDUA: {
                        ImpDeclaration: {
                            ClearanceType: 'IC38-002',
                            ImporterCode: 'RNC123456789',
                            ImpDeclarationProduct: {
                                HSCode: '52081100',
                                ProductName: 'Telas de algodón',
                                Qty: 500,
                                FOBValue: 3000
                            }
                        }
                    }
                },
                productos: [
                    { HSCode: '52081100', ProductName: 'Telas de algodón', ProductCode: '1' }
                ],
                fecha_creacion: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                editado: true,
                exportado: false
            },
            {
                clasificacion_id: generarId('clf'),
                empresa_id: 'emp-test-001',
                usuario_id: 'usr-test-001',
                nombre_archivo: 'factura_electronica.txt',
                tipo_operacion: 'import',
                resultado: {
                    ImportDUA: {
                        ImpDeclaration: {
                            ClearanceType: 'IC38-002',
                            ImporterCode: 'RNC123456789',
                            ImpDeclarationProduct: {
                                HSCode: '85171200',
                                ProductName: 'Teléfonos móviles',
                                Qty: 200,
                                FOBValue: 8000
                            }
                        }
                    }
                },
                productos: [
                    { HSCode: '85171200', ProductName: 'Teléfonos móviles', ProductCode: '1' }
                ],
                fecha_creacion: new Date().toISOString(),
                editado: false,
                exportado: false
            }
        ];
        
        await db.collection('clasificaciones').deleteMany({ empresa_id: 'emp-test-001' });
        await db.collection('clasificaciones').insertMany(clasificaciones);
        console.log(`   ✅ ${clasificaciones.length} clasificaciones creadas\n`);
        
        // 5. Crear algunos consumos
        console.log('💰 Creando consumos de ejemplo...');
        const consumos = [
            {
                consumo_id: generarId('con'),
                empresa_id: 'emp-test-001',
                usuario_id: 'usr-test-001',
                orden_id: generarId('ord'),
                input_tokens: 1500,
                output_tokens: 3500,
                total_tokens: 5000,
                ts: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                origen: 'clasificacion',
                items: 1
            },
            {
                consumo_id: generarId('con'),
                empresa_id: 'emp-test-001',
                usuario_id: 'usr-test-001',
                orden_id: generarId('ord'),
                input_tokens: 2000,
                output_tokens: 4000,
                total_tokens: 6000,
                ts: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
                origen: 'clasificacion',
                items: 1
            }
        ];
        
        await db.collection('consumos').insertMany(consumos);
        console.log(`   ✅ ${consumos.length} consumos creados\n`);
        
        console.log('✅ Seed completado exitosamente!\n');
        console.log('📝 Credenciales de prueba:');
        console.log('   Email: demo@test.com');
        console.log('   Password: test123');
        console.log('   Empresa ID: emp-test-001');
        console.log(`   Tokens restantes: ${empresa.tokens_limite_mensual - empresa.tokens_consumidos} (${((empresa.tokens_limite_mensual - empresa.tokens_consumidos) / empresa.tokens_limite_mensual * 100).toFixed(1)}%)\n`);
        
        await closeDB();
        
    } catch (error) {
        console.error('❌ Error en seed:', error);
        process.exit(1);
    }
}

// Ejecutar seed
seedDatabase();
