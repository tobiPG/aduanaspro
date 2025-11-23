const { getDB } = require('../config/database');
const { generarId } = require('../models/schemas');

class TokenService {
    
    // Verificar si una empresa tiene tokens suficientes
    static async verificarLimiteTokens(empresaId, tokensRequeridos = 0) {
        try {
            const db = getDB();
            
            const empresa = await db.collection('empresas').findOne({ 
                empresa_id: empresaId 
            });
            
            if (!empresa) {
                return { valid: false, error: 'company_not_found', mensaje: 'Empresa no encontrada.' };
            }
            
            const tokensRestantes = empresa.tokens_limite_mensual - empresa.tokens_consumidos;
            
            if (tokensRestantes <= tokensRequeridos) {
                return { 
                    valid: false, 
                    error: 'quota_exceeded', 
                    mensaje: 'Has agotado tus tokens mensuales. Actualiza tu plan o espera el siguiente ciclo.',
                    tokens_restantes: tokensRestantes
                };
            }
            
            return { 
                valid: true, 
                tokens_restantes: tokensRestantes,
                empresa: empresa
            };
            
        } catch (error) {
            console.error('Error verificando límite de tokens:', error);
            return { valid: false, error: 'server_error', mensaje: 'Error interno del servidor.' };
        }
    }
    
    // Registrar consumo de tokens
    static async registrarConsumo(empresaId, usuarioId, inputTokens, outputTokens, origen, items = 1) {
        try {
            const db = getDB();
            
            const totalTokens = inputTokens + outputTokens;
            const ahora = new Date().toISOString();
            const ordenId = generarId('ord');
            
            // 1. Registrar en historial de consumos
            const nuevoConsumo = {
                consumo_id: generarId('con'),
                empresa_id: empresaId,
                usuario_id: usuarioId,
                orden_id: ordenId,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
                total_tokens: totalTokens,
                ts: ahora,
                origen: origen,
                items: items
            };
            
            await db.collection('consumos').insertOne(nuevoConsumo);
            
            // 2. Actualizar tokens consumidos de la empresa (operación atómica)
            const resultadoEmpresa = await db.collection('empresas').updateOne(
                { empresa_id: empresaId },
                { 
                    $inc: { tokens_consumidos: totalTokens }
                }
            );
            
            if (resultadoEmpresa.modifiedCount === 0) {
                console.error('⚠️ No se pudo actualizar el consumo de la empresa');
            }
            
            // 3. Actualizar última actividad de la sesión
            // Esta parte se hará en el middleware de auth
            
            console.log(`💰 Tokens consumidos - Empresa: ${empresaId}, Total: ${totalTokens} (Input: ${inputTokens}, Output: ${outputTokens})`);
            
            return {
                success: true,
                consumo_id: nuevoConsumo.consumo_id,
                orden_id: ordenId,
                total_tokens: totalTokens,
                timestamp: ahora
            };
            
        } catch (error) {
            console.error('Error registrando consumo:', error);
            return { success: false, error: 'server_error', mensaje: 'Error registrando consumo.' };
        }
    }
    
    // Obtener estadísticas de consumo
    static async obtenerEstadisticasConsumo(empresaId, periodo = null) {
        try {
            const db = getDB();
            
            let filtro = { empresa_id: empresaId };
            
            // Agregar filtro de período si se especifica
            if (periodo) {
                filtro.ts = { 
                    $gte: periodo.inicio,
                    $lte: periodo.fin
                };
            }
            
            // Obtener consumos del período
            const consumos = await db.collection('consumos').find(filtro).sort({ ts: -1 }).toArray();
            
            // Calcular estadísticas
            const estadisticas = {
                total_tokens: 0,
                total_input_tokens: 0,
                total_output_tokens: 0,
                total_ordenes: consumos.length,
                total_items: 0,
                promedio_tokens_por_orden: 0,
                consumos_por_origen: {},
                consumos_recientes: consumos.slice(0, 10) // Últimos 10 consumos
            };
            
            consumos.forEach(consumo => {
                estadisticas.total_tokens += consumo.total_tokens;
                estadisticas.total_input_tokens += consumo.input_tokens;
                estadisticas.total_output_tokens += consumo.output_tokens;
                estadisticas.total_items += consumo.items;
                
                // Agrupar por origen
                if (!estadisticas.consumos_por_origen[consumo.origen]) {
                    estadisticas.consumos_por_origen[consumo.origen] = {
                        ordenes: 0,
                        tokens: 0
                    };
                }
                
                estadisticas.consumos_por_origen[consumo.origen].ordenes++;
                estadisticas.consumos_por_origen[consumo.origen].tokens += consumo.total_tokens;
            });
            
            if (estadisticas.total_ordenes > 0) {
                estadisticas.promedio_tokens_por_orden = Math.round(
                    estadisticas.total_tokens / estadisticas.total_ordenes
                );
            }
            
            return { success: true, estadisticas };
            
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return { success: false, error: 'server_error', mensaje: 'Error obteniendo estadísticas.' };
        }
    }
    
    // Resetear consumo mensual (para cron job)
    static async resetearConsumoMensual() {
        try {
            const db = getDB();
            const hoy = new Date();
            
            // Buscar empresas cuyo período ha expirado
            const empresasVencidas = await db.collection('empresas').find({
                periodo_fin: { $lt: hoy.toISOString().split('T')[0] }
            }).toArray();
            
            let empresasActualizadas = 0;
            
            for (const empresa of empresasVencidas) {
                // Calcular nuevo período (1 mes)
                const nuevoPeriodoInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                const nuevoPeriodoFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
                
                await db.collection('empresas').updateOne(
                    { empresa_id: empresa.empresa_id },
                    {
                        $set: {
                            tokens_consumidos: 0,
                            periodo_inicio: nuevoPeriodoInicio.toISOString().split('T')[0],
                            periodo_fin: nuevoPeriodoFin.toISOString().split('T')[0]
                        }
                    }
                );
                
                empresasActualizadas++;
                console.log(`🔄 Tokens reseteados para empresa: ${empresa.nombre} (${empresa.empresa_id})`);
            }
            
            console.log(`📊 Reset mensual completado: ${empresasActualizadas} empresas actualizadas`);
            return { success: true, empresas_actualizadas: empresasActualizadas };
            
        } catch (error) {
            console.error('Error en reset mensual:', error);
            return { success: false, error: 'server_error', mensaje: 'Error en reset mensual.' };
        }
    }
}

module.exports = TokenService;