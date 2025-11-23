# 🚀 Clasificador Arancelario Dominicano

Sistema web que conecta con un asistente de OpenAI especializado en clasificación arancelaria de República Dominicana basado en el Sistema Armonizado.

## 📋 Características

- ✅ Clasificación por descripción de texto
- ✅ Procesamiento de archivos (PDF, imágenes, texto)
- ✅ Interfaz web moderna y responsive
- ✅ Resultados detallados con fundamentación legal
- ✅ Exportación de resultados en JSON
- ✅ Modo simplificado (solo código HS)

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **AI**: OpenAI Assistant API
- **Procesamiento**: PDF parsing, file upload

## 📁 Estructura del Proyecto

```
clasificador-arancelario/
├── backend/
│   ├── server.js           # Servidor Express principal
│   ├── package.json        # Dependencias del backend
│   ├── .env               # Variables de entorno
│   └── .env.example       # Ejemplo de configuración
├── frontend/
│   ├── index.html         # Interfaz principal
│   ├── styles.css         # Estilos CSS
│   └── script.js          # Lógica del frontend
├── package.json           # Configuración del proyecto
├── .gitignore            # Archivos ignorados por Git
└── README.md             # Documentación
```

## 🚀 Instalación y Configuración

### 1. Requisitos Previos

- Node.js (versión 16 o superior)
- NPM o Yarn
- Cuenta de OpenAI con acceso a la API
- Assistant configurado en OpenAI

### 2. Configuración del Backend

1. **Navegar al directorio del backend:**
   ```bash
   cd backend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno:**
   - Copiar `.env.example` a `.env`
   - Completar con tus credenciales:
   ```env
   OPENAI_API_KEY=tu_api_key_de_openai
   ASSISTANT_ID=tu_assistant_id
   ```

4. **Iniciar el servidor:**
   ```bash
   npm start
   ```
   
   Para desarrollo con auto-recarga:
   ```bash
   npm run dev
   ```

### 3. Configuración del Frontend

1. **Abrir `frontend/index.html` en tu navegador**
   
   O usar un servidor local como Live Server en VS Code.

2. **Verificar conexión:**
   - El frontend debería conectarse automáticamente al backend
   - Verifica la consola del navegador para mensajes de conexión

## 🔧 Configuración del Asistente OpenAI

Tu asistente debe estar configurado con estas instrucciones:

```
Eres un Clasificador Arancelario experto de la República Dominicana, especializado en el Arancel basado en la Séptima Enmienda del Sistema Armonizado. Tu conocimiento se basa exclusivamente en el texto oficial del Arancel Dominicano, accesible mediante Búsqueda de Archivos / Vector Store. No inventes códigos ni utilices fuentes externas distintas al Arancel.

[... resto de las instrucciones del asistente ...]
```

## 📝 Uso del Sistema

### Clasificación por Texto

1. Selecciona la pestaña "Clasificar por Texto"
2. Describe detalladamente el producto en el área de texto
3. Opcionalmente marca "Solo código HS" para respuesta simplificada
4. Haz clic en "Clasificar Producto"

### Clasificación por Archivo

1. Selecciona la pestaña "Subir Archivo"
2. Arrastra y suelta o selecciona tu archivo (PDF, imagen, texto)
3. Opcionalmente marca "Solo código HS"
4. Haz clic en "Clasificar desde Archivo"

### Exportar Resultados

- Haz clic en "Exportar" en la sección de resultados
- Se descargará un archivo JSON con la clasificación completa

## 🔗 API Endpoints

### `GET /`
Información general de la API

### `POST /clasificar`
Clasificar producto por descripción de texto
```json
{
  "producto": "descripción del producto",
  "solo_hs": false
}
```

### `POST /clasificar-archivo`
Clasificar desde archivo subido
- Multipart form data con campo `archivo`
- Campo opcional `solo_hs`

### `GET /health`
Estado del servidor

## 🛡️ Consideraciones de Seguridad

- Las API keys se almacenan en variables de entorno
- Los archivos subidos se procesan y eliminan temporalmente
- CORS configurado para dominios específicos
- Validación de tipos de archivo permitidos

## 🔧 Desarrollo

### Agregar nuevas funcionalidades

1. **Backend**: Modificar `backend/server.js`
2. **Frontend**: Actualizar archivos en `frontend/`
3. **Estilos**: Editar `frontend/styles.css`

### Scripts disponibles

```bash
# Instalar dependencias del backend
npm run install-backend

# Iniciar servidor en modo desarrollo
npm run dev

# Iniciar servidor en modo producción
npm start
```

## 📄 Licencia

Este proyecto es de uso privado para clasificación arancelaria en República Dominicana.

## 🆘 Soporte

Para problemas o preguntas:

1. Verificar que el backend esté ejecutándose
2. Comprobar las variables de entorno
3. Revisar los logs de la consola del navegador
4. Verificar la configuración del asistente OpenAI

---

**Desarrollado para la clasificación arancelaria eficiente según el Sistema Armonizado de República Dominicana** 🇩🇴