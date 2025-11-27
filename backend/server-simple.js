const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
require('dotenv').config();
const OpenAI = require('openai');

// Importar configuración de base de datos y autenticación
const { connectDB, closeDB } = require('./config/database');
const authRoutes = require('./routes/auth');
const cleanupRoutes = require('./routes/cleanup');
const { verificarAuth, extraerDeviceFingerprint, extraerIP } = require('./middleware/auth');
const CleanupService = require('./services/cleanupService');
const { generarXmlImportDUA } = require('./utils/xmlGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware global para extraer IP
app.use(extraerIP);

// Rutas de autenticación
app.use('/api/auth', authRoutes);

// Rutas de limpieza y mantenimiento
app.use('/api/cleanup', cleanupRoutes);

// Servir archivos estáticos del frontend
app.use('/app', express.static(path.join(__dirname, '../frontend')));


// Configuración de multer para subida de archivos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'text/plain', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se permiten PDF, TXT, JPG, PNG.'), false);
    }
  }
});

// Función para procesar con la API de Chat Completions usando Prompt almacenado
async function clasificarConAsistente(contenido, soloHS = false) {
  try {
    console.log('🔄 Iniciando clasificación...');
    
    // Obtener el Prompt ID desde las variables de entorno
    const promptId = process.env.OPENAI_PROMPT_ID;
    
    if (!promptId) {
      throw new Error('OPENAI_PROMPT_ID no está configurado en .env');
    }
    
    // Construir el mensaje del usuario (el system prompt viene del Prompt almacenado)
    const userMessage = `Clasifica el siguiente producto según el Sistema Armonizado y devuelve la respuesta en formato JSON:

${contenido}

${soloHS ? 'MODO: Solo devuelve el código HS en formato JSON { "hs": "XXXX.XX.XX.XX" }' : 'MODO: Devuelve la clasificación completa con todos los campos en formato JSON válido'}`;
    
    // Llamar a la API de Chat Completions usando el Prompt almacenado
    let completion;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        completion = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          store: true,
          metadata: {
            prompt_id: promptId,
            mode: soloHS ? 'simplified' : 'complete'
          },
          messages: [
            { 
              role: 'system', 
              content: `prompt:${promptId}` 
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
    
    console.log('📝 Respuesta completa del modelo:');
    console.log('---INICIO---');
    console.log(respuesta);
    console.log('---FIN---');
    
    try {
      // Intentar parsear como JSON
      const resultado = JSON.parse(respuesta);
      console.log('✅ Clasificación completada exitosamente');
      return { 
        resultado: resultado, 
        tokens: tokensUsados 
      };
    } catch (parseError) {
      console.log('❌ Error al parsear JSON directo:', parseError.message);
      
      // Limpiar la respuesta de markdown y espacios
      let cleanResponse = respuesta.trim();
      
      // Remover bloques de código markdown
      cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      try {
        const resultado = JSON.parse(cleanResponse);
        console.log('✅ Clasificación completada (JSON limpio)');
        return { 
          resultado: resultado, 
          tokens: tokensUsados 
        };
      } catch (cleanError) {
        console.log('❌ Error al parsear JSON limpio:', cleanError.message);
        
        // Buscar array JSON [...]
        const arrayMatch = cleanResponse.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          console.log('🔍 Array JSON encontrado:');
          console.log(arrayMatch[0].substring(0, 200) + '...');
          try {
            const resultado = JSON.parse(arrayMatch[0]);
            console.log('✅ Clasificación completada (Array extraído)');
            return { 
              resultado: resultado, 
              tokens: tokensUsados 
            };
          } catch (arrayError) {
            console.log('❌ Error al parsear array JSON:', arrayError.message);
          }
        }
        
        // Si no es array, buscar objeto JSON {...}
        const objectMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          console.log('🔍 Objeto JSON encontrado:');
          console.log(objectMatch[0].substring(0, 200) + '...');
          try {
            const resultado = JSON.parse(objectMatch[0]);
            console.log('✅ Clasificación completada (Objeto extraído)');
            return { 
              resultado: resultado, 
              tokens: tokensUsados 
            };
          } catch (objectError) {
            console.log('❌ Error al parsear objeto JSON:', objectError.message);
          }
        }
        
        throw new Error(`Respuesta no es JSON válido. Respuesta recibida: ${respuesta.substring(0, 500)}...`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error al clasificar:', error.message);
    throw error;
  }
}

// Rutas de la API

// Ruta principal
app.get('/', (req, res) => {
  res.json({ 
    mensaje: 'API del Clasificador Arancelario Dominicano',
    version: '1.0.0',
    frontend: '/app',
    endpoints: {
      '/clasificar': 'POST - Clasificar producto por texto',
      '/clasificar-archivo': 'POST - Clasificar producto desde archivo',
      '/health': 'GET - Estado del servidor',
      '/app': 'GET - Interfaz web'
    }
  });
});

// Importar servicio de tokens
const TokenService = require('./services/tokenService');

// Endpoint para obtener planes disponibles
app.get('/api/planes', verificarAuth, async (req, res) => {
  try {
    const { getDB } = require('./config/database');
    const db = getDB();
    
    const planes = await db.collection('planes').find({}).toArray();
    
    res.json({
      success: true,
      planes: planes
    });
  } catch (error) {
    console.error('Error obteniendo planes:', error);
    res.status(500).json({
      error: 'Error obteniendo planes disponibles',
      details: error.message
    });
  }
});

// Endpoint para cambiar plan de empresa
app.post('/api/cambiar-plan', verificarAuth, async (req, res) => {
  try {
    const { plan_id } = req.body;
    
    if (!plan_id) {
      return res.status(400).json({
        error: 'Se requiere plan_id'
      });
    }
    
    const { getDB } = require('./config/database');
    const db = getDB();
    
    // Verificar que el plan existe
    const plan = await db.collection('planes').findOne({ id: plan_id });
    if (!plan) {
      return res.status(404).json({
        error: 'Plan no encontrado'
      });
    }
    
    // Actualizar la empresa con el nuevo plan
    const ahora = new Date();
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, ahora.getDate());
    
    const resultado = await db.collection('empresas').updateOne(
      { empresa_id: req.auth.empresa_id },
      {
        $set: {
          plan_id: plan_id,
          tokens_limite_mensual: plan.tokens_mes,
          tokens_consumidos: 0, // Resetear tokens al cambiar plan
          periodo_inicio: ahora.toISOString(),
          periodo_fin: finMes.toISOString()
        }
      }
    );
    
    if (resultado.modifiedCount === 0) {
      return res.status(500).json({
        error: 'No se pudo actualizar el plan'
      });
    }
    
    res.json({
      success: true,
      mensaje: `Plan actualizado a ${plan_id} exitosamente`,
      nuevo_plan: plan,
      tokens_resetados: true
    });
    
  } catch (error) {
    console.error('Error cambiando plan:', error);
    res.status(500).json({
      error: 'Error cambiando plan',
      details: error.message
    });
  }
});

// Clasificar por texto (modo demo - sin autenticación)
app.post('/clasificar', async (req, res) => {
  const startTime = new Date();
  
  try {
    const { producto, solo_hs = false } = req.body;
    
    if (!producto) {
      return res.status(400).json({ 
        error: 'Se requiere el campo "producto" con la descripción del artículo' 
      });
    }
    
    console.log(`📝 Nueva clasificación (modo demo): ${producto.substring(0, 50)}...`);
    
    const clasificacionResult = await clasificarConAsistente(producto, solo_hs);
    
    // Usar tokens reales de OpenAI o estimación como fallback
    const inputTokens = clasificacionResult.tokens.input;
    const outputTokens = clasificacionResult.tokens.output;
    
    const duration = (new Date() - startTime) / 1000;
    console.log(`⚡ Clasificación completada en ${duration.toFixed(1)}s`);
    
    // Generar XML si no es modo solo_hs
    let xmlDUA = null;
    if (!solo_hs && clasificacionResult.resultado) {
      try {
        xmlDUA = generarXmlImportDUA(clasificacionResult.resultado);
        console.log('📄 XML ImportDUA generado exitosamente');
      } catch (xmlError) {
        console.error('⚠️ Error generando XML:', xmlError.message);
      }
    }
    
    res.json({
      success: true,
      data: clasificacionResult.resultado,
      xml: xmlDUA,
      timestamp: new Date().toISOString(),
      duration: `${duration.toFixed(1)}s`,
      tokens_info: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    });
    
  } catch (error) {
    const duration = (new Date() - startTime) / 1000;
    console.error(`❌ Error después de ${duration.toFixed(1)}s:`, error.message);
    
    res.status(500).json({ 
      error: 'Error al procesar la clasificación',
      details: error.message,
      duration: `${duration.toFixed(1)}s`
    });
  }
});

// Endpoint para clasificar archivos (modo demo - sin autenticación)
app.post('/clasificar-archivo', upload.single('archivo'), async (req, res) => {
  const startTime = new Date();
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        error: 'No se recibió ningún archivo',
        success: false 
      });
    }

    const { solo_hs } = req.body;
    const soloHS = solo_hs === 'true';
    
    console.log(`📁 Procesando archivo (modo demo): ${req.file.originalname} (${req.file.mimetype})`);
    
    let contenido = '';
    
    // Procesar según el tipo de archivo
    if (req.file.mimetype === 'text/plain') {
      // Archivo de texto
      contenido = req.file.buffer.toString('utf-8');
    } else if (req.file.mimetype === 'application/pdf') {
      // Archivo PDF - extraer texto usando pdf-parse
      try {
        console.log('📄 Extrayendo texto del PDF...');
        const pdfData = await pdfParse(req.file.buffer);
        contenido = pdfData.text;
        console.log(`📋 Texto extraído: ${contenido.length} caracteres`);
      } catch (pdfError) {
        console.error('❌ Error al procesar PDF:', pdfError.message);
        return res.status(400).json({
          error: 'Error al procesar el archivo PDF. Asegúrate de que el archivo no esté dañado o protegido con contraseña.',
          details: pdfError.message,
          success: false
        });
      }
    } else if (req.file.mimetype.startsWith('image/')) {
      // Para imágenes, necesitaríamos OCR o análisis de imagen
      return res.status(400).json({
        error: 'Las imágenes requieren procesamiento adicional. Por favor, transcribe el contenido y pégalo en el campo de texto.',
        success: false
      });
    } else {
      return res.status(400).json({
        error: 'Tipo de archivo no soportado',
        success: false
      });
    }
    
    if (!contenido.trim()) {
      return res.status(400).json({ 
        error: 'El archivo está vacío o no se pudo extraer el contenido',
        success: false 
      });
    }
    
    console.log(`📄 Contenido extraído: ${contenido.substring(0, 100)}...`);
    
    // Clasificar con el asistente
    const clasificacionResult = await clasificarConAsistente(contenido, soloHS);
    
    // Usar tokens reales de OpenAI
    const inputTokens = clasificacionResult.tokens.input;
    const outputTokens = clasificacionResult.tokens.output;
    
    // Determinar número de items procesados
    let itemsCount = 1;
    if (Array.isArray(clasificacionResult.resultado)) {
      itemsCount = clasificacionResult.resultado.length;
    } else if (clasificacionResult.resultado && typeof clasificacionResult.resultado === 'object') {
      // Si es un objeto con múltiples productos, intentar contar
      if (clasificacionResult.resultado.productos && Array.isArray(clasificacionResult.resultado.productos)) {
        itemsCount = clasificacionResult.resultado.productos.length;
      }
    }
    
    const duration = (new Date() - startTime) / 1000;
    console.log(`⚡ Clasificación de archivo completada en ${duration.toFixed(1)}s`);
    
    // Generar XML si no es modo solo_hs
    let xmlDUA = null;
    if (!soloHS && clasificacionResult.resultado) {
      try {
        xmlDUA = generarXmlImportDUA(clasificacionResult.resultado);
        console.log('📄 XML ImportDUA generado exitosamente');
      } catch (xmlError) {
        console.error('⚠️ Error generando XML:', xmlError.message);
      }
    }
    
    res.json({
      success: true,
      data: clasificacionResult.resultado,
      xml: xmlDUA,
      processing_time: `${duration.toFixed(1)}s`,
      file_info: {
        name: req.file.originalname,
        type: req.file.mimetype,
        size: req.file.size
      },
      tokens_info: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens
      }
    });
    
  } catch (error) {
    const duration = (new Date() - startTime) / 1000;
    console.error(`❌ Error al procesar archivo después de ${duration.toFixed(1)}s:`, error.message);
    
    res.status(500).json({ 
      error: 'Error al procesar el archivo',
      details: error.message,
      duration: `${duration.toFixed(1)}s`,
      success: false
    });
  }
});

// Obtener estadísticas de consumo
app.get('/api/estadisticas', verificarAuth, async (req, res) => {
  try {
    const resultado = await TokenService.obtenerEstadisticasConsumo(req.auth.empresa_id);
    
    if (resultado.success) {
      res.json({
        success: true,
        estadisticas: resultado.estadisticas
      });
    } else {
      res.status(500).json(resultado);
    }
    
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      error: 'server_error',
      mensaje: 'Error interno del servidor.'
    });
  }
});

// Ruta de salud
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    openai_configured: !!process.env.OPENAI_API_KEY,
    assistant_configured: !!process.env.ASSISTANT_ID
  });
});

// Manejo de errores
app.use((error, req, res, next) => {
  console.error('❌ Error no manejado:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor con conexión a base de datos
async function iniciarServidor() {
  try {
    // Conectar a MongoDB
    console.log('🔌 Conectando a MongoDB...');
    await connectDB();
    console.log('✅ Base de datos conectada');
    
    // Inicializar tareas programadas
    CleanupService.initializeScheduledTasks();
    
    // Iniciar servidor HTTP
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
      console.log(`📡 API disponible en http://localhost:${PORT}`);
      console.log(`🌐 Interfaz web en http://localhost:${PORT}/app`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
      console.log(`🔑 OpenAI configurado: ${!!process.env.OPENAI_API_KEY}`);
      console.log(`🤖 Modelo: ${process.env.OPENAI_MODEL || 'gpt-4o'}`);
      console.log('');
      console.log('📋 Endpoints de autenticación:');
      console.log('   POST /api/auth/login - Iniciar sesión');
      console.log('   POST /api/auth/registro - Registrar usuario');
      console.log('   POST /api/auth/logout - Cerrar sesión');
      console.log('   GET /api/auth/verificar - Verificar sesión');
      console.log('   GET /api/auth/sesiones - Ver sesiones activas');
      console.log('');
      console.log('📋 Endpoints de clasificación (requieren autenticación):');
      console.log('   POST /clasificar - Clasificar por texto');
      console.log('   POST /clasificar-archivo - Clasificar archivo');
      console.log('   GET /api/estadisticas - Estadísticas de consumo');
      console.log('');
      console.log('🧹 Endpoints de limpieza:');
      console.log('   GET /api/cleanup/stats - Estadísticas de limpieza');
      console.log('   POST /api/cleanup/run - Ejecutar limpieza completa');
      console.log('   POST /api/cleanup/sessions - Limpiar sesiones inactivas');
      console.log('   POST /api/cleanup/reset-monthly - Forzar reset mensual');
      console.log('');
      console.log('🧾 Credenciales de prueba:');
      console.log('   Email: demo@importadora.com');
      console.log('   Contraseña: demo123');
    });
    
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  console.log('🛑 Recibida señal SIGTERM, cerrando servidor...');
  await closeDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Recibida señal SIGINT, cerrando servidor...');
  await closeDB();
  process.exit(0);
});

// Iniciar la aplicación
iniciarServidor();

module.exports = app;