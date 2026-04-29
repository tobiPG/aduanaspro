/**
 * Test de debugging para el error 500 en batch
 * Este script reproduce el problema con el modelo incorrecto y el batch
 */

require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function testBatchError() {
    console.log('\n🔍 ========== DEBUG: Testing Batch 500 Error ==========\n');

    // Verificar configuración
    console.log('📋 Configuración actual:');
    console.log(`   - OPENAI_MODEL: ${process.env.OPENAI_MODEL}`);
    console.log(`   - OPENAI_PROMPT_ID: ${process.env.OPENAI_PROMPT_ID}`);
    console.log(`   - API Key presente: ${process.env.OPENAI_API_KEY ? 'Sí' : 'No'}`);

    // Buscar un PDF de prueba en uploads
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(uploadsDir).filter(f => f.endsWith('.pdf'));

    if (files.length === 0) {
        console.error('❌ No se encontraron PDFs en uploads/ para probar');
        return;
    }

    const testFile = path.join(uploadsDir, files[0]);
    console.log(`\n📄 Usando archivo de prueba: ${files[0]}`);

    let fileId = null;

    try {
        // 1. Subir PDF
        console.log('\n📤 Paso 1: Subiendo PDF a OpenAI...');
        const file = await openai.files.create({
            file: fs.createReadStream(testFile),
            purpose: 'assistants'
        });
        fileId = file.id;
        console.log(`✅ Archivo subido: ${fileId}`);

        // 2. Intentar llamada con responses API (esto debería fallar con gpt-4-turbo)
        console.log('\n🔬 Paso 2: Probando responses.create() con modelo actual...');
        console.log(`   Modelo: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);

        const inputText = `json { "document_id": "TEST-DEBUG", "batch_start": 1, "batch_size": 10 }`;

        const response = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            prompt: { id: process.env.OPENAI_PROMPT_ID },
            input: [
                {
                    role: 'user',
                    content: [
                        { type: 'input_text', text: inputText },
                        { type: 'input_file', file_id: fileId }
                    ]
                }
            ]
        });

        console.log('✅ Respuesta recibida exitosamente!');
        console.log(`   Tokens usados: ${response.usage?.total_tokens || 0}`);

        const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
        console.log(`   Longitud respuesta: ${outputText?.length || 0} caracteres`);

    } catch (error) {
        console.error('\n❌ ERROR DETECTADO:');
        console.error(`   Status: ${error.status}`);
        console.error(`   Code: ${error.code}`);
        console.error(`   Message: ${error.message}`);

        if (error.status === 500) {
            console.log('\n💡 DIAGNÓSTICO:');
            console.log('   El error 500 probablemente se debe a:');
            console.log('   1. Modelo gpt-4-turbo NO soporta la API de responses con prompts persistentes');
            console.log('   2. Solo gpt-4o y versiones posteriores soportan esta funcionalidad');
            console.log('\n🔧 SOLUCIÓN:');
            console.log('   Cambiar en .env: OPENAI_MODEL=gpt-4o');
        }

        if (error.response) {
            console.log('\n📋 Respuesta completa del servidor:');
            console.log(JSON.stringify(error.response.data, null, 2));
        }
    } finally {
        // Limpiar archivo
        if (fileId) {
            try {
                await openai.files.del(fileId);
                console.log('\n🧹 Archivo limpiado de OpenAI');
            } catch (delError) {
                console.warn('⚠️ No se pudo eliminar archivo');
            }
        }
    }

    console.log('\n========== FIN DEL TEST ==========\n');
}

// Ejecutar test
testBatchError().catch(console.error);
