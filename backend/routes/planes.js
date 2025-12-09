const express = require('express');
const { verificarAuth } = require('../middleware/auth');
const { getDB } = require('../config/database');

const router = express.Router();

// Listar todos los planes disponibles
router.get('/listar', async (req, res) => {
    try {
        const db = getDB();
        
        // Obtener todos los planes activos
        const planes = await db.collection('planes').find({ activo: true }).toArray();
        
        res.status(200).json({
            success: true,
            planes: planes
        });
        
    } catch (error) {
        console.error('Error listando planes:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

// Cambiar plan de suscripción
router.post('/cambiar', verificarAuth, async (req, res) => {
    try {
        const { plan_id } = req.body;
        const db = getDB();
        
        if (!plan_id) {
            return res.status(400).json({
                error: 'plan_id_required',
                mensaje: 'Se requiere el ID del plan'
            });
        }
        
        // Verificar que el plan existe
        const plan = await db.collection('planes').findOne({ id: plan_id });
        
        if (!plan) {
            return res.status(404).json({
                error: 'plan_not_found',
                mensaje: 'Plan no encontrado'
            });
        }
        
        // Obtener empresa actual
        const empresa = await db.collection('empresas').findOne({
            empresa_id: req.auth.empresa_id
        });
        
        if (!empresa) {
            return res.status(404).json({
                error: 'empresa_not_found',
                mensaje: 'Empresa no encontrada'
            });
        }
        
        // Verificar si es el mismo plan
        if (empresa.plan_id === plan_id) {
            return res.status(400).json({
                error: 'same_plan',
                mensaje: 'Ya tienes este plan activo'
            });
        }
        
        // Actualizar plan de la empresa
        await db.collection('empresas').updateOne(
            { empresa_id: req.auth.empresa_id },
            { 
                $set: { 
                    plan_id: plan_id,
                    tokens_limite_mensual: plan.tokens_mes,
                    fecha_cambio_plan: new Date().toISOString()
                }
            }
        );
        
        // Obtener información actualizada
        const empresaActualizada = await db.collection('empresas').findOne({
            empresa_id: req.auth.empresa_id
        });
        
        const planActualizado = await db.collection('planes').findOne({
            id: empresaActualizada.plan_id
        });
        
        const sesionesActivas = await db.collection('sesiones').countDocuments({
            empresa_id: empresaActualizada.empresa_id,
            activo: true
        });
        
        const tokensRestantes = empresaActualizada.tokens_limite_mensual - empresaActualizada.tokens_consumidos;
        
        res.status(200).json({
            success: true,
            mensaje: `Plan actualizado exitosamente a ${plan.nombre}`,
            empresa: {
                empresa_id: empresaActualizada.empresa_id,
                nombre: empresaActualizada.nombre,
                plan_id: empresaActualizada.plan_id
            },
            plan: {
                id: planActualizado.id,
                nombre: planActualizado.nombre,
                tokens_mes: planActualizado.tokens_mes,
                dispositivos_concurrentes: planActualizado.dispositivos_concurrentes,
                precio_mensual_usd: planActualizado.precio_mensual_usd
            },
            limites: {
                tokens_limite_mensual: empresaActualizada.tokens_limite_mensual,
                tokens_consumidos: empresaActualizada.tokens_consumidos,
                tokens_restantes: tokensRestantes,
                dispositivos_activos: sesionesActivas,
                dispositivos_limite: planActualizado.dispositivos_concurrentes
            }
        });
        
    } catch (error) {
        console.error('Error cambiando plan:', error);
        res.status(500).json({
            error: 'server_error',
            mensaje: 'Error interno del servidor'
        });
    }
});

module.exports = router;
