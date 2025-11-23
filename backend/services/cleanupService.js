const cron = require('node-cron');
const AuthService = require('./authService');
const TokenService = require('./tokenService');
const { getDB } = require('../config/database');

class CleanupService {
    
    // Inicializar todas las tareas programadas
    static initializeScheduledTasks() {
        console.log('🕒 Inicializando tareas programadas...');
        
        // Limpiar sesiones inactivas cada 15 minutos
        this.scheduleSessionCleanup();
        
        // Reset mensual de tokens cada día a las 2:00 AM
        this.scheduleMonthlyReset();
        
        // Limpieza de logs antiguos cada semana
        this.scheduleLogCleanup();
        
        console.log('✅ Tareas programadas iniciadas');
    }
    
    // Limpiar sesiones inactivas cada 15 minutos
    static scheduleSessionCleanup() {
        cron.schedule('*/15 * * * *', async () => {
            try {
                console.log('🧽 Ejecutando limpieza de sesiones inactivas...');
                const cleaned = await AuthService.limpiarSesionesInactivas();
                
                if (cleaned > 0) {
                    console.log(`✅ ${cleaned} sesiones inactivas limpiadas`);
                }
            } catch (error) {
                console.error('❌ Error en limpieza de sesiones:', error);
            }
        });
        
        console.log('📅 Programada limpieza de sesiones cada 15 minutos');
    }
    
    // Reset mensual de tokens cada día a las 2:00 AM
    static scheduleMonthlyReset() {
        cron.schedule('0 2 * * *', async () => {
            try {
                console.log('🔄 Verificando reset mensual de tokens...');
                const result = await TokenService.resetearConsumoMensual();
                
                if (result.success && result.empresas_actualizadas > 0) {
                    console.log(`✅ Reset mensual completado: ${result.empresas_actualizadas} empresas actualizadas`);
                } else {
                    console.log('📊 No hay empresas que requieran reset mensual');
                }
            } catch (error) {
                console.error('❌ Error en reset mensual:', error);
            }
        });
        
        console.log('📅 Programado reset mensual diario a las 2:00 AM');
    }
    
    // Limpieza de logs antiguos cada domingo a las 3:00 AM
    static scheduleLogCleanup() {
        cron.schedule('0 3 * * 0', async () => {
            try {
                console.log('🗑️ Ejecutando limpieza de logs antiguos...');
                const result = await this.cleanupOldLogs();
                console.log(`✅ Limpieza de logs completada: ${result.eliminados} registros eliminados`);
            } catch (error) {
                console.error('❌ Error en limpieza de logs:', error);
            }
        });
        
        console.log('📅 Programada limpieza de logs los domingos a las 3:00 AM');
    }
    
    // Limpiar logs de consumo antiguos (más de 6 meses)
    static async cleanupOldLogs() {
        try {
            const db = getDB();
            const fechaLimite = new Date();
            fechaLimite.setMonth(fechaLimite.getMonth() - 6);
            
            const result = await db.collection('consumos').deleteMany({
                ts: { $lt: fechaLimite.toISOString() }
            });
            
            return { success: true, eliminados: result.deletedCount };
        } catch (error) {
            console.error('Error limpiando logs antiguos:', error);
            return { success: false, error: error.message };
        }
    }
    
    // Obtener estadísticas de limpieza
    static async getCleanupStats() {
        try {
            const db = getDB();
            
            // Contar sesiones activas e inactivas
            const sesionesActivas = await db.collection('sesiones').countDocuments({ activo: true });
            const sesionesInactivas = await db.collection('sesiones').countDocuments({ activo: false });
            
            // Contar consumos por mes
            const ahora = new Date();
            const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
            const consumosEsteMes = await db.collection('consumos').countDocuments({
                ts: { $gte: inicioMes.toISOString() }
            });
            
            // Contar empresas que necesitan reset
            const empresasVencidas = await db.collection('empresas').countDocuments({
                periodo_fin: { $lt: ahora.toISOString().split('T')[0] }
            });
            
            // Tamaño de colecciones
            const stats = await db.stats();
            
            return {
                sesiones: {
                    activas: sesionesActivas,
                    inactivas: sesionesInactivas,
                    total: sesionesActivas + sesionesInactivas
                },
                consumos: {
                    este_mes: consumosEsteMes,
                    total: await db.collection('consumos').countDocuments()
                },
                empresas: {
                    necesitan_reset: empresasVencidas,
                    total: await db.collection('empresas').countDocuments()
                },
                database: {
                    size_bytes: stats.dataSize,
                    size_mb: Math.round(stats.dataSize / 1024 / 1024 * 100) / 100
                }
            };
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return { error: error.message };
        }
    }
    
    // Ejecutar limpieza manual completa
    static async runFullCleanup() {
        console.log('🧹 Iniciando limpieza completa manual...');
        
        const results = {
            sesiones_limpiadas: 0,
            empresas_reseteadas: 0,
            logs_eliminados: 0,
            errores: []
        };
        
        try {
            // Limpiar sesiones
            const sesionesLimpiadas = await AuthService.limpiarSesionesInactivas();
            results.sesiones_limpiadas = sesionesLimpiadas;
        } catch (error) {
            results.errores.push(`Sesiones: ${error.message}`);
        }
        
        try {
            // Reset mensual
            const resetResult = await TokenService.resetearConsumoMensual();
            results.empresas_reseteadas = resetResult.empresas_actualizadas || 0;
        } catch (error) {
            results.errores.push(`Reset mensual: ${error.message}`);
        }
        
        try {
            // Limpiar logs
            const logsResult = await this.cleanupOldLogs();
            results.logs_eliminados = logsResult.eliminados || 0;
        } catch (error) {
            results.errores.push(`Logs: ${error.message}`);
        }
        
        console.log('✅ Limpieza completa terminada:', results);
        return results;
    }
}

module.exports = CleanupService;