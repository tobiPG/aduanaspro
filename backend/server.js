const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');

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

// Función para procesar con el asistente de OpenAI
async function clasificarConAsistente(contenido, soloHS = false) {
  try {
    // Crear un hilo de conversación
    const thread = await openai.beta.threads.create();
    
    // Preparar el mensaje según si es solo HS o completo
    const params = soloHS ? { solo_hs: true } : { solo_hs: false };
    const mensaje = `producto: ${contenido}\nparams: ${JSON.stringify(params)}`;
    
    // Enviar mensaje al hilo
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: mensaje
    });
    
    // Ejecutar el asistente
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: process.env.ASSISTANT_ID
    });
    
    // Esperar a que termine la ejecución
    let runStatus;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    } while (runStatus.status === 'in_progress' || runStatus.status === 'queued');
    
    if (runStatus.status === 'completed') {
      // Obtener la respuesta
      const messages = await openai.beta.threads.messages.list(thread.id);
      const lastMessage = messages.data[0];
      
      if (lastMessage.content && lastMessage.content[0] && lastMessage.content[0].text) {
        const respuesta = lastMessage.content[0].text.value;
        
        try {
          // Intentar parsear como JSON
          return JSON.parse(respuesta);
        } catch (parseError) {
          // Si no es JSON válido, buscar JSON dentro del texto
          const jsonMatch = respuesta.match(/\{.*\}/s);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
          throw new Error('Respuesta no es JSON válido');
        }
      }
    } else {
      throw new Error(`Error en la ejecución: ${runStatus.status}`);
    }
    
  } catch (error) {
    console.error('Error al clasificar:', error);
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
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`📡 API disponible en http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;