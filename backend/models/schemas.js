const { ObjectId } = require('mongodb');

// Esquemas de validación para MongoDB

// Esquema para Planes
const planSchema = {
    id: { type: 'string', required: true },
    tokens_mes: { type: 'number', required: true, min: 0 },
    precio_mensual_usd: { type: 'number', required: true, min: 0 },
    dispositivos_concurrentes: { type: 'number', required: true, min: 1 }
};

// Esquema para Empresas
const empresaSchema = {
    empresa_id: { type: 'string', required: true },
    nombre: { type: 'string', required: true },
    plan_id: { type: 'string', required: true },
    tokens_limite_mensual: { type: 'number', required: true, min: 0 },
    tokens_consumidos: { type: 'number', default: 0, min: 0 },
    periodo_inicio: { type: 'string', required: true }, // ISO date string
    periodo_fin: { type: 'string', required: true },     // ISO date string
    activa: { type: 'boolean', default: true },
    fecha_creacion: { type: 'string', default: () => new Date().toISOString() }
};

// Esquema para Usuarios
const usuarioSchema = {
    usuario_id: { type: 'string', required: true },
    empresa_id: { type: 'string', required: true },
    nombre: { type: 'string', required: true },
    correo: { type: 'string', required: true },
    contrasena_hash: { type: 'string', required: true },
    activo: { type: 'boolean', default: true },
    fecha_creacion: { type: 'string', default: () => new Date().toISOString() }
};

// Esquema para Sesiones
const sesionSchema = {
    sesion_id: { type: 'string', required: true },
    empresa_id: { type: 'string', required: true },
    usuario_id: { type: 'string', required: true },
    device_fingerprint: { type: 'string', required: true },
    ip: { type: 'string', required: true },
    activo: { type: 'boolean', default: true },
    ts_login: { type: 'string', required: true },
    ts_ultima_actividad: { type: 'string', required: true }
};

// Esquema para Consumos
const consumoSchema = {
    consumo_id: { type: 'string', required: true },
    empresa_id: { type: 'string', required: true },
    usuario_id: { type: 'string', required: true },
    orden_id: { type: 'string', required: true },
    input_tokens: { type: 'number', required: true, min: 0 },
    output_tokens: { type: 'number', required: true, min: 0 },
    total_tokens: { type: 'number', required: true, min: 0 },
    ts: { type: 'string', required: true },
    origen: { type: 'string', required: true },
    items: { type: 'number', default: 1, min: 1 }
};

// Función para validar datos según esquema
function validarEsquema(data, schema) {
    const errores = [];
    
    for (const [campo, reglas] of Object.entries(schema)) {
        const valor = data[campo];
        
        // Verificar campos requeridos
        if (reglas.required && (valor === undefined || valor === null)) {
            errores.push(`Campo requerido: ${campo}`);
            continue;
        }
        
        // Si el campo no es requerido y está vacío, aplicar default si existe
        if (valor === undefined || valor === null) {
            if (reglas.default !== undefined) {
                data[campo] = typeof reglas.default === 'function' ? reglas.default() : reglas.default;
            }
            continue;
        }
        
        // Validar tipo
        if (reglas.type && typeof valor !== reglas.type) {
            errores.push(`${campo} debe ser de tipo ${reglas.type}`);
            continue;
        }
        
        // Validar valor mínimo
        if (reglas.min !== undefined && valor < reglas.min) {
            errores.push(`${campo} debe ser mayor o igual a ${reglas.min}`);
        }
        
        // Validar valor máximo
        if (reglas.max !== undefined && valor > reglas.max) {
            errores.push(`${campo} debe ser menor o igual a ${reglas.max}`);
        }
    }
    
    return errores;
}

// Funciones de validación por modelo
function validarPlan(data) {
    return validarEsquema(data, planSchema);
}

function validarEmpresa(data) {
    return validarEsquema(data, empresaSchema);
}

function validarUsuario(data) {
    const errores = validarEsquema(data, usuarioSchema);
    
    // Validar formato de email
    if (data.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.correo)) {
        errores.push('Formato de correo inválido');
    }
    
    return errores;
}

function validarSesion(data) {
    return validarEsquema(data, sesionSchema);
}

function validarConsumo(data) {
    const errores = validarEsquema(data, consumoSchema);
    
    // Validar que total_tokens sea la suma de input y output
    if (data.input_tokens !== undefined && data.output_tokens !== undefined) {
        data.total_tokens = data.input_tokens + data.output_tokens;
    }
    
    return errores;
}

// Generar IDs únicos
function generarId(prefijo = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return prefijo ? `${prefijo}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

module.exports = {
    planSchema,
    empresaSchema,
    usuarioSchema,
    sesionSchema,
    consumoSchema,
    validarPlan,
    validarEmpresa,
    validarUsuario,
    validarSesion,
    validarConsumo,
    generarId
};