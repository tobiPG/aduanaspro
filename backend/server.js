const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');
const { generarXmlImportDUA } = require('./utils/xmlGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5500', 'file://'],
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

// Clasificar desde archivo
app.post('/clasificar-archivo', upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha enviado ningún archivo' });
    }
    
    const { solo_hs = false } = req.body;
    let contenido = '';
    
    // Leer el contenido del archivo según su tipo
    if (req.file.mimetype.includes('text')) {
      contenido = fs.readFileSync(req.file.path, 'utf8');
    } else if (req.file.mimetype === 'application/pdf') {
      const pdfParse = require('pdf-parse');
      const pdfBuffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(pdfBuffer);
      contenido = pdfData.text;
    } else {
      // Para imágenes, usar OCR (requiere implementación adicional)
      contenido = `Imagen: ${req.file.originalname} - Requiere procesamiento OCR`;
    }
    
    const resultado = await clasificarConAsistente(contenido, solo_hs);
    
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

// Iniciar servidor
app.listen(PORT, '127.0.0.1', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📡 API disponible en http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;