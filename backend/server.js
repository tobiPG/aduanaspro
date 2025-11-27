const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');
const { generarXmlImportDUA } = require('./utils/xmlGenerator');

const app = express();
const PORT = process.env.PORT || 3050;

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3050', 'http://127.0.0.1:3050', 'http://localhost:5500', 'file://'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Configurar timeouts
app.use((req, res, next) => {
  // Timeout de 5 minutos para clasificaciones
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

// Configurar multer para uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen, PDF o texto'));
    }
  }
});

// Función para procesar con la API de Chat Completions (migrado desde Assistants)
async function clasificarConAsistente(contenido, soloHS = false) {
  try {
    console.log('🔄 Iniciando clasificación...');
    
    // Obtener el Prompt ID desde las variables de entorno
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    // Construir el mensaje del usuario
    const userMessage = soloHS 
      ? `Clasifica el siguiente producto y devuelve SOLO el código HS en formato JSON { "hs": "XXXX.XX.XX.XX" }:

${contenido}`
      : `Analiza el siguiente producto/factura y devuelve la estructura ImportDUA completa en formato JSON válido con todos los campos requeridos para SIGA:

${contenido}`;
    
    // System prompt completo para clasificación arancelaria con formato ImportDUA
    const systemPrompt = `Eres un Clasificador Arancelario y Preparador de Datos DUA para la Dirección General de Aduanas de la República Dominicana.

Trabajas exclusivamente con el Arancel Dominicano basado en la Séptima Enmienda del Sistema Armonizado.

Tu función es preparar la información necesaria para construir un XML ImportDUA válido en SIGA, devolviendo SIEMPRE un JSON válido.

En MODO NORMAL (solo_hs = false):
- Extrae TODA la información de la factura/documento
- Clasifica cada producto con código HS correcto para RD
- Incluye justificación técnica con RGI aplicadas, Notas Legales, partidas alternativas consideradas
- Devuelve estructura ImportDUA completa con todos los campos (pueden estar vacíos "" si no hay datos)
- Calcula TotalFOB y TotalCIF correctamente

En MODO ESPECIAL (solo_hs = true):
- Devuelve ÚNICAMENTE: { "hs": "XXXX.XX.XX.XX" }
- Sin texto adicional ni otros campos`;

    // Llamar a la API de Chat Completions
    let completion;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          messages: [
            { 
              role: 'system', 
              content: systemPrompt
            },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        });
        break;
      } catch (error) {
        if (error.status === 429 && retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 5; // 5s, 10s, 20s
          console.log(`⏳ Rate limit detectado. Esperando ${waitTime}s antes de reintentar...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    
    // Obtener información de uso de tokens
    const tokensUsados = {
      input: completion.usage?.prompt_tokens || 0,
      output: completion.usage?.completion_tokens || 0
    };
    
    console.log(`📊 Tokens utilizados - Input: ${tokensUsados.input}, Output: ${tokensUsados.output}, Total: ${tokensUsados.input + tokensUsados.output}`);
    
    // Obtener la respuesta
    const respuesta = completion.choices[0]?.message?.content;
    
    if (!respuesta) {
      throw new Error('No se recibió respuesta del modelo');
    }
    
    console.log('📝 Respuesta del modelo recibida');
    
    try {
      // Intentar parsear como JSON
      const resultado = JSON.parse(respuesta);
      console.log('✅ Clasificación completada exitosamente');
      return resultado;
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      // Si no es JSON válido, buscar JSON dentro del texto
      const jsonMatch = respuesta.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error al clasificar:', error);
    throw error;
  }
}

// Función para clasificar PDF/Imagen con Responses API (input_file)
async function clasificarPdfConResponses(fileBuffer, filename, soloHS = false) {
  let fileId = null;
  
  try {
    console.log('📤 Subiendo archivo a OpenAI...');
    
    // Primero subir el archivo
    const tempPath = path.join(__dirname, 'uploads', `temp-${Date.now()}-${filename}`);
    fs.writeFileSync(tempPath, fileBuffer);
    
    const file = await openai.files.create({
      file: fs.createReadStream(tempPath),
      purpose: 'assistants'
    });
    
    fileId = file.id;
    console.log(`✅ Archivo subido con ID: ${fileId}`);
    
    // Limpiar archivo temporal
    fs.unlinkSync(tempPath);
    
    const systemPrompt = `Eres un experto clasificador arancelario especializado en el Sistema Armonizado de Designación y Codificación de Mercancías de República Dominicana.

Analiza el documento (factura comercial, PDF o imagen) y extrae TODA la información presente:
- Información de factura (número, fecha, moneda, totales)
- Información del vendedor/proveedor (nombre, dirección, RNC/Tax ID)
- Información del comprador/importador (nombre, dirección, RNC)
- TODOS los productos listados (descripción completa, cantidad, precio unitario, precio total, código HS si está presente)
- Términos comerciales (Incoterm, condiciones de pago, método de envío)
- Cualquier otra información relevante del documento

Devuelve TODA la información en formato JSON completo y estructurado.`;

    const userMessage = soloHS 
      ? `Analiza este documento y extrae SOLO el código HS de clasificación arancelaria en formato JSON: { "hs": "XXXX.XX.XX.XX" }`
      : `Analiza COMPLETAMENTE esta factura comercial y extrae TODOS los campos presentes en el documento.

IMPORTANTE: Debes devolver TODO en formato JSON con la siguiente estructura completa:

{
  "factura": {
    "numero": "número de factura",
    "fecha": "fecha de emisión",
    "moneda": "USD/EUR/DOP",
    "valor_total": "monto total",
    "subtotal": "subtotal si existe",
    "impuestos": "impuestos si existen"
  },
  "vendedor": {
    "nombre": "nombre del vendedor/exportador",
    "direccion": "dirección completa",
    "rnc": "RNC o Tax ID",
    "pais": "país de origen",
    "telefono": "teléfono si existe",
    "email": "email si existe"
  },
  "comprador": {
    "nombre": "nombre del comprador/importador",
    "direccion": "dirección completa",
    "rnc": "RNC o Tax ID",
    "pais": "país destino",
    "telefono": "teléfono si existe",
    "email": "email si existe"
  },
  "productos": [
    {
      "descripcion": "descripción completa del producto",
      "cantidad": "cantidad",
      "unidad": "unidad de medida",
      "precio_unitario": "precio por unidad",
      "precio_total": "precio total del item",
      "hs": "código HS si está presente",
      "peso": "peso si existe",
      "origen": "país de origen si existe"
    }
  ],
  "terminos": {
    "incoterm": "FOB/CIF/EXW etc",
    "forma_pago": "forma de pago",
    "metodo_envio": "método de envío",
    "puerto_embarque": "puerto si existe",
    "puerto_destino": "puerto si existe"
  }
}

Extrae TODA la información visible en el documento, no omitas ningún campo.`;

    // Llamar a Responses API con file_id
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    console.log('🔄 Enviando a Responses API...');
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          input: [
            {
              role: 'system',
              content: [
                { type: 'input_text', text: systemPrompt }
              ]
            },
            {
              role: 'user',
              content: [
                { type: 'input_text', text: userMessage },
                {
                  type: 'input_file',
                  file_id: fileId
                }
              ]
            }
          ],
          text: {
            format: { type: 'json_object' }
          }
        });
        break;
      } catch (error) {
        if (error.status === 429 && retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 5;
          console.log(`⏳ Rate limit detectado. Esperando ${waitTime}s antes de reintentar...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    
    console.log('📝 Respuesta de Responses API recibida');
    console.log('🔍 Estructura de respuesta:', JSON.stringify(response, null, 2));
    console.log('🔍 solo_hs:', soloHS);
    
    // Extraer el texto de la respuesta
    const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
    
    if (!outputText) {
      console.error('❌ No se encontró texto en la respuesta');
      console.error('Respuesta completa:', JSON.stringify(response, null, 2));
      throw new Error('No se recibió respuesta del modelo');
    }
    
    console.log('📄 Texto extraído de la API:', outputText.substring(0, 500));
    console.log(`📊 Tokens utilizados: ${response.usage?.total_tokens || 'N/A'}`);
    
    // Limpiar el archivo subido
    if (fileId) {
      try {
        await openai.files.del(fileId);
        console.log('🧹 Archivo eliminado de OpenAI');
      } catch (delError) {
        console.warn('⚠️ No se pudo eliminar el archivo:', delError.message);
      }
    }
    
    try {
      const resultado = JSON.parse(outputText);
      console.log('✅ Clasificación de archivo completada exitosamente');
      console.log('📦 Resultado parseado:', JSON.stringify(resultado, null, 2));
      return resultado;
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = outputText.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error al clasificar con Responses API:', error);
    
    // Limpiar el archivo en caso de error
    if (fileId) {
      try {
        await openai.files.del(fileId);
        console.log('🧹 Archivo eliminado de OpenAI (error cleanup)');
      } catch (delError) {
        console.warn('⚠️ No se pudo eliminar el archivo:', delError.message);
      }
    }
    
    throw error;
  }
}

// Función para clasificar PDF directamente con Chat Completions (igual que texto)
async function clasificarPdfDirecto(base64Pdf, filename, soloHS = false) {
  try {
    console.log('📄 Enviando PDF directamente a Chat Completions...');
    
    const systemPrompt = `Eres un experto clasificador arancelario especializado en el Sistema Armonizado de Designación y Codificación de Mercancías de República Dominicana.

Analiza el documento PDF (factura comercial o documento) y extrae TODA la información presente:
- Información de factura (número, fecha, moneda, totales)
- Información del vendedor/proveedor (nombre, dirección, RNC/Tax ID)
- Información del comprador/importador (nombre, dirección, RNC)
- TODOS los productos listados (descripción completa, cantidad, precio unitario, precio total, código HS si está presente)
- Términos comerciales (Incoterm, condiciones de pago, método de envío)
- Cualquier otra información relevante del documento

Devuelve TODA la información en formato JSON completo y estructurado.`;

    const userMessage = soloHS 
      ? `Analiza este PDF y extrae solo el código HS en formato JSON { "hs": "XXXX.XX.XX.XX" }`
      : `Analiza esta factura PDF y extrae TODA la información en formato JSON. Incluye:
- factura: {numero, fecha, moneda, valor_total}
- vendedor: {nombre, direccion, rnc, pais}
- comprador: {nombre, direccion, rnc, pais}
- productos: [{descripcion, cantidad, precio_unitario, precio_total, hs}]
- terminos: {incoterm, forma_pago, metodo_envio}`;

    // Construir mensaje con el PDF
    const messages = [
      { 
        role: 'system', 
        content: systemPrompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userMessage
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:application/pdf;base64,${base64Pdf}`
            }
          }
        ]
      }
    ];
    
    // Llamar a Chat Completions con el PDF
    let completion;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: messages,
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        });
        break;
      } catch (error) {
        if (error.status === 429 && retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 5;
          console.log(`⏳ Rate limit detectado. Esperando ${waitTime}s antes de reintentar...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    
    const tokensUsados = {
      input: completion.usage?.prompt_tokens || 0,
      output: completion.usage?.completion_tokens || 0
    };
    
    console.log(`📊 Tokens utilizados - Input: ${tokensUsados.input}, Output: ${tokensUsados.output}, Total: ${tokensUsados.input + tokensUsados.output}`);
    
    const respuesta = completion.choices[0]?.message?.content;
    
    if (!respuesta) {
      throw new Error('No se recibió respuesta del modelo');
    }
    
    console.log('📝 Respuesta del modelo recibida');
    
    try {
      const resultado = JSON.parse(respuesta);
      console.log('✅ Clasificación de PDF completada exitosamente');
      return resultado;
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = respuesta.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error al clasificar PDF:', error);
    throw error;
  }
}

// Función para clasificar usando GPT-4o Vision (para PDFs problemáticos e imágenes)
async function clasificarConVision(base64Data, mimeType, soloHS = false) {
  try {
    console.log('👁️ Iniciando clasificación con Vision API...');
    
    // Determinar el tipo de contenido
    let contentType = 'image/jpeg';
    if (mimeType.includes('pdf')) {
      contentType = 'application/pdf';
    } else if (mimeType.includes('png')) {
      contentType = 'image/png';
    } else if (mimeType.includes('webp')) {
      contentType = 'image/webp';
    }
    
    // System prompt para Vision con formato ImportDUA
    const systemPrompt = `Eres un Clasificador Arancelario y Preparador de Datos DUA para la Dirección General de Aduanas de República Dominicana.

Analiza el documento visual (factura, imagen de producto, etc.) y prepara los datos para ImportDUA.

En MODO NORMAL: Extrae toda la información visible, clasifica cada producto con código HS correcto para RD, incluye justificación técnica detallada. Devuelve estructura ImportDUA completa.

En MODO ESPECIAL (solo_hs=true): Devuelve únicamente { "hs": "XXXX.XX.XX.XX" } sin otros campos.`;

    const userMessage = soloHS 
      ? 'Analiza este documento y extrae SOLO el código HS (clasificación arancelaria) en formato JSON { "hs": "XXXX.XX.XX.XX" }'
      : 'Analiza este documento y devuelve la estructura ImportDUA completa en formato JSON. Incluye ImpDeclaration con datos generales, ImpDeclarationSupplier con proveedor, ImpDeclarationProduct[] con todos los productos (HSCode, ProductName, FOBValue, Qty, Weight, Justificacion con RGI y notas), y TotalesCalculados.';
    
    // Construir el mensaje con la imagen/PDF
    const messages = [
      { 
        role: 'system', 
        content: systemPrompt
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: userMessage
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${contentType};base64,${base64Data}`
            }
          }
        ]
      }
    ];
    
    // Llamar a la API con Vision
    let completion;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        completion = await openai.chat.completions.create({
          model: 'gpt-4o', // Vision requiere gpt-4o
          messages: messages,
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: 'json_object' }
        });
        break;
      } catch (error) {
        if (error.status === 429 && retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 5;
          console.log(`⏳ Rate limit detectado. Esperando ${waitTime}s antes de reintentar...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    
    const tokensUsados = {
      input: completion.usage?.prompt_tokens || 0,
      output: completion.usage?.completion_tokens || 0
    };
    
    console.log(`📊 Tokens utilizados (Vision) - Input: ${tokensUsados.input}, Output: ${tokensUsados.output}, Total: ${tokensUsados.input + tokensUsados.output}`);
    
    const respuesta = completion.choices[0]?.message?.content;
    
    if (!respuesta) {
      throw new Error('No se recibió respuesta del modelo Vision');
    }
    
    console.log('📝 Respuesta del modelo Vision recibida');
    
    try {
      const resultado = JSON.parse(respuesta);
      console.log('✅ Clasificación con Vision completada exitosamente');
      return resultado;
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = respuesta.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error al clasificar con Vision:', error);
    throw error;
  }
}

// Rutas de la API

// Ruta principal
app.get('/', (req, res) => {
  res.json({ 
    mensaje: 'API del Clasificador Arancelario Dominicano',
    version: '1.0.0',
    endpoints: {
      '/clasificar': 'POST - Clasificar producto por texto',
      '/clasificar-archivo': 'POST - Clasificar desde archivo',
      '/health': 'GET - Estado del servidor'
    }
  });
});

// Clasificar por texto
app.post('/clasificar', async (req, res) => {
  try {
    const { producto, solo_hs = false } = req.body;
    
    if (!producto) {
      return res.status(400).json({ 
        error: 'Se requiere el campo "producto" con la descripción del artículo' 
      });
    }
    
    const resultado = await clasificarConAsistente(producto, solo_hs);
    
    res.json({
      success: true,
      data: resultado,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error en clasificación:', error);
    res.status(500).json({ 
      error: 'Error al procesar la clasificación',
      details: error.message 
    });
  }
});

// Función para analizar PDF usando la Files API de OpenAI (como Assistants)
async function analizarPdfConOpenAI(pdfPath, filename, soloHS = false) {
  try {
    console.log('📤 Subiendo PDF a OpenAI...');
    
    // Subir el archivo PDF a OpenAI
    const file = await openai.files.create({
      file: fs.createReadStream(pdfPath),
      purpose: 'assistants'
    });
    
    console.log(`✅ PDF subido con ID: ${file.id}`);
    
    // Crear un asistente temporal con File Search
    console.log('🤖 Creando asistente temporal...');
    const assistant = await openai.beta.assistants.create({
      name: "Clasificador Arancelario DUA",
      instructions: `Eres un Clasificador Arancelario y Preparador de Datos DUA para la Dirección General de Aduanas de República Dominicana.

Analiza el PDF adjunto (factura comercial o documento) y prepara los datos para ImportDUA.

En MODO NORMAL: Extrae TODA la información presente y clasifica cada producto con código HS correcto. Incluye justificación técnica (RGI, Notas Legales, partidas alternativas). Devuelve estructura ImportDUA completa.

En MODO ESPECIAL (solo_hs=true): Devuelve únicamente { "hs": "XXXX.XX.XX.XX" } sin otros campos.`,
      model: process.env.OPENAI_MODEL || "gpt-4o",
      tools: [{ type: "file_search" }],
      response_format: { type: "json_object" }
    });
    
    console.log(`✅ Asistente creado: ${assistant.id}`);
    
    // Crear un thread con el archivo
    console.log('💬 Creando thread...');
    
    const userMessage = soloHS 
      ? "Analiza este PDF y extrae SOLO el código HS de clasificación arancelaria en formato JSON: { \"hs\": \"XXXX.XX.XX.XX\" }"
      : `Analiza COMPLETAMENTE esta factura comercial PDF y prepara los datos para ImportDUA.

Devuelve la estructura completa ImportDUA en formato JSON con TODOS los campos:
- ImpDeclaration con datos generales (fechas, valores FOB/CIF, tipo despacho)
- ImpDeclarationSupplier con datos del proveedor extranjero
- ImpDeclarationProduct[] con cada producto (HSCode, ProductName, FOBValue, Qty, Weight, etc.)
- Cada producto DEBE incluir campo Justificacion con: RGI_aplicada, Notas_legales_usadas, Partidas_alternativas_consideradas, Motivo_descartes, Precision_hs, Razon_precision
- TotalesCalculados con sumas correctas

Extrae TODA la información visible en el documento. Los campos sin datos van como \"\".`;
    
    const thread = await openai.beta.threads.create({
      messages: [
        {
          role: "user",
          content: userMessage,
          attachments: [
            {
              file_id: file.id,
              tools: [{ type: "file_search" }]
            }
          ]
        }
      ]
    });
    
    console.log(`✅ Thread creado: ${thread.id}`);
    
    // Ejecutar el asistente
    console.log('▶️ Ejecutando análisis...');
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: assistant.id
    });
    
    // Esperar a que termine
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    let attempts = 0;
    const maxAttempts = 60;
    
    while (runStatus.status !== 'completed' && runStatus.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      console.log(`⏳ Estado: ${runStatus.status}...`);
      attempts++;
    }
    
    if (runStatus.status === 'failed') {
      throw new Error(`Análisis falló: ${runStatus.last_error?.message || 'Error desconocido'}`);
    }
    
    if (runStatus.status !== 'completed') {
      throw new Error('Timeout esperando respuesta del asistente');
    }
    
    // Obtener los mensajes
    console.log('📥 Obteniendo respuesta...');
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
    
    if (!assistantMessage) {
      throw new Error('No se recibió respuesta del asistente');
    }
    
    const respuesta = assistantMessage.content[0]?.text?.value;
    
    console.log(`📊 Tokens utilizados - Input: ${runStatus.usage?.prompt_tokens || 0}, Output: ${runStatus.usage?.completion_tokens || 0}`);
    
    // Limpiar recursos
    console.log('🧹 Limpiando recursos...');
    await openai.beta.assistants.del(assistant.id);
    await openai.files.del(file.id);
    
    console.log('✅ Análisis completado');
    
    // Parsear JSON
    try {
      return JSON.parse(respuesta);
    } catch (parseError) {
      console.log('⚠️ Error parseando JSON, intentando limpiar...');
      console.log('📄 Respuesta original:', respuesta.substring(0, 1000));
      
      // Intentar extraer JSON del texto
      const jsonMatch = respuesta.match(/\{.*\}/s);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // Intentar reparar JSON común (comillas simples, comas finales, etc.)
          let cleanJson = jsonMatch[0]
            .replace(/,(\s*[}\]])/g, '$1')  // Eliminar comas antes de } o ]
            .replace(/\n/g, ' ')             // Eliminar saltos de línea
            .replace(/\r/g, '')              // Eliminar retornos de carro
            .replace(/\t/g, ' ');            // Reemplazar tabs
          
          try {
            return JSON.parse(cleanJson);
          } catch (e2) {
            console.error('❌ No se pudo reparar el JSON');
            throw new Error('Respuesta no es JSON válido: ' + parseError.message);
          }
        }
      }
      throw new Error('No se encontró JSON en la respuesta');
    }
    
  } catch (error) {
    console.error('❌ Error analizando PDF con OpenAI:', error);
    throw error;
  }
}

// Clasificar desde archivo
app.post('/clasificar-archivo', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha enviado ningún archivo' });
    }
    
    // Convertir solo_hs a booleano (viene como string desde FormData)
    const solo_hs = req.body.solo_hs === 'true' || req.body.solo_hs === true;
    console.log('🔍 Modo solo_hs:', solo_hs, '(tipo:', typeof solo_hs, ')');
    let resultado;
    
    // Procesar según el tipo de archivo
    if (req.file.mimetype === 'application/pdf') {
      // PDFs: usar Files API + Assistants (funciona de forma comprobada)
      console.log('📄 PDF detectado, usando Files API + Assistants...');
      resultado = await analizarPdfConOpenAI(req.file.path, req.file.originalname, solo_hs);
      
    } else if (req.file.mimetype.includes('image')) {
      // Imágenes: usar Vision API
      console.log('🖼️ Imagen detectada, usando Vision API...');
      const imageBuffer = fs.readFileSync(req.file.path);
      const base64Data = imageBuffer.toString('base64');
      resultado = await clasificarConVision(base64Data, req.file.mimetype, solo_hs);
      
    } else if (req.file.mimetype.includes('text')) {
      // Archivos de texto: usar Chat Completions
      console.log('📝 Texto detectado, usando Chat Completions...');
      const contenido = fs.readFileSync(req.file.path, 'utf8');
      resultado = await clasificarConAsistente(contenido, solo_hs);
      
    } else {
      throw new Error(`Tipo de archivo no soportado: ${req.file.mimetype}`);
    }
    
    // Limpiar archivo temporal
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      archivo: req.file.originalname,
      data: resultado,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error en clasificación de archivo:', error);
    
    // Limpiar archivo temporal en caso de error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error al eliminar archivo temporal:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      error: 'Error al procesar el archivo',
      details: error.message 
    });
  }
});

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime() 
  });
});

// Ruta principal para servir el frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Manejo de errores
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo es demasiado grande. Máximo 10MB.' });
    }
  }
  
  console.error('Error no manejado:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Almacenamiento temporal de clasificaciones en memoria (en producción usar base de datos)
const clasificacionesActivas = new Map();

// Endpoint para actualizar un campo en la clasificación
app.post('/api/update-field', (req, res) => {
  try {
    const { sessionId, fieldKey, fieldValue } = req.body;
    
    console.log('📝 Actualizando campo:', { sessionId, fieldKey, fieldValue });
    
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId requerido' });
    }
    
    // Obtener la clasificación actual
    let clasificacion = clasificacionesActivas.get(sessionId);
    
    if (!clasificacion) {
      return res.status(404).json({ error: 'Clasificación no encontrada' });
    }
    
    // Actualizar el campo directamente
    clasificacion[fieldKey] = fieldValue;
    
    // También actualizar en objetos anidados si existen
    function updateNested(obj) {
      for (let key in obj) {
        if (key === fieldKey && typeof obj[key] !== 'object') {
          obj[key] = fieldValue;
        } else if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          updateNested(obj[key]);
        }
      }
    }
    updateNested(clasificacion);
    
    // Marcar como editado
    clasificacion.editado = true;
    clasificacion.fecha_ultima_edicion = new Date().toISOString();
    
    // Guardar de vuelta
    clasificacionesActivas.set(sessionId, clasificacion);
    
    console.log('✅ Campo actualizado en backend');
    
    res.json({ 
      success: true, 
      mensaje: 'Campo actualizado correctamente',
      clasificacion: clasificacion
    });
    
  } catch (error) {
    console.error('Error actualizando campo:', error);
    res.status(500).json({ error: 'Error actualizando campo' });
  }
});

// Endpoint para guardar la clasificación inicial
app.post('/api/save-classification', (req, res) => {
  try {
    const { sessionId, data } = req.body;
    
    if (!sessionId || !data) {
      return res.status(400).json({ error: 'sessionId y data requeridos' });
    }
    
    clasificacionesActivas.set(sessionId, data);
    console.log('💾 Clasificación guardada con sessionId:', sessionId);
    
    res.json({ success: true, sessionId });
    
  } catch (error) {
    console.error('Error guardando clasificación:', error);
    res.status(500).json({ error: 'Error guardando clasificación' });
  }
});

// Endpoint para obtener la clasificación actualizada
app.get('/api/get-classification/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const clasificacion = clasificacionesActivas.get(sessionId);
    
    if (!clasificacion) {
      return res.status(404).json({ error: 'Clasificación no encontrada' });
    }
    
    res.json({ success: true, data: clasificacion });
    
  } catch (error) {
    console.error('Error obteniendo clasificación:', error);
    res.status(500).json({ error: 'Error obteniendo clasificación' });
  }
});

// Iniciar servidor
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📡 API disponible en http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;