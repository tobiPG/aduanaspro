require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testClasificacion() {
  try {
    console.log('🔄 Clasificando producto de prueba con OpenAI...\n');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'Eres un clasificador arancelario dominicano experto. Clasifica productos según el Sistema Armonizado usado en República Dominicana.'
        },
        {
          role: 'user',
          content: 'Clasifica este producto y devuelve SOLO JSON válido:\n\nLaptop HP Pavilion 15, procesador Intel Core i5-1235U, 8GB RAM DDR4, disco sólido 256GB SSD, pantalla 15.6 pulgadas Full HD, sistema operativo Windows 11 Home, color plata.\n\nFormato JSON: {"hs": "XXXX.XX.XX.XX", "descripcion": "descripción arancelaria oficial", "pais_origen": "país si lo sabes"}'
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
    
    console.log('✅ RESPUESTA DE OPENAI:\n');
    const respuesta = completion.choices[0].message.content;
    console.log(respuesta);
    
    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`   - Tokens entrada: ${completion.usage.prompt_tokens}`);
    console.log(`   - Tokens salida: ${completion.usage.completion_tokens}`);
    console.log(`   - Total tokens: ${completion.usage.total_tokens}`);
    
    console.log('\n🔍 PARSEANDO JSON:');
    const resultado = JSON.parse(respuesta);
    console.log('   ✅ JSON válido');
    console.log(`   📦 Código HS: ${resultado.hs}`);
    console.log(`   📝 Descripción: ${resultado.descripcion}`);
    if (resultado.pais_origen) {
      console.log(`   🌍 País de origen: ${resultado.pais_origen}`);
    }
    
  } catch (error) {
    console.error('❌ ERROR:', error.message);
    if (error.response) {
      console.error('Detalles:', error.response.data);
    }
  }
}

testClasificacion();
