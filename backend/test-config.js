const OpenAI = require('openai');
require('dotenv').config();

// Test de configuración
async function testConfiguration() {
    console.log('🔍 Verificando configuración...\n');
    
    // 1. Verificar variables de entorno
    console.log('📋 Variables de entorno:');
    console.log(`✅ OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Configurada (' + process.env.OPENAI_API_KEY.substring(0, 20) + '...)' : '❌ NO configurada'}`);
    console.log(`✅ ASSISTANT_ID: ${process.env.ASSISTANT_ID || '❌ NO configurado'}`);
    console.log(`✅ PORT: ${process.env.PORT || '3000'}`);
    console.log();
    
    if (!process.env.OPENAI_API_KEY || !process.env.ASSISTANT_ID) {
        console.log('❌ Faltan variables de entorno requeridas');
        return;
    }
    
    // 2. Verificar conexión con OpenAI
    try {
        console.log('🔌 Probando conexión con OpenAI...');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        
        // Intentar listar asistentes para verificar la API key
        const assistants = await openai.beta.assistants.list({ limit: 1 });
        console.log('✅ Conexión con OpenAI exitosa');
        
        // 3. Verificar que el asistente existe
        console.log('\n🤖 Verificando asistente...');
        const assistant = await openai.beta.assistants.retrieve(process.env.ASSISTANT_ID);
        console.log(`✅ Asistente encontrado: ${assistant.name || 'Sin nombre'}`);
        console.log(`📝 Descripción: ${assistant.instructions ? assistant.instructions.substring(0, 100) + '...' : 'Sin instrucciones'}`);
        
        // 4. Test básico de funcionamiento
        console.log('\n🧪 Realizando test básico...');
        const thread = await openai.beta.threads.create();
        console.log('✅ Thread creado exitosamente');
        
        await openai.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: 'producto: smartphone Samsung Galaxy test\nparams: {"solo_hs": true}'
        });
        console.log('✅ Mensaje enviado al thread');
        
        const run = await openai.beta.threads.runs.create(thread.id, {
            assistant_id: process.env.ASSISTANT_ID
        });
        console.log('✅ Ejecución iniciada');
        
        console.log('\n🎉 TODAS LAS VERIFICACIONES PASARON');
        console.log('📍 El sistema está listo para funcionar');
        
    } catch (error) {
        console.log('❌ Error en la verificación:');
        console.log(`   ${error.message}`);
        
        if (error.status === 401) {
            console.log('   💡 Verifica que tu OPENAI_API_KEY sea correcta');
        } else if (error.status === 404) {
            console.log('   💡 Verifica que tu ASSISTANT_ID sea correcto');
        }
    }
}

testConfiguration().catch(console.error);