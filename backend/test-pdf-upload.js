require('dotenv').config();
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

async function testPDFUpload() {
  try {
    console.log('📄 Preparando prueba de carga de PDF...\n');
    
    // Crear un archivo de texto simple para simular (ya que no hay PDFs)
    const testFilePath = path.join(__dirname, 'uploads', 'test-question.txt');
    
    if (!fs.existsSync(testFilePath)) {
      console.error('❌ No se encontró archivo de prueba en:', testFilePath);
      return;
    }
    
    console.log('✅ Archivo de prueba encontrado:', testFilePath);
    console.log('📊 Tamaño:', fs.statSync(testFilePath).size, 'bytes\n');
    
    // Crear FormData
    const form = new FormData();
    form.append('archivo', fs.createReadStream(testFilePath));
    form.append('solo_hs', 'false');
    form.append('operationType', 'import');
    
    console.log('🚀 Enviando archivo al servidor...');
    console.log('📡 URL: http://localhost:3050/clasificar-archivo\n');
    
    // Hacer la petición
    const response = await axios.post('http://localhost:3050/clasificar-archivo', form, {
      headers: {
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000 // 2 minutos
    });
    
    console.log('✅ RESPUESTA DEL SERVIDOR:\n');
    console.log('Status:', response.status);
    console.log('Success:', response.data.success);
    console.log('Archivo procesado:', response.data.archivo);
    console.log('\n📦 DATOS RECIBIDOS:');
    console.log(JSON.stringify(response.data.data, null, 2));
    
  } catch (error) {
    console.error('\n❌ ERROR EN LA PRUEBA:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else if (error.code === 'ECONNREFUSED') {
      console.error('❌ El servidor no está corriendo en el puerto 3050');
      console.error('💡 Inicia el servidor con: npm start');
    } else {
      console.error(error.message);
    }
  }
}

console.log('═══════════════════════════════════════════════════');
console.log('  TEST: CARGA DE ARCHIVOS (PDF/TXT) A LA API');
console.log('═══════════════════════════════════════════════════\n');

testPDFUpload();
