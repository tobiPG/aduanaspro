# 📧 Guía de Configuración de Email Multi-Empresa

## ✅ Solución Implementada

El sistema ahora soporta **dos modos de operación**:

### 1. Servicio Transaccional Centralizado (RECOMENDADO)
- Un solo servicio de email para TODAS las empresas
- Cada empresa puede tener su propio dominio en el "From"
- Mejor deliverability y no cae en spam
- Económico y escalable

### 2. SMTP por Empresa (Opcional)
- Cada empresa puede configurar su propio servidor SMTP
- Se guarda en la base de datos (colección `empresas`)
- Si no está configurado, usa el servicio centralizado

---

## 🚀 Configuración Rápida (5 minutos)

### Opción A: SendGrid (GRATIS - Recomendado)

**Beneficios:**
- ✅ 100 emails gratis por día
- ✅ Sin tarjeta de crédito para empezar
- ✅ Fácil configuración
- ✅ Excelente deliverability

**Pasos:**

1. **Crear cuenta**: https://sendgrid.com (gratis)

2. **Obtener API Key**:
   - Ve a: Settings > API Keys
   - Click "Create API Key"
   - Nombre: "Clasificador Arancelario"
   - Permisos: "Mail Send" (Full Access)
   - Copia el API Key (solo se muestra una vez)

3. **Configurar en `.env`**:
```bash
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=SG.tu_api_key_aqui_copiado_del_paso_2
EMAIL_FROM=noreply@tudominio.com
```

4. **Verificar dominio** (opcional pero recomendado):
   - Settings > Sender Authentication
   - Verifica tu dominio para mejor deliverability
   - Si no tienes dominio, usa: `noreply@sendgrid.net`

**¡Listo!** Reinicia el servidor y los emails funcionarán.

---

### Opción B: AWS SES (Escalable)

**Beneficios:**
- ✅ 62,000 emails gratis por mes (primer año)
- ✅ Después: $0.10 por cada 1,000 emails
- ✅ Altamente escalable
- ✅ Integración AWS

**Pasos:**

1. **Acceder a AWS SES**: https://console.aws.amazon.com/ses

2. **Verificar email o dominio**:
   - Ve a "Verified identities"
   - Agrega y verifica tu dominio o email

3. **Crear credenciales SMTP**:
   - Ve a "SMTP Settings"
   - Click "Create SMTP credentials"
   - Descarga las credenciales (username y password)

4. **Configurar en `.env`**:
```bash
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=tu_username_smtp_aws
EMAIL_PASSWORD=tu_password_smtp_aws
EMAIL_FROM=noreply@tudominio.com
```

5. **Salir del sandbox** (para enviar a cualquier email):
   - Solicita salir del sandbox en AWS SES
   - Explica tu caso de uso
   - Aprobación en 24-48 horas

---

### Opción C: Mailgun (10,000 emails gratis/mes)

**Beneficios:**
- ✅ 10,000 emails gratis por mes (permanente)
- ✅ Sin tarjeta hasta que necesites más
- ✅ Dashboard completo
- ✅ API poderosa

**Pasos:**

1. **Crear cuenta**: https://mailgun.com

2. **Obtener credenciales SMTP**:
   - Ve a: Sending > Domains
   - Selecciona tu dominio sandbox
   - Ve a "SMTP credentials"

3. **Configurar en `.env`**:
```bash
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=postmaster@sandboxXXXXX.mailgun.org
EMAIL_PASSWORD=tu_password_mailgun
EMAIL_FROM=noreply@tudominio.com
```

---

## 🏢 Configuración por Empresa (Opcional)

Si una empresa específica quiere usar su propio servidor SMTP, agregar estos campos en MongoDB:

```javascript
// En la colección "empresas"
{
  empresa_id: "empresa-123",
  nombre: "Mi Empresa SRL",
  // ... otros campos ...
  
  // Configuración SMTP opcional
  smtp_host: "smtp.miempresa.com",
  smtp_port: 587,
  smtp_user: "noreply@miempresa.com",
  smtp_password: "password_seguro",
  smtp_secure: false,
  email_from: "notificaciones@miempresa.com"
}
```

**El sistema automáticamente:**
1. Busca si la empresa tiene configuración SMTP
2. Si existe, usa esa configuración
3. Si no existe, usa el servicio centralizado (`.env`)

---

## 🔧 Variables de Entorno Completas

Agregar en `.env`:

```bash
# ============================================
# CONFIGURACIÓN DE EMAIL
# ============================================
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=apikey
EMAIL_PASSWORD=SG.tu_api_key_aqui
EMAIL_FROM=noreply@clasificador.com

# ============================================
# CONFIGURACIÓN DE LA APLICACIÓN
# ============================================
FRONTEND_URL=http://localhost:3050
APP_NAME=Clasificador Arancelario RD

# ============================================
# JWT Y SEGURIDAD
# ============================================
JWT_SECRET=clasificador-arancelario-secret-key-2025-CAMBIAR

# ============================================
# MONGODB
# ============================================
MONGODB_URI=mongodb://localhost:27017/clasificador_arancelario
```

---

## ✉️ Emails que se Envían

El sistema envía automáticamente estos emails:

1. **Verificación de Email** (al registrarse)
   - Token válido por 24 horas
   - Link de verificación

2. **Recuperación de Contraseña**
   - Token válido por 1 hora
   - Link para resetear contraseña

3. **Confirmación de Cambio de Contraseña**
   - Notificación de seguridad
   - Se envía después de cambiar contraseña exitosamente

---

## 🧪 Probar el Sistema

### 1. Configurar `.env` con SendGrid (o el servicio elegido)

### 2. Reiniciar el servidor
```bash
cd backend
node server.js
```

### 3. Registrar un usuario de prueba
```bash
curl -X POST http://localhost:3050/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Test User",
    "correo": "test@example.com",
    "contrasena": "password123",
    "empresa_id": "demo-empresa-001"
  }'
```

### 4. Verificar que llegó el email
Revisa la bandeja de entrada de `test@example.com`

### 5. Probar recuperación de contraseña
```bash
curl -X POST http://localhost:3050/api/security/request-reset \
  -H "Content-Type: application/json" \
  -d '{"correo": "test@example.com"}'
```

---

## 📊 Comparación de Servicios

| Servicio  | Gratis/mes | Costo después | Setup | Recomendado |
|-----------|-----------|---------------|-------|-------------|
| SendGrid  | 100/día   | $19.95/mes (100k) | ⭐⭐⭐⭐⭐ | ✅ Desarrollo |
| AWS SES   | 62,000    | $0.10/1000 | ⭐⭐⭐ | ✅ Producción |
| Mailgun   | 10,000    | $35/mes (50k) | ⭐⭐⭐⭐ | ✅ Ambos |
| Gmail     | Limitado  | N/A | ⭐⭐⭐⭐⭐ | ❌ Solo pruebas |

---

## ⚠️ Errores Comunes

### Error: "Invalid API Key"
**Solución**: Verifica que copiaste el API Key completo y que está en `EMAIL_PASSWORD`

### Error: "Connection timeout"
**Solución**: 
1. Verifica que `EMAIL_PORT` sea 587
2. Verifica que `EMAIL_SECURE=false`
3. Revisa tu firewall

### Los emails van a spam
**Solución**:
1. Verifica tu dominio en SendGrid/AWS SES
2. Configura SPF, DKIM y DMARC
3. No uses direcciones genéricas como @gmail.com

### Error: "Daily sending quota exceeded"
**Solución**: Con SendGrid gratis tienes 100/día. Espera 24h o actualiza el plan.

---

## 🎯 Recomendación Final

**Para Desarrollo**: SendGrid (100 emails/día gratis, fácil setup)

**Para Producción con muchos usuarios**: AWS SES (escalable, económico)

**Para Producción pequeña/mediana**: Mailgun (10k gratis/mes)

**NO usar para producción**: Gmail (tiene límites estrictos y puede bloquearte)

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs del servidor
2. Verifica las credenciales en `.env`
3. Consulta la documentación del proveedor elegido
4. Revisa que MongoDB esté corriendo

---

¡Con esto tu sistema de emails estará listo para múltiples empresas! 🚀
