# Cambios Realizados - Permitir Login con Tokens Agotados

## Fecha: 2025-12-05

## Problema Resuelto
El usuario reportó: "cuando gasto mis tokens no me deja iniciar sesion, y quiero que me deje iniciar sesion, pero no clasificar nada"

## Solución Implementada

### 1. Modificaciones en Backend

#### A. **authService.js** - Eliminada validación de tokens en login
Se removió la verificación de tokens agotados (`quota_exceeded`) de dos funciones de autenticación:

**Archivo**: `backend/services/authService.js`

- **Función `iniciarSesion`** (línea ~130):
  - ❌ ANTES: Bloqueaba login si `tokens_restantes <= 0`
  - ✅ AHORA: Permite login independientemente del balance de tokens

- **Función `completarLoginCon2FA`** (línea ~260):
  - ❌ ANTES: Bloqueaba login con 2FA si `tokens_restantes <= 0`
  - ✅ AHORA: Permite login con 2FA independientemente del balance de tokens

#### B. **server.js** - Agregada validación de tokens en endpoints de clasificación

**Archivo**: `backend/server.js`

**Endpoint `/clasificar`** (línea ~835):
```javascript
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
```

**Endpoint `/clasificar-archivo`** (línea ~1039):
- Misma validación que `/clasificar`
- Además elimina el archivo subido antes de retornar el error para evitar archivos huérfanos

### 2. Modificaciones en Frontend

#### A. **script.js** - Manejo mejorado de errores

**Función de clasificación por texto** (línea ~1465):
```javascript
if (response.status === 403) {
  // Verificar si es error de tokens agotados
  if (result.error === 'no_tokens_available') {
    const mensaje = result.mensaje || 'Has agotado tus tokens mensuales.';
    showError(`${mensaje}\n\nPuedes actualizar tu plan desde la sección de perfil.`);
    
    // Si hay información de límites, actualizarla en la UI
    if (result.limites && userInfo && userInfo.limites) {
      userInfo.limites.tokens_consumidos = result.limites.tokens_consumidos;
      userInfo.limites.tokens_limite_mensual = result.limites.tokens_limite;
      updatePlanInfo();
    }
  }
}
```

**Función de clasificación por archivo** (línea ~1610):
- Implementa el mismo manejo de errores `no_tokens_available`
- Actualiza la UI con la información de límites devuelta por el servidor

## Comportamiento Resultante

### ✅ Comportamiento Correcto Ahora:

1. **Login con Tokens Agotados**: ✅ PERMITIDO
   - Usuario puede iniciar sesión
   - Usuario puede ver su dashboard
   - Usuario puede ver su historial
   - Usuario puede cambiar su plan
   - Usuario puede ver su información de cuenta

2. **Clasificación con Tokens Agotados**: ❌ BLOQUEADO
   - Endpoint devuelve HTTP 403 Forbidden
   - Error code: `no_tokens_available`
   - Mensaje claro al usuario con sugerencia de actualizar plan
   - UI actualiza automáticamente los límites mostrados

### 📊 Estado de Prueba:

Empresa de prueba: **Importadora Demo SRL**
- **Plan**: Plan Básico (1,000 tokens, 3 dispositivos)
- **Tokens consumidos**: 3,355
- **Tokens restantes**: -2,355 (AGOTADOS)
- **Estado**: Login permitido, clasificación bloqueada

## Archivos Modificados

1. `backend/services/authService.js`
2. `backend/server.js`
3. `frontend/script.js`

## Scripts de Utilidad Creados

1. `backend/test-tokens-agotados.js` - Test automatizado del flujo
2. `backend/verificar-estado-empresa.js` - Verificar estado de tokens de una empresa
3. `backend/listar-empresas.js` - Listar todas las empresas y su estado
4. `backend/desactivar-sesiones.js` - Desactivar sesiones activas para testing

## Testing Manual

Para probar la funcionalidad:

1. Abrir frontend: http://127.0.0.1:3050
2. Iniciar sesión con `demo@importadora.com` / `demo123`
3. ✅ Verificar que el login funciona
4. ✅ Verificar que se muestra el dashboard con tokens: 3,355 / 1,000
5. ❌ Intentar clasificar → debería mostrar error "Has agotado tus tokens mensuales"
6. ✅ Verificar que el usuario puede cambiar su plan desde la sección de perfil

## Próximos Pasos Recomendados

1. **Probar con frontend**: Abrir http://127.0.0.1:3050 y verificar flujo completo
2. **Actualizar plan**: Cambiar a Plan Profesional para tener más tokens
3. **Reiniciar ciclo**: Implementar script de reinicio mensual de tokens_consumidos
4. **Notificaciones**: Agregar alertas cuando quedan pocos tokens (ej. <10%)

## Notas Técnicas

- Se mantiene la validación de límite de dispositivos en el login
- La validación de tokens se movió de autenticación a negocio (clasificación)
- El frontend maneja el error `no_tokens_available` específicamente
- Los límites se actualizan dinámicamente en la UI cuando se recibe el error
