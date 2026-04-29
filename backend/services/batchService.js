/**
 * Servicio de Clasificación por Lotes (Batch)
 * 
 * Flujo:
 * 1. Recibe PDF → Extrae texto con pdf-parse para contar items
 * 2. Usuario confirma/corrige cantidad de items
 * 3. Si items > 10 → Activa modo batch
 * 4. Sube PDF ORIGINAL a OpenAI (una sola vez)
 * 5. Envía múltiples requests con batch_start y batch_size
 * 
 * Parámetros de la API:
 * - document_id: ID único del documento
 * - batch_start: Desde qué item empezar (1, 11, 21...)
 * - batch_size: Cuántos items procesar por batch (default 10)
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Configuración de batch
const BATCH_SIZE = 10; // Items por lote
const MAX_RETRIES = 3;

class BatchService {
    
    /**
     * Genera un ID único para el documento
     */
    static generarDocumentId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 5);
        return `DOC-${timestamp}-${random}`.toUpperCase();
    }
    
    /**
     * Analiza el PDF para contar cuántos items/productos tiene
     * @param {Buffer} pdfBuffer - Buffer del archivo PDF
     * @returns {Object} - { totalItems, necesitaBatch, metodo }
     */
    static async contarItemsEnPdf(pdfBuffer) {
        try {
            console.log('📄 Extrayendo texto del PDF para contar items...');
            
            const pdfData = await pdfParse(pdfBuffer);
            const texto = pdfData.text;
            
            // Patrones comunes para detectar items en facturas
            const patrones = {
                // Líneas numeradas: "1.", "2.", etc.
                numerados: texto.match(/^\s*\d{1,3}\s*[\.\)\-]/gm) || [],
                // Códigos de producto: SKU-XXX, PROD-XXX, etc.
                codigos: texto.match(/\b(SKU|PROD|ITEM|REF|COD|CÓDIGO?)[\s\-:]*[A-Z0-9\-]+/gi) || [],
                // Líneas con cantidad y precio (patrón típico de factura)
                lineasConPrecio: texto.match(/\d+\s+(uds?|pcs?|units?|unidades?).*\$?\s*[\d,]+\.?\d*/gi) || [],
                // Items con código HS
                codigosHS: texto.match(/\d{4}\.\d{2}(\.\d{2})?(\.\d{2})?/g) || [],
                // Descripciones de producto (líneas que parecen productos)
                descripcionesProducto: texto.match(/^[A-Z][A-Za-z\s,\-]+\s+\d+\s+/gm) || []
            };
            
            // Estimar número de items basado en los patrones detectados
            const conteos = [
                patrones.numerados.length,
                patrones.codigos.length,
                patrones.lineasConPrecio.length,
                patrones.codigosHS.length,
                patrones.descripcionesProducto.length
            ];
            
            // Usar el mayor conteo como estimación
            const totalItemsEstimado = Math.max(...conteos, 1);
            
            console.log(`📊 Items detectados (pdf-parse):`);
            console.log(`   - Numerados: ${patrones.numerados.length}`);
            console.log(`   - Códigos producto: ${patrones.codigos.length}`);
            console.log(`   - Líneas con precio: ${patrones.lineasConPrecio.length}`);
            console.log(`   - Códigos HS: ${patrones.codigosHS.length}`);
            console.log(`   - Descripciones: ${patrones.descripcionesProducto.length}`);
            console.log(`   📦 TOTAL ESTIMADO: ${totalItemsEstimado} items`);
            
            // Generar vista previa del texto (primeras 1500 caracteres)
            const textoLimpio = texto.replace(/\s+/g, ' ').trim();
            const vistaPrevia = textoLimpio.length > 1500 
                ? textoLimpio.substring(0, 1500) + '...' 
                : textoLimpio;
            
            // Calcular confianza de la detección
            const maxConteo = Math.max(...conteos);
            const confianza = maxConteo === 0 ? 'baja' : 
                              maxConteo < 5 ? 'media' : 'alta';
            
            return {
                totalItems: totalItemsEstimado,
                necesitaBatch: totalItemsEstimado > BATCH_SIZE,
                metodo: 'pdf-parse',
                confianza,
                textoExtraido: textoLimpio.length,
                vistaPrevia,
                detalles: {
                    numerados: patrones.numerados.length,
                    codigos: patrones.codigos.length,
                    lineasConPrecio: patrones.lineasConPrecio.length,
                    codigosHS: patrones.codigosHS.length,
                    descripciones: patrones.descripcionesProducto.length
                }
            };
            
        } catch (error) {
            console.error('❌ Error contando items en PDF:', error);
            return {
                totalItems: 0,
                necesitaBatch: false,
                metodo: 'pdf-parse',
                confianza: 'error',
                textoExtraido: 0,
                vistaPrevia: 'No se pudo extraer texto del PDF. Puede ser un PDF escaneado o protegido.',
                error: error.message
            };
        }
    }
    
    /**
     * Procesa una factura en modo batch usando los parámetros de tu API
     * Envía el PDF ORIGINAL + parámetros batch_start, batch_size
     * 
     * @param {string} filePath - Ruta al archivo PDF
     * @param {number} totalItems - Total de items en la factura
     * @param {string} operationType - 'import' o 'export'
     * @param {Function} onBatchComplete - Callback para cada batch completado
     * @returns {Object} - Resultado final con todos los productos
     */
    static async procesarEnBatch(filePath, totalItems, operationType = 'import', onBatchComplete = null) {
        let fileId = null;
        const promptId = process.env.OPENAI_PROMPT_ID;
        const documentId = this.generarDocumentId();
        
        if (!promptId) {
            throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
        }
        
        try {
            console.log(`\n🔄 ========== INICIANDO PROCESAMIENTO BATCH ==========`);
            console.log(`📋 Document ID: ${documentId}`);
            console.log(`📦 Total items: ${totalItems}`);
            console.log(`📦 Tamaño de batch: ${BATCH_SIZE}`);
            
            // Calcular número de batches necesarios
            const numBatches = Math.ceil(totalItems / BATCH_SIZE);
            console.log(`📦 Batches a procesar: ${numBatches}`);
            
            // 1. Subir el PDF ORIGINAL a OpenAI (una sola vez)
            console.log('📤 Subiendo PDF original a OpenAI...');
            const file = await openai.files.create({
                file: fs.createReadStream(filePath),
                purpose: 'assistants'
            });
            fileId = file.id;
            console.log(`✅ Archivo subido con ID: ${fileId}`);
            
            // Resultado acumulado
            let resultadoBase = null;
            let productosAcumulados = [];
            let tokensTotal = 0;
            
            // 2. Procesar cada batch
            for (let batchNum = 0; batchNum < numBatches; batchNum++) {
                const batchStart = batchNum * BATCH_SIZE + 1;
                const itemsEnEsteBatch = Math.min(BATCH_SIZE, totalItems - (batchNum * BATCH_SIZE));
                
                console.log(`\n📦 ========== BATCH ${batchNum + 1}/${numBatches} ==========`);
                console.log(`📦 batch_start: ${batchStart}, batch_size: ${BATCH_SIZE}`);
                
                // Solo enviar JSON con parámetros
                const inputText = `json { "document_id": "${documentId}", "batch_start": ${batchStart}, "batch_size": ${BATCH_SIZE} }`;

                console.log(`📤 Enviando parámetros: ${inputText}`);
                
                // Enviar a OpenAI con el PDF y los parámetros de batch
                let response;
                let retryCount = 0;
                
                while (retryCount < MAX_RETRIES) {
                    try {
                        response = await openai.responses.create({
                            model: process.env.OPENAI_MODEL || 'gpt-4o',
                            prompt: { id: promptId },
                            input: [
                                {
                                    role: 'user',
                                    content: [
                                        { 
                                            type: 'input_text', 
                                            text: inputText
                                        },
                                        { 
                                            type: 'input_file', 
                                            file_id: fileId 
                                        }
                                    ]
                                }
                            ]
                        });
                        break;
                    } catch (error) {
                        if (error.status === 429 && retryCount < MAX_RETRIES - 1) {
                            const waitTime = Math.pow(2, retryCount) * 5;
                            console.log(`⏳ Rate limit. Esperando ${waitTime}s...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                            retryCount++;
                        } else {
                            throw error;
                        }
                    }
                }
                
                // Extraer respuesta
                const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
                
                if (!outputText) {
                    throw new Error(`No se recibió respuesta para batch ${batchNum + 1}`);
                }
                
                console.log(`📥 Respuesta recibida (${outputText.length} caracteres)`);
                
                // Parsear JSON
                let batchResult;
                try {
                    batchResult = JSON.parse(outputText);
                } catch (parseError) {
                    const jsonMatch = outputText.match(/\{.*\}/s);
                    if (jsonMatch) {
                        batchResult = JSON.parse(jsonMatch[0]);
                    } else {
                        console.error(`❌ Error parseando batch ${batchNum + 1}:`, outputText.substring(0, 500));
                        throw new Error(`Respuesta del batch ${batchNum + 1} no es JSON válido`);
                    }
                }
                
                // Extraer productos del batch
                const productosBatch = batchResult.ImpDeclarationProduct || 
                                       batchResult.productos || 
                                       [];
                
                console.log(`✅ Batch ${batchNum + 1}: ${productosBatch.length} productos obtenidos`);
                
                // En el primer batch, guardar la estructura base (datos de factura, proveedor, etc.)
                if (batchNum === 0) {
                    resultadoBase = { ...batchResult };
                    delete resultadoBase.ImpDeclarationProduct;
                    delete resultadoBase.productos;
                }
                
                // Acumular productos
                productosAcumulados = productosAcumulados.concat(productosBatch);
                tokensTotal += response.usage?.total_tokens || 0;
                
                // Callback de progreso
                if (onBatchComplete) {
                    onBatchComplete({
                        batchNum: batchNum + 1,
                        totalBatches: numBatches,
                        batchStart: batchStart,
                        batchSize: BATCH_SIZE,
                        productosObtenidos: productosBatch.length,
                        productosAcumulados: productosAcumulados.length,
                        tokensUsados: response.usage?.total_tokens || 0,
                        progreso: Math.round(((batchNum + 1) / numBatches) * 100)
                    });
                }
                
                console.log(`📊 Progreso: ${productosAcumulados.length}/${totalItems} productos (${Math.round(((batchNum + 1) / numBatches) * 100)}%)`);
            }
            
            // 3. Limpiar archivo de OpenAI
            if (fileId) {
                try {
                    await openai.files.del(fileId);
                    console.log('🧹 Archivo eliminado de OpenAI');
                } catch (delError) {
                    console.warn('⚠️ No se pudo eliminar archivo:', delError.message);
                }
            }
            
            // 4. Construir resultado final
            const resultadoFinal = {
                ...resultadoBase,
                ImpDeclarationProduct: productosAcumulados
            };
            
            console.log(`\n✅ ========== BATCH COMPLETADO ==========`);
            console.log(`📋 Document ID: ${documentId}`);
            console.log(`📦 Total productos: ${productosAcumulados.length}`);
            console.log(`📊 Tokens totales: ${tokensTotal}`);
            
            return {
                data: resultadoFinal,
                usage: { total_tokens: tokensTotal },
                batchInfo: {
                    documentId: documentId,
                    totalBatches: numBatches,
                    totalItems: totalItems,
                    productosObtenidos: productosAcumulados.length,
                    modoBatch: true
                }
            };
            
        } catch (error) {
            // Limpiar archivo en caso de error
            if (fileId) {
                try {
                    await openai.files.del(fileId);
                } catch {}
            }
            throw error;
        }
    }
    
    /**
     * Procesa clasificación usando la cantidad de items especificada por el usuario
     * @param {number} itemsUsuario - Cantidad de items especificada por el usuario (REQUERIDO)
     */
    static async clasificarConBatchInteligente(filePath, filename, mimeType, soloHS = false, operationType = 'import', onProgress = null, itemsUsuario = null) {
        let fileId = null;
        
        try {
            console.log('\n🚀 Iniciando clasificación...');
            
            // Usar cantidad especificada por usuario (default 1 si no se especifica)
            const totalItems = (itemsUsuario && itemsUsuario > 0) ? itemsUsuario : 1;
            console.log(`📦 Items a procesar: ${totalItems}`);
            
            const necesitaBatch = totalItems > BATCH_SIZE;
            console.log(`   Necesita batch: ${necesitaBatch}`);
            
            // 1. Subir PDF a OpenAI
            console.log('📤 Subiendo PDF a OpenAI...');
            const file = await openai.files.create({
                file: fs.createReadStream(filePath),
                purpose: 'assistants'
            });
            fileId = file.id;
            console.log(`✅ Archivo subido con ID: ${fileId}`);
            
            // 2. Si necesita batch, procesar por lotes
            if (necesitaBatch && !soloHS) {
                console.log('🔄 Activando modo BATCH...');
                
                // Eliminar el archivo que subimos porque vamos a subirlo en cada batch
                try {
                    await openai.files.del(fileId);
                    console.log('🧹 Archivo inicial eliminado (se subirá en cada batch)');
                } catch {}
                
                return await this.procesarEnBatchConFilePath(
                    filePath, 
                    totalItems, 
                    operationType,
                    onProgress
                );
            }
            
            // 3. Si no necesita batch, procesar normal
            console.log('📄 Procesando en modo normal (sin batch)...');
            
            const promptId = process.env.OPENAI_PROMPT_ID;
            
            let response;
            let retryCount = 0;
            
            while (retryCount < MAX_RETRIES) {
                try {
                    response = await openai.responses.create({
                        model: process.env.OPENAI_MODEL || 'gpt-4o',
                        prompt: { id: promptId },
                        input: [
                            {
                                role: 'user',
                                content: [
                                    { type: 'input_text', text: 'Analiza este documento y responde en formato JSON válido.' },
                                    { type: 'input_file', file_id: fileId }
                                ]
                            }
                        ]
                    });
                    break;
                } catch (error) {
                    if (error.status === 429 && retryCount < MAX_RETRIES - 1) {
                        const waitTime = Math.pow(2, retryCount) * 5;
                        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                        retryCount++;
                    } else {
                        throw error;
                    }
                }
            }
            
            // Limpiar archivo
            try {
                await openai.files.del(fileId);
            } catch {}
            
            const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
            
            if (!outputText) {
                throw new Error('No se recibió respuesta del modelo');
            }
            
            let resultado;
            try {
                resultado = JSON.parse(outputText);
            } catch (parseError) {
                const jsonMatch = outputText.match(/\{.*\}/s);
                if (jsonMatch) {
                    resultado = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('Respuesta no es JSON válido');
                }
            }
            
            return {
                data: resultado,
                usage: response.usage || { total_tokens: 0 },
                batchInfo: {
                    modoBatch: false,
                    totalItems: totalItems
                }
            };
            
        } catch (error) {
            // Limpiar archivo en caso de error
            if (fileId) {
                try {
                    await openai.files.del(fileId);
                } catch {}
            }
            console.error('❌ Error en clasificarConBatchInteligente:', error);
            throw error;
        }
    }
    
    /**
     * Procesa en batch subiendo el PDF en CADA request (API stateless)
     * @param {string} filePath - Ruta al archivo PDF local
     * @param {number} totalItems - Total de items a procesar
     * @param {string} operationType - 'import' o 'export'
     * @param {Function} onBatchComplete - Callback para progreso
     */
    static async procesarEnBatchConFilePath(filePath, totalItems, operationType = 'import', onBatchComplete = null) {
        const promptId = process.env.OPENAI_PROMPT_ID;
        const documentId = this.generarDocumentId();
        
        if (!promptId) {
            throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
        }
        
        try {
            console.log(`\n🔄 ========== PROCESAMIENTO BATCH (PDF EN CADA REQUEST) ==========`);
            console.log(`📋 Document ID: ${documentId}`);
            console.log(`📦 Total items: ${totalItems}`);
            console.log(`📦 Tamaño de batch: ${BATCH_SIZE}`);
            
            const numBatches = Math.ceil(totalItems / BATCH_SIZE);
            console.log(`📦 Batches a procesar: ${numBatches}`);
            console.log(`⚠️ NOTA: El PDF se subirá en CADA batch (API stateless)`);
            
            let resultadoBase = null;
            let productosAcumulados = [];
            let tokensTotal = 0;
            
            for (let batchNum = 0; batchNum < numBatches; batchNum++) {
                const batchStart = batchNum * BATCH_SIZE + 1;
                let fileId = null;
                
                console.log(`\n📦 ========== BATCH ${batchNum + 1}/${numBatches} ==========`);
                console.log(`📦 batch_start: ${batchStart}, batch_size: ${BATCH_SIZE}`);
                
                try {
                    // 1. Subir PDF para ESTE batch
                    console.log(`📤 Subiendo PDF para batch ${batchNum + 1}...`);
                    const file = await openai.files.create({
                        file: fs.createReadStream(filePath),
                        purpose: 'assistants'
                    });
                    fileId = file.id;
                    console.log(`✅ PDF subido: ${fileId}`);
                    
                    // 2. Enviar request con el PDF y parámetros de batch
                    const inputText = `json { "document_id": "${documentId}", "batch_start": ${batchStart}, "batch_size": ${BATCH_SIZE} }`;
                    
                    let response;
                    let retryCount = 0;
                    
                    while (retryCount < MAX_RETRIES) {
                        try {
                            response = await openai.responses.create({
                                model: process.env.OPENAI_MODEL || 'gpt-4o',
                                prompt: { id: promptId },
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
                            break;
                        } catch (error) {
                            if (error.status === 429 && retryCount < MAX_RETRIES - 1) {
                                const waitTime = Math.pow(2, retryCount) * 5;
                                console.log(`⏳ Rate limit. Esperando ${waitTime}s...`);
                                await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                                retryCount++;
                            } else {
                                throw error;
                            }
                        }
                    }
                    
                    // 3. Eliminar archivo de OpenAI inmediatamente después de usarlo
                    try {
                        await openai.files.del(fileId);
                        console.log(`🧹 PDF eliminado de OpenAI`);
                    } catch (delError) {
                        console.warn(`⚠️ No se pudo eliminar PDF: ${delError.message}`);
                    }
                    
                    // 4. Procesar respuesta
                    const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
                    
                    if (!outputText) {
                        throw new Error(`No se recibió respuesta para batch ${batchNum + 1}`);
                    }
                    
                    let batchResult;
                    try {
                        batchResult = JSON.parse(outputText);
                    } catch (parseError) {
                        const jsonMatch = outputText.match(/\{.*\}/s);
                        if (jsonMatch) {
                            batchResult = JSON.parse(jsonMatch[0]);
                        } else {
                            console.error('Respuesta no JSON:', outputText.substring(0, 500));
                            throw new Error('Respuesta no es JSON válido');
                        }
                    }
                    
                    tokensTotal += response.usage?.total_tokens || 0;
                    
                    // En el primer batch, guardar estructura base
                    if (batchNum === 0) {
                        resultadoBase = { ...batchResult };
                        delete resultadoBase.ImpDeclarationProduct;
                    }
                    
                    const productosBatch = batchResult.ImpDeclarationProduct || [];
                    productosAcumulados = [...productosAcumulados, ...productosBatch];
                    
                    console.log(`✅ Batch ${batchNum + 1}: ${productosBatch.length} productos obtenidos`);
                    console.log(`📊 Acumulados: ${productosAcumulados.length}/${totalItems}`);
                    
                    // Callback de progreso
                    if (onBatchComplete) {
                        onBatchComplete({
                            batchNum: batchNum + 1,
                            totalBatches: numBatches,
                            itemsInicio: batchStart,
                            itemsFin: batchStart + productosBatch.length - 1,
                            productosObtenidos: productosBatch.length,
                            productosAcumulados: productosAcumulados.length,
                            progreso: Math.round(((batchNum + 1) / numBatches) * 100)
                        });
                    }
                    
                } catch (batchError) {
                    // Limpiar archivo si hubo error en este batch
                    if (fileId) {
                        try { await openai.files.del(fileId); } catch {}
                    }
                    throw batchError;
                }
            }
            
            const resultadoFinal = {
                ...resultadoBase,
                ImpDeclarationProduct: productosAcumulados
            };
            
            console.log(`\n✅ ========== BATCH COMPLETADO ==========`);
            console.log(`📦 Total productos: ${productosAcumulados.length}`);
            console.log(`📊 Tokens totales: ${tokensTotal}`);
            
            return {
                data: resultadoFinal,
                usage: { total_tokens: tokensTotal },
                batchInfo: {
                    documentId: documentId,
                    totalBatches: numBatches,
                    totalItems: totalItems,
                    productosObtenidos: productosAcumulados.length,
                    modoBatch: true
                }
            };
            
        } catch (error) {
            console.error('❌ Error en procesarEnBatchConFilePath:', error);
            throw error;
        }
    }
    
    /**
     * LEGACY: Procesa en batch usando un file_id ya existente
     * NOTA: Esta función puede dar resultados vacíos porque la API es stateless
     */
    static async procesarEnBatchConFileId(fileId, totalItems, operationType = 'import', onBatchComplete = null) {
        console.warn('⚠️ ADVERTENCIA: procesarEnBatchConFileId está deprecado. Usar procesarEnBatchConFilePath.');
        
        const promptId = process.env.OPENAI_PROMPT_ID;
        const documentId = this.generarDocumentId();
        
        if (!promptId) {
            throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
        }
        
        try {
            console.log(`\n🔄 ========== PROCESAMIENTO BATCH CON FILE_ID ==========`);
            console.log(`📋 Document ID: ${documentId}`);
            console.log(`📦 Total items: ${totalItems}`);
            console.log(`📦 Tamaño de batch: ${BATCH_SIZE}`);
            
            const numBatches = Math.ceil(totalItems / BATCH_SIZE);
            console.log(`📦 Batches a procesar: ${numBatches}`);
            
            let resultadoBase = null;
            let productosAcumulados = [];
            let tokensTotal = 0;
            
            for (let batchNum = 0; batchNum < numBatches; batchNum++) {
                const batchStart = batchNum * BATCH_SIZE + 1;
                
                console.log(`\n📦 ========== BATCH ${batchNum + 1}/${numBatches} ==========`);
                console.log(`📦 batch_start: ${batchStart}, batch_size: ${BATCH_SIZE}`);
                
                // Solo enviar JSON con parámetros
                const inputText = `json { "document_id": "${documentId}", "batch_start": ${batchStart}, "batch_size": ${BATCH_SIZE} }`;
                
                let response;
                let retryCount = 0;
                
                while (retryCount < MAX_RETRIES) {
                    try {
                        response = await openai.responses.create({
                            model: process.env.OPENAI_MODEL || 'gpt-4o',
                            prompt: { id: promptId },
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
                        break;
                    } catch (error) {
                        if (error.status === 429 && retryCount < MAX_RETRIES - 1) {
                            const waitTime = Math.pow(2, retryCount) * 5;
                            console.log(`⏳ Rate limit. Esperando ${waitTime}s...`);
                            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                            retryCount++;
                        } else {
                            throw error;
                        }
                    }
                }
                
                const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
                
                if (!outputText) {
                    throw new Error(`No se recibió respuesta para batch ${batchNum + 1}`);
                }
                
                let batchResult;
                try {
                    batchResult = JSON.parse(outputText);
                } catch (parseError) {
                    const jsonMatch = outputText.match(/\{.*\}/s);
                    if (jsonMatch) {
                        batchResult = JSON.parse(jsonMatch[0]);
                    } else {
                        console.error('Respuesta no JSON:', outputText.substring(0, 500));
                        throw new Error('Respuesta no es JSON válido');
                    }
                }
                
                tokensTotal += response.usage?.total_tokens || 0;
                
                if (batchNum === 0) {
                    resultadoBase = { ...batchResult };
                    delete resultadoBase.ImpDeclarationProduct;
                }
                
                const productosBatch = batchResult.ImpDeclarationProduct || [];
                productosAcumulados = [...productosAcumulados, ...productosBatch];
                
                console.log(`✅ Batch ${batchNum + 1}: ${productosBatch.length} productos`);
                
                if (onBatchComplete) {
                    onBatchComplete({
                        batchNum: batchNum + 1,
                        totalBatches: numBatches,
                        itemsInicio: batchStart,
                        itemsFin: batchStart + productosBatch.length - 1,
                        productosObtenidos: productosBatch.length,
                        productosAcumulados: productosAcumulados.length,
                        progreso: Math.round(((batchNum + 1) / numBatches) * 100)
                    });
                }
            }
            
            // Limpiar archivo de OpenAI
            try {
                await openai.files.del(fileId);
                console.log('🧹 Archivo eliminado de OpenAI');
            } catch (delError) {
                console.warn('⚠️ No se pudo eliminar archivo:', delError.message);
            }
            
            const resultadoFinal = {
                ...resultadoBase,
                ImpDeclarationProduct: productosAcumulados
            };
            
            console.log(`\n✅ ========== BATCH COMPLETADO ==========`);
            console.log(`📦 Total productos: ${productosAcumulados.length}`);
            console.log(`📊 Tokens totales: ${tokensTotal}`);
            
            return {
                data: resultadoFinal,
                usage: { total_tokens: tokensTotal },
                batchInfo: {
                    documentId: documentId,
                    totalBatches: numBatches,
                    totalItems: totalItems,
                    productosObtenidos: productosAcumulados.length,
                    modoBatch: true
                }
            };
            
        } catch (error) {
            // Limpiar archivo en caso de error
            try {
                await openai.files.del(fileId);
            } catch {}
            throw error;
        }
    }
}

module.exports = BatchService;
