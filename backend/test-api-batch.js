/**
 * Test directo de la API de OpenAI con parámetros de batch
 * Verifica que el prompt responde a document_id, batch_start, batch_size
 */

require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function testApiDirecta() {
    console.log('🧪 ========== TEST API BATCH PARAMS ==========\n');
    
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    if (!promptId) {
        console.log('❌ OPENAI_PROMPT_ID no configurado');
        return;
    }
    
    console.log(`📋 Prompt ID: ${promptId}`);
    console.log(`📋 Model: ${process.env.OPENAI_MODEL || 'gpt-4o'}\n`);
    
    // Simular una factura con texto (sin PDF real)
    const facturaTexto = `
COMMERCIAL INVOICE
Invoice No: INV-2025-00017
Date: January 12, 2025
From: Tech Supplies Inc., Miami FL, USA
To: Importadora XYZ, Santo Domingo, RD

ITEMS:
1. Dell Laptop XPS 15 - Intel i7 - Qty: 2 - Unit Price: $1,500.00 - Total: $3,000.00
2. LG Monitor 27" 4K IPS - Qty: 5 - Unit Price: $450.00 - Total: $2,250.00
3. Logitech MX Keys Wireless Keyboard - Qty: 10 - Unit Price: $120.00 - Total: $1,200.00
4. Logitech MX Master 3 Mouse - Qty: 10 - Unit Price: $99.00 - Total: $990.00
5. Logitech C920 HD Webcam - Qty: 8 - Unit Price: $79.00 - Total: $632.00
6. Jabra Evolve2 75 Headset - Qty: 5 - Unit Price: $299.00 - Total: $1,495.00
7. Dell WD19 Docking Station - Qty: 3 - Unit Price: $250.00 - Total: $750.00
8. HDMI 2.1 Cable 6ft - Qty: 20 - Unit Price: $25.00 - Total: $500.00
9. Anker USB-C Hub 7-port - Qty: 15 - Unit Price: $35.00 - Total: $525.00
10. Samsung 970 EVO Plus SSD 1TB - Qty: 10 - Unit Price: $110.00 - Total: $1,100.00
11. Corsair Vengeance DDR5 32GB - Qty: 8 - Unit Price: $180.00 - Total: $1,440.00
12. Rain Design mStand Laptop Stand - Qty: 12 - Unit Price: $45.00 - Total: $540.00
13. Privacy Screen Filter 15.6" - Qty: 20 - Unit Price: $35.00 - Total: $700.00
14. Targus Laptop Bag 15.6" - Qty: 10 - Unit Price: $65.00 - Total: $650.00
15. Belkin Wireless Charger 15W - Qty: 15 - Unit Price: $40.00 - Total: $600.00

Subtotal: $16,372.00
Shipping (FOB Miami): $500.00
Insurance: $163.72
TOTAL CIF: $17,035.72

Terms: FOB Miami
Payment: Wire Transfer 30 days
    `;
    
    // Test 1: Batch de items 1-10
    console.log('📤 TEST 1: Enviando batch_start=1, batch_size=10...\n');
    
    const batchParams1 = {
        document_id: "INV-2025-00017",
        batch_start: 1,
        batch_size: 10
    };
    
    try {
        console.log('   Parámetros:', JSON.stringify(batchParams1));
        
        const response1 = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            prompt: { id: promptId },
            input: [
                {
                    role: 'user',
                    content: [
                        { 
                            type: 'input_text', 
                            text: 'Procesa esta factura y devuelve JSON:\n\n' + JSON.stringify(batchParams1) + '\n\n' + facturaTexto
                        }
                    ]
                }
            ]
        });
        
        const outputText1 = response1.output_text || response1.output?.[0]?.content?.[0]?.text;
        
        console.log('\n✅ Respuesta recibida!');
        console.log(`   Tokens usados: ${response1.usage?.total_tokens || 'N/A'}`);
        
        // Parsear JSON
        let resultado1;
        try {
            resultado1 = JSON.parse(outputText1);
        } catch (e) {
            const match = outputText1.match(/\{.*\}/s);
            if (match) {
                resultado1 = JSON.parse(match[0]);
            }
        }
        
        if (resultado1) {
            const productos = resultado1.ImpDeclarationProduct || resultado1.productos || [];
            console.log(`\n📦 Productos en respuesta: ${productos.length}`);
            
            if (productos.length > 0) {
                console.log('\n   Items recibidos:');
                productos.forEach((p, i) => {
                    const nombre = p.ProductName || p.descripcion || 'Sin nombre';
                    const hs = p.HSCode || p.hs || 'N/A';
                    console.log(`   ${i + 1}. ${nombre.substring(0, 40)}... - HS: ${hs}`);
                });
            }
            
            // Verificar si respeta el batch
            if (productos.length <= 10) {
                console.log('\n   ✅ La API respetó el batch_size de 10 items');
            } else {
                console.log(`\n   ⚠️ La API devolvió ${productos.length} items (esperado: ≤10)`);
            }
        }
        
        // Test 2: Batch de items 11-15
        console.log('\n\n📤 TEST 2: Enviando batch_start=11, batch_size=10...\n');
        
        const batchParams2 = {
            document_id: "INV-2025-00017",
            batch_start: 11,
            batch_size: 10
        };
        
        console.log('   Parámetros:', JSON.stringify(batchParams2));
        
        const response2 = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            prompt: { id: promptId },
            input: [
                {
                    role: 'user',
                    content: [
                        { 
                            type: 'input_text', 
                            text: 'Procesa esta factura y devuelve JSON:\n\n' + JSON.stringify(batchParams2) + '\n\n' + facturaTexto
                        }
                    ]
                }
            ]
        });
        
        const outputText2 = response2.output_text || response2.output?.[0]?.content?.[0]?.text;
        
        console.log('\n✅ Respuesta recibida!');
        console.log(`   Tokens usados: ${response2.usage?.total_tokens || 'N/A'}`);
        
        let resultado2;
        try {
            resultado2 = JSON.parse(outputText2);
        } catch (e) {
            const match = outputText2.match(/\{.*\}/s);
            if (match) {
                resultado2 = JSON.parse(match[0]);
            }
        }
        
        if (resultado2) {
            const productos2 = resultado2.ImpDeclarationProduct || resultado2.productos || [];
            console.log(`\n📦 Productos en respuesta: ${productos2.length}`);
            
            if (productos2.length > 0) {
                console.log('\n   Items recibidos (batch 2):');
                productos2.forEach((p, i) => {
                    const nombre = p.ProductName || p.descripcion || 'Sin nombre';
                    const hs = p.HSCode || p.hs || 'N/A';
                    console.log(`   ${i + 1}. ${nombre.substring(0, 40)}... - HS: ${hs}`);
                });
            }
            
            // La factura tiene 15 items, batch 11-20 debería tener 5
            if (productos2.length === 5) {
                console.log('\n   ✅ La API devolvió correctamente los 5 items restantes (11-15)');
            } else {
                console.log(`\n   ℹ️ Items recibidos: ${productos2.length}`);
            }
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
    
    console.log('\n🧪 ========== FIN DEL TEST ==========');
}

testApiDirecta();
