// ...existing code...
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const OpenAI = require('openai');
const { generarXmlImportDUA } = require('./utils/xmlGenerator');
const { connectDB } = require('./config/database');
const { verificarAuthOpcional } = require('./middleware/auth');
const CleanupService = require('./services/cleanupService');

// Importar rutas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const alertasRoutes = require('./routes/alertas');
const planesRoutes = require('./routes/planes');
const historialRoutes = require('./routes/historial');
const securityRoutes = require('./routes/security');
const cleanupRoutes = require('./routes/cleanup');
const configRoutes = require('./routes/config');

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

// Servir archivos estáticos del frontend (DEBE estar antes de las rutas de API)
app.use(express.static(path.join(__dirname, '../frontend')));

// Configurar multer para uploads (debe estar antes de los endpoints que lo usan)
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

// Importar BatchService para procesamiento inteligente de facturas
const BatchService = require('./services/batchService');

// Endpoint para clasificar archivos (con soporte de batch automático para >10 items)
app.post('/clasificar-archivo', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No se recibió ningún archivo',
        success: false
      });
    }
    
    const { obtener_hs = true, solo_hs, operationType = 'import' } = req.body;
    // Soporte para parámetro legado solo_hs: si viene como true, significa que NO quiere HS
    const obtenerCodigosArancelarios = solo_hs !== undefined ? !solo_hs : obtener_hs;
    
    // Con diskStorage, el archivo está en req.file.path
    const fileBuffer = fs.readFileSync(req.file.path);
    
    // Para archivos de texto, procesar directamente
    if (req.file.mimetype === 'text/plain') {
      const contenido = fileBuffer.toString('utf-8');
      const resultado = await clasificarTextoConResponsesAPI(contenido, obtenerCodigosArancelarios, operationType);
      // Limpiar archivo temporal
      fs.unlinkSync(req.file.path);
      return res.json({
        success: true,
        data: resultado.data,
        tokens_info: resultado.usage || {},
        batchInfo: { modoBatch: false },
        timestamp: new Date().toISOString()
      });
    }
    
    // Para PDFs, usar BatchService con detección automática
    if (req.file.mimetype === 'application/pdf') {
      try {
        // Usar BatchService que detecta automáticamente si necesita batch
        // El archivo ya está guardado en req.file.path por multer diskStorage
        const resultado = await BatchService.clasificarConBatchInteligente(
          req.file.path,
          req.file.originalname,
          req.file.mimetype,
          obtenerCodigosArancelarios,
          operationType
        );
        
        // Limpiar archivo temporal
        fs.unlinkSync(req.file.path);
        
        return res.json({
          success: true,
          data: resultado.data,
          tokens_info: resultado.usage || {},
          batchInfo: resultado.batchInfo || { modoBatch: false },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        // Limpiar archivo temporal en caso de error
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        throw error;
      }
    }
    
    // Para imágenes, usar Vision API
    if (req.file.mimetype.startsWith('image/')) {
      const base64Data = fileBuffer.toString('base64');
      const resultado = await clasificarConVision(base64Data, req.file.mimetype, obtenerCodigosArancelarios, operationType);
      // Limpiar archivo temporal
      fs.unlinkSync(req.file.path);
      return res.json({
        success: true,
        data: resultado.data,
        tokens_info: resultado.usage || {},
        batchInfo: { modoBatch: false },
        timestamp: new Date().toISOString()
      });
    }
    
    // Limpiar archivo si tipo no soportado
    fs.unlinkSync(req.file.path);
    return res.status(400).json({
      error: 'Tipo de archivo no soportado',
      success: false
    });
    
  } catch (error) {
    // Limpiar archivo en caso de error general
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      error: 'Error inesperado',
      details: error.message,
      success: false
    });
  }
});

// Endpoint con SSE para clasificación con progreso en tiempo real
// Almacén temporal para archivos pendientes de procesar con SSE
const pendingBatchFiles = new Map();

// NUEVO FLUJO: Endpoint para analizar PDF con pdf-parse y contar items automáticamente
app.post('/analizar-pdf', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo', success: false });
    }
    
    if (req.file.mimetype !== 'application/pdf') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ 
        error: 'Solo se pueden procesar archivos PDF',
        success: false 
      });
    }
    
    // Generar ID para guardar temporalmente
    const fileId = `pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // PASO 1: Analizar con pdf-parse para contar items
    console.log('📄 Analizando PDF con pdf-parse...');
    const fileBuffer = fs.readFileSync(req.file.path);
    const analisis = await BatchService.contarItemsEnPdf(fileBuffer);
    
    console.log(`📊 Resultado del análisis:`);
    console.log(`   - Items detectados: ${analisis.totalItems}`);
    console.log(`   - Confianza: ${analisis.confianza}`);
    console.log(`   - Texto extraído: ${analisis.textoExtraido} caracteres`);
    
    // Guardar archivo para procesamiento posterior
    pendingBatchFiles.set(fileId, {
      tempPath: req.file.path,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      analisis: analisis,
      createdAt: Date.now()
    });
    
    // Limpiar archivos viejos (más de 10 minutos)
    const TEN_MINUTES = 10 * 60 * 1000;
    for (const [id, data] of pendingBatchFiles.entries()) {
      if (Date.now() - data.createdAt > TEN_MINUTES) {
        if (fs.existsSync(data.tempPath)) {
          fs.unlinkSync(data.tempPath);
        }
        pendingBatchFiles.delete(id);
      }
    }
    
    console.log(`📁 PDF guardado temporalmente: ${fileId}`);
    
    res.json({
      success: true,
      fileId,
      filename: req.file.originalname,
      metodo: 'pdf-parse',
      itemsDetectados: analisis.totalItems,
      confianza: analisis.confianza,
      detalles: analisis.detalles,
      vistaPrevia: analisis.vistaPrevia?.substring(0, 500),
      mensaje: analisis.totalItems > 0 
        ? `Se detectaron ${analisis.totalItems} items/productos en el documento.`
        : 'No se pudieron detectar items automáticamente. Por favor indique la cantidad.'
    });
    
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error analizando PDF:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// NUEVO: Endpoint para detectar items usando IA (cuando pdf-parse no es preciso)
app.post('/detectar-items-ia', async (req, res) => {
  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'fileId es requerido', success: false });
    }
    
    const fileData = pendingBatchFiles.get(fileId);
    if (!fileData) {
      return res.status(404).json({ 
        error: 'Archivo no encontrado o expirado. Por favor suba el archivo nuevamente.',
        success: false 
      });
    }
    
    console.log('🤖 Detectando items con IA (COUNT_ITEMS_ONLY)...');
    
    // Subir archivo a OpenAI temporalmente
    const file = await openai.files.create({
      file: fs.createReadStream(fileData.tempPath),
      purpose: 'assistants'
    });
    
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    // Usar COUNT_ITEMS_ONLY para activar el modo de conteo puro del prompt
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: { id: promptId },
      input: [
        {
          role: 'user',
          content: [
            { 
              type: 'input_text', 
              text: 'COUNT_ITEMS_ONLY - Responde en formato json'
            },
            { type: 'input_file', file_id: file.id }
          ]
        }
      ]
    });
    
    // Eliminar archivo de OpenAI
    try {
      await openai.files.del(file.id);
    } catch {}
    
    // Extraer respuesta
    const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
    
    if (!outputText) {
      throw new Error('No se recibió respuesta de la IA');
    }
    
    console.log('📥 Respuesta de IA (COUNT MODE):', outputText);
    
    // Parsear respuesta - esperamos { "TotalItems": "X" }
    let resultado;
    let itemsDetectados = 1;
    
    try {
      resultado = JSON.parse(outputText);
      // El formato es { "TotalItems": "X" }
      itemsDetectados = parseInt(resultado.TotalItems) || parseInt(resultado.totalItems) || 1;
    } catch {
      // Intentar extraer el JSON del texto
      const jsonMatch = outputText.match(/\{[\s\S]*"TotalItems"[\s\S]*\}/i);
      if (jsonMatch) {
        resultado = JSON.parse(jsonMatch[0]);
        itemsDetectados = parseInt(resultado.TotalItems) || parseInt(resultado.totalItems) || 1;
      } else {
        // Último intento: buscar número en el texto
        const numMatch = outputText.match(/(\d+)/);
        itemsDetectados = numMatch ? parseInt(numMatch[1]) : 1;
      }
    }
    
    // Actualizar el análisis guardado
    fileData.analisisIA = {
      totalItems: itemsDetectados,
      tokensUsados: response.usage?.total_tokens || 0
    };
    pendingBatchFiles.set(fileId, fileData);
    
    console.log(`✅ IA detectó ${itemsDetectados} items (COUNT_ITEMS_ONLY)`);
    
    res.json({
      success: true,
      fileId,
      metodo: 'ia',
      itemsDetectados: itemsDetectados,
      tokensUsados: response.usage?.total_tokens || 0,
      mensaje: `La IA detectó ${itemsDetectados} items/productos en el documento.`
    });
    
  } catch (error) {
    console.error('Error detectando items con IA:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// NUEVO: Endpoint para forzar conteo con IA (FORCE_ITEM_COUNT)
app.post('/forzar-conteo-ia', async (req, res) => {
  try {
    const { fileId, cantidadForzada } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'fileId es requerido', success: false });
    }
    
    if (!cantidadForzada || cantidadForzada < 1) {
      return res.status(400).json({ error: 'cantidadForzada es requerida y debe ser mayor a 0', success: false });
    }
    
    const fileData = pendingBatchFiles.get(fileId);
    if (!fileData) {
      return res.status(404).json({ 
        error: 'Archivo no encontrado o expirado. Por favor suba el archivo nuevamente.',
        success: false 
      });
    }
    
    console.log(`🎯 Forzando conteo con IA: FORCE_ITEM_COUNT: ${cantidadForzada}...`);
    
    // Subir archivo a OpenAI temporalmente
    const file = await openai.files.create({
      file: fs.createReadStream(fileData.tempPath),
      purpose: 'assistants'
    });
    
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    // Usar FORCE_ITEM_COUNT para forzar el conteo
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: { id: promptId },
      input: [
        {
          role: 'user',
          content: [
            { 
              type: 'input_text', 
              text: `"FORCE_ITEM_COUNT": ${cantidadForzada} - Responde en formato json`
            },
            { type: 'input_file', file_id: file.id }
          ]
        }
      ]
    });
    
    // Eliminar archivo de OpenAI
    try {
      await openai.files.del(file.id);
    } catch {}
    
    // Extraer respuesta
    const outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
    
    console.log('📥 Respuesta de IA (FORCE_ITEM_COUNT):', outputText);
    
    // Parsear respuesta - esperamos { "TotalItems": "X" }
    let itemsConfirmados = cantidadForzada;
    
    if (outputText) {
      try {
        const resultado = JSON.parse(outputText);
        itemsConfirmados = parseInt(resultado.TotalItems) || parseInt(resultado.totalItems) || cantidadForzada;
      } catch {
        // Si no se puede parsear, usar la cantidad forzada
        itemsConfirmados = cantidadForzada;
      }
    }
    
    // Actualizar el análisis guardado
    fileData.analisisIA = {
      totalItems: itemsConfirmados,
      forzado: true,
      tokensUsados: response.usage?.total_tokens || 0
    };
    pendingBatchFiles.set(fileId, fileData);
    
    console.log(`✅ IA confirmó ${itemsConfirmados} items (FORCE_ITEM_COUNT)`);
    
    res.json({
      success: true,
      fileId,
      metodo: 'ia-forzado',
      itemsConfirmados: itemsConfirmados,
      tokensUsados: response.usage?.total_tokens || 0,
      mensaje: `La IA confirmó ${itemsConfirmados} items/productos en el documento.`
    });
    
  } catch (error) {
    console.error('Error forzando conteo con IA:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// NUEVO: Endpoint para procesar un PDF ya analizado con la cantidad de items confirmada por el usuario
app.post('/procesar-pdf-confirmado', verificarAuthOpcional, async (req, res) => {
  try {
    const { fileId, itemsConfirmados, soloHS = false, operationType = 'import' } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'fileId es requerido', success: false });
    }
    
    const fileData = pendingBatchFiles.get(fileId);
    if (!fileData) {
      return res.status(404).json({ 
        error: 'Archivo no encontrado o expirado. Por favor suba el archivo nuevamente.',
        success: false 
      });
    }
    
    const totalItems = itemsConfirmados || fileData.totalItems || 1;
    
    console.log(`\n📊 Procesando con ${totalItems} items (confirmado por usuario)`);
    
    // Procesar con BatchService
    const resultado = await BatchService.clasificarConBatchInteligente(
      fileData.tempPath,
      fileData.filename,
      fileData.mimetype,
      soloHS,
      operationType,
      null, // onProgress
      totalItems // items confirmados por usuario
    );
    
    // Limpiar archivo temporal
    if (fs.existsSync(fileData.tempPath)) {
      fs.unlinkSync(fileData.tempPath);
    }
    
    // Guardar en historial si hay autenticación
    if (req.auth?.empresa_id && req.auth?.usuario_id) {
      try {
        const HistorialService = require('./services/historialService');
        const db = require('./config/database').getDB();
        const tokensUsados = resultado.usage?.total_tokens || 0;
        
        await db.collection('empresas').updateOne(
          { empresa_id: req.auth.empresa_id },
          { $inc: { tokens_consumidos: tokensUsados } }
        );
        
        await HistorialService.guardarClasificacion(
          req.auth.empresa_id,
          req.auth.usuario_id,
          operationType,
          fileData.filename || 'Clasificación PDF',
          resultado.data,
          tokensUsados
        );
        console.log('📝 Clasificación guardada en historial (procesar-pdf-confirmado)');
      } catch (historialError) {
        console.error('⚠️ Error guardando en historial:', historialError);
      }
    }
    
    pendingBatchFiles.delete(fileId);
    
    res.json({
      success: true,
      data: resultado.data,
      tokens_info: resultado.usage || {},
      batchInfo: resultado.batchInfo || { modoBatch: false },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error procesando PDF confirmado:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// Endpoint para subir archivo y obtener ID para procesamiento con progreso
app.post('/clasificar-archivo-iniciar', verificarAuthOpcional, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se recibió ningún archivo', success: false });
    }
    
    const { solo_hs, operationType = 'import', itemsUsuario } = req.body;
    const soloHS = solo_hs === 'true' || solo_hs === true;
    const itemsConfirmados = itemsUsuario ? parseInt(itemsUsuario) : null;
    
    // Solo para PDFs tiene sentido el modo batch con progreso
    if (req.file.mimetype !== 'application/pdf') {
      return res.status(400).json({ 
        error: 'El procesamiento con progreso solo está disponible para PDFs',
        success: false 
      });
    }
    
    // Con diskStorage, el archivo ya está guardado en req.file.path
    
    // Generar un ID único para este batch
    const fileId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Usar SOLO la cantidad especificada por el usuario (NO usar pdf-parse)
    const totalItems = (itemsConfirmados && itemsConfirmados > 0) ? itemsConfirmados : 1;
    
    // Guardar info para procesamiento posterior (incluyendo auth para historial)
    pendingBatchFiles.set(fileId, {
      tempPath: req.file.path,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      soloHS,
      operationType,
      totalItems,
      createdAt: Date.now(),
      auth: req.auth ? { empresa_id: req.auth.empresa_id, usuario_id: req.auth.usuario_id } : null
    });
    
    // Limpiar archivos pendientes viejos (más de 5 minutos)
    const FIVE_MINUTES = 5 * 60 * 1000;
    for (const [id, data] of pendingBatchFiles.entries()) {
      if (Date.now() - data.createdAt > FIVE_MINUTES) {
        if (fs.existsSync(data.tempPath)) {
          fs.unlinkSync(data.tempPath);
        }
        pendingBatchFiles.delete(id);
      }
    }
    
    res.json({
      success: true,
      fileId,
      analisis: {
        totalItems: totalItems,
        necesitaBatch: totalItems > 10,
        batchSize: 10,
        totalBatches: totalItems > 10 ? Math.ceil(totalItems / 10) : 1
      }
    });
    
  } catch (error) {
    console.error('Error iniciando clasificación:', error);
    res.status(500).json({ error: error.message, success: false });
  }
});

// Endpoint SSE para procesar con progreso en tiempo real
app.get('/clasificar-archivo-stream/:fileId', async (req, res) => {
  const { fileId } = req.params;
  
  // Configurar SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Función para enviar eventos SSE
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  try {
    const fileData = pendingBatchFiles.get(fileId);
    
    if (!fileData) {
      sendEvent('error', { error: 'Archivo no encontrado o expirado' });
      return res.end();
    }
    
    const totalItems = fileData.totalItems || 1;
    const necesitaBatch = totalItems > 10;
    
    sendEvent('inicio', { 
      mensaje: 'Iniciando procesamiento...',
      totalItems: totalItems,
      necesitaBatch: necesitaBatch
    });
    
    // Callback para reportar progreso de cada batch
    const onBatchComplete = (progressData) => {
      sendEvent('progreso', {
        batch: progressData.batchNum,
        totalBatches: progressData.totalBatches,
        itemsInicio: progressData.itemsInicio,
        itemsFin: progressData.itemsFin,
        productosObtenidos: progressData.productosObtenidos,
        productosAcumulados: progressData.productosAcumulados,
        progreso: progressData.progreso
      });
    };
    
    // Procesar con BatchService - PASAR totalItems
    const resultado = await BatchService.clasificarConBatchInteligente(
      fileData.tempPath,
      fileData.filename,
      fileData.mimetype,
      fileData.soloHS,
      fileData.operationType,
      onBatchComplete,
      totalItems  // <-- PASAR LA CANTIDAD DE ITEMS
    );
    
    // Limpiar archivo temporal
    if (fs.existsSync(fileData.tempPath)) {
      fs.unlinkSync(fileData.tempPath);
    }
    
    // Guardar en historial si hay autenticación
    if (fileData.auth?.empresa_id && fileData.auth?.usuario_id) {
      try {
        const HistorialService = require('./services/historialService');
        const db = require('./config/database').getDB();
        const tokensUsados = resultado.usage?.total_tokens || 0;
        
        // Actualizar tokens consumidos en la empresa
        await db.collection('empresas').updateOne(
          { empresa_id: fileData.auth.empresa_id },
          { $inc: { tokens_consumidos: tokensUsados } }
        );
        console.log(`📊 Tokens actualizados para batch PDF: +${tokensUsados}`);
        
        // Guardar en historial
        const historialResult = await HistorialService.guardarClasificacion(
          fileData.auth.empresa_id,
          fileData.auth.usuario_id,
          fileData.operationType,
          fileData.filename || 'Clasificación PDF',
          resultado.data,
          tokensUsados
        );
        console.log('📝 Resultado de guardar en historial (batch PDF):', historialResult);
      } catch (historialError) {
        console.error('⚠️ Error guardando en historial (batch):', historialError);
      }
    } else {
      console.log('⚠️ No hay auth en batch PDF, no se guardará en historial');
    }
    
    pendingBatchFiles.delete(fileId);
    
    // Enviar resultado final
    sendEvent('completo', {
      success: true,
      data: resultado.data,
      tokens_info: resultado.usage,
      batchInfo: resultado.batchInfo
    });
    
    res.end();
    
  } catch (error) {
    console.error('Error en stream de clasificación:', error);
    sendEvent('error', { error: error.message });
    
    // Limpiar en caso de error
    const fileData = pendingBatchFiles.get(fileId);
    if (fileData && fs.existsSync(fileData.tempPath)) {
      fs.unlinkSync(fileData.tempPath);
    }
    pendingBatchFiles.delete(fileId);
    
    res.end();
  }
});

// Endpoint para generar XML ImportDUA desde JSON
app.post('/generar-xml', (req, res) => {
  try {
    console.log('📄 Generando XML ImportDUA...');
    const jsonData = req.body;
    
    if (!jsonData || Object.keys(jsonData).length === 0) {
      return res.status(400).json({ 
        error: 'No se recibieron datos para generar el XML',
        success: false 
      });
    }
    
    // Generar XML usando el generador
    const xml = generarXmlImportDUA(jsonData);
    
    console.log('✅ XML generado correctamente');
    
    // Enviar como texto XML
    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
    
  } catch (error) {
    console.error('❌ Error generando XML:', error);
    res.status(500).json({ 
      error: 'Error al generar XML',
      details: error.message,
      success: false 
    });
  }
});

// Middleware de logging para debug
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// Configurar timeouts
app.use((req, res, next) => {
  // Timeout de 5 minutos para clasificaciones
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

// Montar rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/planes', planesRoutes);
app.use('/api/historial', historialRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/cleanup', cleanupRoutes);
app.use('/api/config', configRoutes);

// Ruta de health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
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

IMPORTANTE: Responde SIEMPRE en formato JSON válido con toda la información estructurada.`;

    const userMessage = soloHS 
      ? `Analiza este documento y extrae SOLO el código HS de clasificación arancelaria. Responde en formato JSON: { "hs": "XXXX.XX.XX.XX" }`
      : `Analiza COMPLETAMENTE esta factura comercial y extrae TODOS los campos presentes en el documento.

IMPORTANTE: Tu respuesta debe ser únicamente un objeto JSON válido con la siguiente estructura:

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
    const systemPrompt = `Eres un Clasificador Arancelario y Preparador de Datos DUA para la Dirección General de Aduanas de la República Dominicana.

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
      return {
        data: resultado,
        usage: completion.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = respuesta.match(/\{.*\}/s);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          usage: completion.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        };
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
async function clasificarTextoConResponsesAPI(textoProducto, soloHS = false, operationType = 'import', skipHS = false) {
  try {
    const promptId = process.env.OPENAI_PROMPT_ID;
    const promptVersion = process.env.OPENAI_PROMPT_VERSION;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    console.log('\n🟣 ========== LLAMADA A RESPONSES API (TEXTO) ==========');
    console.log('📋 Usando Prompt ID:', promptId);
    console.log('📋 Versión del Prompt:', promptVersion || 'latest');
    console.log('📦 Modo skip_hs:', skipHS);
    console.log('📦 Tipo operación:', operationType);
    console.log('📝 Texto:', textoProducto.substring(0, 200) + '...');
    
    const promptConfig = {
      id: promptId
    };
    
    // Agregar versión solo si está definida
    if (promptVersion) {
      promptConfig.version = promptVersion;
    }
    
    console.log('📤 REQUEST a Responses API:');
    console.log(JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: promptConfig,
      input: textoProducto.substring(0, 200) + '...'
    }, null, 2));
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          prompt: promptConfig,
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
      return {
        data: resultado,
        usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = outputText.match(/\{.*\}/s);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error en clasificarTextoConResponsesAPI:', error);
    throw error;
  }
}

// Clasificar por texto
app.post('/clasificar', verificarAuthOpcional, async (req, res) => {
  try {
    const { producto, solo_hs = false, operationType = 'import' } = req.body;
    
    if (!producto) {
      return res.status(400).json({ 
        error: 'Se requiere el campo "producto" con la descripción del artículo' 
      });
    }
    
    console.log('🔍 Verificando autenticación en /clasificar:', {
      tieneAuth: !!req.auth,
      empresa_id: req.auth?.empresa_id,
      usuario_id: req.auth?.usuario_id
    });
    
    // Verificar tokens disponibles ANTES de clasificar
    if (req.auth?.empresa_id) {
      const db = require('./config/database').getDB();
      const empresa = await db.collection('empresas').findOne({ empresa_id: req.auth.empresa_id });
      
      if (empresa) {
        const tokensRestantes = empresa.tokens_limite_mensual - empresa.tokens_consumidos;
        if (tokensRestantes <= 0) {
          return res.status(403).json({
            error: 'no_tokens_available',
            mensaje: 'Has agotado tus tokens mensuales. Por favor, actualiza tu plan o espera el siguiente ciclo.',
            limites: {
              tokens_consumidos: empresa.tokens_consumidos,
              tokens_limite: empresa.tokens_limite_mensual,
              tokens_restantes: tokensRestantes
            }
          });
        }
      }
    }
    
    // Usar Responses API con tu prompt guardado
    const respuesta = await clasificarTextoConResponsesAPI(producto, solo_hs, operationType);
    let resultado = respuesta.data;
    const usage = respuesta.usage;
    
    // Obtener y aplicar defaults de la empresa si está autenticado
    if (req.auth?.empresa_id) {
      const ConfigService = require('./services/configService');
      const defaultsInfo = await ConfigService.obtenerDefaults(req.auth.empresa_id);
      
      if (defaultsInfo.success && Object.keys(defaultsInfo.defaults).length > 0) {
        console.log('🔧 Aplicando defaults de la empresa:', defaultsInfo.defaults);
        resultado = ConfigService.aplicarDefaults(resultado, defaultsInfo.defaults);
        console.log('✅ Defaults aplicados correctamente');
      }
    }
    
    // Actualizar tokens consumidos y guardar en historial si hay autenticación
    if (req.auth?.empresa_id && req.auth?.usuario_id) {
      const HistorialService = require('./services/historialService');
      console.log('✅ Usuario autenticado en /clasificar, guardando en historial...');
      
      // Actualizar tokens consumidos en la empresa
      const db = require('./config/database').getDB();
      await db.collection('empresas').updateOne(
        { empresa_id: req.auth.empresa_id },
        { $inc: { tokens_consumidos: usage.total_tokens } }
      );
      console.log(`📊 Tokens actualizados: +${usage.total_tokens}`);
      
      const historialResult = await HistorialService.guardarClasificacion(
        req.auth.empresa_id,
        req.auth.usuario_id,
        operationType,
        'Clasificación por texto',
        resultado,
        usage.total_tokens
      );
      console.log('📝 Resultado de guardar en historial:', historialResult);
    } else {
      console.log('⚠️ No hay autenticación en /clasificar, no se guardará en historial');
    }
    
    res.json({
      success: true,
      data: resultado,
      tokens_info: usage,
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
    const promptVersion = process.env.OPENAI_PROMPT_VERSION;
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    // Subir archivo a OpenAI
    const file = await openai.files.create({
      file: fs.createReadStream(filePath),
      purpose: 'assistants'
    });
    fileId = file.id;
    // Procesar el archivo completo primero para extraer los items
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    let outputText = null;
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          prompt: { id: promptId },
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_file', file_id: fileId }
              ]
            }
          ]
        });
        outputText = response.output_text || response.output?.[0]?.content?.[0]?.text;
        break;
      } catch (error) {
        if (error.status === 429 && retryCount < maxRetries - 1) {
          const waitTime = Math.pow(2, retryCount) * 5;
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          retryCount++;
        } else {
          throw error;
        }
      }
    }
    // Limpiar el archivo subido
    if (fileId) {
      try { await openai.files.del(fileId); } catch {}
    }
    if (!outputText) throw new Error('No se recibió respuesta del modelo');
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
    // Si hay <=10 items, devolver resultado normal
    let productos = resultado.ImpDeclarationProduct || resultado.productos || [];
    if (productos.length <= 10) {
      return {
        data: resultado,
        usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    }
    // Si hay más de 10, procesar en batch de 10
    let lotes = [];
    for (let i = 0; i < productos.length; i += 10) {
      lotes.push(productos.slice(i, i + 10));
    }
    let resultadosBatch = [];
    let tokensTotales = 0;
    let productosAcumulados = [];
    for (let lote of lotes) {
      // Construir JSON parcial para el lote
      let parcial = { ...resultado, ImpDeclarationProduct: lote };
      // Enviar solo el lote a la IA para validación y enriquecimiento
      let partialText = JSON.stringify(parcial);
      let batchResp;
      retryCount = 0;
      while (retryCount < maxRetries) {
        try {
          batchResp = await openai.responses.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o',
            prompt: { id: promptId },
            input: [
              { role: 'user', content: [ { type: 'input_text', text: partialText } ] }
            ]
          });
          break;
        } catch (error) {
          if (error.status === 429 && retryCount < maxRetries - 1) {
            const waitTime = Math.pow(2, retryCount) * 5;
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
            retryCount++;
          } else {
            throw error;
          }
        }
      }
      let batchOutput = batchResp.output_text || batchResp.output?.[0]?.content?.[0]?.text;
      let batchResult;
      try {
        batchResult = JSON.parse(batchOutput);
      } catch (e) {
        const jsonMatch = batchOutput.match(/\{.*\}/s);
        if (jsonMatch) {
          batchResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Respuesta batch no es JSON válido');
        }
      }
      productosAcumulados = productosAcumulados.concat(batchResult.ImpDeclarationProduct || batchResult.productos || []);
      tokensTotales += batchResp.usage?.total_tokens || 0;
      resultadosBatch.push(batchResult);
    }
    // Unir todos los productos en el resultado final
    let resultadoFinal = { ...resultado, ImpDeclarationProduct: productosAcumulados };
    return {
      data: resultadoFinal,
      usage: { total_tokens: tokensTotales }
    };
  } catch (error) {
    if (fileId) {
      try { await openai.files.del(fileId); } catch {}
    }
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
    const systemPrompt = `Eres un Clasificador Arancelario y Preparador de Datos DUA para la Dirección General de Aduanas de la República Dominicana.

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
      return {
        data: resultado,
        usage: completion.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = respuesta.match(/\{.*\}/s);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          usage: completion.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        };
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
async function clasificarTextoConResponsesAPI(textoProducto, soloHS = false, operationType = 'import', skipHS = false) {
  try {
    const promptId = process.env.OPENAI_PROMPT_ID;
    const promptVersion = process.env.OPENAI_PROMPT_VERSION;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    console.log('\n🟣 ========== LLAMADA A RESPONSES API (TEXTO) ==========');
    console.log('📋 Usando Prompt ID:', promptId);
    console.log('📋 Versión del Prompt:', promptVersion || 'latest');
    console.log('📦 Modo skip_hs:', skipHS);
    console.log('📦 Tipo operación:', operationType);
    console.log('📝 Texto:', textoProducto.substring(0, 200) + '...');
    
    const promptConfig = {
      id: promptId
    };
    
    // Agregar versión solo si está definida
    if (promptVersion) {
      promptConfig.version = promptVersion;
    }
    
    console.log('📤 REQUEST a Responses API:');
    console.log(JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: promptConfig,
      input: textoProducto.substring(0, 200) + '...'
    }, null, 2));
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          prompt: promptConfig,
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
      return {
        data: resultado,
        usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = outputText.match(/\{.*\}/s);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error en clasificarTextoConResponsesAPI:', error);
    throw error;
  }
}

// Clasificar por texto
app.post('/clasificar', verificarAuthOpcional, async (req, res) => {
  try {
    const { producto, solo_hs = false, operationType = 'import' } = req.body;
    
    if (!producto) {
      return res.status(400).json({ 
        error: 'Se requiere el campo "producto" con la descripción del artículo' 
      });
    }
    
    console.log('🔍 Verificando autenticación en /clasificar:', {
      tieneAuth: !!req.auth,
      empresa_id: req.auth?.empresa_id,
      usuario_id: req.auth?.usuario_id
    });
    
    // Verificar tokens disponibles ANTES de clasificar
    if (req.auth?.empresa_id) {
      const db = require('./config/database').getDB();
      const empresa = await db.collection('empresas').findOne({ empresa_id: req.auth.empresa_id });
      
      if (empresa) {
        const tokensRestantes = empresa.tokens_limite_mensual - empresa.tokens_consumidos;
        if (tokensRestantes <= 0) {
          return res.status(403).json({
            error: 'no_tokens_available',
            mensaje: 'Has agotado tus tokens mensuales. Por favor, actualiza tu plan o espera el siguiente ciclo.',
            limites: {
              tokens_consumidos: empresa.tokens_consumidos,
              tokens_limite: empresa.tokens_limite_mensual,
              tokens_restantes: tokensRestantes
            }
          });
        }
      }
    }
    
    // Usar Responses API con tu prompt guardado
    const respuesta = await clasificarTextoConResponsesAPI(producto, solo_hs, operationType);
    let resultado = respuesta.data;
    const usage = respuesta.usage;
    
    // Obtener y aplicar defaults de la empresa si está autenticado
    if (req.auth?.empresa_id) {
      const ConfigService = require('./services/configService');
      const defaultsInfo = await ConfigService.obtenerDefaults(req.auth.empresa_id);
      
      if (defaultsInfo.success && Object.keys(defaultsInfo.defaults).length > 0) {
        console.log('🔧 Aplicando defaults de la empresa:', defaultsInfo.defaults);
        resultado = ConfigService.aplicarDefaults(resultado, defaultsInfo.defaults);
        console.log('✅ Defaults aplicados correctamente');
      }
    }
    
    // Actualizar tokens consumidos y guardar en historial si hay autenticación
    if (req.auth?.empresa_id && req.auth?.usuario_id) {
      const HistorialService = require('./services/historialService');
      console.log('✅ Usuario autenticado en /clasificar, guardando en historial...');
      
      // Actualizar tokens consumidos en la empresa
      const db = require('./config/database').getDB();
      await db.collection('empresas').updateOne(
        { empresa_id: req.auth.empresa_id },
        { $inc: { tokens_consumidos: usage.total_tokens } }
      );
      console.log(`📊 Tokens actualizados: +${usage.total_tokens}`);
      
      const historialResult = await HistorialService.guardarClasificacion(
        req.auth.empresa_id,
        req.auth.usuario_id,
        operationType,
        'Clasificación por texto',
        resultado,
        usage.total_tokens
      );
      console.log('📝 Resultado de guardar en historial:', historialResult);
    } else {
      console.log('⚠️ No hay autenticación en /clasificar, no se guardará en historial');
    }
    
    res.json({
      success: true,
      data: resultado,
      tokens_info: usage,
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
    const promptVersion = process.env.OPENAI_PROMPT_VERSION;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    console.log('\n🟣 ========== LLAMADA A RESPONSES API CON ARCHIVO ==========');
    console.log('📋 Usando Prompt ID:', promptId);
    console.log('📋 Versión del Prompt:', promptVersion || 'latest');
    console.log('📦 Modo skip_hs:', skipHS);
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
    
    const promptConfig = {
      id: promptId
    };
    
    // Agregar versión solo si está definida
    if (promptVersion) {
      promptConfig.version = promptVersion;
    }
    
    console.log('📤 REQUEST a Responses API con archivo:');
    console.log(JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: promptConfig,
      file_id: fileId
    }, null, 2));
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          prompt: promptConfig,
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
    
    // Limpiar el archivo subido
    if (fileId) {
      try {
        await openai.files.del(fileId);
        console.log('🧹 Archivo eliminado de OpenAI');
      } catch (delError) {
        console.warn('⚠️ No se pudo eliminar el archivo:', delError.message);
      }
    }
    
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
      return {
        data: resultado,
        usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = outputText.match(/\{.*\}/s);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error en clasificarConResponsesAPI:', error);
    
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
    const systemPrompt = `Eres un Clasificador Arancelario y Preparador de Datos DUA para la Dirección General de Aduanas de la República Dominicana.

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
      return {
        data: resultado,
        usage: completion.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = respuesta.match(/\{.*\}/s);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          usage: completion.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        };
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
async function clasificarTextoConResponsesAPI(textoProducto, soloHS = false, operationType = 'import', skipHS = false) {
  try {
    const promptId = process.env.OPENAI_PROMPT_ID;
    const promptVersion = process.env.OPENAI_PROMPT_VERSION;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    console.log('\n🟣 ========== LLAMADA A RESPONSES API (TEXTO) ==========');
    console.log('📋 Usando Prompt ID:', promptId);
    console.log('📋 Versión del Prompt:', promptVersion || 'latest');
    console.log('📦 Modo skip_hs:', skipHS);
    console.log('📦 Tipo operación:', operationType);
    console.log('📝 Texto:', textoProducto.substring(0, 200) + '...');
    
    const promptConfig = {
      id: promptId
    };
    
    // Agregar versión solo si está definida
    if (promptVersion) {
      promptConfig.version = promptVersion;
    }
    
    console.log('📤 REQUEST a Responses API:');
    console.log(JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      prompt: promptConfig,
      input: textoProducto.substring(0, 200) + '...'
    }, null, 2));
    
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        response = await openai.responses.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          prompt: promptConfig,
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
      return {
        data: resultado,
        usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON:', parseError.message);
      const jsonMatch = outputText.match(/\{.*\}/s);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          usage: response.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 }
        };
      }
      throw new Error('Respuesta no es JSON válido');
    }
    
  } catch (error) {
    console.error('❌ Error en clasificarTextoConResponsesAPI:', error);
    throw error;
  }
}

// Inicializaci�n del servidor
const startServer = async () => {
  try {
    // Conectar a MongoDB
    await connectDB();
    
    // Iniciar servidor
    app.listen(PORT, () => {
      console.log('`n' + '='.repeat(60));
      console.log(' Servidor corriendo en http://localhost:' + PORT);
      console.log(' Environment: ' + (process.env.NODE_ENV || 'development'));
      console.log(' JWT configurado: ' + (process.env.JWT_SECRET ? '' : ''));
      console.log(' OpenAI API Key: ' + (process.env.OPENAI_API_KEY ? '' : ''));
      console.log(' Email configurado: ' + (process.env.EMAIL_PASSWORD !== 'CONFIGURA_TU_SENDGRID_API_KEY_AQUI' ? '' : ''));
      console.log('='.repeat(60) + '`n');
    });
  } catch (error) {
    console.error(' Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();
