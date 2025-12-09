const { getDB } = require('../config/database');

class ConfigService {
    
    // Obtener configuración de defaults de una empresa
    static async obtenerDefaults(empresaId) {
        try {
            const db = getDB();
            
            const empresa = await db.collection('empresas').findOne(
                { empresa_id: empresaId },
                { projection: { config_defaults: 1 } }
            );
            
            if (!empresa) {
                return { success: false, error: 'company_not_found' };
            }
            
            return {
                success: true,
                defaults: empresa.config_defaults || {}
            };
            
        } catch (error) {
            console.error('Error obteniendo defaults:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Actualizar configuración de defaults
    static async actualizarDefaults(empresaId, nuevosDefaults) {
        try {
            const db = getDB();
            
            // Validar que los defaults sean un objeto
            if (typeof nuevosDefaults !== 'object' || Array.isArray(nuevosDefaults)) {
                return { success: false, error: 'invalid_format' };
            }
            
            // Validar formatos si se proporcionan campos específicos
            const errores = [];
            
            if (nuevosDefaults.ClearanceType && !/^IC\d{2}-\d{3}$/.test(nuevosDefaults.ClearanceType)) {
                errores.push('ClearanceType debe tener formato IC##-### (ej: IC38-002)');
            }
            
            if (nuevosDefaults.ImporterCode && !/^RNC\d+$/.test(nuevosDefaults.ImporterCode)) {
                errores.push('ImporterCode debe tener formato RNC seguido de números');
            }
            
            if (nuevosDefaults.DeclarantCode && !/^RNC\d+$/.test(nuevosDefaults.DeclarantCode)) {
                errores.push('DeclarantCode debe tener formato RNC seguido de números');
            }
            
            if (nuevosDefaults.RegimenCode && !/^\d+$/.test(nuevosDefaults.RegimenCode.toString())) {
                errores.push('RegimenCode debe ser un número entero');
            }
            
            if (errores.length > 0) {
                return { success: false, error: 'validation_error', errores };
            }
            
            const result = await db.collection('empresas').updateOne(
                { empresa_id: empresaId },
                { $set: { config_defaults: nuevosDefaults } }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'company_not_found' };
            }
            
            return {
                success: true,
                mensaje: 'Configuración actualizada correctamente',
                defaults: nuevosDefaults
            };
            
        } catch (error) {
            console.error('Error actualizando defaults:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Actualizar un campo específico de defaults
    static async actualizarCampoDefault(empresaId, campo, valor) {
        try {
            const db = getDB();
            
            const updateKey = `config_defaults.${campo}`;
            
            const result = await db.collection('empresas').updateOne(
                { empresa_id: empresaId },
                { $set: { [updateKey]: valor } }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'company_not_found' };
            }
            
            return {
                success: true,
                mensaje: `Campo ${campo} actualizado correctamente`
            };
            
        } catch (error) {
            console.error('Error actualizando campo default:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Eliminar un campo específico de defaults
    static async eliminarCampoDefault(empresaId, campo) {
        try {
            const db = getDB();
            
            const unsetKey = `config_defaults.${campo}`;
            
            const result = await db.collection('empresas').updateOne(
                { empresa_id: empresaId },
                { $unset: { [unsetKey]: "" } }
            );
            
            if (result.matchedCount === 0) {
                return { success: false, error: 'company_not_found' };
            }
            
            return {
                success: true,
                mensaje: `Campo ${campo} eliminado correctamente`
            };
            
        } catch (error) {
            console.error('Error eliminando campo default:', error);
            return { success: false, error: 'server_error' };
        }
    }
    
    // Aplicar defaults a un objeto de clasificación
    static aplicarDefaults(clasificacion, defaults) {
        // Crear copia del objeto para no mutar el original
        const resultado = JSON.parse(JSON.stringify(clasificacion));
        
        // Acceder a ImpDeclaration
        const declaration = resultado.ImportDUA?.ImpDeclaration || resultado;
        
        // Aplicar cada default solo si el campo está vacío o no existe
        for (const [campo, valorDefault] of Object.entries(defaults)) {
            if (!declaration[campo] || 
                declaration[campo] === '' || 
                declaration[campo] === null || 
                declaration[campo] === undefined) {
                declaration[campo] = valorDefault;
            }
        }
        
        return resultado;
    }
}

module.exports = ConfigService;
