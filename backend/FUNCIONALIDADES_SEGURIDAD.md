# 🔐 Funcionalidades de Seguridad

Este documento describe las 4 funcionalidades de seguridad implementadas en el sistema.

## 📋 Índice

1. [Rate Limiting](#1-rate-limiting)
2. [Recuperación de Contraseña](#2-recuperación-de-contraseña)
3. [Verificación de Email](#3-verificación-de-email)
4. [Autenticación de Dos Factores (2FA)](#4-autenticación-de-dos-factores-2fa)

---

## 1. Rate Limiting

### Descripción
Sistema de limitación de tasas para prevenir ataques de fuerza bruta y abuso de APIs.

### Implementación
**Archivo**: `backend/middleware/rateLimiter.js`

### Limitadores Configurados

| Limitador | Endpoint | Límite | Ventana de Tiempo |
|-----------|----------|--------|-------------------|
| **loginLimiter** | POST /api/auth/login | 5 intentos | 15 minutos |
| **registerLimiter** | POST /api/auth/registro | 3 registros | 1 hora |
| **passwordResetLimiter** | POST /api/security/request-reset | 3 solicitudes | 1 hora |
| **apiLimiter** | /api/* (general) | 100 requests | 15 minutos |
| **strictLimiter** | Operaciones sensibles | 10 requests | 1 hora |

### Comportamiento
- Usa la IP del cliente para identificar requests
- Responde con `429 Too Many Requests` cuando se excede el límite
- Incluye headers con información de límites: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Ejemplo de Uso
```javascript
const { loginLimiter } = require('../middleware/rateLimiter');
router.post('/login', loginLimiter, async (req, res) => {
  // Lógica de login
});
```

---

## 2. Recuperación de Contraseña

### Descripción
Sistema completo de recuperación de contraseña mediante email con tokens seguros.

### Implementación
**Archivos**: 
- `backend/services/securityService.js` - Lógica de negocio
- `backend/services/emailService.js` - Envío de emails
- `backend/routes/security.js` - Endpoints REST

### Flujo de Recuperación

1. **Solicitar Recuperación**
   - **Endpoint**: `POST /api/security/request-reset`
   - **Rate Limit**: 3 intentos por hora
   - **Body**: `{ "correo": "usuario@ejemplo.com" }`
   - **Proceso**:
     - Genera token aleatorio de 64 caracteres
     - Guarda en colección `password_resets` con expiración de 1 hora
     - Envía email con enlace de recuperación
     - Siempre responde éxito (no revela si el email existe)

2. **Verificar Token**
   - **Endpoint**: `GET /api/security/verify-reset-token/:token`
   - **Proceso**:
     - Valida que el token existe en la base de datos
     - Verifica que no haya expirado (1 hora)
     - Retorna `{ "valido": true/false }`

3. **Restablecer Contraseña**
   - **Endpoint**: `POST /api/security/reset-password`
   - **Body**: `{ "token": "...", "nuevaContrasena": "..." }`
   - **Proceso**:
     - Valida token y expiración
     - Hashea nueva contraseña con bcrypt (12 rounds)
     - Actualiza contraseña del usuario
     - **Invalida todas las sesiones activas del usuario** (seguridad)
     - Elimina token de recuperación
     - Envía email de confirmación

### Email Templates
Emails HTML profesionales con diseño responsive:
- Email de recuperación con botón de acción
- Email de confirmación de cambio exitoso
- Diseño con gradiente azul y responsive

### Seguridad
- Tokens criptográficamente seguros (`crypto.randomBytes`)
- Expiración automática de 1 hora
- Invalidación de sesiones al cambiar contraseña
- No revela información sobre existencia de emails
- Rate limiting en solicitudes

---

## 3. Verificación de Email

### Descripción
Sistema de verificación de correo electrónico para nuevos registros.

### Implementación
**Archivos**:
- `backend/services/securityService.js` - Lógica de verificación
- `backend/services/emailService.js` - Envío de emails
- `backend/services/authService.js` - Integración con registro
- `backend/routes/security.js` - Endpoints REST

### Flujo de Verificación

1. **Envío Automático en Registro**
   - Se ejecuta automáticamente al registrar nuevo usuario
   - Genera token aleatorio de 64 caracteres
   - Guarda en colección `email_verifications` con expiración de 24 horas
   - Envía email con enlace de verificación
   - Usuario queda con `email_verificado: false`

2. **Verificar Email**
   - **Endpoint**: `GET /api/security/verify-email/:token`
   - **Proceso**:
     - Valida token en base de datos
     - Verifica que no haya expirado (24 horas)
     - Marca usuario como `email_verificado: true`
     - Elimina token de verificación
     - Retorna confirmación de éxito

3. **Reenviar Verificación**
   - **Endpoint**: `POST /api/security/resend-verification`
   - **Autenticación**: Requiere token JWT
   - **Rate Limit**: 10 intentos por hora (strictLimiter)
   - **Proceso**:
     - Verifica que el email no esté ya verificado
     - Genera nuevo token
     - Envía nuevo email de verificación

### Email Template
Email HTML profesional con:
- Diseño responsive con gradiente azul
- Botón de verificación destacado
- Nota sobre expiración en 24 horas
- Alternativa con enlace de texto

### Uso Posterior
El campo `email_verificado` puede usarse para:
- Restringir funcionalidades a usuarios no verificados
- Mostrar banners de recordatorio
- Validación adicional en operaciones sensibles

---

## 4. Autenticación de Dos Factores (2FA)

### Descripción
Sistema completo de autenticación de dos factores basado en TOTP (Time-based One-Time Password) con códigos de respaldo.

### Implementación
**Archivos**:
- `backend/services/twoFactorService.js` - Lógica de 2FA
- `backend/services/authService.js` - Integración con login
- `backend/routes/security.js` - Endpoints REST
- `backend/routes/auth.js` - Endpoint de login con 2FA

### Librerías
- **speakeasy**: Generación y verificación de códigos TOTP
- **qrcode**: Generación de códigos QR para apps de autenticación

### Flujo de Configuración

1. **Habilitar 2FA**
   - **Endpoint**: `POST /api/security/2fa/enable`
   - **Autenticación**: Requiere token JWT
   - **Proceso**:
     - Genera secret de 32 caracteres con speakeasy
     - Genera 8 códigos de respaldo aleatorios (8 dígitos hex)
     - Guarda en usuario con estado `two_factor_enabled: false` (pendiente)
     - Genera código QR en formato Data URL
   - **Respuesta**:
     ```json
     {
       "success": true,
       "qrCode": "data:image/png;base64,...",
       "secret": "BASE32SECRET",
       "backupCodes": ["A1B2C3D4", "E5F6G7H8", ...]
     }
     ```

2. **Verificar y Activar 2FA**
   - **Endpoint**: `POST /api/security/2fa/verify`
   - **Autenticación**: Requiere token JWT
   - **Body**: `{ "codigo": "123456" }`
   - **Proceso**:
     - Verifica código TOTP con ventana de 2 pasos (±60 segundos)
     - Si es válido, marca `two_factor_enabled: true`
     - Usuario ahora tiene 2FA activo

3. **Deshabilitar 2FA**
   - **Endpoint**: `POST /api/security/2fa/disable`
   - **Autenticación**: Requiere token JWT
   - **Body**: `{ "contrasena": "..." }`
   - **Proceso**:
     - Verifica contraseña del usuario
     - Elimina `two_factor_secret` y `two_factor_backup_codes`
     - Marca `two_factor_enabled: false`

### Flujo de Login con 2FA

1. **Login Inicial**
   - **Endpoint**: `POST /api/auth/login`
   - **Body**: `{ "correo": "...", "contrasena": "..." }`
   - Si usuario tiene 2FA activado, responde:
     ```json
     {
       "success": false,
       "requires_2fa": true,
       "usuario_id": "usr_123",
       "mensaje": "Se requiere código 2FA"
     }
     ```

2. **Completar Login con 2FA**
   - **Endpoint**: `POST /api/auth/login-2fa`
   - **Body**: 
     ```json
     {
       "usuarioId": "usr_123",
       "codigo": "123456",
       "esBackupCode": false
     }
     ```
   - **Proceso**:
     - Verifica código TOTP o código de respaldo
     - Si código de respaldo, lo marca como usado
     - Completa el login normalmente (crea sesión, genera JWT)
   - **Respuesta**: Misma estructura que login normal + `backup_code_used: true/false`

### Códigos de Respaldo

**Uso**:
- 8 códigos de un solo uso
- Se usan si el usuario pierde acceso a su app de autenticación
- Cada código se marca como `used: true` al utilizarse

**Regenerar Códigos**:
- **Endpoint**: `POST /api/security/2fa/regenerate-backup-codes`
- **Autenticación**: Requiere token JWT
- **Rate Limit**: 10 intentos por hora
- **Proceso**: Genera nuevos 8 códigos y reemplaza los anteriores

**Estado de 2FA**:
- **Endpoint**: `GET /api/security/2fa/status`
- **Autenticación**: Requiere token JWT
- **Respuesta**:
  ```json
  {
    "enabled": true,
    "activatedAt": "2025-01-15T10:30:00Z",
    "backupCodesRemaining": 6
  }
  ```

### Aplicaciones Compatibles
El código QR funciona con cualquier app TOTP:
- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Bitwarden Authenticator

### Seguridad
- Códigos TOTP rotan cada 30 segundos
- Ventana de validación de ±60 segundos (tolerancia de 2 pasos)
- Códigos de respaldo de un solo uso
- Secret almacenado en base64 (no legible directamente)
- Rate limiting en todas las operaciones

---

## 📊 Endpoints de Seguridad - Resumen

### Recuperación de Contraseña
```
POST   /api/security/request-reset          - Solicitar recuperación
GET    /api/security/verify-reset-token/:token - Verificar token
POST   /api/security/reset-password         - Restablecer contraseña
```

### Verificación de Email
```
GET    /api/security/verify-email/:token    - Verificar email
POST   /api/security/resend-verification    - Reenviar verificación (auth)
```

### Autenticación de Dos Factores
```
POST   /api/security/2fa/enable             - Generar QR y secret (auth)
POST   /api/security/2fa/verify             - Verificar y activar (auth)
POST   /api/security/2fa/disable            - Deshabilitar 2FA (auth)
POST   /api/security/2fa/validate           - Validar código (interno)
POST   /api/security/2fa/regenerate-backup-codes - Regenerar códigos (auth)
GET    /api/security/2fa/status             - Estado de 2FA (auth)
```

### Autenticación con 2FA
```
POST   /api/auth/login-2fa                  - Completar login con código 2FA
```

---

## ⚙️ Configuración Requerida

### Variables de Entorno
Agregar en `.env`:

```bash
# Configuración de Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_app_password

# Configuración de la App
FRONTEND_URL=http://localhost:3050
APP_NAME=Clasificador Arancelario RD

# JWT Secret (cambiar en producción)
JWT_SECRET=tu-secret-super-seguro-aqui
```

### Colecciones de MongoDB
Asegurarse de que existan las colecciones:
- `password_resets` - Para tokens de recuperación
- `email_verifications` - Para tokens de verificación
- Campos en `usuarios`:
  - `email_verificado` (boolean)
  - `two_factor_enabled` (boolean)
  - `two_factor_secret` (string)
  - `two_factor_backup_codes` (array)

---

## 🧪 Testing

### 1. Rate Limiting
```bash
# Probar límite de login (5 intentos)
for i in {1..6}; do
  curl -X POST http://localhost:3050/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"correo":"test@test.com","contrasena":"wrong"}'
done
# El 6to debe retornar 429
```

### 2. Recuperación de Contraseña
```bash
# 1. Solicitar recuperación
curl -X POST http://localhost:3050/api/security/request-reset \
  -H "Content-Type: application/json" \
  -d '{"correo":"demo@test.com"}'

# 2. Verificar token (usar token del email)
curl http://localhost:3050/api/security/verify-reset-token/TOKEN_AQUI

# 3. Restablecer contraseña
curl -X POST http://localhost:3050/api/security/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"TOKEN_AQUI","nuevaContrasena":"nueva123"}'
```

### 3. Verificación de Email
```bash
# Verificar email (token del email de registro)
curl http://localhost:3050/api/security/verify-email/TOKEN_AQUI

# Reenviar verificación (con JWT)
curl -X POST http://localhost:3050/api/security/resend-verification \
  -H "Authorization: Bearer TU_JWT_AQUI"
```

### 4. Autenticación 2FA
```bash
# 1. Habilitar 2FA (con JWT)
curl -X POST http://localhost:3050/api/security/2fa/enable \
  -H "Authorization: Bearer TU_JWT_AQUI"
# Guarda el QR y secret

# 2. Escanear QR con app y verificar código
curl -X POST http://localhost:3050/api/security/2fa/verify \
  -H "Authorization: Bearer TU_JWT_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"123456"}'

# 3. Probar login con 2FA
# Login normal (retorna requires_2fa)
curl -X POST http://localhost:3050/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"demo@test.com","contrasena":"test123"}'

# Completar con código 2FA
curl -X POST http://localhost:3050/api/auth/login-2fa \
  -H "Content-Type: application/json" \
  -d '{"usuarioId":"usr_123","codigo":"123456","esBackupCode":false}'

# 4. Verificar estado 2FA
curl http://localhost:3050/api/security/2fa/status \
  -H "Authorization: Bearer TU_JWT_AQUI"
```

---

## 🔒 Consideraciones de Seguridad

### Producción
1. **JWT Secret**: Cambiar `JWT_SECRET` a un valor aleatorio y complejo
2. **HTTPS**: Todas las operaciones sensibles deben ir sobre HTTPS
3. **Email**: Usar credenciales seguras y no exponerlas en logs
4. **Rate Limiting**: Ajustar límites según necesidades reales
5. **Tokens**: Los tokens de recuperación/verificación nunca deben loguearse
6. **Sesiones**: Al cambiar contraseña, se invalidan todas las sesiones (ya implementado)

### Monitoreo
- Registrar intentos fallidos de login
- Alertas en múltiples solicitudes de recuperación
- Monitorear uso de códigos de respaldo 2FA
- Revisar logs de rate limiting

---

## 📝 Próximos Pasos (Opcionales)

- [ ] Frontend para recuperación de contraseña
- [ ] Frontend para verificación de email
- [ ] Frontend para configuración de 2FA
- [ ] Email notifications para cambios de seguridad
- [ ] Audit log de operaciones sensibles
- [ ] Bloqueo temporal de cuentas tras múltiples fallos
- [ ] Notificación de login desde nuevo dispositivo

---

## 🆘 Soporte

Para problemas o preguntas sobre las funcionalidades de seguridad:
1. Revisar logs del servidor
2. Verificar configuración de variables de entorno
3. Confirmar que MongoDB tiene las colecciones correctas
4. Revisar que las dependencias estén instaladas (`npm install`)
