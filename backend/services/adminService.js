const { getDB } = require('../config/database');
const bcrypt = require('bcryptjs');
const { generarId, validarEmpresa, validarUsuario } = require('../models/schemas');

class AdminService {
    
    // ==================== DASHBOARD ESTADÍSTICAS GLOBALES ====================
    
    /**
     * Obtener estadísticas globales del sistema
     */
    static async obtenerEstadisticasGlobales() {
        try {
            const db = getDB();
            
            // Total de empresas
            const totalEmpresas = await db.collection('empresas').countDocuments();
            const empresasActivas = await db.collection('empresas').countDocuments({ activa: true });
            
            // Total de usuarios
            const totalUsuarios = await db.collection('usuarios').countDocuments();
            const usuariosActivos = await db.collection('usuarios').countDocuments({ activo: true });
            
            // Total de clasificaciones
            const totalClasificaciones = await db.collection('clasificaciones').countDocuments();
            
            // Clasificaciones este mes
            const inicioMes = new Date();
            inicioMes.setDate(1);
            inicioMes.setHours(0, 0, 0, 0);
            
            const clasificacionesMes = await db.collection('clasificaciones').countDocuments({
                fecha_creacion: { $gte: inicioMes.toISOString() }
            });
            
            // Consumo total de tokens
            const consumoTotal = await db.collection('consumos').aggregate([
                {
                    $group: {
                        _id: null,
                        total_tokens: { $sum: '$total_tokens' },
                        total_input: { $sum: '$input_tokens' },
                        total_output: { $sum: '$output_tokens' }
                    }
                }
            ]).toArray();
            
            // Sesiones activas actuales
            const sesionesActivas = await db.collection('sesiones').countDocuments({ activo: true });
            
            // Distribución de planes
            const distribucionPlanes = await db.collection('empresas').aggregate([
                {
                    $group: {
                        _id: '$plan_id',
                        cantidad: { $sum: 1 },
                        tokens_totales: { $sum: '$tokens_limite_mensual' }
                    }
                },
                { $sort: { cantidad: -1 } }
            ]).toArray();
            
            return {
                success: true,
                estadisticas: {
                    empresas: {
                        total: totalEmpresas,
                        activas: empresasActivas,
                        inactivas: totalEmpresas - empresasActivas
                    },
                    usuarios: {
                        total: totalUsuarios,
                        activos: usuariosActivos,
                        inactivos: totalUsuarios - usuariosActivos
                    },
                    clasificaciones: {
                        total: totalClasificaciones,
                        este_mes: clasificacionesMes
                    },
                    tokens: {
                        total_consumido: consumoTotal[0]?.total_tokens || 0,
                        total_input: consumoTotal[0]?.total_input || 0,
                        total_output: consumoTotal[0]?.total_output || 0
                    },
                    sesiones: {
                        activas: sesionesActivas
                    },
                    planes: distribucionPlanes
                }
            };
            
        } catch (error) {
            console.error('Error obteniendo estadísticas globales:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Obtener datos para gráficas del dashboard
     */
    static async obtenerDatosGraficas(periodo = '30d') {
        try {
            const db = getDB();
            
            // Calcular fecha de inicio según período
            const fechaInicio = new Date();
            switch (periodo) {
                case '7d':
                    fechaInicio.setDate(fechaInicio.getDate() - 7);
                    break;
                case '30d':
                    fechaInicio.setDate(fechaInicio.getDate() - 30);
                    break;
                case '90d':
                    fechaInicio.setDate(fechaInicio.getDate() - 90);
                    break;
                case '1y':
                    fechaInicio.setFullYear(fechaInicio.getFullYear() - 1);
                    break;
                default:
                    fechaInicio.setDate(fechaInicio.getDate() - 30);
            }
            
            // 1. Clasificaciones por día
            const clasificacionesPorDia = await db.collection('clasificaciones').aggregate([
                {
                    $match: {
                        fecha_creacion: { $gte: fechaInicio.toISOString() }
                    }
                },
                {
                    $group: {
                        _id: { $substr: ['$fecha_creacion', 0, 10] },
                        cantidad: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]).toArray();
            
            // 2. Consumo de tokens por día
            const consumoPorDia = await db.collection('consumos').aggregate([
                {
                    $match: {
                        ts: { $gte: fechaInicio.toISOString() }
                    }
                },
                {
                    $group: {
                        _id: { $substr: ['$ts', 0, 10] },
                        total_tokens: { $sum: '$total_tokens' }
                    }
                },
                { $sort: { _id: 1 } }
            ]).toArray();
            
            // 3. Top 10 empresas por consumo
            const topEmpresas = await db.collection('consumos').aggregate([
                {
                    $match: {
                        ts: { $gte: fechaInicio.toISOString() }
                    }
                },
                {
                    $group: {
                        _id: '$empresa_id',
                        total_tokens: { $sum: '$total_tokens' },
                        clasificaciones: { $sum: '$items' }
                    }
                },
                { $sort: { total_tokens: -1 } },
                { $limit: 10 }
            ]).toArray();
            
            // Enriquecer con nombre de empresa
            for (const empresa of topEmpresas) {
                const datosEmpresa = await db.collection('empresas').findOne(
                    { empresa_id: empresa._id },
                    { projection: { nombre: 1, plan_id: 1 } }
                );
                empresa.nombre = datosEmpresa?.nombre || 'N/A';
                empresa.plan = datosEmpresa?.plan_id || 'N/A';
            }
            
            // 4. Distribución de tipos de operación
            const tiposOperacion = await db.collection('clasificaciones').aggregate([
                {
                    $match: {
                        fecha_creacion: { $gte: fechaInicio.toISOString() }
                    }
                },
                {
                    $group: {
                        _id: '$tipo_operacion',
                        cantidad: { $sum: 1 }
                    }
                }
            ]).toArray();
            
            return {
                success: true,
                periodo: periodo,
                fecha_inicio: fechaInicio.toISOString(),
                graficas: {
                    clasificaciones_por_dia: clasificacionesPorDia,
                    consumo_por_dia: consumoPorDia,
                    top_empresas: topEmpresas,
                    tipos_operacion: tiposOperacion
                }
            };
            
        } catch (error) {
            console.error('Error obteniendo datos de gráficas:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // ==================== GESTIÓN DE EMPRESAS ====================
    
    /**
     * Listar todas las empresas con información detallada
     */
    static async listarEmpresas(filtros = {}) {
        try {
            const db = getDB();
            
            const query = {};
            if (filtros.activa !== undefined) {
                query.activa = filtros.activa;
            }
            if (filtros.plan_id) {
                query.plan_id = filtros.plan_id;
            }
            
            const empresas = await db.collection('empresas')
                .find(query)
                .sort({ fecha_creacion: -1 })
                .toArray();
            
            // Enriquecer con estadísticas
            for (const empresa of empresas) {
                // Contar usuarios
                empresa.total_usuarios = await db.collection('usuarios').countDocuments({
                    empresa_id: empresa.empresa_id
                });
                
                // Contar clasificaciones
                empresa.total_clasificaciones = await db.collection('clasificaciones').countDocuments({
                    empresa_id: empresa.empresa_id
                });
                
                // Sesiones activas
                empresa.sesiones_activas = await db.collection('sesiones').countDocuments({
                    empresa_id: empresa.empresa_id,
                    activo: true
                });
                
                // Obtener datos del plan
                const plan = await db.collection('planes').findOne({ id: empresa.plan_id });
                empresa.plan_nombre = plan?.id || 'N/A';
                empresa.plan_precio = plan?.precio_mensual_usd || 0;
            }
            
            return {
                success: true,
                empresas: empresas,
                total: empresas.length
            };
            
        } catch (error) {
            console.error('Error listando empresas:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Obtener detalle completo de una empresa
     */
    static async obtenerDetalleEmpresa(empresaId) {
        try {
            const db = getDB();
            
            const empresa = await db.collection('empresas').findOne({ empresa_id: empresaId });
            
            if (!empresa) {
                return { success: false, error: 'company_not_found' };
            }
            
            // Estadísticas detalladas
            const usuarios = await db.collection('usuarios')
                .find({ empresa_id: empresaId })
                .project({ contrasena_hash: 0 })
                .toArray();
            
            const clasificaciones = await db.collection('clasificaciones').aggregate([
                { $match: { empresa_id: empresaId } },
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        exportados: { $sum: { $cond: ['$exportado', 1, 0] } }
                    }
                }
            ]).toArray();
            
            const consumo = await db.collection('consumos').aggregate([
                { $match: { empresa_id: empresaId } },
                {
                    $group: {
                        _id: null,
                        total_tokens: { $sum: '$total_tokens' },
                        total_ordenes: { $sum: 1 }
                    }
                }
            ]).toArray();
            
            // Consumo por mes (últimos 6 meses)
            const consumoPorMes = await db.collection('consumos').aggregate([
                {
                    $match: {
                        empresa_id: empresaId,
                        ts: {
                            $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString()
                        }
                    }
                },
                {
                    $group: {
                        _id: { $substr: ['$ts', 0, 7] }, // YYYY-MM
                        total_tokens: { $sum: '$total_tokens' },
                        clasificaciones: { $sum: '$items' }
                    }
                },
                { $sort: { _id: 1 } }
            ]).toArray();
            
            const plan = await db.collection('planes').findOne({ id: empresa.plan_id });
            
            return {
                success: true,
                empresa: {
                    ...empresa,
                    plan: plan,
                    usuarios: usuarios,
                    estadisticas: {
                        clasificaciones: clasificaciones[0] || { total: 0, exportados: 0 },
                        consumo: consumo[0] || { total_tokens: 0, total_ordenes: 0 },
                        consumo_por_mes: consumoPorMes
                    }
                }
            };
            
        } catch (error) {
            console.error('Error obteniendo detalle de empresa:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Crear nueva empresa
     */
    static async crearEmpresa(datosEmpresa) {
        try {
            const db = getDB();
            
            // Validar datos
            const errores = validarEmpresa(datosEmpresa);
            if (errores.length > 0) {
                return { success: false, error: 'validation_error', mensaje: errores.join(', ') };
            }
            
            // Verificar que el plan existe
            const plan = await db.collection('planes').findOne({ id: datosEmpresa.plan_id });
            if (!plan) {
                return { success: false, error: 'plan_not_found', mensaje: 'Plan no encontrado.' };
            }
            
            // Crear empresa
            const nuevaEmpresa = {
                empresa_id: datosEmpresa.empresa_id || generarId('emp'),
                nombre: datosEmpresa.nombre,
                plan_id: datosEmpresa.plan_id,
                tokens_limite_mensual: plan.tokens_mes,
                tokens_consumidos: 0,
                periodo_inicio: datosEmpresa.periodo_inicio,
                periodo_fin: datosEmpresa.periodo_fin,
                activa: true,
                fecha_creacion: new Date().toISOString(),
                config_defaults: datosEmpresa.config_defaults || {}
            };
            
            await db.collection('empresas').insertOne(nuevaEmpresa);
            
            return {
                success: true,
                empresa: nuevaEmpresa,
                mensaje: 'Empresa creada exitosamente.'
            };
            
        } catch (error) {
            console.error('Error creando empresa:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Actualizar empresa
     */
    static async actualizarEmpresa(empresaId, datosActualizados) {
        try {
            const db = getDB();
            
            const empresa = await db.collection('empresas').findOne({ empresa_id: empresaId });
            if (!empresa) {
                return { success: false, error: 'company_not_found' };
            }
            
            // Si se cambia el plan, actualizar límite de tokens
            if (datosActualizados.plan_id && datosActualizados.plan_id !== empresa.plan_id) {
                const nuevoPlan = await db.collection('planes').findOne({ id: datosActualizados.plan_id });
                if (!nuevoPlan) {
                    return { success: false, error: 'plan_not_found' };
                }
                datosActualizados.tokens_limite_mensual = nuevoPlan.tokens_mes;
            }
            
            await db.collection('empresas').updateOne(
                { empresa_id: empresaId },
                { $set: datosActualizados }
            );
            
            return {
                success: true,
                mensaje: 'Empresa actualizada exitosamente.'
            };
            
        } catch (error) {
            console.error('Error actualizando empresa:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Activar/Desactivar empresa
     */
    static async toggleEmpresa(empresaId, activa) {
        try {
            const db = getDB();
            
            const result = await db.collection('empresas').updateOne(
                { empresa_id: empresaId },
                { $set: { activa: activa } }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'company_not_found' };
            }
            
            return {
                success: true,
                mensaje: `Empresa ${activa ? 'activada' : 'desactivada'} exitosamente.`
            };
            
        } catch (error) {
            console.error('Error toggle empresa:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // ==================== GESTIÓN DE USUARIOS ====================
    
    /**
     * Listar todos los usuarios del sistema
     */
    static async listarUsuarios(filtros = {}) {
        try {
            const db = getDB();
            
            const query = {};
            if (filtros.activo !== undefined) {
                query.activo = filtros.activo;
            }
            if (filtros.rol) {
                query.rol = filtros.rol;
            }
            if (filtros.empresa_id) {
                query.empresa_id = filtros.empresa_id;
            }
            
            const usuarios = await db.collection('usuarios')
                .find(query)
                .project({ contrasena_hash: 0 })
                .sort({ fecha_creacion: -1 })
                .toArray();
            
            // Enriquecer con información de empresa
            for (const usuario of usuarios) {
                const empresa = await db.collection('empresas').findOne(
                    { empresa_id: usuario.empresa_id },
                    { projection: { nombre: 1, plan_id: 1 } }
                );
                usuario.empresa_nombre = empresa?.nombre || 'N/A';
                usuario.plan_id = empresa?.plan_id || 'N/A';
                
                // Sesiones activas del usuario
                usuario.sesiones_activas = await db.collection('sesiones').countDocuments({
                    usuario_id: usuario.usuario_id,
                    activo: true
                });
            }
            
            return {
                success: true,
                usuarios: usuarios,
                total: usuarios.length
            };
            
        } catch (error) {
            console.error('Error listando usuarios:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Crear nuevo usuario
     */
    static async crearUsuario(datosUsuario) {
        try {
            const db = getDB();
            
            // Verificar que la empresa existe
            const empresa = await db.collection('empresas').findOne({ empresa_id: datosUsuario.empresa_id });
            if (!empresa) {
                return { success: false, error: 'company_not_found' };
            }
            
            // Verificar que el correo no existe
            const usuarioExistente = await db.collection('usuarios').findOne({ correo: datosUsuario.correo });
            if (usuarioExistente) {
                return { success: false, error: 'email_exists', mensaje: 'El correo ya está registrado.' };
            }
            
            // Hash de contraseña
            const saltRounds = 12;
            const contrasenaHash = await bcrypt.hash(datosUsuario.contrasena, saltRounds);
            
            const nuevoUsuario = {
                usuario_id: generarId('usr'),
                empresa_id: datosUsuario.empresa_id,
                nombre: datosUsuario.nombre,
                correo: datosUsuario.correo.toLowerCase(),
                contrasena_hash: contrasenaHash,
                rol: datosUsuario.rol || 'user',
                activo: true,
                fecha_creacion: new Date().toISOString()
            };
            
            await db.collection('usuarios').insertOne(nuevoUsuario);
            
            delete nuevoUsuario.contrasena_hash;
            
            return {
                success: true,
                usuario: nuevoUsuario,
                mensaje: 'Usuario creado exitosamente.'
            };
            
        } catch (error) {
            console.error('Error creando usuario:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Actualizar usuario
     */
    static async actualizarUsuario(usuarioId, datosActualizados) {
        try {
            const db = getDB();
            
            // Si se actualiza la contraseña, hashearla
            if (datosActualizados.contrasena) {
                const saltRounds = 12;
                datosActualizados.contrasena_hash = await bcrypt.hash(datosActualizados.contrasena, saltRounds);
                delete datosActualizados.contrasena;
            }
            
            const result = await db.collection('usuarios').updateOne(
                { usuario_id: usuarioId },
                { $set: datosActualizados }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'user_not_found' };
            }
            
            return {
                success: true,
                mensaje: 'Usuario actualizado exitosamente.'
            };
            
        } catch (error) {
            console.error('Error actualizando usuario:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Activar/Desactivar usuario
     */
    static async toggleUsuario(usuarioId, activo) {
        try {
            const db = getDB();
            
            const result = await db.collection('usuarios').updateOne(
                { usuario_id: usuarioId },
                { $set: { activo: activo } }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'user_not_found' };
            }
            
            // Si se desactiva, cerrar todas sus sesiones
            if (!activo) {
                await db.collection('sesiones').updateMany(
                    { usuario_id: usuarioId },
                    { $set: { activo: false } }
                );
            }
            
            return {
                success: true,
                mensaje: `Usuario ${activo ? 'activado' : 'desactivado'} exitosamente.`
            };
            
        } catch (error) {
            console.error('Error toggle usuario:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    /**
     * Resetear consumo mensual de tokens para una empresa
     */
    static async resetearConsumoEmpresa(empresaId) {
        try {
            const db = getDB();
            
            const result = await db.collection('empresas').updateOne(
                { empresa_id: empresaId },
                { $set: { tokens_consumidos: 0 } }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'company_not_found' };
            }
            
            return {
                success: true,
                mensaje: 'Consumo de tokens reseteado exitosamente.'
            };
            
        } catch (error) {
            console.error('Error reseteando consumo:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // ==================== GESTIÓN DE SESIONES ====================
    
    /**
     * Cerrar todas las sesiones activas del sistema (excepto la del admin)
     */
    static async cerrarTodasLasSesiones(sesionAdminId) {
        try {
            const db = getDB();
            
            // Contar sesiones antes de cerrar
            const sesionesAntes = await db.collection('sesiones').countDocuments({ activo: true });
            
            // Cerrar todas las sesiones excepto la del admin
            const resultado = await db.collection('sesiones').updateMany(
                { 
                    activo: true,
                    sesion_id: { $ne: sesionAdminId }
                },
                { 
                    $set: { 
                        activo: false,
                        cerrada_por: 'admin',
                        fecha_cierre: new Date().toISOString()
                    } 
                }
            );
            
            console.log(`🔒 Admin cerró ${resultado.modifiedCount} sesiones de ${sesionesAntes} activas`);
            
            return {
                success: true,
                sesiones_cerradas: resultado.modifiedCount,
                sesiones_antes: sesionesAntes,
                mensaje: `Se cerraron ${resultado.modifiedCount} sesiones exitosamente.`
            };
            
        } catch (error) {
            console.error('Error cerrando todas las sesiones:', error);
            return { success: false, error: 'server_error', mensaje: 'Error al cerrar sesiones.' };
        }
    }
    
    /**
     * Obtener lista de todas las sesiones activas
     */
    static async obtenerSesionesActivas() {
        try {
            const db = getDB();
            
            const sesiones = await db.collection('sesiones').aggregate([
                {
                    $match: { activo: true }
                },
                {
                    $lookup: {
                        from: 'usuarios',
                        localField: 'usuario_id',
                        foreignField: 'usuario_id',
                        as: 'usuario'
                    }
                },
                {
                    $lookup: {
                        from: 'empresas',
                        localField: 'empresa_id',
                        foreignField: 'empresa_id',
                        as: 'empresa'
                    }
                },
                {
                    $unwind: '$usuario'
                },
                {
                    $unwind: '$empresa'
                },
                {
                    $project: {
                        sesion_id: 1,
                        usuario_nombre: '$usuario.nombre',
                        usuario_correo: '$usuario.correo',
                        empresa_nombre: '$empresa.nombre',
                        device_fingerprint: 1,
                        ip: 1,
                        ts_login: 1,
                        ts_ultima_actividad: 1
                    }
                },
                {
                    $sort: { ts_ultima_actividad: -1 }
                }
            ]).toArray();
            
            return {
                success: true,
                sesiones,
                total: sesiones.length
            };
            
        } catch (error) {
            console.error('Error obteniendo sesiones activas:', error);
            return { success: false, error: 'server_error', mensaje: 'Error al obtener sesiones.' };
        }
    }
    
    /**
     * Cerrar una sesión específica
     */
    static async cerrarSesion(sesionId) {
        try {
            const db = getDB();
            
            const resultado = await db.collection('sesiones').updateOne(
                { sesion_id: sesionId },
                { 
                    $set: { 
                        activo: false,
                        cerrada_por: 'admin',
                        fecha_cierre: new Date().toISOString()
                    } 
                }
            );
            
            if (resultado.matchedCount === 0) {
                return { success: false, error: 'session_not_found', mensaje: 'Sesión no encontrada.' };
            }
            
            return {
                success: true,
                mensaje: 'Sesión cerrada exitosamente.'
            };
            
        } catch (error) {
            console.error('Error cerrando sesión:', error);
            return { success: false, error: 'server_error', mensaje: 'Error al cerrar sesión.' };
        }
    }
}

module.exports = AdminService;
