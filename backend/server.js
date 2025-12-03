const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
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
async function clasificarConAsistente(contenido, soloHS = false, operationType = 'import') {
  try {
    const tipoOperacion = operationType === 'export' ? 'EXPORTACIÓN' : 'IMPORTACIÓN';
    console.log(`🔄 Iniciando clasificación de ${tipoOperacion}...`);
    
    // Obtener el Prompt ID desde las variables de entorno
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    // Construir el mensaje del usuario
    const userMessage = soloHS 
      ? `Clasifica el siguiente producto de ${tipoOperacion} y devuelve SOLO el código HS en formato JSON { "hs": "XXXX.XX.XX.XX" }:

${contenido}`
      : `Analiza el siguiente producto/factura de ${tipoOperacion} y devuelve la estructura ImportDUA completa en formato JSON válido con todos los campos requeridos para SIGA:

${contenido}`;
    
    // System prompt completo para clasificación arancelaria con formato ImportDUA
    const systemPrompt = `Eres un Clasificador Arancelario y Preparador de Datos DUA para la Dirección General de Aduanas de la República Dominicana.

Estás procesando una operación de ${tipoOperacion}.

Trabajas exclusivamente con el Arancel Dominicano basado en la Séptima Enmienda del Sistema Armonizado.

Tu función es preparar la información necesaria para construir un XML ImportDUA válido en SIGA, devolviendo SIEMPRE un JSON válido.

En MODO NORMAL (solo_hs = false):
- Extrae TODA la información de la factura/documento
- Clasifica cada producto con código HS correcto para RD
- Devuelve EXACTAMENTE esta estructura JSON (todos los campos requeridos, usa "" para campos vacíos):

{
  "DeclarationDate": "",
  "ClearanceType": "",
  "AreaCode": "",
  "FormNo": "",
  "BLNo": "",
  "ManifestNo": "",
  "ConsigneeCode": "",
  "ConsigneeName": "",
  "ConsigneeNationality": "",
  "CargoControlNo": "",
  "CommercialInvoiceNo": "",
  "DestinationLocationCode": "",
  "EntryPort": "",
  "DepartureCountryCode": "",
  "TransportCompanyCode": "",
  "TransportNationality": "",
  "TransportMethod": "",
  "EntryPlanDate": "",
  "EntryDate": "",
  "ImporterCode": "",
  "ImporterName": "",
  "ImporterNationality": "",
  "BrokerEmployeeCode": "",
  "BrokerCompanyCode": "",
  "DeclarantCode": "",
  "DeclarantName": "",
  "DeclarantNationality": "",
  "RegimenCode": "",
  "AgreementCode": "",
  "TotalFOB": "",
  "InsuranceValue": "",
  "FreightValue": "",
  "OtherValue": "",
  "TotalCIF": "",
  "TotalWeight": "",
  "NetWeight": "",
  "Remark": "",
  "ImpDeclarationSupplier": {
    "ForeignSupplierName": "",
    "ForeignSupplierCode": "",
    "ForeignSupplierNationality": ""
  },
  "ImpDeclarationProduct": [
    {
      "HSCode": "",
      "ProductCode": "",
      "ProductName": "",
      "BrandCode": "",
      "BrandName": "",
      "ModelCode": "",
      "ModelName": "",
      "ProductStatusCode": "",
      "ProductYear": "",
      "FOBValue": "",
      "UnitCode": "",
      "Qty": "",
      "Weight": "",
      "ProductSpecification": "",
      "TempProductYN": "",
      "CertificateOrignYN": "",
      "CertificateOriginNo": "",
      "OriginCountry": "",
      "OrganicYN": "",
      "GradeAlcohol": "",
      "CustomerSalesPrice": "",
      "ProductSerialNo": "",
      "VehicleType": "",
      "VehicleChassis": "",
      "VehicleColor": "",
      "VehicleMotor": "",
      "VehicleCC": "",
      "ProductDescription": "",
      "Remark": ""
    }
  ]
}

IMPORTANTE: Todos los campos numéricos (FOBValue, Qty, Weight, etc.) deben ser strings. Los campos vacíos van como "".

En MODO ESPECIAL (solo_hs = true):
- Devuelve ÚNICAMENTE: { "hs": "XXXX.XX.XX.XX" }
- Sin texto adicional ni otros campos`;

    // Llamar a la API de Chat Completions
    let completion;
    let retryCount = 0;
    const maxRetries = 3;
    
    console.log('\n🔵 ========== LLAMADA A CHAT COMPLETIONS API ==========');
    console.log('📤 REQUEST:');
    console.log(JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt.substring(0, 200) + '...' },
        { role: 'user', content: userMessage.substring(0, 200) + '...' }
      ],
      temperature: 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' }
    }, null, 2));
    
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
    
    console.log('\n📥 RESPONSE COMPLETA:');
    console.log(JSON.stringify(completion, null, 2));
    
    // Obtener información de uso de tokens
    const tokensUsados = {
      input: completion.usage?.prompt_tokens || 0,
      output: completion.usage?.completion_tokens || 0
    };
    
    console.log(`\n📊 Tokens utilizados - Input: ${tokensUsados.input}, Output: ${tokensUsados.output}, Total: ${tokensUsados.input + tokensUsados.output}`);
    
    // Obtener la respuesta
    const respuesta = completion.choices[0]?.message?.content;
    
    if (!respuesta) {
      throw new Error('No se recibió respuesta del modelo');
    }
    
    console.log('\n📝 CONTENIDO DE LA RESPUESTA:');
    console.log(respuesta);
    console.log('🔵 ========== FIN RESPUESTA API ==========\n');
    
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
async function clasificarConVision(base64Data, mimeType, soloHS = false, operationType = 'import') {
  try {
    const tipoOperacion = operationType === 'export' ? 'EXPORTACIÓN' : 'IMPORTACIÓN';
    console.log(`🔄 Iniciando clasificación de ${tipoOperacion} con Vision API...`);
    
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

Estás procesando una operación de ${tipoOperacion}.

Analiza el documento visual (factura, imagen de producto, etc.) y prepara los datos para ImportDUA.

En MODO NORMAL: Extrae toda la información visible, clasifica cada producto con código HS correcto. Devuelve estructura JSON completa con TODOS los campos ImportDUA (usa "" para campos vacíos, valores numéricos como strings).

En MODO ESPECIAL (solo_hs=true): Devuelve únicamente { "hs": "XXXX.XX.XX.XX" } sin otros campos.`;

    const userMessage = soloHS 
      ? `Analiza este documento de ${tipoOperacion} y extrae SOLO el código HS (clasificación arancelaria) en formato JSON { "hs": "XXXX.XX.XX.XX" }`
      : `Analiza este documento de ${tipoOperacion} y devuelve la estructura ImportDUA completa en formato JSON con TODOS los campos (usa "" para vacíos, valores numéricos como strings): DeclarationDate, ClearanceType, AreaCode, FormNo, BLNo, ManifestNo, ConsigneeCode, ConsigneeName, ConsigneeNationality, CargoControlNo, CommercialInvoiceNo, DestinationLocationCode, EntryPort, DepartureCountryCode, TransportCompanyCode, TransportNationality, TransportMethod, EntryPlanDate, EntryDate, ImporterCode, ImporterName, ImporterNationality, BrokerEmployeeCode, BrokerCompanyCode, DeclarantCode, DeclarantName, DeclarantNationality, RegimenCode, AgreementCode, TotalFOB, InsuranceValue, FreightValue, OtherValue, TotalCIF, TotalWeight, NetWeight, Remark, ImpDeclarationSupplier{ForeignSupplierName, ForeignSupplierCode, ForeignSupplierNationality}, ImpDeclarationProduct[]{HSCode, ProductCode, ProductName, BrandCode, BrandName, ModelCode, ModelName, ProductStatusCode, ProductYear, FOBValue, UnitCode, Qty, Weight, ProductSpecification, TempProductYN, CertificateOrignYN, CertificateOriginNo, OriginCountry, OrganicYN, GradeAlcohol, CustomerSalesPrice, ProductSerialNo, VehicleType, VehicleChassis, VehicleColor, VehicleMotor, VehicleCC, ProductDescription, Remark}.`;
    
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
    
    console.log('\n🟢 ========== LLAMADA A VISION API (GPT-4O) ==========');
    console.log('📤 REQUEST (con imagen base64):');
    console.log(JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt.substring(0, 200) + '...' },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: userMessage.substring(0, 200) + '...' },
            { type: 'image_url', image_url: { url: `data:${contentType};base64,[BASE64_TRUNCATED]` }}
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    }, null, 2));
    
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
    
    console.log('\n📥 VISION RESPONSE COMPLETA:');
    console.log(JSON.stringify(completion, null, 2));
    
    const tokensUsados = {
      input: completion.usage?.prompt_tokens || 0,
      output: completion.usage?.completion_tokens || 0
    };
    
    console.log(`\n📊 Tokens utilizados (Vision) - Input: ${tokensUsados.input}, Output: ${tokensUsados.output}, Total: ${tokensUsados.input + tokensUsados.output}`);
    
    const respuesta = completion.choices[0]?.message?.content;
    
    if (!respuesta) {
      throw new Error('No se recibió respuesta del modelo Vision');
    }
    
    console.log('\n📝 CONTENIDO DE LA RESPUESTA VISION:');
    console.log(respuesta);
    console.log('🟢 ========== FIN RESPUESTA VISION API ==========\n');
    
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

// Función para clasificar texto usando Responses API
async function clasificarTextoConResponsesAPI(textoProducto, soloHS = false, operationType = 'import') {
  try {
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    console.log('\n🟣 ========== LLAMADA A RESPONSES API (TEXTO) ==========');
    console.log('📋 Usando Prompt ID:', promptId);
    console.log('📦 Modo solo_hs:', soloHS);
    console.log('📦 Tipo operación:', operationType);
    console.log('📝 Texto:', textoProducto.substring(0, 200) + '...');
    
    console.log('📤 REQUEST a Responses API:');
    console.log(JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: { id: promptId },
      input: textoProducto.substring(0, 200) + '...'
    }, null, 2));
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          prompt: {
            id: promptId
          },
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: textoProducto }
              ]
            }
          ]
        });
        break;
      } catch (error) {
        if (error.status === 429 && retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 5;
          console.log(`⏳ Rate limit detectado. Esperando ${waitTime}s antes de reintentar...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          console.error('❌ Error en Responses API:', error);
          throw error;
        }
      }
    }
    
    console.log('\n📥 RESPONSES API - RESPUESTA COMPLETA:');
    console.log(JSON.stringify(response, null, 2));
    
    const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
    
    if (!outputText) {
      console.error('❌ No se encontró texto en la respuesta');
      console.error('Respuesta completa:', JSON.stringify(response, null, 2));
      throw new Error('No se recibió respuesta del modelo');
    }
    
    console.log('\n📝 CONTENIDO DE LA RESPUESTA:');
    console.log(outputText);
    console.log(`📊 Tokens utilizados: ${response.usage?.total_tokens || 'N/A'}`);
    console.log('🟣 ========== FIN RESPONSES API ==========\n');
    
    try {
      const resultado = JSON.parse(outputText);
      console.log('✅ JSON parseado correctamente');
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
    console.error('❌ Error en clasificarTextoConResponsesAPI:', error);
    throw error;
  }
}

// Clasificar por texto
app.post('/clasificar', async (req, res) => {
  try {
    const { producto, solo_hs = false, operationType = 'import' } = req.body;
    
    if (!producto) {
      return res.status(400).json({ 
        error: 'Se requiere el campo "producto" con la descripción del artículo' 
      });
    }
    
    // Usar Responses API con tu prompt guardado
    const resultado = await clasificarTextoConResponsesAPI(producto, solo_hs, operationType);
    
    res.json({
      success: true,
      data: resultado,
      operationType: operationType,
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

// Función para clasificar usando Responses API con tu Prompt guardado y archivo PDF
async function clasificarConResponsesAPIConArchivo(filePath, filename, mimeType, soloHS = false, operationType = 'import') {
  let fileId = null;
  
  try {
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    console.log('\n🟣 ========== LLAMADA A RESPONSES API CON ARCHIVO ==========');
    console.log('📋 Usando Prompt ID:', promptId);
    console.log('📦 Modo solo_hs:', soloHS);
    console.log('📦 Tipo operación:', operationType);
    console.log('📄 Archivo:', filename);
    console.log('📄 Tipo MIME:', mimeType);
    
    // Subir archivo a OpenAI
    console.log('📤 Subiendo archivo a OpenAI...');
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants'
    });
    
    fileId = file.id;
    console.log(`✅ Archivo subido con ID: ${fileId}`);
    
    console.log('📤 REQUEST a Responses API con archivo:');
    console.log(JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: { id: promptId },
      file_id: fileId
    }, null, 2));
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          prompt: {
            id: promptId
          },
          input: [
            {
              role: 'user',
              content: [
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
        if (error.status === 429 && retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 5;
          console.log(`⏳ Rate limit detectado. Esperando ${waitTime}s antes de reintentar...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          console.error('❌ Error en Responses API:', error);
          throw error;
        }
      }
    }
    
    console.log('\n📥 RESPONSES API - RESPUESTA COMPLETA:');
    console.log(JSON.stringify(response, null, 2));
    
    // Extraer el texto de la respuesta
    const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
    
    if (!outputText) {
      console.error('❌ No se encontró texto en la respuesta');
      console.error('Respuesta completa:', JSON.stringify(response, null, 2));
      throw new Error('No se recibió respuesta del modelo');
    }
    
    console.log('\n📝 CONTENIDO DE LA RESPUESTA:');
    console.log(outputText);
    console.log(`📊 Tokens utilizados: ${response.usage?.total_tokens || 'N/A'}`);
    console.log('🟣 ========== FIN RESPONSES API ==========\n');
    
    try {
      const resultado = JSON.parse(outputText);
      console.log('✅ JSON parseado correctamente');
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
    console.error('❌ Error en clasificarConResponsesAPI:', error);
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
    const operationType = req.body.operationType || 'import';
    console.log('🔍 Modo solo_hs:', solo_hs, '(tipo:', typeof solo_hs, ')');
    console.log('📦 Tipo de operación:', operationType);
    let resultado;
    
    // Procesar según el tipo de archivo - USAR RESPONSES API
    if (req.file.mimetype === 'application/pdf') {
      // PDFs: enviar directamente a Responses API
      console.log('📄 PDF detectado, enviando directamente a Responses API...');
      resultado = await clasificarConResponsesAPIConArchivo(req.file.path, req.file.originalname, req.file.mimetype, solo_hs, operationType);
      
    } else if (req.file.mimetype.includes('image')) {
      // Imágenes: usar Vision API (no soportado por Responses API aún)
      console.log('🖼️ Imagen detectada, usando Vision API...');
      const fileBuffer = fs.readFileSync(req.file.path);
      const base64Data = fileBuffer.toString('base64');
      resultado = await clasificarConVision(base64Data, req.file.mimetype, solo_hs, operationType);
      
    } else if (req.file.mimetype.includes('text')) {
      // Archivos de texto: usar Responses API
      console.log('📝 Texto detectado, usando Responses API...');
      const contenido = fs.readFileSync(req.file.path, 'utf8');
      resultado = await clasificarTextoConResponsesAPI(contenido, solo_hs, operationType);
      
    } else {
      throw new Error(`Tipo de archivo no soportado: ${req.file.mimetype}`);
    }
    
    // Limpiar archivo temporal
    fs.unlinkSync(req.file.path);
    
    res.json({
      success: true,
      archivo: req.file.originalname,
      data: resultado,
      operationType: operationType,
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

// Endpoint para generar XML desde JSON
// Validar campos obligatorios para SIGA
function validarCamposObligatoriosSIGA(jsonData) {
  const errores = [];
  const data = jsonData.ImportDUA?.ImpDeclaration || jsonData;
  
  // Validar ClearanceType con formato
  if (!data.ClearanceType || data.ClearanceType.trim() === '') {
    errores.push('ClearanceType es obligatorio (ej: IC38-002)');
  } else if (!/^IC\d{2}-\d{3}$/.test(data.ClearanceType)) {
    errores.push('ClearanceType debe tener formato IC##-### (ej: IC38-002, IC04-001)');
  }
  
  // Validar ImporterCode con formato RNC
  if (!data.ImporterCode || data.ImporterCode.trim() === '') {
    errores.push('ImporterCode es obligatorio (debe comenzar con RNC)');
  } else if (!data.ImporterCode.startsWith('RNC')) {
    errores.push('ImporterCode debe comenzar con RNC seguido de números');
  } else if (!/^RNC\d+$/.test(data.ImporterCode)) {
    errores.push('ImporterCode debe tener formato RNC seguido de números (ej: RNC214101830141)');
  }
  
  // Validar DeclarantCode con formato RNC
  if (!data.DeclarantCode || data.DeclarantCode.trim() === '') {
    errores.push('DeclarantCode es obligatorio (debe comenzar con RNC)');
  } else if (!data.DeclarantCode.startsWith('RNC')) {
    errores.push('DeclarantCode debe comenzar con RNC seguido de números');
  } else if (!/^RNC\d+$/.test(data.DeclarantCode)) {
    errores.push('DeclarantCode debe tener formato RNC seguido de números (ej: RNC214101830141)');
  }
  
  // Validar RegimenCode
  if (!data.RegimenCode || data.RegimenCode.toString().trim() === '') {
    errores.push('RegimenCode es obligatorio (ej: 1, 4, 70)');
  } else if (!/^\d+$/.test(data.RegimenCode.toString())) {
    errores.push('RegimenCode debe ser un número entero (ej: 1, 4, 70)');
  }
  
  // Validar campos numéricos
  if (data.TotalFOB === undefined || data.TotalFOB === null || data.TotalFOB === '') {
    errores.push('TotalFOB es obligatorio (formato decimal: 90513.5000)');
  }
  
  if (data.InsuranceValue === undefined || data.InsuranceValue === null || data.InsuranceValue === '') {
    errores.push('InsuranceValue es obligatorio (formato decimal: 900.0000, usar 0.00 si no aplica)');
  }
  
  if (data.FreightValue === undefined || data.FreightValue === null || data.FreightValue === '') {
    errores.push('FreightValue es obligatorio (formato decimal: 8200.0000, usar 0.00 si no aplica)');
  }
  
  // Validar productos
  const products = data.ImpDeclarationProduct || [];
  products.forEach((product, index) => {
    const productNum = index + 1;
    
    if (!product.ProductStatusCode || product.ProductStatusCode.trim() === '') {
      errores.push(`Producto ${productNum}: ProductStatusCode es obligatorio (ej: IC04-001)`);
    }
    
    // Validar booleanos
    if (product.TempProductYN !== 'true' && product.TempProductYN !== 'false' && 
        product.TempProductYN !== true && product.TempProductYN !== false) {
      errores.push(`Producto ${productNum}: TempProductYN debe ser true o false`);
    }
    
    if (product.OrganicYN !== 'true' && product.OrganicYN !== 'false' && 
        product.OrganicYN !== true && product.OrganicYN !== false) {
      errores.push(`Producto ${productNum}: OrganicYN debe ser true o false`);
    }
  });
  
  return errores;
}

app.post('/generar-xml', async (req, res) => {
  try {
    const jsonData = req.body;
    
    if (!jsonData) {
      return res.status(400).json({ error: 'No se recibieron datos JSON' });
    }
    
    console.log('📤 Generando XML ImportDUA...');
    console.log('📊 Datos recibidos:', JSON.stringify(jsonData, null, 2));
    
    // Validar campos obligatorios
    const errores = validarCamposObligatoriosSIGA(jsonData);
    if (errores.length > 0) {
      console.log('❌ Errores de validación:', errores);
      return res.status(400).json({ 
        error: 'Campos obligatorios faltantes o inválidos',
        errores: errores 
      });
    }
    
    const xml = generarXmlImportDUA(jsonData);
    
    console.log('✅ XML generado exitosamente');
    
    res.set('Content-Type', 'application/xml');
    res.send(xml);
    
  } catch (error) {
    console.error('❌ Error generando XML:', error);
    res.status(500).json({ 
      error: 'Error al generar XML',
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