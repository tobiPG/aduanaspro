// Script de prueba para las APIs con autenticación
require('dotenv').config();
const http = require('http');

const BASE_URL = '127.0.0.1';
const PORT = 3050;
let authToken = null;

// Helper para hacer requests
function makeRequest(method, endpoint, data = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: BASE_URL,
            port: PORT,
            path: endpoint,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        
        if (authToken && !headers['Authorization']) {
            options.headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const req = http.request(options, (res) => {
            let body = '';
            
            res.on('data', (chunk) => {
                body += chunk;
            });
            
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        data: json
                    });
                } catch (e) {
                    resolve({
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        data: body
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        if (data) {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

async function testAPIs() {
    console.log('🧪 Iniciando pruebas de APIs\n');
    console.log('='.repeat(60));
    
    try {
        // 1. Login
        console.log('\n1️⃣ TEST: Login');
        console.log('-'.repeat(60));
        const login = await makeRequest('POST', '/api/auth/login', {
            correo: 'demo@test.com',
            contrasena: 'test123'
        }, {
            'X-Device-Fingerprint': 'test-device-12345'
        });
        
        console.log(`Status: ${login.status} ${login.statusText}`);
        if (login.data?.success) {
            authToken = login.data.token;
            console.log('✅ Login exitoso');
            console.log(`Usuario: ${login.data.usuario.nombre}`);
            console.log(`Empresa: ${login.data.empresa.nombre}`);
            console.log(`Plan: ${login.data.plan.id}`);
            console.log(`Tokens restantes: ${login.data.limites.tokens_restantes}`);
            if (login.data.alerta) {
                console.log(`⚠️  ALERTA: ${login.data.alerta.mensaje}`);
            }
        } else {
            console.log('❌ Login fallido:', login.data);
            return;
        }
        
        // 2. Verificar sesión
        console.log('\n2️⃣ TEST: Verificar sesión');
        console.log('-'.repeat(60));
        const verificar = await makeRequest('GET', '/api/auth/verificar');
        console.log(`Status: ${verificar.status} ${verificar.statusText}`);
        if (verificar.data?.success) {
            console.log('✅ Sesión válida');
            if (verificar.data.alerta) {
                console.log(`⚠️  ${verificar.data.alerta.nivel.toUpperCase()}: ${verificar.data.alerta.mensaje}`);
            }
        }
        
        // 3. Obtener alertas de tokens
        console.log('\n3️⃣ TEST: Alertas de tokens');
        console.log('-'.repeat(60));
        const alertas = await makeRequest('GET', '/api/alertas/tokens');
        console.log(`Status: ${alertas.status} ${alertas.statusText}`);
        if (alertas.data?.success) {
            console.log('✅ Alertas obtenidas');
            console.log(`Tokens limite: ${alertas.data.tokens.limite}`);
            console.log(`Tokens consumidos: ${alertas.data.tokens.consumidos}`);
            console.log(`Tokens restantes: ${alertas.data.tokens.restantes} (${alertas.data.tokens.porcentaje_restante.toFixed(1)}%)`);
            if (alertas.data.alerta) {
                console.log(`⚠️  Nivel: ${alertas.data.alerta.nivel}`);
                console.log(`⚠️  Mensaje: ${alertas.data.alerta.mensaje}`);
            } else {
                console.log('✅ Sin alertas activas');
            }
        }
        
        // 4. Obtener historial de clasificaciones
        console.log('\n4️⃣ TEST: Historial de clasificaciones');
        console.log('-'.repeat(60));
        const historial = await makeRequest('GET', '/api/historial?limite=10');
        console.log(`Status: ${historial.status} ${historial.statusText}`);
        if (historial.data?.success) {
            console.log('✅ Historial obtenido');
            console.log(`Total clasificaciones: ${historial.data.paginacion.total}`);
            console.log(`Mostrando: ${historial.data.clasificaciones.length}`);
            historial.data.clasificaciones.forEach((clf, idx) => {
                console.log(`  ${idx + 1}. ${clf.nombre_archivo} - ${clf.tipo_operacion}`);
                console.log(`     Productos: ${clf.productos?.length || 0}`);
                console.log(`     Fecha: ${new Date(clf.fecha_creacion).toLocaleString('es-DO')}`);
                console.log(`     Editado: ${clf.editado ? 'Sí' : 'No'} | Exportado: ${clf.exportado ? 'Sí' : 'No'}`);
            });
        }
        
        // 5. Obtener estadísticas del historial
        console.log('\n5️⃣ TEST: Estadísticas del historial');
        console.log('-'.repeat(60));
        const stats = await makeRequest('GET', '/api/historial/stats/resumen');
        console.log(`Status: ${stats.status} ${stats.statusText}`);
        if (stats.data?.success) {
            console.log('✅ Estadísticas obtenidas');
            const est = stats.data.estadisticas;
            console.log(`Total clasificaciones: ${est.total_clasificaciones}`);
            console.log(`Importaciones: ${est.importaciones}`);
            console.log(`Exportaciones: ${est.exportaciones}`);
            console.log(`Editadas: ${est.editadas}`);
            console.log(`Exportadas: ${est.exportadas}`);
            console.log('\nTop códigos HS:');
            est.top_codigos_hs.forEach((item, idx) => {
                console.log(`  ${idx + 1}. ${item._id}: ${item.count} veces`);
            });
        }
        
        // 6. Obtener defaults de configuración
        console.log('\n6️⃣ TEST: Obtener defaults de empresa');
        console.log('-'.repeat(60));
        const defaults = await makeRequest('GET', '/api/config/defaults');
        console.log(`Status: ${defaults.status} ${defaults.statusText}`);
        if (defaults.data?.success) {
            console.log('✅ Defaults obtenidos');
            console.log('Configuración actual:');
            Object.entries(defaults.data.defaults).forEach(([key, value]) => {
                console.log(`  ${key}: ${value}`);
            });
        }
        
        // 7. Actualizar un default
        console.log('\n7️⃣ TEST: Actualizar campo default');
        console.log('-'.repeat(60));
        const updateDefault = await makeRequest('PATCH', '/api/config/defaults/RegimenCode', {
            valor: '4'
        });
        console.log(`Status: ${updateDefault.status} ${updateDefault.statusText}`);
        if (updateDefault.data?.success) {
            console.log('✅ Campo actualizado:', updateDefault.data.mensaje);
        }
        
        // 8. Verificar actualización
        console.log('\n8️⃣ TEST: Verificar actualización de defaults');
        console.log('-'.repeat(60));
        const defaultsUpdated = await makeRequest('GET', '/api/config/defaults');
        console.log(`Status: ${defaultsUpdated.status} ${defaultsUpdated.statusText}`);
        if (defaultsUpdated.data?.success) {
            console.log('✅ Defaults actualizados:');
            Object.entries(defaultsUpdated.data.defaults).forEach(([key, value]) => {
                console.log(`  ${key}: ${value}`);
            });
        }
        
        // 9. Logout
        console.log('\n9️⃣ TEST: Logout');
        console.log('-'.repeat(60));
        const logout = await makeRequest('POST', '/api/auth/logout');
        console.log(`Status: ${logout.status} ${logout.statusText}`);
        if (logout.data?.success) {
            console.log('✅ Logout exitoso');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ TODAS LAS PRUEBAS COMPLETADAS');
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error('\n❌ ERROR en las pruebas:', error.message);
        console.error(error.stack);
    }
}

// Ejecutar pruebas
testAPIs();
