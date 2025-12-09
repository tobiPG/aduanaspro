const rateLimit = require('express-rate-limit');

// Rate limiter para login - 50 intentos por 5 minutos (modo desarrollo)
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 50,
    message: {
        error: 'too_many_attempts',
        mensaje: 'Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 5 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // No contar requests exitosos
});

// Rate limiter para registro - 3 registros por hora por IP
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3,
    message: {
        error: 'too_many_registrations',
        mensaje: 'Demasiados intentos de registro. Por favor, intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter para recuperación de contraseña - 3 intentos por hora
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 3,
    message: {
        error: 'too_many_password_resets',
        mensaje: 'Demasiadas solicitudes de recuperación de contraseña. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter general para API - 100 requests por 15 minutos
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: {
        error: 'too_many_requests',
        mensaje: 'Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate limiter estricto para endpoints sensibles - 10 requests por hora
const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 10,
    message: {
        error: 'too_many_requests',
        mensaje: 'Límite de solicitudes excedido. Por favor, intenta de nuevo en 1 hora.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = {
    loginLimiter,
    registerLimiter,
    passwordResetLimiter,
    apiLimiter,
    strictLimiter
};
