/**
 * Test del BatchService
 * Prueba el sistema de clasificación por lotes
 */

require('dotenv').config();
const BatchService = require('./services/batchService');
const fs = require('fs');
const path = require('path');

async function testBatch() {
    console.log('🧪 ========== TEST BATCH SERVICE ==========\n');
    
    // Verificar configuración
    console.log('📋 Configuración:');
    console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Configurada' : '❌ Falta'}`);
    console.log(`   OPENAI_PROMPT_ID: ${process.env.OPENAI_PROMPT_ID || '❌ Falta'}`);
    console.log(`   OPENAI_MODEL: ${process.env.OPENAI_MODEL || 'gpt-4o (default)'}`);
    console.log('');
    
    // Buscar un PDF de prueba en uploads
    const uploadsDir = path.join(__dirname, 'uploads');
    let testPdfPath = null;
    
    if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        const pdfFile = files.find(f => f.endsWith('.pdf'));
        if (pdfFile) {
            testPdfPath = path.join(uploadsDir, pdfFile);
            console.log(`📄 PDF de prueba encontrado: ${pdfFile}`);
        }
    }
    
    if (!testPdfPath) {
        console.log('⚠️ No se encontró un PDF de prueba en /uploads');
        console.log('   Por favor, coloca un PDF de factura en backend/uploads/');
        console.log('   y vuelve a ejecutar este test.\n');
        
        // Crear un PDF de prueba simple con texto
        console.log('🔧 Creando archivo de prueba con texto simulado...\n');
        
        // Probar solo el conteo de items con texto simulado
        const textoFactura = `
FACTURA COMERCIAL
Invoice No: INV-2025-00017
Fecha: 2025-01-12

PRODUCTOS:
1. Laptop Dell XPS 15 - Qty: 2 - $1,500.00
2. Monitor LG 27" 4K - Qty: 5 - $450.00
3. Teclado Logitech MX Keys - Qty: 10 - $120.00
4. Mouse Logitech MX Master - Qty: 10 - $99.00
5. Webcam Logitech C920 - Qty: 8 - $79.00
6. Headset Jabra Evolve2 - Qty: 5 - $299.00
7. Docking Station Dell - Qty: 3 - $250.00
8. Cable HDMI 2.1 - Qty: 20 - $25.00
9. USB Hub 7 ports - Qty: 15 - $35.00
10. SSD Samsung 1TB - Qty: 10 - $110.00
11. RAM DDR5 32GB - Qty: 8 - $180.00
12. Laptop Stand - Qty: 12 - $45.00
13. Screen Protector - Qty: 20 - $15.00
14. Laptop Bag - Qty: 10 - $65.00
15. Wireless Charger - Qty: 15 - $40.00

TOTAL: $15,000.00
        `;
        
        // Simular buffer de PDF con el texto
        const mockBuffer = Buffer.from(textoFactura);
        
        // Mockear pdf-parse para que devuelva nuestro texto
        console.log('📊 Probando detección de items...\n');
        
        // Contar manualmente los patrones
        const patrones = {
            numerados: textoFactura.match(/^\s*\d{1,3}\s*[\.\)\-]/gm) || [],
            lineasConPrecio: textoFactura.match(/\d+\s+(uds?|pcs?|units?|unidades?|Qty).*\$?\s*[\d,]+\.?\d*/gi) || []
        };
        
        console.log('📦 Patrones detectados en texto de prueba:');
        console.log(`   - Líneas numeradas: ${patrones.numerados.length}`);
        console.log(`   - Líneas con Qty/precio: ${patrones.lineasConPrecio.length}`);
        console.log(`   - Estimación: ${Math.max(patrones.numerados.length, patrones.lineasConPrecio.length)} items`);
        console.log(`   - Necesita batch: ${Math.max(patrones.numerados.length, patrones.lineasConPrecio.length) > 10 ? 'SÍ' : 'NO'}`);
        
        return;
    }
    
    try {
        // 1. Test: Contar items en el PDF
        console.log('\n📊 TEST 1: Contando items en el PDF...');
        const pdfBuffer = fs.readFileSync(testPdfPath);
        const analisis = await BatchService.contarItemsEnPdf(pdfBuffer);
        
        console.log('\n📋 Resultado del análisis:');
        console.log(`   Total items estimados: ${analisis.totalItems}`);
        console.log(`   Necesita batch: ${analisis.necesitaBatch ? 'SÍ ✅' : 'NO'}`);
        console.log(`   Texto extraído: ${analisis.textoExtraido.substring(0, 200)}...`);
        
        // 2. Test: Procesar con batch si es necesario
        if (analisis.necesitaBatch) {
            console.log('\n🔄 TEST 2: Procesando en modo BATCH...');
            console.log('   Esto puede tomar varios minutos...\n');
            
            const resultado = await BatchService.clasificarConBatchInteligente(
                testPdfPath,
                path.basename(testPdfPath),
                'application/pdf',
                false,
                'import',
                (progreso) => {
                    console.log(`   📦 Batch ${progreso.batchNum}/${progreso.totalBatches}: ${progreso.productosObtenidos} productos (${progreso.progreso}%)`);
                }
            );
            
            console.log('\n✅ Resultado final:');
            console.log(`   Document ID: ${resultado.batchInfo?.documentId || 'N/A'}`);
            console.log(`   Modo batch: ${resultado.batchInfo?.modoBatch ? 'SÍ' : 'NO'}`);
            console.log(`   Total batches: ${resultado.batchInfo?.totalBatches || 1}`);
            console.log(`   Productos obtenidos: ${resultado.batchInfo?.productosObtenidos || 'N/A'}`);
            console.log(`   Tokens totales: ${resultado.usage?.total_tokens || 'N/A'}`);
            
            // Mostrar primeros productos
            const productos = resultado.data?.ImpDeclarationProduct || resultado.data?.productos || [];
            if (productos.length > 0) {
                console.log(`\n📦 Primeros 3 productos:`);
                productos.slice(0, 3).forEach((p, i) => {
                    console.log(`   ${i + 1}. ${p.ProductName || p.descripcion || 'Sin nombre'} - HS: ${p.HSCode || p.hs || 'N/A'}`);
                });
            }
            
        } else {
            console.log('\n📄 El documento tiene ≤10 items, no requiere batch.');
            console.log('   Procesando en modo normal...\n');
            
            const resultado = await BatchService.clasificarConBatchInteligente(
                testPdfPath,
                path.basename(testPdfPath),
                'application/pdf',
                false,
                'import'
            );
            
            console.log('✅ Resultado:');
            console.log(`   Tokens usados: ${resultado.usage?.total_tokens || 'N/A'}`);
            
            const productos = resultado.data?.ImpDeclarationProduct || resultado.data?.productos || [];
            console.log(`   Productos encontrados: ${productos.length}`);
        }
        
    } catch (error) {
        console.error('\n❌ Error durante el test:', error.message);
        console.error(error.stack);
    }
    
    console.log('\n🧪 ========== FIN DEL TEST ==========');
}

// Ejecutar test
testBatch();
