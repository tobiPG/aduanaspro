const { getDB } = require('../config/database');
const { generarId } = require('../models/schemas');

class HistorialService {
    
    // Guardar una nueva clasificación en el historial
    static async guardarClasificacion(empresaId, usuarioId, tipoOperacion, nombreArchivo, resultado, tokensConsumidos = 0) {
        try {
            const db = getDB();
            
            // Extraer productos para búsqueda rápida
            const productos = [];
            let headerData = {};
            
            // Manejar estructura anidada ImportDUA.ImpDeclaration (nuevo formato GPT)
            if (resultado.ImportDUA?.ImpDeclaration?.ImpDeclarationProduct) {
                const impDeclaration = resultado.ImportDUA.ImpDeclaration;
                const productsArray = Array.isArray(impDeclaration.ImpDeclarationProduct) 
                    ? impDeclaration.ImpDeclarationProduct 
                    : [impDeclaration.ImpDeclarationProduct];
                
                productsArray.forEach(prod => {
                    productos.push({
                        HSCode: prod.HSCode,
                        ProductName: prod.ProductName,
                        ProductCode: prod.ProductCode
                    });
                });
                
                // Extraer datos del header (factura)
                headerData = {
                    CommercialInvoiceNo: impDeclaration.CommercialInvoiceNo,
                    DeclarationDate: impDeclaration.DeclarationDate,
                    TotalFOB: impDeclaration.TotalFOB,
                    TotalCIF: impDeclaration.TotalCIF,
                    FreightValue: impDeclaration.FreightValue,
                    InsuranceValue: impDeclaration.InsuranceValue,
                    TotalWeight: impDeclaration.TotalWeight,
                    ImpDeclarationSupplier: impDeclaration.ImpDeclarationSupplier
                };
            } 
            // Manejar estructura plana (ImpDeclarationProduct directo)
            else if (resultado.ImpDeclarationProduct) {
                const productsArray = Array.isArray(resultado.ImpDeclarationProduct) 
                    ? resultado.ImpDeclarationProduct 
                    : [resultado.ImpDeclarationProduct];
                
                productsArray.forEach(prod => {
                    productos.push({
                        HSCode: prod.HSCode,
                        ProductName: prod.ProductName,
                        ProductCode: prod.ProductCode
                    });
                });
                
                // Extraer datos del header si existen
                headerData = {
                    CommercialInvoiceNo: resultado.CommercialInvoiceNo,
                    TotalFOB: resultado.TotalFOB,
                    TotalCIF: resultado.TotalCIF,
                    FreightValue: resultado.FreightValue,
                    InsuranceValue: resultado.InsuranceValue,
                    TotalWeight: resultado.TotalWeight,
                    ImpDeclarationSupplier: resultado.ImpDeclarationSupplier
                };
            }
            
            const clasificacion = {
                clasificacion_id: generarId('clf'),
                empresa_id: empresaId,
                usuario_id: usuarioId,
                nombre_archivo: nombreArchivo || 'Sin nombre',
                tipo_operacion: tipoOperacion,
                resultado: resultado,
                productos: productos,
                headerData: headerData, // Guardar datos del header
                tokens_consumidos: tokensConsumidos,
                fecha_creacion: new Date().toISOString(),
                editado: false,
                exportado: false
            };
            
            await db.collection('clasificaciones').insertOne(clasificacion);
            
            return { success: true, clasificacion_id: clasificacion.clasificacion_id };
            
        } catch (error) {
            console.error('Error guardando clasificación:', error);
            return { success: false, error: 'save_failed' };
        }
    }
    
    // Obtener historial con filtros y paginación
    static async obtenerHistorial(empresaId, opciones = {}) {
        try {
            const db = getDB();
            
            const {
                pagina = 1,
                limite = 50,
                busqueda = '',
                tipoOperacion = null,
                desde = null,
                hasta = null
            } = opciones;
            
            // Construir filtro
            const filtro = { empresa_id: empresaId };
            
            console.log('🔍 Filtrando historial por empresa_id:', empresaId);
            console.log('📝 Filtro completo:', JSON.stringify(filtro));
            
            if (tipoOperacion) {
                filtro.tipo_operacion = tipoOperacion;
            }
            
            if (desde || hasta) {
                filtro.fecha_creacion = {};
                if (desde) filtro.fecha_creacion.$gte = desde;
                if (hasta) filtro.fecha_creacion.$lte = hasta;
            }
            
            // Búsqueda por texto (nombre archivo, código HS, nombre producto)
            if (busqueda) {
                filtro.$or = [
                    { nombre_archivo: { $regex: busqueda, $options: 'i' } },
                    { 'productos.HSCode': { $regex: busqueda, $options: 'i' } },
                    { 'productos.ProductName': { $regex: busqueda, $options: 'i' } }
                ];
            }
            
            // Paginación
            const skip = (pagina - 1) * limite;
            
            // Obtener total y resultados
            const [total, clasificaciones] = await Promise.all([
                db.collection('clasificaciones').countDocuments(filtro),
                db.collection('clasificaciones')
                    .find(filtro)
                    .sort({ fecha_creacion: -1 })
                    .skip(skip)
                    .limit(limite)
                    .project({
                        clasificacion_id: 1,
                        nombre_archivo: 1,
                        tipo_operacion: 1,
                        productos: 1,
                        tokens_consumidos: 1,
                        fecha_creacion: 1,
                        editado: 1,
                        exportado: 1,
                        fecha_exportacion: 1
                    })
                    .toArray()
            ]);
            
            return {
                success: true,
                clasificaciones,
                paginacion: {
                    total,
                    pagina,
                    limite,
                    total_paginas: Math.ceil(total / limite)
                }
            };
            
        } catch (error) {
            console.error('Error obteniendo historial:', error);
            return { success: false, error: 'fetch_failed' };
        }
    }
    
    // Obtener una clasificación específica
    static async obtenerClasificacion(clasificacionId, empresaId) {
        try {
            const db = getDB();
            
            const clasificacion = await db.collection('clasificaciones').findOne({
                clasificacion_id: clasificacionId,
                empresa_id: empresaId
            });
            
            if (!clasificacion) {
                return { success: false, error: 'not_found' };
            }
            
            return { success: true, clasificacion };
            
        } catch (error) {
            console.error('Error obteniendo clasificación:', error);
            return { success: false, error: 'fetch_failed' };
        }
    }
    
    // Marcar como editado
    static async marcarComoEditado(clasificacionId, empresaId) {
        try {
            const db = getDB();
            
            const result = await db.collection('clasificaciones').updateOne(
                { clasificacion_id: clasificacionId, empresa_id: empresaId },
                { $set: { editado: true } }
            );
            
            return { success: result.modifiedCount > 0 };
            
        } catch (error) {
            console.error('Error marcando como editado:', error);
            return { success: false };
        }
    }
    
    // Marcar como exportado
    static async marcarComoExportado(clasificacionId, empresaId) {
        try {
            const db = getDB();
            
            const result = await db.collection('clasificaciones').updateOne(
                { clasificacion_id: clasificacionId, empresa_id: empresaId },
                { 
                    $set: { 
                        exportado: true,
                        fecha_exportacion: new Date().toISOString()
                    } 
                }
            );
            
            return { success: result.modifiedCount > 0 };
            
        } catch (error) {
            console.error('Error marcando como exportado:', error);
            return { success: false };
        }
    }
    
    // Eliminar clasificación
    static async eliminarClasificacion(clasificacionId, empresaId) {
        try {
            const db = getDB();
            
            const result = await db.collection('clasificaciones').deleteOne({
                clasificacion_id: clasificacionId,
                empresa_id: empresaId
            });
            
            return { success: result.deletedCount > 0 };
            
        } catch (error) {
            console.error('Error eliminando clasificación:', error);
            return { success: false };
        }
    }
    
    // Obtener estadísticas del historial
    static async obtenerEstadisticas(empresaId) {
        try {
            const db = getDB();
            
            // Calcular inicio del mes actual
            const inicioMes = new Date();
            inicioMes.setDate(1);
            inicioMes.setHours(0, 0, 0, 0);
            
            const [total, importaciones, exportaciones, editadas, exportadas, esteMes] = await Promise.all([
                db.collection('clasificaciones').countDocuments({ empresa_id: empresaId }),
                db.collection('clasificaciones').countDocuments({ empresa_id: empresaId, tipo_operacion: 'import' }),
                db.collection('clasificaciones').countDocuments({ empresa_id: empresaId, tipo_operacion: 'export' }),
                db.collection('clasificaciones').countDocuments({ empresa_id: empresaId, editado: true }),
                db.collection('clasificaciones').countDocuments({ empresa_id: empresaId, exportado: true }),
                db.collection('clasificaciones').countDocuments({ 
                    empresa_id: empresaId, 
                    fecha_creacion: { $gte: inicioMes.toISOString() }
                })
            ]);
            
            // Calcular total de productos clasificados
            const productosAggregate = await db.collection('clasificaciones').aggregate([
                { $match: { empresa_id: empresaId } },
                { $project: { productos_count: { $size: { $ifNull: ['$productos', []] } } } },
                { $group: { _id: null, total_productos: { $sum: '$productos_count' } } }
            ]).toArray();
            
            const totalProductos = productosAggregate.length > 0 ? productosAggregate[0].total_productos : 0;
            
            // Top 10 códigos HS más usados
            const topHS = await db.collection('clasificaciones').aggregate([
                { $match: { empresa_id: empresaId } },
                { $unwind: '$productos' },
                { $group: { _id: '$productos.HSCode', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]).toArray();
            
            return {
                success: true,
                estadisticas: {
                    total: total,
                    este_mes: esteMes,
                    exportados: exportadas,
                    total_productos: totalProductos,
                    importaciones,
                    exportaciones,
                    editadas,
                    top_codigos_hs: topHS
                }
            };
            
        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            return { success: false, error: 'fetch_failed' };
        }
    }
}

module.exports = HistorialService;
