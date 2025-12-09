const { getDB } = require('../config/database');

class AlertasService {
    
    // Umbrales de alerta
    static UMBRALES = {
        CRITICO: 5,    // 5% restante
        ALTO: 10,      // 10% restante
        MEDIO: 20      // 20% restante
    };
    
    // Obtener estado de tokens y alertas
    static async verificarTokens(empresaId) {
        try {
            const db = getDB();
            
            const empresa = await db.collection('empresas').findOne({ 
                empresa_id: empresaId 
            });
            
            if (!empresa) {
                return { success: false, error: 'company_not_found' };
            }
            
            const tokensRestantes = empresa.tokens_limite_mensual - empresa.tokens_consumidos;
            const porcentajeRestante = (tokensRestantes / empresa.tokens_limite_mensual) * 100;
            
            let nivelAlerta = null;
            let mensaje = null;
            let color = 'green';
            
            if (porcentajeRestante <= this.UMBRALES.CRITICO) {
                nivelAlerta = 'critico';
                mensaje = `¡CRÍTICO! Solo te quedan ${tokensRestantes} tokens (${porcentajeRestante.toFixed(1)}%). Considera actualizar tu plan.`;
                color = 'red';
            } else if (porcentajeRestante <= this.UMBRALES.ALTO) {
                nivelAlerta = 'alto';
                mensaje = `¡ADVERTENCIA! Te quedan ${tokensRestantes} tokens (${porcentajeRestante.toFixed(1)}%). Planifica tus clasificaciones.`;
                color = 'orange';
            } else if (porcentajeRestante <= this.UMBRALES.MEDIO) {
                nivelAlerta = 'medio';
                mensaje = `Te quedan ${tokensRestantes} tokens (${porcentajeRestante.toFixed(1)}%). Monitorea tu consumo.`;
                color = 'yellow';
            }
            
            return {
                success: true,
                tokens: {
                    limite: empresa.tokens_limite_mensual,
                    consumidos: empresa.tokens_consumidos,
                    restantes: tokensRestantes,
                    porcentaje_restante: porcentajeRestante
                },
                alerta: nivelAlerta ? {
                    nivel: nivelAlerta,
                    mensaje: mensaje,
                    color: color,
                    mostrar: true
                } : null
            };
            
        } catch (error) {
            console.error('Error verificando tokens:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Verificar si se debe mostrar alerta después de un consumo
    static async verificarDespuesDeConsumo(empresaId, tokensConsumidos) {
        try {
            const resultado = await this.verificarTokens(empresaId);
            
            if (resultado.success && resultado.alerta) {
                // Aquí se podría enviar email, notificación push, etc.
                console.log(`⚠️ ALERTA [${resultado.alerta.nivel.toUpperCase()}]: ${resultado.alerta.mensaje}`);
                
                // TODO: Implementar envío de email si está configurado
                // await this.enviarEmailAlerta(empresaId, resultado.alerta);
            }
            
            return resultado;
            
        } catch (error) {
            console.error('Error verificando después de consumo:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Obtener historial de alertas (para dashboard)
    static async obtenerHistorialAlertas(empresaId, limite = 10) {
        try {
            const db = getDB();
            
            // Obtener consumos recientes y calcular cuándo se cruzaron umbrales
            const consumos = await db.collection('consumos')
                .find({ empresa_id: empresaId })
                .sort({ ts: -1 })
                .limit(100)
                .toArray();
            
            const empresa = await db.collection('empresas').findOne({ 
                empresa_id: empresaId 
            });
            
            const alertasHistoricas = [];
            let tokensAcumulados = empresa.tokens_consumidos;
            
            // Simular histórico de alertas basado en consumos
            for (const consumo of consumos.reverse()) {
                tokensAcumulados -= consumo.total_tokens;
                const tokensRestantes = empresa.tokens_limite_mensual - tokensAcumulados;
                const porcentaje = (tokensRestantes / empresa.tokens_limite_mensual) * 100;
                
                if (porcentaje <= this.UMBRALES.CRITICO) {
                    alertasHistoricas.push({
                        fecha: consumo.ts,
                        nivel: 'critico',
                        tokens_restantes: tokensRestantes,
                        porcentaje: porcentaje
                    });
                } else if (porcentaje <= this.UMBRALES.ALTO) {
                    alertasHistoricas.push({
                        fecha: consumo.ts,
                        nivel: 'alto',
                        tokens_restantes: tokensRestantes,
                        porcentaje: porcentaje
                    });
                } else if (porcentaje <= this.UMBRALES.MEDIO) {
                    alertasHistoricas.push({
                        fecha: consumo.ts,
                        nivel: 'medio',
                        tokens_restantes: tokensRestantes,
                        porcentaje: porcentaje
                    });
                }
            }
            
            return {
                success: true,
                alertas: alertasHistoricas.slice(0, limite)
            };
            
        } catch (error) {
            console.error('Error obteniendo historial de alertas:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // TODO: Implementar envío de email
    // static async enviarEmailAlerta(empresaId, alerta) {
    //     // Usar nodemailer, SendGrid, etc.
    // }
}

module.exports = AlertasService;
