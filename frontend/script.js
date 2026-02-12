// Configuración de la API
const API_BASE_URL = 'http://127.0.0.1:3050';

// Estado global - usar window directamente para sincronizar entre scripts
window.resultadoActual = null;
let archivoSeleccionado = null;
let editedClassification = null; // Para almacenar la clasificación editada
let currentEditingIndex = null; // Índice del producto que se está editando
let authToken = localStorage.getItem('authToken'); // Token de autenticación
let userInfo = null; // Información del usuario logueado

// Alias local para compatibilidad
let resultadoActual = window.resultadoActual;

// Función helper para fetch con manejo automático de errores de autenticación
async function fetchConAuth(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // Si recibimos 401 Unauthorized, limpiar sesión automáticamente
        if (response.status === 401) {
            console.log('🔒 Sesión expirada (401) - limpiando automáticamente');
            limpiarSesionSilenciosamente();
            
            // Lanzar error para que el código que llama pueda manejarlo
            const error = new Error('Sesión expirada');
            error.status = 401;
            throw error;
        }
        
        return response;
    } catch (error) {
        // Si es error de red o el error que lanzamos, propagar
        throw error;
    }
}

// Función auxiliar para mostrar notificaciones
function showNotification(message, type = 'info') {
    // Buscar contenedor existente o crear uno nuevo
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10001;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    const colors = {
        success: '#10b981',
        error: '#dc2626',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    
    notification.style.cssText = `
        background: ${colors[type] || colors.info};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        min-width: 300px;
        animation: slideInRight 0.3s ease-out;
        font-size: 14px;
    `;
    
    notification.textContent = message;
    container.appendChild(notification);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Agregar estilos de animación
(function() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(400px); opacity: 0; }
        }
        @keyframes slideDown {
            from { transform: translateY(-100%); }
            to { transform: translateY(0); }
        }
    `;
    document.head.appendChild(style);
})();

// Funciones globales para onclick
window.abrirFormularioEdicion = function() {
    console.log('✅ Función abrirFormularioEdicion llamada');
    console.log('📊 resultadoActual:', resultadoActual);
    showEditForm(0);
};

window.exportarXML = function() {
    console.log('✅ Función exportarXML llamada');
    showExportOptions();
};

window.guardarJSON = function() {
    console.log('💾 Guardando JSON editado...');
    
    const editor = document.getElementById('json-editor');
    if (!editor) {
        showNotification('❌ Editor no encontrado', 'error');
        return;
    }
    
    const jsonText = editor.value;
    console.log('📝 JSON del editor:', jsonText);
    
    try {
        // Parsear el JSON para validarlo
        const parsedJSON = JSON.parse(jsonText);
        console.log('✅ JSON válido parseado:', parsedJSON);
        
        // Actualizar resultadoActual directamente
        resultadoActual = parsedJSON;
        editedClassification = parsedJSON;
        
        // IMPORTANTE: Sincronizar con window.resultadoActual
        window.resultadoActual = parsedJSON;
        window.editedClassification = parsedJSON;
        
        console.log('✅ resultadoActual actualizado y sincronizado:', resultadoActual);
        
        showNotification('✅ JSON guardado correctamente. Ahora puedes descargar el XML con estos datos.', 'success');
        
        // Revalidar campos obligatorios después de guardar
        setTimeout(() => {
            validarYMostrarPanel();
        }, 500);
        
        // Opcional: actualizar la visualización de la tarjeta
        // displayResults(resultadoActual);
        
    } catch (error) {
        console.error('❌ Error parseando JSON:', error);
        showNotification('❌ Error: JSON inválido. Verifica la sintaxis.', 'error');
        
        // Resaltar el error
        editor.style.borderColor = '#dc3545';
        setTimeout(() => {
            editor.style.borderColor = '#667eea';
        }, 2000);
    }
};

// Función para editar campos directamente en la tarjeta
window.editarCampoDirecto = function(fieldKey, fieldLabel, element) {
    console.log('✏️ Editando campo:', fieldKey, 'Label:', fieldLabel);
    
    // Evitar que se abran múltiples editores
    if (element.classList.contains('editing')) {
        console.log('⚠️ Ya está en modo edición');
        return;
    }
    
    element.classList.add('editing');
    
    // Obtener el elemento del valor
    const valueElement = element.querySelector('.detail-value');
    const currentValue = valueElement.dataset.originalValue || valueElement.textContent.trim();
    
    console.log('Valor actual:', currentValue);
    
    // Determinar el tipo de campo
    const isNumeric = fieldKey.includes('dai') || fieldKey.includes('itbis') || fieldKey.includes('valor') || fieldKey.includes('peso') || fieldKey.includes('cantidad');
    const isBoolean = fieldKey.toLowerCase().includes('yn') || 
                      fieldKey.toLowerCase().includes('tempproduct') || 
                      fieldKey.toLowerCase().includes('organic') || 
                      fieldKey.toLowerCase().includes('certificate') ||
                      currentValue === 'true' || currentValue === 'false' ||
                      currentValue === true || currentValue === false;
    
    // Guardar el valor original en el dataset
    valueElement.dataset.originalValue = currentValue;
    
    // Crear input y botones usando DOM en lugar de innerHTML para evitar problemas con caracteres especiales
    const editControls = document.createElement('div');
    editControls.className = 'edit-controls';
    editControls.style.cssText = 'display: flex; gap: 5px; align-items: center; width: 100%;';
    
    // Crear input apropiado según el tipo
    let input;
    if (isBoolean) {
        // Crear select para campos booleanos
        input = document.createElement('select');
        input.id = `edit-input-${fieldKey}`;
        input.style.cssText = 'flex: 1; padding: 8px; border: 2px solid #667eea; border-radius: 4px; font-size: 14px; min-height: 40px; cursor: pointer; background: white;';
        
        // Agregar opciones
        const optionTrue = document.createElement('option');
        optionTrue.value = 'true';
        optionTrue.textContent = 'true';
        
        const optionFalse = document.createElement('option');
        optionFalse.value = 'false';
        optionFalse.textContent = 'false';
        
        input.appendChild(optionTrue);
        input.appendChild(optionFalse);
        
        // Seleccionar el valor actual
        const normalizedValue = String(currentValue).toLowerCase();
        input.value = normalizedValue === 'true' ? 'true' : 'false';
    } else {
        // Crear input/textarea para otros campos
        const inputType = isNumeric ? 'number' : 'text';
        input = document.createElement(isNumeric ? 'input' : 'textarea');
        input.type = inputType;
        input.id = `edit-input-${fieldKey}`;
        input.value = currentValue;
        input.style.cssText = 'flex: 1; padding: 8px; border: 2px solid #667eea; border-radius: 4px; font-size: 14px; min-height: 40px; resize: vertical;';
    }
    
    input.dataset.fieldKey = fieldKey;
    input.dataset.fieldLabel = fieldLabel;
    
    // Solo agregar keypress para inputs/textarea, no para select
    if (!isBoolean) {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                guardarCampoDirecto(fieldKey, fieldLabel, this);
            }
        });
    }
    
    // Botón guardar
    const saveBtn = document.createElement('button');
    saveBtn.innerHTML = '<i class="fas fa-check"></i> Guardar';
    saveBtn.style.cssText = 'background: #667eea; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; white-space: nowrap;';
    saveBtn.onclick = function(e) {
        e.stopPropagation();
        guardarCampoDirecto(fieldKey, fieldLabel, input);
    };
    
    // Botón cancelar
    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = '<i class="fas fa-times"></i>';
    cancelBtn.style.cssText = 'background: #dc3545; color: white; border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer;';
    cancelBtn.onclick = function(e) {
        e.stopPropagation();
        cancelarEdicionDirecta(fieldKey, this);
    };
    
    // Agregar elementos al contenedor
    editControls.appendChild(input);
    editControls.appendChild(saveBtn);
    editControls.appendChild(cancelBtn);
    
    // Reemplazar el contenido
    valueElement.innerHTML = '';
    valueElement.appendChild(editControls);
    
    // Enfocar el input
    setTimeout(() => {
        input.focus();
        input.select();
    }, 50);
};

// Guardar campo editado directamente - MODIFICA EL JSON
window.guardarCampoDirecto = function(fieldKey, fieldLabel, parentElement) {
    console.log('💾 Guardando campo:', fieldKey);
    console.log('📊 JSON ANTES:', JSON.stringify(resultadoActual, null, 2));
    
    const input = document.getElementById(`edit-input-${fieldKey}`);
    if (!input) {
        console.error('❌ Input no encontrado');
        return;
    }
    
    const newValue = input.value;
    console.log('✏️ Nuevo valor:', newValue);
    
    if (!resultadoActual) {
        showNotification('Error: No hay datos', 'error');
        return;
    }
    
    // Función para actualizar campos usando path notation (ej: "factura.productos[0].cantidad")
    function actualizarCampoEnJSON(obj, campo, valor) {
        console.log(`🔍 Intentando actualizar: ${campo} = ${valor}`);
        
        // Si el campo contiene puntos o corchetes, es un path anidado
        if (campo.includes('.') || campo.includes('[')) {
            // Parsear el path (ej: "factura.productos[0].cantidad" -> ["factura", "productos", "0", "cantidad"])
            const parts = campo.split(/\.|\[|\]/).filter(p => p !== '');
            console.log('📍 Path parts:', parts);
            
            let current = obj;
            
            // Navegar hasta el penúltimo nivel
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                const nextPart = parts[i + 1];
                
                // Si el siguiente es un número, el actual debe ser un array
                if (!isNaN(nextPart)) {
                    if (!Array.isArray(current[part])) {
                        console.log(`❌ ${part} no es un array`);
                        return false;
                    }
                    current = current[part];
                } else {
                    // Es un índice de array
                    if (!isNaN(part)) {
                        current = current[parseInt(part)];
                    } else {
                        if (!current[part]) {
                            console.log(`❌ No existe ${part} en el path`);
                            return false;
                        }
                        current = current[part];
                    }
                }
            }
            
            // Actualizar el valor final
            const lastPart = parts[parts.length - 1];
            if (!isNaN(lastPart)) {
                current[parseInt(lastPart)] = valor;
            } else {
                current[lastPart] = valor;
            }
            console.log(`✅ Actualizado en path: ${campo} = ${valor}`);
            return true;
        }
        
        // Búsqueda simple en el nivel actual
        let actualizado = false;
        
        if (obj.hasOwnProperty(campo)) {
            obj[campo] = valor;
            actualizado = true;
            console.log(`✅ Actualizado: ${campo} = ${valor}`);
        }
        
        // Buscar en objetos anidados
        for (let key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                if (actualizarCampoEnJSON(obj[key], campo, valor)) {
                    actualizado = true;
                }
            }
        }
        
        return actualizado;
    }
    
    // Actualizar el campo en resultadoActual
    const updated = actualizarCampoEnJSON(resultadoActual, fieldKey, newValue);
    
    // Si no existía, agregarlo en el nivel raíz
    if (!updated) {
        resultadoActual[fieldKey] = newValue;
        console.log(`➕ Campo agregado en raíz: ${fieldKey} = ${newValue}`);
    }
    
    // Marcar como editado
    resultadoActual.editado = true;
    resultadoActual.fecha_edicion = new Date().toISOString();
    
    // IMPORTANTE: Sincronizar con window.resultadoActual
    window.resultadoActual = resultadoActual;
    
    // También actualizar editedClassification
    if (typeof window.editedClassification !== 'undefined') {
        window.editedClassification = resultadoActual;
    }
    
    console.log('📊 JSON DESPUÉS:', JSON.stringify(resultadoActual, null, 2));
    console.log(`🔍 Verificación: resultadoActual.${fieldKey} =`, resultadoActual[fieldKey]);
    console.log('📊 Sincronizado con window.resultadoActual');
    
    // Actualizar el visor JSON completo
    const jsonViewerDisplay = document.getElementById('json-viewer-display');
    if (jsonViewerDisplay) {
        jsonViewerDisplay.textContent = JSON.stringify(resultadoActual, null, 2);
    }
    
    // Actualizar la visualización en pantalla
    const detailItem = parentElement.closest('.detail-item');
    if (detailItem) {
        const valueElement = detailItem.querySelector('.detail-value');
        if (valueElement) {
            valueElement.innerHTML = escapeHtml(newValue);
            valueElement.dataset.originalValue = newValue;
        }
        detailItem.classList.remove('editing');
    }
    
    showNotification(`✅ ${fieldLabel} actualizado`, 'success');
    console.log('===========================================');
    
    // Limpiar alerta inline del campo editado si existe
    const fieldElement = parentElement.closest('.detail-item');
    if (fieldElement) {
        const inlineAlert = fieldElement.querySelector('.field-inline-alert');
        if (inlineAlert) {
            inlineAlert.remove();
        }
        fieldElement.classList.remove('has-error');
    }
    
    // Revalidar campos obligatorios después de editar
    setTimeout(() => {
        validarYMostrarPanel();
    }, 500);
};

// Cancelar edición directa
window.cancelarEdicionDirecta = function(fieldKey, buttonElement) {
    console.log('❌ Cancelando edición de:', fieldKey);
    
    // Encontrar el detail-item padre
    const detailItem = buttonElement.closest('.detail-item');
    if (!detailItem) {
        console.error('❌ No se encontró el detail-item');
        return;
    }
    
    // Remover clase de edición
    detailItem.classList.remove('editing');
    
    // Restaurar el valor original
    const valueElement = detailItem.querySelector('.detail-value');
    if (valueElement) {
        const originalValue = valueElement.dataset.originalValue || '';
        valueElement.innerHTML = escapeHtml(originalValue);
        console.log('✅ Valor restaurado:', originalValue);
    }
};

// Generar device fingerprint (debe ser persistente entre recargas)
function getDeviceFingerprint() {
    // Usar localStorage para mantener el mismo fingerprint
    let fingerprint = localStorage.getItem('deviceFingerprint');
    
    if (!fingerprint) {
        const nav = navigator;
        const screen = window.screen;
        
        const components = [
            nav.userAgent,
            nav.language,
            screen.colorDepth,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset()
        ];
        
        // Crear un hash consistente (sin timestamp)
        const str = components.join('|');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        fingerprint = 'fp_' + Math.abs(hash).toString(36);
        localStorage.setItem('deviceFingerprint', fingerprint);
    }
    
    return fingerprint;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function performLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btnLogin = document.getElementById('btn-login');
    const errorDiv = document.getElementById('login-error');
    
    if (!email || !password) {
        showLoginError('Por favor, ingresa tu correo y contraseña.');
        return;
    }
    
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando sesión...';
    errorDiv.style.display = 'none';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': getDeviceFingerprint()
            },
            body: JSON.stringify({
                correo: email,
                contrasena: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            authToken = data.token;
            userInfo = data;
            localStorage.setItem('authToken', data.token);
            updateUserInterface(data);
        } else {
            showLoginError(data.mensaje || 'Error al iniciar sesión.');
        }
    } catch (error) {
        console.error('Error en login:', error);
        showLoginError('Error de conexión. Intenta nuevamente.');
    } finally {
        btnLogin.disabled = false;
        btnLogin.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
    }
}

function showLoginError(message) {
    const errorDiv = document.getElementById('login-error');
    errorDiv.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    errorDiv.style.display = 'block';
}

async function logout() {
    if (authToken) {
        try {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Error cerrando sesión:', error);
        }
    }
    
    // Limpiar sesión
    limpiarSesion();
    
    // Mostrar modal de login
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.style.display = 'flex';
    }
    
    mostrarNotificacion('Sesión cerrada correctamente', 'success');
}

// Event listeners para el login
document.addEventListener('DOMContentLoaded', function() {
    // Acceso directo sin login
    // hideLoginModal(); // Comentado - función no existe
    // showMainInterface(); // Comentado - función no existe
    
    console.log('✅ DOM cargado - Script inicializado');
});

// Función para formatear códigos HS con el formato arancelario estándar
function formatearCodigoHS(codigo) {
    if (!codigo) return 'N/A';
    
    // Convertir a string y limpiar
    let codigoStr = String(codigo).replace(/\D/g, ''); // Solo números
    
    // Pad con ceros si es necesario para llegar a 8 dígitos
    codigoStr = codigoStr.padEnd(8, '0');
    
    // Formatear como XXXX.XX.XX
    if (codigoStr.length >= 6) {
        return `${codigoStr.substring(0, 4)}.${codigoStr.substring(4, 6)}.${codigoStr.substring(6, 8)}`;
    } else if (codigoStr.length >= 4) {
        return `${codigoStr.substring(0, 4)}.${codigoStr.substring(4)}`;
    } else {
        return codigoStr;
    }
}

// Verificar conectividad al cargar
async function verificarConexion() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            mode: 'cors',
            cache: 'no-cache'
        });
        
        if (response.ok) {
            console.log('✅ Conexión con backend establecida');
            return true;
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showError('No se puede conectar con el servidor. Asegúrate de que el backend esté ejecutándose en el puerto 3000.');
        return false;
    }
}

// Funciones de utilidad
// Cargar historial de clasificaciones
async function cargarHistorial() {
    if (!authToken) {
        console.log('⚠️ No hay token, no se puede cargar historial');
        const historialLista = document.getElementById('historial-lista');
        if (historialLista) {
            historialLista.innerHTML = '<p style="text-align: center; padding: 40px;">Inicia sesión para ver tu historial de clasificaciones</p>';
        }
        return;
    }
    
    try {
        console.log('📡 Cargando historial...');
        
        const response = await fetchConAuth(`${API_BASE_URL}/api/historial?limite=50`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            // Los errores 401 ya son manejados por fetchConAuth
            throw new Error('Error al cargar historial');
        }
        
        const data = await response.json();
        console.log('✅ Historial cargado:', data);
        console.log('📊 Total de clasificaciones recibidas:', data.clasificaciones?.length || 0);
        console.log('📋 Paginación:', data.paginacion);
        
        const historialLista = document.getElementById('historial-lista');
        if (!historialLista) {
            console.warn('⚠️ No se encontró el contenedor de historial');
            return;
        }
        
        if (!data.success || !data.clasificaciones || data.clasificaciones.length === 0) {
            historialLista.innerHTML = '<p style="text-align: center; padding: 40px;">No hay clasificaciones en tu historial aún. ¡Realiza tu primera clasificación!</p>';
            return;
        }
        
        // Generar HTML para cada clasificación
        const historialHTML = data.clasificaciones.map(clf => {
            const fecha = new Date(clf.fecha_creacion).toLocaleString('es-ES');
            const tipo = clf.tipo_operacion === 'import' ? 'Importación' : 'Exportación';
            const productos = clf.productos && clf.productos.length > 0 ? clf.productos.length : 0;
            const tokens = clf.tokens_consumidos ? clf.tokens_consumidos.toLocaleString() : 'N/A';
            
            return `
                <div class="historial-item" style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: white; transition: box-shadow 0.2s;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 8px 0; color: #2563eb;">
                                <i class="fas fa-file-alt"></i> ${clf.nombre_archivo || 'Clasificación por texto'}
                            </h4>
                            <p style="margin: 4px 0; color: #666; font-size: 0.9rem;">
                                <i class="fas fa-calendar"></i> ${fecha}
                                <span style="margin-left: 15px;"><i class="fas fa-tag"></i> ${tipo}</span>
                            </p>
                            <p style="margin: 8px 0 0 0; color: #888; font-size: 0.85rem;">
                                <i class="fas fa-box"></i> ${productos} producto${productos !== 1 ? 's' : ''}
                                <span style="margin-left: 15px;"><i class="fas fa-coins"></i> ${tokens} tokens</span>
                            </p>
                        </div>
                        <div style="text-align: right;">
                            <button onclick="verDetalleClasificacion('${clf.clasificacion_id}')" class="btn-secondary" style="font-size: 0.85rem; padding: 6px 12px;">
                                <i class="fas fa-eye"></i> Ver detalles
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        historialLista.innerHTML = `
            <div style="margin-bottom: 20px;">
                <p style="color: #666;">Total de clasificaciones: <strong>${data.paginacion.total}</strong></p>
            </div>
            ${historialHTML}
        `;
        
    } catch (error) {
        console.error('❌ Error al cargar historial:', error);
        const historialLista = document.getElementById('historial-lista');
        if (historialLista) {
            historialLista.innerHTML = '<p style="text-align: center; padding: 40px; color: #dc2626;">Error al cargar el historial. Por favor, intenta nuevamente.</p>';
        }
    }
}

// Función para ver detalle de una clasificación
async function verDetalleClasificacion(clasificacionId) {
    console.log('📖 Cargando detalle de clasificación:', clasificacionId);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/historial/${clasificacionId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar detalle');
        }
        
        const data = await response.json();
        console.log('✅ Detalle cargado:', data);
        
        if (!data.success || !data.clasificacion) {
            throw new Error('Clasificación no encontrada');
        }
        
        const clf = data.clasificacion;
        console.log('📋 Estructura de clasificación:', JSON.stringify(clf, null, 2));
        
        // Guardar resultado en variable global para edición y exportación
        // Buscar productos en todas las posibles ubicaciones
        let productosEncontrados = [];
        
        // Intentar obtener productos de varias fuentes
        if (clf.resultado?.ImpDeclarationProduct?.length > 0) {
            productosEncontrados = clf.resultado.ImpDeclarationProduct;
            console.log('✅ Productos encontrados en clf.resultado.ImpDeclarationProduct');
        } else if (clf.resultado?.productos?.length > 0) {
            productosEncontrados = clf.resultado.productos;
            console.log('✅ Productos encontrados en clf.resultado.productos');
        } else if (clf.productos?.length > 0) {
            productosEncontrados = clf.productos;
            console.log('✅ Productos encontrados en clf.productos');
        } else if (Array.isArray(clf.resultado) && clf.resultado.length > 0) {
            productosEncontrados = clf.resultado;
            console.log('✅ Productos encontrados: clf.resultado es un array');
        }
        
        console.log('📦 Productos encontrados:', productosEncontrados.length);
        
        // Construir resultadoActual con estructura correcta
        if (clf.resultado && typeof clf.resultado === 'object' && !Array.isArray(clf.resultado)) {
            resultadoActual = {
                ...clf.resultado,
                ImpDeclarationProduct: productosEncontrados
            };
        } else {
            resultadoActual = {
                ImpDeclarationProduct: productosEncontrados,
                productos: productosEncontrados,
                tipo_operacion: clf.tipo_operacion,
                fecha_creacion: clf.fecha_creacion,
                nombre_archivo: clf.nombre_archivo
            };
        }
        
        // IMPORTANTE: Sincronizar con window.resultadoActual
        window.resultadoActual = resultadoActual;
        
        clasificacionIdActual = clasificacionId;
        console.log('📦 resultadoActual final:', resultadoActual);
        
        // Crear modal para mostrar detalles
        const fecha = new Date(clf.fecha_creacion).toLocaleString('es-ES');
        const tipo = clf.tipo_operacion === 'import' ? 'Importación' : 'Exportación';
        const tokens = clf.tokens_consumidos ? clf.tokens_consumidos.toLocaleString() : 'N/A';
        
        // Generar HTML para productos con TODOS los detalles disponibles
        let productosHTML = '';
        
        // Usar productos del resultado completo si están disponibles
        const productosData = clf.resultado?.ImpDeclarationProduct || clf.productos || [];
        
        if (productosData && productosData.length > 0) {
            productosHTML = productosData.map((prod, idx) => {
                // Extraer todos los campos del producto
                const campos = [];
                const camposExcluidos = ['_index', '_isManual'];
                
                // Mapeo de etiquetas
                const etiquetas = {
                    'HSCode': 'Código HS', 'ProductName': 'Nombre', 'descripcion_comercial': 'Descripción',
                    'Qty': 'Cantidad', 'FOBValue': 'Valor FOB', 'NetWeight': 'Peso Neto',
                    'OriginCountryCode': 'Origen', 'Brand': 'Marca', 'Model': 'Modelo',
                    'UnitMeasure': 'Unidad', 'DAI': 'DAI %', 'ITBIS': 'ITBIS %'
                };
                
                for (const [key, value] of Object.entries(prod)) {
                    if (value && !camposExcluidos.includes(key) && typeof value !== 'object') {
                        campos.push({
                            label: etiquetas[key] || key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim(),
                            value: value
                        });
                    }
                }
                
                const hsCode = prod.HSCode || prod.hs || 'N/A';
                const nombre = prod.ProductName || prod.descripcion_comercial || prod.item_name || `Producto ${idx + 1}`;
                
                return `
                <div style="border: 2px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); transition: all 0.3s;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;">${idx + 1}</span>
                            <h4 style="margin: 0; color: #1f2937; font-size: 15px; font-weight: 600;">${escapeHtml(nombre).substring(0, 50)}${nombre.length > 50 ? '...' : ''}</h4>
                        </div>
                        <span style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; letter-spacing: 0.5px;">
                            ${hsCode}
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; font-size: 13px;">
                        ${campos.slice(0, 8).map(c => `
                            <div style="background: white; padding: 8px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                                <div style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 2px;">${escapeHtml(c.label)}</div>
                                <div style="color: #1e293b; font-weight: 500;">${escapeHtml(String(c.value))}</div>
                            </div>
                        `).join('')}
                    </div>
                    ${campos.length > 8 ? `<p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b; text-align: center;">+ ${campos.length - 8} campos más... (Click en Editar para ver todos)</p>` : ''}
                </div>
            `;
            }).join('');
        } else {
            productosHTML = '<p style="color: #666; text-align: center; padding: 20px;">No hay productos clasificados</p>';
        }
        
        // Crear y mostrar modal mejorado
        const modal = document.createElement('div');
        modal.id = 'modal-detalle-historial';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;';
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 900px; width: 100%; max-height: 90vh; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column;">
                <div style="padding: 24px; border-bottom: 2px solid #e5e7eb; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: white; font-size: 22px; font-weight: 600;">
                            <i class="fas fa-file-invoice"></i> Detalle de Clasificación
                        </h3>
                        <button onclick="cerrarModalDetalle()" style="background: rgba(255,255,255,0.2); border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 24px; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; transition: all 0.3s;">×</button>
                    </div>
                </div>
                
                <div style="flex: 1; overflow-y: auto; padding: 24px;">
                    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
                            <div>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Archivo</p>
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">${clf.nombre_archivo}</p>
                            </div>
                            <div>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Fecha</p>
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">${fecha}</p>
                            </div>
                            <div>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Tipo</p>
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">
                                    ${tipo === 'Importación' ? '📥' : '📤'} ${tipo}
                                </p>
                            </div>
                            <div>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Tokens</p>
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">⚡ ${tokens}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <h4 style="margin: 0; color: #1f2937; font-size: 18px; font-weight: 600;">
                                Productos Clasificados (${clf.productos?.length || 0})
                            </h4>
                            <div style="display: flex; gap: 8px;">
                                ${clf.editado ? '<span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">✏️ Editado</span>' : ''}
                                ${clf.exportado ? '<span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">📤 Exportado</span>' : ''}
                            </div>
                        </div>
                        ${productosHTML}
                    </div>
                </div>
                
                <div style="padding: 20px; border-top: 2px solid #e5e7eb; background: #f9fafb; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                    <button onclick="editarResultadoHistorial('${clasificacionId}')" style="background: #f59e0b; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button onclick="descargarXMLHistorial('${clasificacionId}')" style="background: #10b981; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <i class="fas fa-file-code"></i> Descargar XML
                    </button>
                    <button onclick="cerrarModalDetalle()" style="background: #6b7280; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px; transition: all 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <i class="fas fa-times"></i> Cerrar
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Cerrar al hacer clic fuera del modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                cerrarModalDetalle();
            }
        });
        
        // Añadir estilos hover para los botones
        const buttons = modal.querySelectorAll('button[style*="transition"]');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'translateY(-2px)';
                btn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translateY(0)';
                btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            });
        });
        
    } catch (error) {
        console.error('❌ Error al cargar detalle:', error);
        showNotification('Error al cargar los detalles de la clasificación', 'error');
    }
}

// Variables globales para edición desde historial
let clasificacionIdActual = null;

// Función para cerrar el modal de detalle
function cerrarModalDetalle() {
    const modal = document.getElementById('modal-detalle-historial');
    if (modal) {
        modal.remove();
    }
}

// Función para editar resultado desde historial
async function editarResultadoHistorial(clasificacionId) {
    console.log('✏️ Editando resultado de clasificación:', clasificacionId);
    console.log('📦 resultadoActual antes de editar:', resultadoActual);
    
    // Si resultadoActual está vacío o sin productos, recargar desde servidor
    const tieneProductos = resultadoActual && 
        (resultadoActual.ImpDeclarationProduct?.length > 0 || 
         resultadoActual.productos?.length > 0 ||
         (Array.isArray(resultadoActual) && resultadoActual.length > 0));
    
    if (!tieneProductos) {
        console.log('⚠️ resultadoActual vacío, recargando desde servidor...');
        try {
            const response = await fetch(`${API_BASE_URL}/api/historial/${clasificacionId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.clasificacion) {
                    const clf = data.clasificacion;
                    
                    // Buscar productos en todas las ubicaciones posibles
                    let productos = [];
                    if (clf.resultado?.ImpDeclarationProduct?.length > 0) {
                        productos = clf.resultado.ImpDeclarationProduct;
                    } else if (clf.resultado?.productos?.length > 0) {
                        productos = clf.resultado.productos;
                    } else if (clf.productos?.length > 0) {
                        productos = clf.productos;
                    } else if (Array.isArray(clf.resultado)) {
                        productos = clf.resultado;
                    }
                    
                    resultadoActual = {
                        ImpDeclarationProduct: productos,
                        productos: productos,
                        tipo_operacion: clf.tipo_operacion,
                        nombre_archivo: clf.nombre_archivo
                    };
                    
                    // IMPORTANTE: Sincronizar con window.resultadoActual
                    window.resultadoActual = resultadoActual;
                    
                    console.log('✅ Datos recargados desde servidor:', resultadoActual);
                }
            }
        } catch (error) {
            console.error('❌ Error recargando datos:', error);
        }
    }
    
    if (!resultadoActual || (!resultadoActual.ImpDeclarationProduct?.length && !resultadoActual.productos?.length)) {
        // Aunque no haya productos, permitir edición si hay otros datos
        if (resultadoActual && Object.keys(resultadoActual).length > 2) {
            console.log('⚠️ Sin productos pero con datos de declaración, permitiendo edición');
            // Asegurar que tenga arrays vacíos para que funcione el sistema
            resultadoActual.ImpDeclarationProduct = resultadoActual.ImpDeclarationProduct || [];
            resultadoActual.productos = resultadoActual.productos || [];
        } else {
            showNotification('No hay productos para editar en esta clasificación', 'error');
            return;
        }
    }
    
    // Cerrar modal de detalle
    cerrarModalDetalle();
    
    // IMPORTANTE: Guardar copia del resultado antes de cambiar tab
    // porque showTab llama a hideResults() que pone resultadoActual = null
    const resultadoParaMostrar = JSON.parse(JSON.stringify(resultadoActual));
    
    // Cambiar a la pestaña de clasificación
    showTab('clasificar');
    
    // Pequeño delay para asegurar que el DOM esté listo
    setTimeout(() => {
        // Restaurar y mostrar resultado con el nuevo formato moderno
        resultadoActual = resultadoParaMostrar;
        // IMPORTANTE: Sincronizar con window.resultadoActual
        window.resultadoActual = resultadoActual;
        showResults(resultadoActual, null);
        
        // Scroll a resultados
        const resultsDiv = document.getElementById('results');
        if (resultsDiv) {
            resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        // Mensaje según si hay productos o no
        if (resultadoActual.ImpDeclarationProduct?.length > 0 || resultadoActual.productos?.length > 0) {
            showNotification('Resultado cargado para edición. Puedes modificar los campos y exportar nuevamente.', 'success');
        } else {
            showNotification('Esta clasificación no tiene productos. Puedes añadir productos manualmente usando el botón "Añadir Producto".', 'info');
        }
    }, 100);
}

// Función para descargar XML desde historial
function descargarXMLHistorial(clasificacionId) {
    if (!resultadoActual) {
        showNotification('No hay resultado para exportar', 'error');
        return;
    }
    
    console.log('📥 Descargando XML de clasificación:', clasificacionId);
    
    try {
        const xml = convertToXML(resultadoActual, 'ImportDUA');
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clasificacion_${clasificacionId}_${Date.now()}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('✅ XML descargado exitosamente', 'success');
    } catch (error) {
        console.error('Error descargando XML:', error);
        showNotification('Error al generar XML', 'error');
    }
}

// Función para descargar JSON desde historial
function descargarJSONHistorial(clasificacionId) {
    if (!resultadoActual) {
        showNotification('No hay resultado para exportar', 'error');
        return;
    }
    
    console.log('📥 Descargando JSON de clasificación:', clasificacionId);
    
    try {
        const json = JSON.stringify(resultadoActual, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clasificacion_${clasificacionId}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('✅ JSON descargado exitosamente', 'success');
    } catch (error) {
        console.error('Error descargando JSON:', error);
        showNotification('Error al generar JSON', 'error');
    }
}

function showTab(tabName) {
    // Ocultar todos los tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    
    // Ocultar todos los botones de tab
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mostrar el tab seleccionado (formato consistente: tab-{name})
    const selectedTab = document.getElementById(`tab-${tabName}`);
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }
    
    // Activar el botón correspondiente por texto
    const buttons = document.querySelectorAll('.tab-button');
    buttons.forEach(btn => {
        const onClick = btn.getAttribute('onclick');
        if (onClick && onClick.includes(`'${tabName}'`)) {
            btn.classList.add('active');
        }
    });
    
    // Cargar datos específicos del tab
    if (tabName === 'planes') {
        loadPlanesData();
        updatePlanInfo();
    } else if (tabName === 'historial') {
        // Cargar historial si el usuario está autenticado
        cargarHistorial();
    } else if (tabName === 'configuracion') {
        // Cargar configuración y top códigos HS
        if (typeof cargarDefaults === 'function') {
            cargarDefaults();
        }
        if (typeof cargarTopCodigosHS === 'function') {
            cargarTopCodigosHS();
        }
    }
    
    // Limpiar resultados y errores
    hideResults();
    hideError();
}

function showLoading() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'block';
    hideResults();
    hideError();
}

function hideLoading() {
    const loadingDiv = document.getElementById('loading');
    if (loadingDiv) loadingDiv.style.display = 'none';
}

function showResults(data, tokensInfo = null) {
    hideLoading();
    resultadoActual = data;
    // IMPORTANTE: Sincronizar con window.resultadoActual
    window.resultadoActual = data;
    console.log('📥 Clasificación recibida y guardada en memoria:', resultadoActual);
    
    const resultsDiv = document.getElementById('results');
    const contentDiv = document.getElementById('results-content');
    
    // Limpiar contenido anterior
    contentDiv.innerHTML = '';
    
    // Agregar información de tokens si está disponible
    if (tokensInfo && (tokensInfo.input_tokens || tokensInfo.output_tokens || tokensInfo.total_tokens)) {
        const inputTokens = tokensInfo.input_tokens || 0;
        const outputTokens = tokensInfo.output_tokens || 0;
        const totalTokens = tokensInfo.total_tokens || 0;
        
        const tokensCard = document.createElement('div');
        tokensCard.className = 'tokens-info-card';
        tokensCard.innerHTML = `
            <div class="tokens-header">
                <i class="fas fa-coins"></i>
                <span>Tokens Consumidos en esta Operación</span>
            </div>
            <div class="tokens-details">
                <div class="token-item">
                    <span class="token-label">Entrada:</span>
                    <span class="token-value">${inputTokens.toLocaleString()}</span>
                </div>
                <div class="token-item">
                    <span class="token-label">Salida:</span>
                    <span class="token-value">${outputTokens.toLocaleString()}</span>
                </div>
                <div class="token-item total">
                    <span class="token-label">Total:</span>
                    <span class="token-value">${totalTokens.toLocaleString()}</span>
                </div>
            </div>
        `;
        contentDiv.appendChild(tokensCard);
    }
    
    // NUEVO: Usar el sistema moderno de visualización de productos
    // Verificar primero que data no sea null
    if (!data) {
        console.error('❌ showResults llamado con data null');
        contentDiv.innerHTML = '<p style="text-align: center; color: #dc2626; padding: 20px;">No hay datos para mostrar</p>';
        resultsDiv.style.display = 'block';
        return;
    }
    
    // Verificar si hay productos en la estructura
    const tieneProductos = (data.ImpDeclarationProduct && data.ImpDeclarationProduct.length > 0) || 
                          (data.productos && data.productos.length > 0) || 
                          (Array.isArray(data) && data.length > 0) ||
                          data.HSCode || data.hs;
    
    // Usar el nuevo sistema de renderizado si existe la función
    if (typeof renderizarProductos === 'function') {
        // Asegurar que data tenga arrays de productos (aunque estén vacíos)
        if (!data.ImpDeclarationProduct) data.ImpDeclarationProduct = [];
        if (!data.productos) data.productos = [];
        
        // Usar el nuevo sistema de renderizado moderno
        renderizarProductos(data);
        
        // Si no hay productos, mostrar mensaje informativo
        if (!tieneProductos) {
            const grid = document.getElementById('products-grid');
            if (grid) {
                const msgDiv = document.createElement('div');
                msgDiv.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 30px; background: #fef3c7; border-radius: 12px; border: 2px dashed #f59e0b; margin-bottom: 10px;';
                msgDiv.innerHTML = `
                    <i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #f59e0b; margin-bottom: 15px; display: block;"></i>
                    <h4 style="margin: 0 0 10px 0; color: #92400e;">Esta clasificación no tiene productos</h4>
                    <p style="margin: 0; color: #78350f;">La clasificación original falló o no generó productos.<br>Puedes añadir productos manualmente usando el botón de abajo.</p>
                `;
                grid.insertBefore(msgDiv, grid.firstChild);
            }
        }
    } else {
        // Fallback al sistema anterior
        if (Array.isArray(data)) {
            data.forEach((item, index) => {
                contentDiv.appendChild(createResultCard(item, index + 1));
            });
        } else {
            contentDiv.appendChild(createResultCard(data));
        }
        
        // Mostrar botones de acción del sistema antiguo
        showActionButtons();
    }
    
    resultsDiv.style.display = 'block';
    
    // Validar y mostrar panel de campos faltantes si es necesario
    setTimeout(() => {
        validarYMostrarPanel();
    }, 500);
}

function showActionButtons() {
    // Eliminar botones existentes
    const existingActions = document.getElementById('results-actions');
    if (existingActions) {
        existingActions.remove();
    }
    
    // Crear nuevo contenedor de acciones simple
    const actionsContainer = document.createElement('div');
    actionsContainer.id = 'results-actions';
    actionsContainer.style.cssText = 'margin: 20px 0; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
    
    actionsContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <i class="fas fa-hand-pointer"></i>
                <strong>Haz clic en cualquier campo de arriba para editarlo directamente</strong>
            </div>
        </div>
        <div style="text-align: center;">
            <button onclick="window.exportarXML()" style="
                background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
                color: white;
                border: none;
                padding: 15px 30px;
                font-size: 18px;
                border-radius: 8px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(17, 153, 142, 0.4);
                transition: all 0.3s;
                font-weight: bold;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                <i class="fas fa-download"></i> DESCARGAR XML
            </button>
        </div>
    `;
    
    // Agregar al DOM
    const resultsDiv = document.getElementById('results');
    resultsDiv.appendChild(actionsContainer);
    
    console.log('✅ Editor JSON agregado correctamente');
}

function createResultCard(data, index = null) {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    // Si solo es código HS
    if (typeof data === 'string' || (data.hs && Object.keys(data).length === 1)) {
        const hsCode = typeof data === 'string' ? data : data.hs;
        const hsFormateado = formatearCodigoHS(hsCode);
        card.innerHTML = `
            <div class="result-header">
                <div class="hs-code">${hsFormateado}</div>
                ${index ? `<span class="product-number">Producto ${index}</span>` : ''}
            </div>
            <div class="simple-result">
                <i class="fas fa-check-circle"></i>
                <p>Clasificación simplificada - Solo código HS</p>
                <small>Haz clic en los botones de abajo para editar o exportar XML</small>
            </div>
        `;
        return card;
    }
    
    // Mapear campos con diferentes nombres
    const mappedData = {
        hs: data.hs,
        descripcion_arancelaria: data.descripcion_arancelaria || data.description,
        descripcion_comercial: data.descripcion_comercial || data.item_name,
        pais_origen: data.pais_origen || data.country_of_origin,
        pais_procedencia: data.pais_procedencia || data.country_of_origin,
        valor_unitario: data.valor_unitario || data.value,
        valor_total: data.valor_total || data.total_value,
        unidad_medida_estadistica: data.unidad_medida_estadistica || data.unit_of_measure,
        cantidad_total: data.cantidad_total || data.quantity,
        peso_neto: data.peso_neto || data.net_weight,
        peso_bruto: data.peso_bruto || data.gross_weight,
        moneda: data.moneda || data.currency,
        tipo_operacion: data.tipo_operacion || data.operation_type,
        regimen_aduanero: data.regimen_aduanero || data.customs_regime,
        incoterm: data.incoterm,
        partidas_alternativas_consideradas: data.partidas_alternativas_consideradas || data.alternate_hs_codes,
        motivo_descarte_alternativas: data.motivo_descarte_alternativas,
        citas_legales: data.citas_legales
    };
    
    // Resultado completo
    const {
        hs,
        descripcion_arancelaria,
        descripcion_comercial,
        pais_origen,
        pais_procedencia,
        valor_unitario,
        valor_total,
        unidad_medida_estadistica,
        cantidad_total,
        peso_neto,
        peso_bruto,
        moneda,
        tipo_operacion,
        regimen_aduanero,
        incoterm,
        partidas_alternativas_consideradas,
        motivo_descarte_alternativas,
        citas_legales
    } = mappedData;
    
    card.innerHTML = `
        <!-- Header con código HS principal -->
        <div class="result-header-enhanced">
            <div class="hs-section">
                <div class="hs-code-large">${formatearCodigoHS(hs)}</div>
                <div class="hs-label">Código Arancelario</div>
            </div>
            <div class="confidence-section">

                ${index ? `<div class="product-number">Producto ${index}</div>` : ''}
            </div>
        </div>
        
        <!-- Descripción Arancelaria -->
        ${descripcion_arancelaria ? `
            <div class="description-section">
                <h4><i class="fas fa-book"></i> Descripción Arancelaria Oficial</h4>
                <div class="description-text">${descripcion_arancelaria}</div>
            </div>
        ` : ''}
        
        <!-- Información Comercial (dinámica) - MEJORADO -->
        ${(() => {
            // Función para extraer todos los campos del objeto recursivamente
            const extractAllFields = (obj, prefix = '') => {
                const fields = [];
                
                if (!obj || typeof obj !== 'object') return fields;
                
                // Mapeo de nombres técnicos a etiquetas user-friendly
                const labelMap = {
                    'hs': 'Código HS',
                    'descripcion_arancelaria': 'Descripción Arancelaria',
                    'descripcion_comercial': 'Descripción Comercial',
                    'item_name': 'Nombre del Producto',
                    'product_name': 'Producto',
                    'pais_origen': 'País de Origen',
                    'country_of_origin': 'País de Origen',
                    'pais_procedencia': 'País de Procedencia',
                    'valor_unitario': 'Valor Unitario (FOB)',
                    'valor_total': 'Valor Total',
                    'value': 'Valor',
                    'total_value': 'Valor Total',
                    'unidad_medida_estadistica': 'Unidad de Medida',
                    'unit_of_measure': 'Unidad',
                    'cantidad_total': 'Cantidad Total',
                    'quantity': 'Cantidad',
                    'peso_neto': 'Peso Neto',
                    'peso_bruto': 'Peso Bruto',
                    'net_weight': 'Peso Neto',
                    'gross_weight': 'Peso Bruto',
                    'moneda': 'Moneda',
                    'currency': 'Moneda',
                    'tipo_operacion': 'Tipo de Operación',
                    'operation_type': 'Tipo de Operación',
                    'regimen_aduanero': 'Régimen Aduanero',
                    'customs_regime': 'Régimen Aduanero',
                    'incoterm': 'Incoterm',
                    'marca': 'Marca',
                    'brand': 'Marca',
                    'modelo': 'Modelo',
                    'model': 'Modelo',
                    'ano': 'Año',
                    'year': 'Año',
                    'material': 'Material',
                    'especificacion': 'Especificación',
                    'specification': 'Especificación',
                    'uso': 'Uso',
                    'use': 'Uso',
                    'aplicacion': 'Aplicación',
                    'observaciones': 'Observaciones',
                    'notes': 'Notas',
                    'partidas_alternativas_consideradas': 'Partidas Alternativas',
                    'alternate_hs_codes': 'Códigos HS Alternativos',
                    'motivo_descarte_alternativas': 'Motivo de Descarte',
                    'citas_legales': 'Referencias Legales',
                    'legal_references': 'Referencias Legales',
                    'dai': 'DAI (%)',
                    'itbis': 'ITBIS (%)',
                    'arancel': 'Arancel (%)',
                    'impuesto': 'Impuesto (%)'
                };
                
                // Campos a excluir de la visualización
                const excludeFields = [
                    'fundamentacion_legal',
                    'legal_basis',
                    'nivel_confianza_clasificacion',
                    'confidence',
                    'descripcion_items',
                    'item_description',
                    'tokens_info',
                    'success',
                    'mensaje'
                ];
                
                for (const [key, value] of Object.entries(obj)) {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    
                    // Saltar campos excluidos
                    if (excludeFields.includes(key)) continue;
                    
                    // Si el valor es null o undefined, saltar
                    if (value === null || value === undefined) continue;
                    
                    // Si es un objeto anidado (pero no un array)
                    if (typeof value === 'object' && !Array.isArray(value)) {
                        // Recursivamente extraer campos del objeto anidado
                        fields.push(...extractAllFields(value, fullKey));
                    }
                    // Si es un array simple de valores primitivos
                    else if (Array.isArray(value) && value.length > 0 && typeof value[0] !== 'object') {
                        fields.push({
                            key: fullKey,
                            label: labelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                            value: value.join(', '),
                            isArray: true
                        });
                    }
                    // Si es un array de objetos, procesar cada elemento con su índice
                    else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
                        value.forEach((item, index) => {
                            fields.push(...extractAllFields(item, `${fullKey}[${index}]`));
                        });
                    }
                    // Valor primitivo
                    else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                        // Formatear el valor
                        let displayValue = value;
                        if (typeof value === 'number') {
                            // Si parece un código HS (número largo)
                            if (key === 'hs' || key.includes('hs_')) {
                                displayValue = formatearCodigoHS(String(value));
                            } else if (key.includes('valor') || key.includes('value') || key.includes('precio')) {
                                displayValue = `$${value.toFixed(2)}`;
                            } else {
                                displayValue = value;
                            }
                        }
                        
                        fields.push({
                            key: fullKey,
                            label: labelMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                            value: displayValue,
                            isPrimitive: true
                        });
                    }
                }
                
                return fields;
            };
            
            // Función para detectar y agrupar campos por arrays
            function groupFieldsByArray(fields) {
                const grouped = {
                    root: [],  // Campos que no pertenecen a arrays
                    arrays: {} // Campos agrupados por array
                };
                
                fields.forEach(field => {
                    const arrayMatch = field.key.match(/^([^\[]+)\[(\d+)\]\.(.+)$/);
                    if (arrayMatch) {
                        const [, arrayPath, index, fieldName] = arrayMatch;
                        if (!grouped.arrays[arrayPath]) {
                            grouped.arrays[arrayPath] = {};
                        }
                        if (!grouped.arrays[arrayPath][index]) {
                            grouped.arrays[arrayPath][index] = [];
                        }
                        grouped.arrays[arrayPath][index].push({
                            ...field,
                            arrayPath,
                            arrayIndex: parseInt(index),
                            fieldName
                        });
                    } else {
                        grouped.root.push(field);
                    }
                });
                
                return grouped;
            }
            
            // Extraer todos los campos del objeto data
            const allFields = extractAllFields(data);
            
            if (allFields.length === 0) {
                return `<div class="info-grid">
                    <div class="info-section">
                        <h4><i class="fas fa-exclamation-triangle"></i> Sin Información Estructurada</h4>
                        <div class="detail-grid">
                            <div class="detail-item">
                                <div class="detail-label">Respuesta Completa</div>
                                <div class="detail-value">
                                    <pre style="white-space:pre-wrap;max-height:300px;overflow:auto;background:#f1f5f9;padding:1rem;border-radius:8px;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }
            
            // Agrupar campos
            const groupedFields = groupFieldsByArray(allFields);
            
            // Función para categorizar un campo
            function categorizeField(field) {
                const label = field.label.toLowerCase();
                const key = field.key.toLowerCase();
                
                if (label.includes('código') || label.includes('hs') || key.includes('clasificacion') || 
                    label.includes('descripción arancelaria') || label.includes('subpartida') || label.includes('partida')) {
                    return 'Código y Descripción';
                } else if (label.includes('nombre') || label.includes('producto') || label.includes('marca') || 
                           label.includes('modelo') || label.includes('especificación') || label.includes('material') ||
                           label.includes('descripcion') && !label.includes('arancelaria')) {
                    return 'Información del Producto';
                } else if (label.includes('valor') || label.includes('cantidad') || label.includes('peso') || 
                           label.includes('precio') || label.includes('moneda') || label.includes('unidad') ||
                           label.includes('subtotal')) {
                    return 'Valores y Cantidades';
                } else if (label.includes('país') || label.includes('origen') || label.includes('procedencia') ||
                           label.includes('direccion') || label.includes('telefono')) {
                    return 'Ubicación';
                } else if (label.includes('dai') || label.includes('itbis') || label.includes('arancel') || 
                           label.includes('impuesto') || label.includes('régimen')) {
                    return 'Impuestos';
                } else if (label.includes('vendedor') || label.includes('comprador') || label.includes('rnc')) {
                    return 'Partes Involucradas';
                } else if (label.includes('factura') || label.includes('numero') || label.includes('fecha') ||
                           label.includes('incoterm') || label.includes('empaque') || label.includes('condiciones')) {
                    return 'Información Comercial';
                } else {
                    return 'Otros';
                }
            }
            
            // Generar HTML
            let html = '<div class="info-grid">';
            
            // Mostrar campos raíz primero (categorizados)
            if (groupedFields.root.length > 0) {
                const categorizedRoot = {};
                groupedFields.root.forEach(field => {
                    const category = categorizeField(field);
                    if (!categorizedRoot[category]) categorizedRoot[category] = [];
                    categorizedRoot[category].push(field);
                });
                
                for (const [category, fields] of Object.entries(categorizedRoot)) {
                    if (fields.length === 0) continue;
                    
                    html += `<div class="info-section">
                        <h4><i class="fas fa-box"></i> ${category}</h4>
                        <div class="detail-grid">`;
                    
                    fields.forEach(field => {
                        html += `<div class="detail-item editable-field" data-field-key="${escapeHtml(field.key)}"
                            onclick="editarCampoDirecto('${escapeHtml(field.key)}', '${escapeHtml(field.label)}', this)">
                            <div class="detail-label">
                                <i class="fas fa-edit" style="opacity: 0.3; margin-right: 5px;"></i>
                                ${escapeHtml(field.label)}
                            </div>
                            <div class="detail-value" data-original-value="${escapeHtml(String(field.value))}">${escapeHtml(String(field.value))}</div>
                        </div>`;
                    });
                    
                    html += '</div></div>';
                }
            }
            
            // Mostrar arrays de forma separada
            for (const [arrayPath, items] of Object.entries(groupedFields.arrays)) {
                const arrayName = arrayPath.split('.').pop();
                const arrayLabel = arrayName.charAt(0).toUpperCase() + arrayName.slice(1).replace(/_/g, ' ');
                
                html += `<div class="array-section">
                    <h4>
                        <i class="fas fa-layer-group"></i> ${arrayLabel}
                        <span>
                            ${Object.keys(items).length} ${Object.keys(items).length === 1 ? 'item' : 'items'}
                        </span>
                    </h4>
                    <div class="array-container">`;
                
                // Cada elemento del array en su propia tarjeta
                Object.entries(items).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([index, fields]) => {
                    html += `<div class="array-item-card">
                        <div class="array-item-header">
                            <div class="item-number">${parseInt(index) + 1}</div>
                            <span class="item-label">Item ${parseInt(index) + 1}</span>
                        </div>
                        <div class="detail-grid">`;
                    
                    fields.forEach(field => {
                        html += `<div class="detail-item editable-field" data-field-key="${escapeHtml(field.key)}"
                            onclick="editarCampoDirecto('${escapeHtml(field.key)}', '${escapeHtml(field.label)}', this)">
                            <div class="detail-label">
                                <i class="fas fa-edit" style="opacity: 0.3; margin-right: 5px;"></i>
                                ${escapeHtml(field.label)}
                            </div>
                            <div class="detail-value" data-original-value="${escapeHtml(String(field.value))}">${escapeHtml(String(field.value))}</div>
                        </div>`;
                    });
                    
                    html += '</div></div>';
                });
                
                html += '</div></div>';
            }
            
            html += '</div>';
            return html;
        })()}
        
        <!-- Fundamentación Legal -->

        
        <!-- Partidas Alternativas -->
        ${partidas_alternativas_consideradas && 
          partidas_alternativas_consideradas !== 'No aplicable' && 
          partidas_alternativas_consideradas !== 'No aplicable.' ? `
            <div class="alternatives-section">
                <h4><i class="fas fa-list-alt"></i> Partidas Alternativas Consideradas</h4>
                <div class="alternatives-content">
                    ${typeof partidas_alternativas_consideradas === 'string' 
                        ? partidas_alternativas_consideradas.replace(/\n/g, '<br>') 
                        : Array.isArray(partidas_alternativas_consideradas) 
                            ? partidas_alternativas_consideradas.join('<br>') 
                            : JSON.stringify(partidas_alternativas_consideradas)}
                    ${motivo_descarte_alternativas && motivo_descarte_alternativas !== 'No aplicable' ? `
                        <div class="discard-reason">
                            <strong>Motivo de descarte:</strong> ${typeof motivo_descarte_alternativas === 'string' 
                                ? motivo_descarte_alternativas 
                                : JSON.stringify(motivo_descarte_alternativas)}
                        </div>
                    ` : ''}
                </div>
            </div>
        ` : ''}
        
        <!-- JSON Raw (colapsable) -->
        <div class="json-section">
            <details>
                <summary class="json-toggle">
                    <i class="fas fa-code"></i>
                    Ver JSON completo
                </summary>
                <div class="json-viewer" id="json-viewer-display">
                    ${JSON.stringify(data, null, 2)}
                </div>
            </details>
        </div>
    `;
    
    return card;
}

function hideResults() {
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.style.display = 'none';
    }
    resultadoActual = null;
    // IMPORTANTE: Sincronizar con window.resultadoActual
    window.resultadoActual = null;
    // Limpiar productos originales para nueva clasificación
    window._productosOriginales = null;
}

function showError(message) {
    hideLoading();
    const errorMsg = document.getElementById('error-message');
    const errorDiv = document.getElementById('error');
    if (errorMsg) errorMsg.textContent = message;
    if (errorDiv) errorDiv.style.display = 'flex';
}

function hideError() {
    const errorDiv = document.getElementById('error');
    if (errorDiv) errorDiv.style.display = 'none';
}

// Funciones de ayuda para el frontend
function setExample(type) {
    const examples = {
        smartphone: 'Smartphone marca Samsung Galaxy S23 Ultra, pantalla Dynamic AMOLED 2X de 6.8 pulgadas con resolución QHD+, procesador Qualcomm Snapdragon 8 Gen 2, memoria RAM 12GB, almacenamiento interno 512GB, sistema de cámaras cuádruple (200MP + 12MP + 10MP + 10MP), batería 5000mAh, conectividad 5G, WiFi 6E, Bluetooth 5.3, sistema operativo Android 13, carcasa de aluminio y vidrio Gorilla Glass Victus 2, color negro fantasma, fabricado en Vietnam, nuevo en caja sellada con todos los accesorios originales.',
        
        laptop: 'Laptop marca Dell XPS 15 9530, pantalla táctil OLED de 15.6 pulgadas con resolución 3.5K, procesador Intel Core i9-13900H de 13ª generación, memoria RAM 32GB DDR5, disco sólido NVMe 1TB, tarjeta gráfica NVIDIA GeForce RTX 4070 8GB, teclado retroiluminado, lector de huellas, webcam Full HD, batería 86Wh, sistema operativo Windows 11 Pro, carcasa de aluminio color platino, peso 1.86kg, fabricado en China, nuevo con garantía internacional de 1 año.',
        
        ropa: 'Camisa de vestir para hombre, manga larga, marca Ralph Lauren, talla L (large), 100% algodón pima peruano de alta calidad, color azul cielo con rayas blancas finas verticales, cuello italiano con varillas removibles, cierre frontal con 7 botones de nácar, puños con botones, bolsillo en el pecho con logo bordado, corte slim fit, costuras reforzadas, etiqueta de composición y cuidados en el cuello, fabricada en Perú, nueva con etiquetas originales.',
        
        alimento: 'Aceite de oliva extra virgen premium, marca española Carbonell, primera prensa en frío de aceitunas variedad Picual, acidez máxima 0.4%, color verde dorado intenso, sabor afrutado con notas de hierba fresca y almendra, contenido neto 1 litro, presentación en botella de vidrio oscuro con cierre hermético, certificación DOP (Denominación de Origen Protegida) de Andalucía, cosecha 2024, fecha de caducidad 24 meses desde producción, rico en polifenoles y vitamina E, producido y envasado en Córdoba, España.',
        
        vehiculo: 'Automóvil marca Toyota Corolla Cross Hybrid 2024, tipo SUV compacto, motor híbrido de 1.8 litros 4 cilindros en línea combinado con motor eléctrico para potencia total de 122HP, transmisión automática CVT, tracción delantera, kilometraje 0 km (nuevo), capacidad 5 pasajeros, sistema de seguridad Toyota Safety Sense 2.5 con pre-colisión, asistente de mantenimiento de carril, control crucero adaptativo, cámaras 360°, pantalla táctil 9 pulgadas con Apple CarPlay y Android Auto, tapicería de cuero sintético, aire acondicionado automático dual, rines de aleación 18 pulgadas, color blanco perla, chasis número JTDEPRAE1PJ123456, fabricado en Tailandia, importación directa.'
    };
    
    const textarea = document.getElementById('producto-texto');
    textarea.value = examples[type] || '';
    updateCharCount();
    
    // Scroll suave al textarea
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textarea.focus();
}

function updateCharCount() {
    const textarea = document.getElementById('producto-texto');
    const charCount = document.getElementById('char-count');
    if (textarea && charCount) {
        charCount.textContent = textarea.value.length;
        
        // Cambiar color según la longitud
        if (textarea.value.length < 100) {
            charCount.style.color = '#dc2626';
        } else if (textarea.value.length < 300) {
            charCount.style.color = '#d97706';
        } else {
            charCount.style.color = '#059669';
        }
    }
}

// Event listener para el contador de caracteres
document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.getElementById('producto-texto');
    if (textarea) {
        textarea.addEventListener('input', updateCharCount);
        updateCharCount(); // Inicializar
    }
});

// Funciones principales
async function clasificarTexto() {
    const producto = document.getElementById('producto-texto').value.trim();
    const soloHS = document.getElementById('solo-hs-texto').checked;
    
    if (!producto) {
        showError('Por favor, ingresa la descripción del producto a clasificar.');
        return;
    }
    
    // Verificar autenticación - DESHABILITADO
    // Acceso directo sin verificación
    
    showLoading();
    
    try {
        // Controller para cancelar la petición si es necesario
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutos
        
        // Preparar headers con autenticación si está disponible
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
            console.log('🔑 Enviando clasificación con token de autenticación');
        } else {
            console.log('⚠️ Clasificando sin autenticación (no se guardará en historial)');
        }
        
        const response = await fetchConAuth(`${API_BASE_URL}/clasificar`, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: headers,
            body: JSON.stringify({
                producto: producto,
                solo_hs: soloHS
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const result = await response.json();
        
        console.log('📡 RESPUESTA DE LA API (clasificar por texto):');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(result, null, 2));
        
        if (!response.ok) {
            // Los errores 401 ya son manejados por fetchConAuth
            if (response.status === 403) {
                // Verificar si es error de tokens agotados
                if (result.error === 'no_tokens_available') {
                    const mensaje = result.mensaje || 'Has agotado tus tokens mensuales.';
                    showError(`${mensaje}\n\nPuedes actualizar tu plan desde la sección de perfil.`);
                    
                    // Si hay información de límites, actualizarla en la UI
                    if (result.limites && userInfo && userInfo.limites) {
                        userInfo.limites.tokens_consumidos = result.limites.tokens_consumidos;
                        userInfo.limites.tokens_limite_mensual = result.limites.tokens_limite;
                        updatePlanInfo();
                    }
                } else {
                    showError(result.mensaje || 'No tienes suficientes tokens o has alcanzado el límite de dispositivos.');
                }
                return;
            }
            throw new Error(result.error || 'Error en la clasificación');
        }
        
        if (result.success) {
            // Actualizar información de consumo si está disponible
            if (result.tokens_info && userInfo) {
                if (userInfo.limites) {
                    userInfo.limites.tokens_consumidos += result.tokens_info.total_tokens;
                    const tokensText = `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
                    const tokensElement = document.getElementById('tokens-info');
                    if (tokensElement) tokensElement.textContent = tokensText;
                    
                    // Guardar en localStorage para persistir los cambios
                    localStorage.setItem('userInfo', JSON.stringify(userInfo));
                    console.log('💾 Tokens actualizados en localStorage:', userInfo.limites.tokens_consumidos);
                }
                updatePlanInfo();
            }
            
            // Mostrar información de tokens consumidos en los resultados
            showResults(result.data, result.tokens_info);
        } else {
            throw new Error('No se pudo obtener la clasificación');
        }
        
    } catch (error) {
        console.error('Error:', error);
        if (error.name === 'AbortError') {
            showError('La clasificación tomó demasiado tiempo. Por favor, intenta con un producto individual en lugar de una factura completa.');
        } else if (error.message.includes('Rate limit')) {
            showError('🕐 Límite de tokens alcanzado. Por favor espera 1-2 minutos antes de intentar de nuevo, o prueba con una descripción más corta.');
        } else if (error.message.includes('Respuesta no es JSON válido')) {
            showError('⚠️ El asistente devolvió una respuesta incorrecta. Intenta reformular tu consulta o prueba con un producto más específico.');
        } else if (error.message.includes('Timeout')) {
            showError('⏱️ La clasificación está tomando más tiempo del esperado. Intenta con una descripción más concisa.');
        } else {
            showError(`Error al clasificar el producto: ${error.message}`);
        }
    }
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    
    archivoSeleccionado = file;
    
    console.log('📄 Archivo seleccionado:', {
        name: file.name,
        size: file.size,
        type: file.type
    });
    
    // Mostrar información del archivo con formato mejorado
    const fileInfo = document.getElementById('file-info');
    let sizeText = '';
    
    if (file.size < 1024) {
        sizeText = `${file.size} bytes`;
    } else if (file.size < 1024 * 1024) {
        sizeText = `${(file.size / 1024).toFixed(2)} KB`;
    } else {
        sizeText = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
    }
    
    const fileIcon = file.type.includes('pdf') ? 'fa-file-pdf' : 
                     file.type.includes('image') ? 'fa-file-image' : 
                     'fa-file-alt';
    
    fileInfo.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas ${fileIcon}" style="font-size: 24px; color: #3b82f6;"></i>
            <div>
                <strong style="display: block; color: #1e293b;">${file.name}</strong>
                <small style="color: #64748b;">${sizeText} • ${file.type || 'Tipo desconocido'}</small>
            </div>
        </div>
    `;
    fileInfo.style.display = 'block';
    
    // Habilitar el botón de clasificar
    document.getElementById('btn-clasificar-archivo').disabled = false;
}

// Variable para controlar si hay una clasificación batch en progreso
let batchEnProgreso = false;

async function clasificarArchivo() {
    if (!archivoSeleccionado) {
        showError('Por favor, selecciona un archivo primero.');
        return;
    }
    
    // Si es un PDF, usar el nuevo sistema con detección de batch
    if (archivoSeleccionado.type === 'application/pdf') {
        await clasificarArchivoConBatch();
        return;
    }
    
    // Para otros archivos, usar el método tradicional
    await clasificarArchivoTradicional();
}

// Clasificación tradicional (para archivos pequeños o no-PDF)
async function clasificarArchivoTradicional() {
    const soloHS = document.getElementById('solo-hs-archivo').checked;
    
    console.log('📤 Clasificando archivo (modo tradicional):', archivoSeleccionado.name);
    
    showLoading();
    
    try {
        const formData = new FormData();
        formData.append('archivo', archivoSeleccionado);
        formData.append('solo_hs', soloHS);
        
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const response = await fetchConAuth(`${API_BASE_URL}/clasificar-archivo`, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            if (response.status === 403 && result.error === 'no_tokens_available') {
                showError(`${result.mensaje || 'Has agotado tus tokens mensuales.'}\n\nPuedes actualizar tu plan desde la sección de perfil.`);
                return;
            }
            throw new Error(result.error || 'Error en la clasificación');
        }
        
        if (result.success) {
            procesarResultadoClasificacion(result, soloHS);
        } else {
            throw new Error('No se pudo obtener la clasificación');
        }
        
    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        showError(`Error al procesar el archivo: ${error.message}`);
    }
}

// Nueva función: Clasificación con soporte de batch y confirmación de items
// Nueva función: Clasificación con flujo de 3 pasos para detección de items
async function clasificarArchivoConBatch() {
    const soloHS = document.getElementById('solo-hs-archivo').checked;
    
    console.log('📤 Clasificando archivo (nuevo flujo):', archivoSeleccionado.name);
    
    try {
        // PASO 1: Analizar el PDF con pdf-parse para detectar items automáticamente
        mostrarProgresoBatch('Analizando documento con pdf-parse...', 0);
        
        const formData = new FormData();
        formData.append('archivo', archivoSeleccionado);
        
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const analisisResponse = await fetch(`${API_BASE_URL}/analizar-pdf`, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        const analisisResult = await analisisResponse.json();
        
        if (!analisisResponse.ok) {
            throw new Error(analisisResult.error || 'Error al analizar documento');
        }
        
        console.log('📊 Análisis pdf-parse:', analisisResult);
        
        // PASO 2: Mostrar resultado y preguntar al usuario
        ocultarProgresoBatch();
        
        // Mostrar modal con el nuevo flujo de 3 pasos
        const itemsConfirmados = await mostrarModalFlujoPasos(analisisResult);
        
        if (itemsConfirmados === false) {
            // Usuario canceló
            showNotification('Clasificación cancelada', 'info');
            return;
        }
        
        console.log('✅ Items confirmados:', itemsConfirmados);
        
        // PASO 3: Procesar con los items confirmados
        mostrarProgresoBatch(`Procesando ${itemsConfirmados} items...`, 5);
        
        const necesitaBatch = itemsConfirmados > 10;
        
        if (necesitaBatch) {
            await procesarConSSE(analisisResult.fileId, itemsConfirmados, soloHS);
        } else {
            await procesarDirecto(analisisResult.fileId, itemsConfirmados, soloHS);
        }
        
    } catch (error) {
        console.error('Error:', error);
        ocultarProgresoBatch();
        showError(`Error al procesar el archivo: ${error.message}`);
    }
}

// NUEVO: Modal con flujo de 3 pasos para detección de items
function mostrarModalFlujoPasos(datosAnalisis) {
    return new Promise((resolve) => {
        // Estado del modal
        let pasoActual = 1;
        let fileId = datosAnalisis.fileId;
        let itemsDetectados = datosAnalisis.itemsDetectados || 0;
        let metodoDeteccion = datosAnalisis.metodo || 'pdf-parse';
        let confianza = datosAnalisis.confianza || 'baja';
        
        // Remover modal anterior si existe
        const existingModal = document.getElementById('modal-confirmar-items');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'modal-confirmar-items';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        const filename = datosAnalisis.filename || 'documento.pdf';
        
        // Función para renderizar el contenido según el paso
        function renderizarPaso() {
            const confianzaColor = confianza === 'alta' ? '#10b981' : confianza === 'media' ? '#f59e0b' : '#ef4444';
            const confianzaIcon = confianza === 'alta' ? 'fa-check-circle' : confianza === 'media' ? 'fa-exclamation-circle' : 'fa-question-circle';
            
            if (pasoActual === 1) {
                // PASO 1: Mostrar resultado de pdf-parse
                modal.innerHTML = `
                    <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 95%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <h3 style="margin: 0 0 20px 0; color: #1e293b; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-file-pdf" style="color: #ef4444;"></i>
                            Paso 1/4: Detección Automática
                        </h3>
                        
                        <!-- Nombre del archivo -->
                        <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #64748b; font-size: 13px;">
                                <i class="fas fa-file"></i> ${filename}
                            </p>
                        </div>
                        
                        <!-- Resultado de detección -->
                        <div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-radius: 12px; padding: 25px; margin-bottom: 20px; text-align: center;">
                            <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px;">
                                <i class="fas fa-robot"></i> Análisis con pdf-parse
                            </p>
                            <div style="font-size: 48px; font-weight: bold; color: #1e40af; margin-bottom: 10px;">
                                ${itemsDetectados}
                            </div>
                            <p style="margin: 0; color: #64748b; font-size: 14px;">
                                items/productos detectados
                            </p>
                            <div style="margin-top: 15px; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; background: ${confianzaColor}22; border-radius: 20px;">
                                <i class="fas ${confianzaIcon}" style="color: ${confianzaColor};"></i>
                                <span style="color: ${confianzaColor}; font-size: 13px; font-weight: 500;">
                                    Confianza ${confianza}
                                </span>
                            </div>
                        </div>
                        
                        <!-- Pregunta -->
                        <div style="background: #fef3c7; border-radius: 8px; padding: 15px; margin-bottom: 20px; text-align: center;">
                            <p style="margin: 0; color: #92400e; font-size: 15px; font-weight: 500;">
                                <i class="fas fa-question-circle"></i>
                                ¿Es correcta esta cantidad?
                            </p>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button id="btn-cancelar" style="
                                flex: 1;
                                padding: 14px;
                                border: 2px solid #e2e8f0;
                                background: white;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                                color: #64748b;
                            ">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button id="btn-incorrecto" style="
                                flex: 1;
                                padding: 14px;
                                border: 2px solid #f59e0b;
                                background: #fffbeb;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                                color: #b45309;
                            ">
                                <i class="fas fa-redo"></i> No, detectar con IA
                            </button>
                            <button id="btn-correcto" style="
                                flex: 1.5;
                                padding: 14px;
                                border: none;
                                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                                color: white;
                                border-radius: 8px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                                <i class="fas fa-check"></i> Sí, clasificar
                            </button>
                        </div>
                    </div>
                `;
                
                // Event listeners paso 1
                document.getElementById('btn-cancelar').onclick = () => {
                    modal.remove();
                    resolve(false);
                };
                
                document.getElementById('btn-incorrecto').onclick = async () => {
                    pasoActual = 2;
                    await detectarConIA();
                };
                
                document.getElementById('btn-correcto').onclick = () => {
                    modal.remove();
                    resolve(itemsDetectados);
                };
                
            } else if (pasoActual === 2) {
                // PASO 2: Mostrar resultado de detección con IA
                modal.innerHTML = `
                    <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 95%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <h3 style="margin: 0 0 20px 0; color: #1e293b; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-brain" style="color: #8b5cf6;"></i>
                            Paso 2/4: Detección con IA
                        </h3>
                        
                        <!-- Nombre del archivo -->
                        <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #64748b; font-size: 13px;">
                                <i class="fas fa-file"></i> ${filename}
                            </p>
                        </div>
                        
                        <!-- Resultado de IA -->
                        <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 12px; padding: 25px; margin-bottom: 20px; text-align: center;">
                            <p style="margin: 0 0 10px 0; color: #7c3aed; font-size: 14px;">
                                <i class="fas fa-brain"></i> Análisis con Inteligencia Artificial
                            </p>
                            <div style="font-size: 48px; font-weight: bold; color: #6d28d9; margin-bottom: 10px;">
                                ${itemsDetectados}
                            </div>
                            <p style="margin: 0; color: #64748b; font-size: 14px;">
                                items/productos detectados
                            </p>
                        </div>
                        
                        <!-- Pregunta -->
                        <div style="background: #fef3c7; border-radius: 8px; padding: 15px; margin-bottom: 20px; text-align: center;">
                            <p style="margin: 0; color: #92400e; font-size: 15px; font-weight: 500;">
                                <i class="fas fa-question-circle"></i>
                                ¿Es correcta esta cantidad?
                            </p>
                        </div>
                        
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button id="btn-cancelar" style="
                                flex: 1;
                                min-width: 100px;
                                padding: 14px;
                                border: 2px solid #e2e8f0;
                                background: white;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                                color: #64748b;
                            ">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button id="btn-forzar-ia" style="
                                flex: 1;
                                min-width: 100px;
                                padding: 14px;
                                border: 2px solid #8b5cf6;
                                background: #f5f3ff;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                                color: #7c3aed;
                            ">
                                <i class="fas fa-magic"></i> Indicar a IA
                            </button>
                            <button id="btn-manual" style="
                                flex: 1;
                                min-width: 100px;
                                padding: 14px;
                                border: 2px solid #f59e0b;
                                background: #fffbeb;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                                color: #b45309;
                            ">
                                <i class="fas fa-edit"></i> Manual
                            </button>
                            <button id="btn-correcto" style="
                                flex: 1.5;
                                min-width: 120px;
                                padding: 14px;
                                border: none;
                                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                                color: white;
                                border-radius: 8px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                                <i class="fas fa-check"></i> Sí, clasificar
                            </button>
                        </div>
                    </div>
                `;
                
                // Event listeners paso 2
                document.getElementById('btn-cancelar').onclick = () => {
                    modal.remove();
                    resolve(false);
                };
                
                document.getElementById('btn-forzar-ia').onclick = () => {
                    pasoActual = 2.5;
                    renderizarPaso();
                };
                
                document.getElementById('btn-manual').onclick = () => {
                    pasoActual = 3;
                    renderizarPaso();
                };
                
                document.getElementById('btn-correcto').onclick = () => {
                    modal.remove();
                    resolve(itemsDetectados);
                };
                
            } else if (pasoActual === 2.5) {
                // PASO 2.5: Forzar conteo con IA (FORCE_ITEM_COUNT)
                modal.innerHTML = `
                    <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 95%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <h3 style="margin: 0 0 20px 0; color: #1e293b; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-magic" style="color: #8b5cf6;"></i>
                            Paso 3/4: Indicar Cantidad a la IA
                        </h3>
                        
                        <!-- Nombre del archivo -->
                        <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #64748b; font-size: 13px;">
                                <i class="fas fa-file"></i> ${filename}
                            </p>
                        </div>
                        
                        <!-- Input para forzar cantidad -->
                        <div style="background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); border-radius: 12px; padding: 25px; margin-bottom: 20px; text-align: center;">
                            <label style="display: block; margin-bottom: 15px; color: #7c3aed; font-weight: 600; font-size: 16px;">
                                <i class="fas fa-brain"></i> ¿Cuántos items tiene el documento?
                            </label>
                            <input type="number" id="input-items-forzar" 
                                value="${itemsDetectados || 1}" 
                                min="1" 
                                max="500"
                                style="width: 150px; padding: 16px; border: 3px solid #8b5cf6; border-radius: 12px; font-size: 28px; text-align: center; font-weight: bold; color: #7c3aed;"
                            >
                            <p style="margin: 15px 0 0 0; color: #64748b; font-size: 13px;">
                                La IA usará este número como referencia autoritativa
                            </p>
                        </div>
                        
                        <!-- Info -->
                        <div style="background: #f5f3ff; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #7c3aed; font-size: 13px;">
                                <i class="fas fa-info-circle"></i>
                                Se enviará <strong>FORCE_ITEM_COUNT</strong> a la IA para confirmar el conteo.
                            </p>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button id="btn-volver" style="
                                flex: 1;
                                padding: 14px;
                                border: 2px solid #e2e8f0;
                                background: white;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                                color: #64748b;
                            ">
                                <i class="fas fa-arrow-left"></i> Volver
                            </button>
                            <button id="btn-forzar-enviar" style="
                                flex: 2;
                                padding: 14px;
                                border: none;
                                background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
                                color: white;
                                border-radius: 8px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                                <i class="fas fa-paper-plane"></i> Confirmar con IA
                            </button>
                        </div>
                    </div>
                `;
                
                // Focus en el input
                setTimeout(() => {
                    const input = document.getElementById('input-items-forzar');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }, 100);
                
                // Event listeners paso 2.5
                document.getElementById('btn-volver').onclick = () => {
                    pasoActual = 2;
                    renderizarPaso();
                };
                
                document.getElementById('btn-forzar-enviar').onclick = async () => {
                    const itemsForzados = parseInt(document.getElementById('input-items-forzar').value) || 1;
                    await forzarConteoConIA(itemsForzados);
                };
                
                // Enter para confirmar
                document.getElementById('input-items-forzar').onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        document.getElementById('btn-forzar-enviar').click();
                    }
                };
                
            } else if (pasoActual === 3) {
                // PASO 3: Entrada manual
                modal.innerHTML = `
                    <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 95%; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
                        <h3 style="margin: 0 0 20px 0; color: #1e293b; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-edit" style="color: #f59e0b;"></i>
                            Paso 4/4: Entrada Manual
                        </h3>
                        
                        <!-- Nombre del archivo -->
                        <div style="background: #f8fafc; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #64748b; font-size: 13px;">
                                <i class="fas fa-file"></i> ${filename}
                            </p>
                        </div>
                        
                        <!-- Input manual -->
                        <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 25px; margin-bottom: 20px; text-align: center;">
                            <label style="display: block; margin-bottom: 15px; color: #b45309; font-weight: 600; font-size: 16px;">
                                <i class="fas fa-boxes"></i> Ingrese la cantidad de items/productos:
                            </label>
                            <input type="number" id="input-items-manual" 
                                value="${itemsDetectados || 1}" 
                                min="1" 
                                max="500"
                                style="width: 150px; padding: 16px; border: 3px solid #f59e0b; border-radius: 12px; font-size: 28px; text-align: center; font-weight: bold; color: #b45309;"
                            >
                        </div>
                        
                        <!-- Info -->
                        <div style="background: #ecfdf5; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #059669; font-size: 13px;">
                                <i class="fas fa-info-circle"></i>
                                Si son más de 10 items, se procesarán en lotes automáticamente.
                            </p>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button id="btn-cancelar" style="
                                flex: 1;
                                padding: 14px;
                                border: 2px solid #e2e8f0;
                                background: white;
                                border-radius: 8px;
                                font-size: 14px;
                                cursor: pointer;
                                color: #64748b;
                            ">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button id="btn-clasificar" style="
                                flex: 2;
                                padding: 14px;
                                border: none;
                                background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
                                color: white;
                                border-radius: 8px;
                                font-size: 14px;
                                font-weight: 600;
                                cursor: pointer;
                            ">
                                <i class="fas fa-play"></i> Clasificar
                            </button>
                        </div>
                    </div>
                `;
                
                // Focus en el input
                setTimeout(() => {
                    const input = document.getElementById('input-items-manual');
                    if (input) {
                        input.focus();
                        input.select();
                    }
                }, 100);
                
                // Event listeners paso 3
                document.getElementById('btn-cancelar').onclick = () => {
                    modal.remove();
                    resolve(false);
                };
                
                document.getElementById('btn-clasificar').onclick = () => {
                    const items = parseInt(document.getElementById('input-items-manual').value) || 1;
                    modal.remove();
                    resolve(items);
                };
                
                // Enter para confirmar
                document.getElementById('input-items-manual').onkeypress = (e) => {
                    if (e.key === 'Enter') {
                        document.getElementById('btn-clasificar').click();
                    }
                };
            }
        }
        
        // Función para detectar con IA
        async function detectarConIA() {
            // Mostrar loading
            modal.innerHTML = `
                <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 95%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;">
                    <div style="font-size: 48px; color: #8b5cf6; margin-bottom: 20px;">
                        <i class="fas fa-brain fa-pulse"></i>
                    </div>
                    <h3 style="margin: 0 0 10px 0; color: #1e293b;">
                        Analizando con Inteligencia Artificial...
                    </h3>
                    <p style="margin: 0; color: #64748b; font-size: 14px;">
                        La IA está contando los items en el documento
                    </p>
                    <div style="margin-top: 20px;">
                        <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                            <div style="width: 60%; height: 100%; background: linear-gradient(90deg, #8b5cf6, #a78bfa); animation: loading 1.5s infinite;"></div>
                        </div>
                    </div>
                </div>
                <style>
                    @keyframes loading {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(200%); }
                    }
                </style>
            `;
            
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(`${API_BASE_URL}/detectar-items-ia`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ fileId })
                });
                
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(result.error || 'Error al detectar items con IA');
                }
                
                console.log('🤖 Resultado IA:', result);
                
                // Actualizar items detectados
                itemsDetectados = result.itemsDetectados || 1;
                metodoDeteccion = 'ia';
                
                // Renderizar paso 2 con el resultado
                renderizarPaso();
                
            } catch (error) {
                console.error('Error detectando con IA:', error);
                // Si falla la IA, ir directo al paso manual
                pasoActual = 3;
                renderizarPaso();
                showNotification('No se pudo detectar con IA. Por favor ingrese la cantidad manualmente.', 'warning');
            }
        }
        
        // Función para forzar conteo con IA (FORCE_ITEM_COUNT)
        async function forzarConteoConIA(cantidadForzada) {
            // Mostrar loading
            modal.innerHTML = `
                <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; width: 95%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;">
                    <div style="font-size: 48px; color: #8b5cf6; margin-bottom: 20px;">
                        <i class="fas fa-magic fa-pulse"></i>
                    </div>
                    <h3 style="margin: 0 0 10px 0; color: #1e293b;">
                        Confirmando con IA...
                    </h3>
                    <p style="margin: 0; color: #64748b; font-size: 14px;">
                        Enviando FORCE_ITEM_COUNT: ${cantidadForzada}
                    </p>
                    <div style="margin-top: 20px;">
                        <div style="width: 100%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                            <div style="width: 60%; height: 100%; background: linear-gradient(90deg, #8b5cf6, #a78bfa); animation: loading 1.5s infinite;"></div>
                        </div>
                    </div>
                </div>
                <style>
                    @keyframes loading {
                        0% { transform: translateX(-100%); }
                        100% { transform: translateX(200%); }
                    }
                </style>
            `;
            
            try {
                const headers = { 'Content-Type': 'application/json' };
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(`${API_BASE_URL}/forzar-conteo-ia`, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({ fileId, cantidadForzada })
                });
                
                const result = await response.json();
                
                if (!response.ok) {
                    throw new Error(result.error || 'Error al forzar conteo con IA');
                }
                
                console.log('🎯 Resultado forzar IA:', result);
                
                // Actualizar items con el valor confirmado
                itemsDetectados = result.itemsConfirmados || cantidadForzada;
                metodoDeteccion = 'ia-forzado';
                
                // La IA confirmó, proceder a clasificar
                modal.remove();
                resolve(itemsDetectados);
                
            } catch (error) {
                console.error('Error forzando conteo con IA:', error);
                // Si falla, usar el valor que indicó el usuario
                showNotification(`Usando cantidad indicada: ${cantidadForzada} items`, 'info');
                modal.remove();
                resolve(cantidadForzada);
            }
        }
        
        document.body.appendChild(modal);
        
        // Click fuera para cancelar
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        };
        
        // Renderizar primer paso
        renderizarPaso();
    });
}

// Mantener función legacy por compatibilidad
function mostrarModalConfirmacionItems(datos) {
    // Redirigir al nuevo flujo
    return mostrarModalFlujoPasos(datos);
}

// Procesar con SSE (para batch con progreso)
async function procesarConSSE(fileId, itemsConfirmados, soloHS) {
    // Primero, iniciar clasificación para que el archivo se registre con los items correctos
    const formData = new FormData();
    formData.append('archivo', archivoSeleccionado);
    formData.append('solo_hs', soloHS);
    formData.append('operationType', 'import');
    formData.append('itemsUsuario', itemsConfirmados);
    
    const headers = {};
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const initResponse = await fetch(`${API_BASE_URL}/clasificar-archivo-iniciar`, {
        method: 'POST',
        headers: headers,
        body: formData
    });
    
    const initResult = await initResponse.json();
    
    if (!initResponse.ok) {
        throw new Error(initResult.error || 'Error al iniciar clasificación');
    }
    
    const batchFileId = initResult.fileId;
    const totalBatches = Math.ceil(itemsConfirmados / 10);
    
    mostrarProgresoBatch(
        `Procesando ${itemsConfirmados} items en ${totalBatches} lotes...`,
        5
    );
    
    batchEnProgreso = true;
    
    const eventSource = new EventSource(`${API_BASE_URL}/clasificar-archivo-stream/${batchFileId}`);
    
    return new Promise((resolve, reject) => {
        eventSource.addEventListener('inicio', (e) => {
            const data = JSON.parse(e.data);
            console.log('🚀 Inicio:', data);
            mostrarProgresoBatch(data.mensaje, 10);
        });
        
        eventSource.addEventListener('progreso', (e) => {
            const data = JSON.parse(e.data);
            console.log('📦 Batch:', data);
            mostrarProgresoBatch(
                `Lote ${data.batch}/${data.totalBatches}: ${data.productosAcumulados} productos...`,
                10 + (data.progreso * 0.8)
            );
        });
        
        eventSource.addEventListener('completo', (e) => {
            const data = JSON.parse(e.data);
            console.log('✅ Completo:', data);
            eventSource.close();
            batchEnProgreso = false;
            ocultarProgresoBatch();
            
            if (data.success) {
                procesarResultadoClasificacion(data, soloHS);
                resolve(data);
            } else {
                reject(new Error(data.error || 'Error en clasificación'));
            }
        });
        
        eventSource.addEventListener('error', (e) => {
            const data = JSON.parse(e.data);
            console.error('❌ Error en stream:', data);
            eventSource.close();
            batchEnProgreso = false;
            ocultarProgresoBatch();
            reject(new Error(data.error));
        });
        
        eventSource.onerror = (error) => {
            console.error('❌ Error de conexión SSE:', error);
            eventSource.close();
            batchEnProgreso = false;
            
            // Intentar método tradicional como fallback
            console.log('⚠️ Reconectando con método tradicional...');
            clasificarArchivoTradicional().then(resolve).catch(reject);
        };
    });
}

// Procesar directo (sin batch)
async function procesarDirecto(fileId, itemsConfirmados, soloHS) {
    mostrarProgresoBatch('Procesando documento...', 30);
    
    const headers = {
        'Content-Type': 'application/json'
    };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await fetch(`${API_BASE_URL}/procesar-pdf-confirmado`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            fileId,
            itemsConfirmados,
            soloHS,
            operationType: 'import'
        })
    });
    
    const result = await response.json();
    
    ocultarProgresoBatch();
    
    if (!response.ok) {
        throw new Error(result.error || 'Error al procesar documento');
    }
    
    procesarResultadoClasificacion(result, soloHS);
}

// Mantener compatibilidad con el código anterior
async function clasificarArchivoConBatchLegacy() {
    const soloHS = document.getElementById('solo-hs-archivo').checked;
    
    console.log('📤 Clasificando archivo (legacy):', archivoSeleccionado.name);
    
    try {
        // Paso 1: Iniciar clasificación y obtener análisis del documento
        mostrarProgresoBatch('Analizando documento...', 0);
        
        const formData = new FormData();
        formData.append('archivo', archivoSeleccionado);
        formData.append('solo_hs', soloHS);
        formData.append('operationType', 'import');
        
        const headers = {};
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        const initResponse = await fetch(`${API_BASE_URL}/clasificar-archivo-iniciar`, {
            method: 'POST',
            headers: headers,
            body: formData
        });
        
        const initResult = await initResponse.json();
        
        if (!initResponse.ok) {
            throw new Error(initResult.error || 'Error al iniciar clasificación');
        }
        
        console.log('📊 Análisis del documento:', initResult.analisis);
        
        // Mostrar información del análisis
        if (initResult.analisis.necesitaBatch) {
            mostrarProgresoBatch(
                `Factura con ${initResult.analisis.totalItems} items detectados. Procesando en ${initResult.analisis.totalBatches} lotes...`,
                5
            );
        } else {
            mostrarProgresoBatch('Procesando documento...', 10);
        }
        
        // Paso 2: Iniciar stream SSE para recibir progreso
        batchEnProgreso = true;
        
        const eventSource = new EventSource(`${API_BASE_URL}/clasificar-archivo-stream/${initResult.fileId}`);
        
        return new Promise((resolve, reject) => {
            eventSource.addEventListener('inicio', (e) => {
                const data = JSON.parse(e.data);
                console.log('🚀 Inicio:', data);
                mostrarProgresoBatch(data.mensaje, 10);
            });
            
            eventSource.addEventListener('progreso', (e) => {
                const data = JSON.parse(e.data);
                console.log(`📦 Batch ${data.batch}/${data.totalBatches}:`, data);
                
                const mensaje = `Procesando batch ${data.batch} de ${data.totalBatches} (items ${data.itemsInicio}-${data.itemsFin})`;
                mostrarProgresoBatch(mensaje, data.progreso, {
                    batch: data.batch,
                    totalBatches: data.totalBatches,
                    productosAcumulados: data.productosAcumulados
                });
            });
            
            eventSource.addEventListener('completo', (e) => {
                const data = JSON.parse(e.data);
                console.log('✅ Clasificación completada:', data);
                
                eventSource.close();
                batchEnProgreso = false;
                ocultarProgresoBatch();
                
                if (data.success) {
                    procesarResultadoClasificacion(data, soloHS);
                    resolve(data);
                } else {
                    reject(new Error(data.error || 'Error en clasificación'));
                }
            });
            
            eventSource.addEventListener('error', (e) => {
                if (e.data) {
                    const data = JSON.parse(e.data);
                    console.error('❌ Error en stream:', data);
                    eventSource.close();
                    batchEnProgreso = false;
                    ocultarProgresoBatch();
                    showError(`Error: ${data.error}`);
                    reject(new Error(data.error));
                }
            });
            
            eventSource.onerror = (e) => {
                console.error('❌ Error de conexión SSE:', e);
                eventSource.close();
                batchEnProgreso = false;
                ocultarProgresoBatch();
                
                // Si perdemos conexión, intentar con el método tradicional
                console.log('⚠️ Reconectando con método tradicional...');
                clasificarArchivoTradicional().then(resolve).catch(reject);
            };
        });
        
    } catch (error) {
        console.error('Error:', error);
        batchEnProgreso = false;
        ocultarProgresoBatch();
        showError(`Error al procesar el archivo: ${error.message}`);
    }
}

// Función para mostrar progreso del batch
function mostrarProgresoBatch(mensaje, progreso, detalles = null) {
    let progressContainer = document.getElementById('batch-progress-container');
    
    if (!progressContainer) {
        progressContainer = document.createElement('div');
        progressContainer.id = 'batch-progress-container';
        progressContainer.innerHTML = `
            <div class="batch-progress-overlay">
                <div class="batch-progress-modal">
                    <div class="batch-progress-header">
                        <i class="fas fa-sync-alt fa-spin"></i>
                        <h3>Procesando Factura</h3>
                    </div>
                    <div class="batch-progress-content">
                        <p id="batch-progress-mensaje">${mensaje}</p>
                        <div class="batch-progress-bar-container">
                            <div class="batch-progress-bar" id="batch-progress-bar" style="width: ${progreso}%"></div>
                        </div>
                        <span class="batch-progress-percent" id="batch-progress-percent">${progreso}%</span>
                        <div id="batch-progress-detalles" class="batch-progress-detalles"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(progressContainer);
        
        // Agregar estilos si no existen
        if (!document.getElementById('batch-progress-styles')) {
            const styles = document.createElement('style');
            styles.id = 'batch-progress-styles';
            styles.textContent = `
                .batch-progress-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                }
                .batch-progress-modal {
                    background: white;
                    border-radius: 16px;
                    padding: 2rem;
                    max-width: 500px;
                    width: 90%;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                }
                .batch-progress-header {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }
                .batch-progress-header i {
                    font-size: 2rem;
                    color: #667eea;
                }
                .batch-progress-header h3 {
                    margin: 0;
                    color: #1a202c;
                }
                .batch-progress-content p {
                    color: #4a5568;
                    margin-bottom: 1rem;
                }
                .batch-progress-bar-container {
                    background: #e2e8f0;
                    border-radius: 10px;
                    height: 20px;
                    overflow: hidden;
                    margin-bottom: 0.5rem;
                }
                .batch-progress-bar {
                    background: linear-gradient(90deg, #667eea, #764ba2);
                    height: 100%;
                    border-radius: 10px;
                    transition: width 0.3s ease;
                }
                .batch-progress-percent {
                    display: block;
                    text-align: center;
                    font-weight: bold;
                    color: #667eea;
                }
                .batch-progress-detalles {
                    margin-top: 1rem;
                    padding-top: 1rem;
                    border-top: 1px solid #e2e8f0;
                    font-size: 0.875rem;
                    color: #718096;
                }
            `;
            document.head.appendChild(styles);
        }
    } else {
        document.getElementById('batch-progress-mensaje').textContent = mensaje;
        document.getElementById('batch-progress-bar').style.width = `${progreso}%`;
        document.getElementById('batch-progress-percent').textContent = `${progreso}%`;
    }
    
    // Mostrar detalles si están disponibles
    const detallesEl = document.getElementById('batch-progress-detalles');
    if (detalles && detallesEl) {
        detallesEl.innerHTML = `
            <div><strong>Batch:</strong> ${detalles.batch} de ${detalles.totalBatches}</div>
            <div><strong>Productos procesados:</strong> ${detalles.productosAcumulados}</div>
        `;
    }
}

// Función para ocultar progreso del batch
function ocultarProgresoBatch() {
    const container = document.getElementById('batch-progress-container');
    if (container) {
        container.remove();
    }
}

// Función común para procesar el resultado de la clasificación
function procesarResultadoClasificacion(result, soloHS) {
    hideLoading();
    
    // Actualizar información de consumo si está disponible
    if (result.tokens_info && userInfo && userInfo.limites) {
        userInfo.limites.tokens_consumidos += result.tokens_info.total_tokens || 0;
        const tokensText = `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
        const tokensElement = document.getElementById('tokens-info');
        if (tokensElement) tokensElement.textContent = tokensText;
        
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        updatePlanInfo();
    }
    
    // Guardar el resultado en la variable global
    resultadoActual = result.data;
    // IMPORTANTE: Sincronizar con window.resultadoActual
    window.resultadoActual = result.data;
    
    // Si es modo solo_hs, mostrar solo el código
    if (soloHS && result.data.hs) {
        showResults({ hs: result.data.hs }, result.tokens_info);
    } else {
        showResults(result.data, result.tokens_info);
    }
    
    // Mostrar info de batch si aplica
    if (result.batchInfo && result.batchInfo.modoBatch) {
        showNotification(
            `✅ Clasificación completada: ${result.batchInfo.productosObtenidos} productos en ${result.batchInfo.totalBatches} lotes`,
            'success'
        );
    } else {
        showNotification('✅ Clasificación completada exitosamente', 'success');
    }
    
    // Scroll suave a los resultados
    document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Recargar historial si el usuario está autenticado
    const token = localStorage.getItem('authToken');
    if (token && typeof cargarHistorial === 'function') {
        setTimeout(() => cargarHistorial(), 500);
    }
}

// Funciones de exportación
function convertToXML(data, rootElement = 'ImportDUA') {
    function escapeXML(str) {
        if (typeof str !== 'string') str = String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    function objectToXML(obj, indent = 0) {
        let xml = '';
        const spaces = '  '.repeat(indent);
        
        for (const [key, value] of Object.entries(obj)) {
            // Saltar campos que no se deben incluir
            if (key === 'editado' || key === 'fecha_edicion' || key === 'Justificacion') continue;
            
            const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
            
            if (value === null || value === undefined || value === '') {
                xml += `${spaces}<${cleanKey}></${cleanKey}>\n`;
            } else if (Array.isArray(value)) {
                // Para arrays, usar el nombre en singular si es plural
                const itemName = cleanKey.endsWith('s') ? cleanKey.slice(0, -1) : cleanKey;
                value.forEach((item, index) => {
                    if (typeof item === 'object') {
                        xml += `${spaces}<${itemName}>\n`;
                        xml += objectToXML(item, indent + 1);
                        xml += `${spaces}</${itemName}>\n`;
                    } else {
                        xml += `${spaces}<${itemName}>${escapeXML(item)}</${itemName}>\n`;
                    }
                });
            } else if (typeof value === 'object') {
                xml += `${spaces}<${cleanKey}>\n`;
                xml += objectToXML(value, indent + 1);
                xml += `${spaces}</${cleanKey}>\n`;
            } else {
                xml += `${spaces}<${cleanKey}>${escapeXML(value)}</${cleanKey}>\n`;
            }
        }
        return xml;
    }
    
    // Generar XML para estructura ImportDUA
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${rootElement} xmlns="http://www.aduanas.gob.do/siga" version="2.0">\n`;
    
    if (Array.isArray(data)) {
        data.forEach((item) => {
            xml += objectToXML(item, 1);
        });
    } else {
        xml += objectToXML(data, 1);
    }
    
    xml += `</${rootElement}>\n`;
    return xml;
}

// Función reemplazada por la nueva versión en líneas posteriores

function closeExportModal() {
    const modal = document.querySelector('.export-modal');
    if (modal) {
        modal.remove();
    }
}

function exportarResultado(formato = 'json') {
    console.log('📥 exportarResultado llamada con formato:', formato);
    
    if (!resultadoActual) {
        showError('No hay resultados para exportar.');
        return;
    }
    
    // Procesar datos para formatear códigos HS
    const datosFormateados = procesarDatosParaExporte(resultadoActual);
    
    const timestamp = new Date().toISOString().split('T')[0];
    let dataStr, mimeType, extension, filename;
    
    switch (formato) {
        case 'table':
            console.log('🔧 Generando Tabla HTML...');
            dataStr = convertToTable(datosFormateados);
            mimeType = 'text/html';
            extension = 'html';
            break;
            
        case 'xml':
            console.log('🔧 Generando XML...');
            dataStr = convertToXML(datosFormateados);
            mimeType = 'application/xml';
            extension = 'xml';
            break;
            
        case 'csv':
            console.log('🔧 Generando CSV...');
            dataStr = convertToCSV(datosFormateados);
            mimeType = 'text/csv';
            extension = 'csv';
            break;
            
        case 'json':
        default:
            console.log('🔧 Generando JSON...');
            dataStr = JSON.stringify(datosFormateados, null, 2);
            mimeType = 'application/json';
            extension = 'json';
            break;
    }
    
    filename = `clasificacion-arancelaria-${timestamp}.${extension}`;
    console.log('💾 Descargando archivo:', filename);
    
    const dataBlob = new Blob([dataStr], { type: mimeType });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    closeExportModal();
    
    // Mostrar notificación de éxito
    showNotification(`Archivo ${filename} descargado exitosamente`, 'success');
}

// Función para procesar datos y formatear códigos HS
function procesarDatosParaExporte(data) {
    const esArray = Array.isArray(data);
    const items = esArray ? data : [data];
    
    const itemsFormateados = items.map(item => {
        const itemFormateado = { ...item };
        
        // Formatear código HS
        if (itemFormateado.hs) {
            itemFormateado.hs = formatearCodigoHS(itemFormateado.hs);
        }
        
        // Eliminar campos no deseados
        delete itemFormateado.fundamentacion_legal;
        delete itemFormateado.legal_basis;
        delete itemFormateado.nivel_confianza_clasificacion;
        delete itemFormateado.confidence;
        delete itemFormateado.descripcion_items;
        delete itemFormateado.item_description;
        
        return itemFormateado;
    });
    
    // Retornar en el mismo formato que se recibió
    return esArray ? itemsFormateados : itemsFormateados[0];
}

function convertToCSV(data) {
    const items = Array.isArray(data) ? data : [data];
    
    // Obtener todas las claves únicas
    const allKeys = new Set();
    items.forEach(item => Object.keys(item).forEach(key => allKeys.add(key)));
    const headers = Array.from(allKeys);
    
    // Crear CSV
    let csv = headers.join(',') + '\n';
    
    items.forEach(item => {
        const row = headers.map(header => {
            let value = item[header];
            if (value === null || value === undefined) value = '';
            if (typeof value === 'object') value = JSON.stringify(value);
            // Escapar comillas y comas
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        });
        csv += row.join(',') + '\n';
    });
    
    return csv;
}

function convertToTable(data) {
    const items = Array.isArray(data) ? data : [data];
    
    // Crear HTML de tabla completo
    let html = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Clasificación Arancelaria - Tabla</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            margin: 20px;
            background-color: #f8fafc;
            color: #1e293b;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 10px;
        }
        .table-container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            overflow: hidden;
            margin-bottom: 20px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            background-color: #f1f5f9;
            color: #374151;
            font-weight: 600;
            padding: 12px 16px;
            text-align: left;
            border-bottom: 2px solid #e2e8f0;
        }
        td {
            padding: 12px 16px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
        }
        tr:hover {
            background-color: #f8fafc;
        }
        .hs-code {
            font-weight: 700;
            color: #2563eb;
            font-size: 1.1em;
        }
        .value {
            font-weight: 600;
            color: #059669;
        }
        .confidence-high {
            color: #059669;
            font-weight: 600;
        }
        .confidence-medium {
            color: #d97706;
            font-weight: 600;
        }
        .confidence-low {
            color: #dc2626;
            font-weight: 600;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #64748b;
            font-size: 0.9em;
        }
        @media print {
            body { margin: 0; }
            .header { break-inside: avoid; }
            .table-container { break-inside: avoid; margin-bottom: 10px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 Clasificación Arancelaria Dominicana</h1>
        <p>Reporte generado el ${new Date().toLocaleDateString('es-DO', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })}</p>
    </div>
`;

    items.forEach((item, index) => {
        const productTitle = items.length > 1 ? `Producto ${index + 1}` : 'Producto';
        
        html += `
    <div class="table-container">
        <h2 style="margin: 0; padding: 16px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            ${productTitle}: ${item.descripcion_comercial || item.item_name || 'Sin descripción'}
        </h2>
        <table>
            <tr>
                <th style="width: 30%;">Campo</th>
                <th>Valor</th>
            </tr>
            <tr>
                <td><strong>Código HS</strong></td>
                <td><span class="hs-code">${formatearCodigoHS(item.hs)}</span></td>
            </tr>
            <tr>
                <td><strong>Descripción Arancelaria</strong></td>
                <td>${item.descripcion_arancelaria || item.description || 'N/A'}</td>
            </tr>
            <tr>
                <td><strong>Descripción Comercial</strong></td>
                <td>${item.descripcion_comercial || item.item_name || 'N/A'}</td>
            </tr>
            <tr>
                <td><strong>País de Origen</strong></td>
                <td>${item.pais_origen || item.country_of_origin || 'N/A'}</td>
            </tr>
            <tr>
                <td><strong>Cantidad</strong></td>
                <td>${item.cantidad_total || item.quantity || 'N/A'} ${item.unidad_medida_estadistica || item.unit_of_measure || ''}</td>
            </tr>
            <tr>
                <td><strong>Valor Unitario</strong></td>
                <td><span class="value">${item.valor_unitario || item.value || 'N/A'} ${item.moneda || item.currency || ''}</span></td>
            </tr>
            <tr>
                <td><strong>Valor Total</strong></td>
                <td><span class="value">${item.valor_total || item.total_value || 'N/A'} ${item.moneda || item.currency || ''}</span></td>
            </tr>
            <tr>
                <td><strong>Peso Neto</strong></td>
                <td>${item.peso_neto || item.net_weight || 'N/A'}</td>
            </tr>
            <tr>
                <td><strong>Peso Bruto</strong></td>
                <td>${item.peso_bruto || item.gross_weight || 'N/A'}</td>
            </tr>
            <tr>
                <td><strong>Incoterm</strong></td>
                <td>${item.incoterm || 'N/A'}</td>
            </tr>
            <tr>
                <td><strong>Tipo de Operación</strong></td>
                <td>${item.tipo_operacion || item.operation_type || 'N/A'}</td>
            </tr>

        </table>
    </div>
`;
    });

    html += `
    <div class="footer">
        <p>Este reporte fue generado por el Sistema de Clasificación Arancelaria Dominicana</p>
        <p>Basado en la Séptima Enmienda del Sistema Armonizado</p>
    </div>
</body>
</html>`;

    return html;
}

// Funciones específicas para campos DUA
function showManualValidationErrors(errors) {
    const summary = document.getElementById('manual-validation-summary');
    const list = document.getElementById('manual-validation-list');
    
    list.innerHTML = '';
    errors.forEach(error => {
        const li = document.createElement('li');
        li.textContent = error;
        list.appendChild(li);
    });
    
    summary.style.display = 'block';
    summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearManualValidation() {
    document.getElementById('manual-validation-summary').style.display = 'none';
    const inputs = document.querySelectorAll('#manual-form .form-input');
    inputs.forEach(input => {
        input.classList.remove('error');
    });
}

function updateComplementaryFields() {
    const checkbox = document.getElementById('manual-datos-complementarios');
    const section = document.getElementById('complementary-fields');
    section.style.display = checkbox.checked ? 'block' : 'none';
}

function updateVehicleFields() {
    const hsCode = document.getElementById('manual-hs-code').value;
    const vehicleSection = document.querySelector('.vehicle-fields');
    
    // Mostrar campos de vehículos para capítulos 87 (vehículos terrestres)
    if (hsCode.startsWith('8703') || hsCode.startsWith('8704') || hsCode.startsWith('8705')) {
        vehicleSection.style.display = 'block';
    } else {
        vehicleSection.style.display = 'none';
    }
}

function updateAlcoholFields() {
    const hsCode = document.getElementById('manual-hs-code').value;
    const alcoholSection = document.querySelector('.alcohol-fields');
    
    // Mostrar campos de alcoholes para capítulo 22 (bebidas)
    if (hsCode.startsWith('22')) {
        alcoholSection.style.display = 'block';
    } else {
        alcoholSection.style.display = 'none';
    }
}

function updateTaxCalculations() {
    const fobTotal = parseFloat(document.getElementById('manual-valor-fob-total').value) || 0;
    const flete = parseFloat(document.getElementById('manual-flete').value) || 0;
    const seguro = parseFloat(document.getElementById('manual-seguro').value) || 0;
    const otrosGastos = parseFloat(document.getElementById('manual-otros-gastos').value) || 0;
    const tasaCambio = parseFloat(document.getElementById('manual-tasa-cambio').value) || 60;
    
    // Calcular CIF
    const cifUSD = fobTotal + flete + seguro + otrosGastos;
    const cifRD = cifUSD * tasaCambio;
    
    // Actualizar campos calculados
    document.getElementById('manual-valor-cif-usd').value = cifUSD.toFixed(2);
    document.getElementById('manual-valor-cif-rd').value = cifRD.toFixed(2);
    
    // Calcular impuestos si están los porcentajes
    const daiPct = parseFloat(document.getElementById('manual-dai-porcentaje').value) || 0;
    const itbisPct = parseFloat(document.getElementById('manual-itbis-porcentaje').value) || 18;
    
    if (daiPct > 0 && cifUSD > 0) {
        const dai = cifUSD * (daiPct / 100);
        const baseItbis = cifUSD + dai;
        const itbis = baseItbis * (itbisPct / 100);
        const total = cifUSD + dai + itbis;
        
        updateTaxDisplay(dai, itbis, total, tasaCambio);
    }
}

function updateTaxDisplay(dai, itbis, total, tasaCambio) {
    // Crear o actualizar resumen de impuestos
    let taxSummary = document.getElementById('tax-summary');
    if (!taxSummary) {
        taxSummary = document.createElement('div');
        taxSummary.id = 'tax-summary';
        taxSummary.className = 'tax-calculation-summary';
        document.querySelector('.valoracion-section').appendChild(taxSummary);
    }
    
    taxSummary.innerHTML = `
        <h4>Cálculo de Impuestos (Estimado)</h4>
        <div class="tax-line"><span>DAI:</span> <span>USD ${dai.toFixed(2)} (RD$ ${(dai * tasaCambio).toFixed(2)})</span></div>
        <div class="tax-line"><span>ITBIS:</span> <span>USD ${itbis.toFixed(2)} (RD$ ${(itbis * tasaCambio).toFixed(2)})</span></div>
        <div class="tax-line total"><span>Total a Pagar:</span> <span>USD ${total.toFixed(2)} (RD$ ${(total * tasaCambio).toFixed(2)})</span></div>
    `;
}

function showDUAResult(data) {
    const resultContainer = document.getElementById('resultado');
    
    resultContainer.innerHTML = `
        <div class="dua-result">
            <div class="result-header">
                <h2><i class="fas fa-file-invoice"></i> DUA - Declaración Única Aduanera</h2>
                <div class="result-actions">
                    <button class="btn btn-secondary" onclick="editResult()">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-primary" onclick="exportDUA()">
                        <i class="fas fa-download"></i> Exportar XML
                    </button>
                </div>
            </div>
            
            <div class="dua-sections">
                <!-- Información General -->
                <div class="dua-section">
                    <h3>1. Información General</h3>
                    <div class="info-grid">
                        <div><strong>Fecha:</strong> ${data.fecha_declaracion}</div>
                        <div><strong>Tipo Despacho:</strong> ${data.tipo_despacho}</div>
                        <div><strong>Administración:</strong> ${data.administracion_aduanera}</div>
                        <div><strong>Puerto Entrada:</strong> ${data.puerto_entrada}</div>
                    </div>
                </div>
                
                <!-- Importador -->
                <div class="dua-section">
                    <h3>2. Importador</h3>
                    <div class="info-grid">
                        <div><strong>Nombre:</strong> ${data.importador.nombre}</div>
                        <div><strong>RNC/Cédula:</strong> ${data.importador.documento}</div>
                        <div><strong>Dirección:</strong> ${data.importador.direccion}</div>
                        ${data.importador.telefono ? `<div><strong>Teléfono:</strong> ${data.importador.telefono}</div>` : ''}
                    </div>
                </div>
                
                <!-- Mercancía -->
                <div class="dua-section">
                    <h3>3. Mercancía</h3>
                    <div class="mercancia-info">
                        <div class="hs-code"><strong>Código S.A.:</strong> ${data.mercancia.hs}</div>
                        <div class="product-name"><strong>Producto:</strong> ${data.mercancia.producto}</div>
                        <div class="specification"><strong>Especificación:</strong> ${data.mercancia.especificacion}</div>
                        <div class="origin"><strong>País Origen:</strong> ${data.mercancia.pais_origen}</div>
                        <div class="quantity"><strong>Cantidad:</strong> ${data.mercancia.cantidad} ${data.mercancia.unidad}</div>
                        <div class="fob"><strong>FOB Unitario:</strong> USD ${data.mercancia.fob_unitario}</div>
                    </div>
                </div>
                
                <!-- Valoración -->
                <div class="dua-section">
                    <h3>4. Valoración Aduanera</h3>
                    <div class="valoracion-grid">
                        <div><strong>FOB Total:</strong> USD ${data.valoracion.valor_fob_total}</div>
                        <div><strong>Flete:</strong> USD ${data.valoracion.flete}</div>
                        <div><strong>Seguro:</strong> USD ${data.valoracion.seguro}</div>
                        <div><strong>Otros Gastos:</strong> USD ${data.valoracion.otros_gastos}</div>
                        <div><strong>CIF Total:</strong> USD ${data.calculos.base_cif_usd.toFixed(2)}</div>
                        <div><strong>Tasa Cambio:</strong> RD$ ${data.valoracion.tasa_cambio}</div>
                    </div>
                </div>
                
                <!-- Impuestos -->
                <div class="dua-section">
                    <h3>5. Impuestos y Gravámenes</h3>
                    <div class="impuestos-table">
                        <div class="tax-row">
                            <span>DAI (${data.impuestos.dai_porcentaje}%)</span>
                            <span>USD ${data.calculos.dai_monto.toFixed(2)}</span>
                            <span>RD$ ${(data.calculos.dai_monto * data.valoracion.tasa_cambio).toFixed(2)}</span>
                        </div>
                        <div class="tax-row">
                            <span>ITBIS (${data.impuestos.itbis_porcentaje}%)</span>
                            <span>USD ${data.calculos.itbis_monto.toFixed(2)}</span>
                            <span>RD$ ${(data.calculos.itbis_monto * data.valoracion.tasa_cambio).toFixed(2)}</span>
                        </div>
                        ${data.impuestos.selectivo_porcentaje > 0 ? `
                        <div class="tax-row">
                            <span>Selectivo (${data.impuestos.selectivo_porcentaje}%)</span>
                            <span>USD ${data.calculos.selectivo_monto.toFixed(2)}</span>
                            <span>RD$ ${(data.calculos.selectivo_monto * data.valoracion.tasa_cambio).toFixed(2)}</span>
                        </div>
                        ` : ''}
                        <div class="tax-row total">
                            <span><strong>Total a Pagar</strong></span>
                            <span><strong>USD ${data.calculos.total_pagar.toFixed(2)}</strong></span>
                            <span><strong>RD$ ${data.calculos.total_rd.toFixed(2)}</strong></span>
                        </div>
                    </div>
                </div>
                
                <!-- Documentos -->
                <div class="dua-section">
                    <h3>6. Documentos de Soporte</h3>
                    <div class="info-grid">
                        <div><strong>Tipo:</strong> ${data.documento.tipo}</div>
                        <div><strong>Número:</strong> ${data.documento.numero}</div>
                        <div><strong>Fecha:</strong> ${data.documento.fecha}</div>
                        ${data.documento.monto ? `<div><strong>Monto:</strong> USD ${data.documento.monto}</div>` : ''}
                    </div>
                </div>
                
                ${data.observacion_general ? `
                <!-- Observaciones -->
                <div class="dua-section">
                    <h3>7. Observaciones</h3>
                    <div class="observaciones">${data.observacion_general}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Cambiar a la pestaña de resultados
    showTab('resultado');
    
    // Scroll al resultado
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportDUA() {
    if (!resultadoActual) {
        showNotification('No hay datos DUA para exportar', 'error');
        return;
    }
    
    // Crear XML completo de la DUA
    const xmlContent = generateDUAXML(resultadoActual);
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DUA_${resultadoActual.mercancia.hs.replace(/\./g, '')}_${new Date().toISOString().split('T')[0]}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('DUA exportada exitosamente en formato XML', 'success');
    updateTokenUsage();
}

function generateDUAXML(data) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<DUA xmlns="http://www.aduanas.gob.do/schema/dua" version="1.0">
    <Declaracion>
        <FechaDeclaracion>${data.fecha_declaracion}</FechaDeclaracion>
        <TipoDespacho>${data.tipo_despacho}</TipoDespacho>
        <AdministracionAduanera>${data.administracion_aduanera}</AdministracionAduanera>
    </Declaracion>
    
    <DocumentoEmbarque>
        <PuertoEntrada>${data.puerto_entrada}</PuertoEntrada>
        <PaisProcedencia>${data.pais_procedencia}</PaisProcedencia>
        <MedioTransporte>${data.medio_transporte}</MedioTransporte>
        ${data.empresa_transportista ? `<EmpresaTransportista>${data.empresa_transportista}</EmpresaTransportista>` : ''}
        ${data.fecha_llegada ? `<FechaLlegada>${data.fecha_llegada}</FechaLlegada>` : ''}
    </DocumentoEmbarque>
    
    <Importador>
        <Nombre>${data.importador.nombre}</Nombre>
        <Documento>${data.importador.documento}</Documento>
        <Direccion>${data.importador.direccion}</Direccion>
        ${data.importador.telefono ? `<Telefono>${data.importador.telefono}</Telefono>` : ''}
        ${data.importador.email ? `<Email>${data.importador.email}</Email>` : ''}
    </Importador>
    
    <Agente>
        <Nombre>${data.agente.nombre}</Nombre>
        ${data.agente.licencia ? `<Licencia>${data.agente.licencia}</Licencia>` : ''}
    </Agente>
    
    <Proveedor>
        <Nombre>${data.proveedor.nombre}</Nombre>
        <Pais>${data.proveedor.pais}</Pais>
        ${data.proveedor.documento ? `<Documento>${data.proveedor.documento}</Documento>` : ''}
        ${data.proveedor.direccion ? `<Direccion>${data.proveedor.direccion}</Direccion>` : ''}
    </Proveedor>
    
    <RegimenAduanero>
        <Codigo>${data.regimen_aduanero}</Codigo>
        ${data.acuerdo_comercial ? `<AcuerdoComercial>${data.acuerdo_comercial}</AcuerdoComercial>` : ''}
    </RegimenAduanero>
    
    <Mercancia>
        <CodigoSA>${data.mercancia.hs}</CodigoSA>
        <Descripcion>${data.mercancia.producto}</Descripcion>
        <Especificacion>${data.mercancia.especificacion}</Especificacion>
        <PaisOrigen>${data.mercancia.pais_origen}</PaisOrigen>
        <Cantidad>${data.mercancia.cantidad}</Cantidad>
        <Unidad>${data.mercancia.unidad}</Unidad>
        <FOBUnitario>${data.mercancia.fob_unitario}</FOBUnitario>
        ${data.mercancia.marca ? `<Marca>${data.mercancia.marca}</Marca>` : ''}
        ${data.mercancia.modelo ? `<Modelo>${data.mercancia.modelo}</Modelo>` : ''}
        ${data.mercancia.ano ? `<Ano>${data.mercancia.ano}</Ano>` : ''}
        ${data.mercancia.chasis ? `<Chasis>${data.mercancia.chasis}</Chasis>` : ''}
        ${data.mercancia.motor ? `<Motor>${data.mercancia.motor}</Motor>` : ''}
    </Mercancia>
    
    <Valoracion>
        <TasaCambio>${data.valoracion.tasa_cambio}</TasaCambio>
        <FOBTotal>${data.valoracion.valor_fob_total}</FOBTotal>
        <Flete>${data.valoracion.flete}</Flete>
        <Seguro>${data.valoracion.seguro}</Seguro>
        <OtrosGastos>${data.valoracion.otros_gastos}</OtrosGastos>
        <CIFTotal>${data.calculos.base_cif_usd}</CIFTotal>
    </Valoracion>
    
    <Impuestos>
        <DAI>
            <Porcentaje>${data.impuestos.dai_porcentaje}</Porcentaje>
            <Monto>${data.calculos.dai_monto}</Monto>
        </DAI>
        <ITBIS>
            <Porcentaje>${data.impuestos.itbis_porcentaje}</Porcentaje>
            <Monto>${data.calculos.itbis_monto}</Monto>
        </ITBIS>
        ${data.impuestos.selectivo_porcentaje > 0 ? `
        <Selectivo>
            <Porcentaje>${data.impuestos.selectivo_porcentaje}</Porcentaje>
            <Monto>${data.calculos.selectivo_monto}</Monto>
        </Selectivo>
        ` : ''}
        <Total>${data.calculos.total_pagar}</Total>
    </Impuestos>
    
    <Peso>
        <Bruto>${data.peso_bruto}</Bruto>
        <Neto>${data.peso_neto}</Neto>
    </Peso>
    
    <DocumentoSoporte>
        <Tipo>${data.documento.tipo}</Tipo>
        <Numero>${data.documento.numero}</Numero>
        <Fecha>${data.documento.fecha}</Fecha>
        ${data.documento.monto ? `<Monto>${data.documento.monto}</Monto>` : ''}
        ${data.documento.pais ? `<Pais>${data.documento.pais}</Pais>` : ''}
    </DocumentoSoporte>
    
    ${data.observacion_general ? `<Observaciones>${data.observacion_general}</Observaciones>` : ''}
    
    <Metadatos>
        <FechaCreacion>${data.fecha_creacion}</FechaCreacion>
        <Tipo>${data.tipo}</Tipo>
        <Validado>${data.validado}</Validado>
    </Metadatos>
</DUA>`;
}

function showManualResult(data) {
    const resultContainer = document.getElementById('resultado');
    
    resultContainer.innerHTML = `
        <div class="result">
            <div class="result-header">
                <h2><i class="fas fa-file-alt"></i> Clasificación Arancelaria Manual</h2>
                <div class="result-actions">
                    <button class="btn btn-secondary" onclick="editResult()">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-primary" onclick="exportXML()">
                        <i class="fas fa-download"></i> Exportar XML
                    </button>
                </div>
            </div>
            
            <div class="classification-info">
                <div class="hs-section">
                    <div class="hs-code">${data.hs}</div>
                    <div class="hs-description">${data.descripcion}</div>
                </div>
                
                <div class="product-info">
                    <h3>Información del Producto</h3>
                    <div class="info-grid">
                        <div><strong>Producto:</strong> ${data.producto}</div>
                        <div><strong>País de Origen:</strong> ${data.origen}</div>
                        ${data.marca ? `<div><strong>Marca:</strong> ${data.marca}</div>` : ''}
                        ${data.modelo ? `<div><strong>Modelo:</strong> ${data.modelo}</div>` : ''}
                        ${data.material ? `<div><strong>Material:</strong> ${data.material}</div>` : ''}
                        ${data.uso ? `<div><strong>Uso:</strong> ${data.uso}</div>` : ''}
                        ${data.peso ? `<div><strong>Peso:</strong> ${data.peso} kg</div>` : ''}
                        ${data.dimensiones ? `<div><strong>Dimensiones:</strong> ${data.dimensiones}</div>` : ''}
                        <div><strong>Cantidad:</strong> ${data.cantidad} ${data.unidad_medida || 'unidades'}</div>
                        ${data.valor_fob ? `<div><strong>Valor FOB:</strong> USD ${data.valor_fob}</div>` : ''}
                    </div>
                </div>
                
                <div class="tax-info">
                    <h3>Impuestos y Gravámenes</h3>
                    <div class="tax-table">
                        <div class="tax-row">
                            <span>DAI (Derecho Arancelario a la Importación)</span>
                            <span>${data.dai}%</span>
                        </div>
                        <div class="tax-row">
                            <span>ITBIS (Impuesto sobre Transferencias)</span>
                            <span>${data.itbis}%</span>
                        </div>
                        ${data.impuesto_selectivo > 0 ? `
                        <div class="tax-row">
                            <span>Impuesto Selectivo</span>
                            <span>${data.impuesto_selectivo}%</span>
                        </div>
                        ` : ''}
                        ${data.otros_impuestos ? `
                        <div class="tax-row">
                            <span>Otros Impuestos</span>
                            <span>${data.otros_impuestos}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                ${data.observaciones ? `
                <div class="observations">
                    <h3>Observaciones</h3>
                    <div class="observation-text">${data.observaciones}</div>
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Cambiar a la pestaña de resultados
    showTab('resultado');
    
    // Scroll al resultado
    resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Funciones para gestión de planes
async function loadPlanesData() {
    try {
        // Cargar planes desde el backend
        const response = await fetch(`${API_BASE_URL}/api/planes/listar`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        let planesData;
        
        if (response.ok) {
            planesData = await response.json();
            console.log('✅ Planes cargados desde backend:', planesData);
        } else {
            // Fallback a planes demo si falla la carga
            console.warn('⚠️ No se pudieron cargar planes desde backend, usando planes locales');
            planesData = {
                planes: [
                    {
                        id: 'plan-gratuito',
                        nombre: 'Plan Gratuito',
                        precio_mensual: 0,
                        tokens_mes: 100,
                        dispositivos_concurrentes: 1,
                        descripcion: 'Para probar el sistema'
                    },
                    {
                        id: 'plan-basico',
                        nombre: 'Plan Básico',
                        precio_mensual: 29.99,
                        tokens_mes: 1000,
                        dispositivos_concurrentes: 3,
                        descripcion: 'Perfecto para pequeñas empresas'
                    },
                    {
                        id: 'plan-profesional',
                        nombre: 'Plan Profesional',
                        precio_mensual: 59.99,
                        tokens_mes: 5000,
                        dispositivos_concurrentes: 8,
                        descripcion: 'Ideal para empresas medianas'
                    },
                    {
                        id: 'plan-empresarial',
                        nombre: 'Plan Empresarial',
                        precio_mensual: 149.99,
                        tokens_mes: 15000,
                        dispositivos_concurrentes: 25,
                        descripcion: 'Para grandes importadoras'
                    },
                    {
                        id: 'plan-corporativo',
                        nombre: 'Plan Corporativo',
                        precio_mensual: 299.99,
                        tokens_mes: 50000,
                        dispositivos_concurrentes: 100,
                        descripcion: 'Para corporaciones grandes'
                    },
                    {
                        id: 'plan-ilimitado',
                        nombre: 'Plan Ilimitado',
                        precio_mensual: 599.99,
                        tokens_mes: -1,
                        dispositivos_concurrentes: -1,
                        descripcion: 'Sin límites para grandes corporaciones'
                    }
                ]
            };
        }
        
        displayPlanes(planesData.planes || planesData);
        
        // Cargar historial de consumo demo
        loadConsumoHistory();
        
    } catch (error) {
        console.error('Error cargando datos de planes:', error);
        document.getElementById('planes-grid').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                Error cargando planes disponibles
            </div>
        `;
    }
}

function displayPlanes(planes) {
    const planesGrid = document.getElementById('planes-grid');
    
    if (!planes || planes.length === 0) {
        planesGrid.innerHTML = `
            <div class="no-plans">
                <i class="fas fa-info-circle"></i>
                No hay planes disponibles
            </div>
        `;
        return;
    }
    
    // Obtener el plan actual del usuario desde userInfo
    const planActual = userInfo?.plan?.id || userInfo?.empresa?.plan_id || 'plan-basico';
    console.log('📋 Plan actual del usuario:', planActual);
    
    planesGrid.innerHTML = '';
    
    planes.forEach(plan => {
        const isCurrentPlan = plan.id === planActual;
        
        const planCard = document.createElement('div');
        planCard.className = `plan-card ${isCurrentPlan ? 'current' : 'selectable'}`;
        
        // Formatear tokens - usar tokens_mes (nombre en la BD)
        const tokens = plan.tokens_mes || 0;
        let tokensText;
        if (tokens === -1) {
            tokensText = 'Ilimitados';
        } else if (tokens >= 1000000) {
            tokensText = (tokens / 1000000).toFixed(1) + 'M';
        } else if (tokens >= 1000) {
            tokensText = (tokens / 1000) + 'K';
        } else {
            tokensText = tokens.toString();
        }
        
        // Formatear dispositivos
        const dispositivos = plan.dispositivos_concurrentes || 0;
        let dispositivosText = dispositivos === -1 ? 'Ilimitados' : dispositivos;
        
        // Usar precio_mensual_usd (nombre correcto en la BD)
        const precio = plan.precio_mensual_usd || plan.precio_mensual || 0;
        
        // Usar plan.id como nombre si no existe nombre
        const nombrePlan = plan.nombre || plan.id || 'Plan';
        
        planCard.innerHTML = `
            <div class="plan-header">
                <div class="plan-name">${nombrePlan}</div>
                <div class="plan-price">$${precio.toFixed(2)}/mes</div>
            </div>
            <div class="plan-details">
                <div class="plan-tokens">⚡ ${tokensText} tokens/mes</div>
                <div class="plan-devices">📱 ${dispositivosText} dispositivos</div>
            </div>
            <div class="plan-description">${plan.descripcion || ''}</div>
            ${isCurrentPlan ? 
                '<div class="current-badge"><i class="fas fa-check-circle"></i> Plan Actual</div>' :
                `<button class="plan-select-button" onclick="cambiarPlan('${plan.id}')">
                    <i class="fas fa-arrow-up"></i> Seleccionar Plan
                </button>`
            }
        `;
        
        planesGrid.appendChild(planCard);
    });
}

async function cambiarPlan(planId) {
    if (!authToken) {
        showNotification('Debes iniciar sesión para cambiar de plan', 'error');
        showLoginModal();
        return;
    }
    
    const confirmacion = confirm(`¿Estás seguro de que quieres cambiar a este plan?`);
    
    if (!confirmacion) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/planes/cambiar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ plan_id: planId })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification(`✅ ${data.mensaje}`, 'success');
            
            // Actualizar userInfo con los nuevos datos
            if (userInfo) {
                userInfo.plan = data.plan;
                userInfo.limites = data.limites;
                userInfo.empresa = data.empresa;
            }
            
            // Actualizar UI
            updatePlanInfo();
            
            // Recargar datos de planes para actualizar la vista
            await loadPlanesData();
            
        } else {
            if (response.status === 401) {
                authToken = null;
                localStorage.removeItem('authToken');
                showError('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
                showLoginModal();
                return;
            }
            showNotification(data.mensaje || 'Error al cambiar plan', 'error');
        }
        
    } catch (error) {
        console.error('Error cambiando plan:', error);
        showNotification('Error de conexión al cambiar plan', 'error');
    }
}

async function loadConsumoHistory() {
    const historyContainer = document.getElementById('consumo-history');
    if (!historyContainer) return;
    
    try {
        // Mostrar loading
        historyContainer.innerHTML = `
            <div class="history-content">
                <h4>📊 Últimas Clasificaciones</h4>
                <div class="loading-spinner">Cargando historial...</div>
            </div>
        `;
        
        // Obtener historial real desde el API
        const response = await fetch(`${API_BASE_URL}/api/historial?limite=10`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Error al cargar historial');
        }
        
        const data = await response.json();
        const clasificaciones = data.clasificaciones || [];
        
        if (clasificaciones.length === 0) {
            historyContainer.innerHTML = `
                <div class="history-content">
                    <h4>📊 Últimas Clasificaciones</h4>
                    <p class="no-history">No hay clasificaciones recientes</p>
                </div>
            `;
            return;
        }
        
        // Formatear y mostrar historial
        const historialHtml = clasificaciones.slice(0, 10).map(item => {
            const fecha = new Date(item.fecha_creacion).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
            const hora = new Date(item.fecha_creacion).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const tipo = item.tipo_operacion || 'texto';
            // Obtener el primer HSCode de los productos
            const fraccion = (item.productos && item.productos.length > 0 && item.productos[0].HSCode) 
                ? item.productos[0].HSCode 
                : 'N/A';
            const nombreArchivo = item.nombre_archivo || 'Sin nombre';
            const descripcion = nombreArchivo.substring(0, 30);
            const tokensUsados = item.tokens_consumidos || 0;
            
            return `
                <div class="history-item">
                    <div class="history-main">
                        <span class="history-date">${fecha} ${hora}</span>
                        <span class="history-fraccion">${fraccion}</span>
                    </div>
                    <div class="history-details">
                        <span class="history-type tipo-${tipo}">${tipo}</span>
                        <span class="history-desc" title="${nombreArchivo}">${descripcion}${nombreArchivo.length > 30 ? '...' : ''}</span>
                        <span class="history-tokens">🔥 ${tokensUsados.toLocaleString()} tokens</span>
                    </div>
                </div>
            `;
        }).join('');
        
        historyContainer.innerHTML = `
            <div class="history-content">
                <h4>📊 Últimas Clasificaciones</h4>
                ${historialHtml}
            </div>
        `;
        
    } catch (error) {
        console.error('Error cargando historial:', error);
        historyContainer.innerHTML = `
            <div class="history-content">
                <h4>📊 Últimas Clasificaciones</h4>
                <p class="error-message">Error al cargar historial</p>
            </div>
        `;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async function() {
    console.log('✅ DOM cargado - Script inicializado');
    
    // Sincronizar authToken con localStorage siempre
    const storedToken = localStorage.getItem('authToken');
    if (storedToken && storedToken !== authToken) {
        authToken = storedToken;
        console.log('🔄 Token sincronizado desde localStorage');
    }
    
    // Solo ejecutar si estamos en la página principal (no en admin panel)
    const isMainPage = document.getElementById('producto-texto') !== null;
    
    if (isMainPage) {
        // Inicializar tabs
        showTab('texto');
        
        // Restaurar sesión si existe token
        await restaurarSesion();
        
        // Verificar conexión con el backend al cargar la página
        const conectado = await verificarConexion();
        
        if (conectado) {
            // Mostrar indicador visual de que está conectado
            const header = document.querySelector('.header-content p');
            if (header) {
                header.innerHTML += ' <span style="color: #10b981;">● Conectado</span>';
            }
        }
        
        // Enter key en textarea
        const productoTexto = document.getElementById('producto-texto');
        if (productoTexto) {
            productoTexto.addEventListener('keydown', function(event) {
                if (event.ctrlKey && event.key === 'Enter') {
                    clasificarTexto();
                }
            });
        }
    }
    
    // Drag and drop para archivos
    const fileUploadArea = document.querySelector('.file-upload-area');
    if (fileUploadArea) {
        fileUploadArea.addEventListener('dragover', function(event) {
            event.preventDefault();
            this.style.borderColor = 'var(--primary-color)';
            this.style.backgroundColor = 'rgba(37, 99, 235, 0.05)';
        });
        
        fileUploadArea.addEventListener('dragleave', function(event) {
            event.preventDefault();
            this.style.borderColor = 'var(--border-color)';
            this.style.backgroundColor = 'transparent';
        });
        
        fileUploadArea.addEventListener('drop', function(event) {
            event.preventDefault();
            this.style.borderColor = 'var(--border-color)';
            this.style.backgroundColor = 'transparent';
            
            const files = event.dataTransfer.files;
            if (files.length > 0) {
                const fileInput = document.getElementById('file-input');
                fileInput.files = files;
                handleFileSelect(fileInput);
            }
        });
    }
    
    // Verificar autenticación al cargar
    // checkAuthStatus(); // Comentado - función no existe
});

// Funciones para gestión de planes - FUNCIÓN DUPLICADA ELIMINADA
// La función principal loadPlanesData() está arriba y maneja todos los 6 planes

// Función duplicada eliminada - usando la función principal arriba

async function cambiarPlan(planId) {
    if (!authToken) {
        mostrarNotificacion('Debes iniciar sesión para cambiar de plan', 'warning');
        return;
    }
    
    const confirmacion = confirm(`¿Estás seguro de que quieres cambiar de plan?`);
    if (!confirmacion) return;
    
    try {
        console.log('🔄 Cambiando plan a:', planId);
        
        const response = await fetch(`${API_BASE_URL}/api/planes/cambiar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ plan_id: planId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (data.error === 'same_plan') {
                mostrarNotificacion('Ya tienes este plan activo', 'info');
            } else {
                throw new Error(data.mensaje || 'Error al cambiar el plan');
            }
            return;
        }
        
        console.log('✅ Plan cambiado exitosamente:', data);
        
        // Actualizar userInfo con los nuevos datos
        if (data.plan && data.limites && data.empresa) {
            userInfo = {
                ...userInfo,
                empresa: data.empresa,
                plan: data.plan,
                limites: data.limites
            };
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            
            // Actualizar UI inmediatamente
            const tokensInfo = document.getElementById('tokens-info');
            if (tokensInfo) {
                tokensInfo.textContent = `${data.limites.tokens_consumidos.toLocaleString()} / ${data.limites.tokens_limite_mensual.toLocaleString()} tokens`;
            }
            
            const devicesInfo = document.getElementById('devices-info');
            if (devicesInfo) {
                devicesInfo.textContent = `${data.limites.dispositivos_activos} / ${data.limites.dispositivos_limite} dispositivos`;
            }
        }
        
        mostrarNotificacion(`Plan actualizado exitosamente a ${data.plan.nombre}`, 'success');
        
        // Recargar los planes para actualizar el estado
        setTimeout(() => {
            loadPlanesData();
        }, 500);
        
    } catch (error) {
        console.error('Error cambiando plan:', error);
        mostrarNotificacion(`Error: ${error.message}`, 'error');
    }
}

function updatePlanInfo() {
    if (!userInfo) return;
    
    try {
        // Verificar que existan las propiedades necesarias
        if (!userInfo.plan || !userInfo.limites) {
            console.warn('⚠️ Datos de plan o límites no disponibles en userInfo');
            return;
        }
        
        // Actualizar información del plan actual
        const planNameEl = document.getElementById('current-plan-name');
        if (planNameEl) planNameEl.textContent = userInfo.plan.id || 'N/A';
        
        const planPriceEl = document.getElementById('current-plan-price');
        if (planPriceEl) planPriceEl.textContent = `$${userInfo.plan.precio_mensual_usd || 0}/mes`;
        
        let tokensFormatted = ((userInfo.plan.tokens_mes || 0) / 1000).toLocaleString() + 'K';
        if (userInfo.plan.tokens_mes >= 1000000) {
            tokensFormatted = ((userInfo.plan.tokens_mes || 0) / 1000000).toLocaleString() + 'M';
        }
        const planTokensEl = document.getElementById('current-plan-tokens');
        if (planTokensEl) planTokensEl.textContent = `${tokensFormatted} tokens/mes`;
        
        const planDevicesEl = document.getElementById('current-plan-devices');
        if (planDevicesEl) planDevicesEl.textContent = `${userInfo.plan.dispositivos_concurrentes || 0} dispositivos`;
        
        // Actualizar barra de progreso
        const tokensConsumidos = userInfo.limites.tokens_consumidos || 0;
        const tokensLimite = userInfo.limites.tokens_limite_mensual || 1;
        const porcentajeUso = (tokensConsumidos / tokensLimite) * 100;
        
        const progressBar = document.getElementById('tokens-progress');
        if (progressBar) progressBar.style.width = `${Math.min(porcentajeUso, 100)}%`;
        
        const usageTextEl = document.getElementById('tokens-usage-text');
        if (usageTextEl) usageTextEl.textContent = 
            `${tokensConsumidos.toLocaleString()} / ${tokensLimite.toLocaleString()} tokens`;
            
        // Cambiar color de la barra según el uso
        if (progressBar) {
            if (porcentajeUso > 90) {
                progressBar.style.background = 'linear-gradient(90deg, var(--error-color), var(--warning-color))';
            } else if (porcentajeUso > 70) {
                progressBar.style.background = 'linear-gradient(90deg, var(--warning-color), var(--success-color))';
            } else {
                progressBar.style.background = 'linear-gradient(90deg, var(--success-color), var(--primary-color))';
            }
        }
        
    } catch (error) {
        console.error('Error actualizando información de plan:', error);
    }
}

// Funciones para edición de clasificación
function showEditForm(productIndex = 0) {
    console.log('🔍 showEditForm llamado con índice:', productIndex);
    console.log('📊 resultadoActual:', resultadoActual);
    
    const dataToEdit = Array.isArray(resultadoActual) ? resultadoActual[productIndex] : resultadoActual;
    
    if (!dataToEdit) {
        showNotification('No hay resultado para editar', 'error');
        console.error('❌ No hay datos para editar');
        return;
    }
    
    console.log('📝 Datos a editar:', dataToEdit);
    
    // Guardar índice del producto que se está editando
    currentEditingIndex = productIndex;
    
    // Poblar el formulario con los datos actuales
    populateEditForm(dataToEdit);
    
    // Actualizar título del modal
    const modalTitle = document.querySelector('#edit-modal h2');
    if (modalTitle) {
        const productName = dataToEdit.descripcion_comercial || dataToEdit.item_name || `Producto ${productIndex + 1}`;
        modalTitle.textContent = `Editar: ${productName}`;
    }
    
    // Mostrar el modal
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.style.display = 'flex';
        console.log('✅ Modal abierto');
    } else {
        console.error('❌ Modal no encontrado');
    }
}

function hideEditForm() {
    document.getElementById('edit-modal').style.display = 'none';
    clearValidation();
    currentEditingIndex = null;
}

function populateEditForm(data) {
    // Limpiar formulario primero
    clearEditForm();
    
    // Si es array, tomar el primer elemento
    const item = Array.isArray(data) ? data[0] : data;
    
    if (!item) {
        console.error('❌ No hay datos para rellenar en el formulario');
        return;
    }
    
    console.log('📋 Rellenando formulario con datos:', item);
    
    // Función helper para buscar valores en múltiples posibles keys
    const tryGet = (obj, ...keys) => {
        for (const key of keys) {
            if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
                return obj[key];
            }
        }
        return null;
    };
    
    // Extraer valores de forma recursiva incluyendo objetos anidados
    const extractValue = (obj, ...possibleKeys) => {
        // Primero intentar en el nivel superior
        let value = tryGet(obj, ...possibleKeys);
        if (value !== null) return value;
        
        // Buscar en objetos anidados comunes
        if (obj.mercancia) value = tryGet(obj.mercancia, ...possibleKeys);
        if (value !== null) return value;
        
        if (obj.product) value = tryGet(obj.product, ...possibleKeys);
        if (value !== null) return value;
        
        if (obj.ImpDeclarationProduct && Array.isArray(obj.ImpDeclarationProduct)) {
            value = tryGet(obj.ImpDeclarationProduct[0], ...possibleKeys);
            if (value !== null) return value;
        }
        
        if (obj.productos && Array.isArray(obj.productos)) {
            value = tryGet(obj.productos[0], ...possibleKeys);
            if (value !== null) return value;
        }
        
        return null;
    };
    
    // Mapear campos correctamente (búsqueda exhaustiva)
    const mapped = {
        hs: extractValue(item, 'hs', 'codigo_hs', 'hs_code', 'HSCode'),
        descripcion: extractValue(item, 'descripcion_arancelaria', 'description', 'descripcion', 'Descripcion'),
        descripcion_comercial: extractValue(item, 'descripcion_comercial', 'item_name', 'product_name', 'ProductName', 'nombre_producto', 'producto'),
        dai: extractValue(item, 'dai', 'arancel', 'DAI', 'derecho_arancel'),
        itbis: extractValue(item, 'itbis', 'impuesto', 'ITBIS', 'iva') || '18.00',
        pais_origen: extractValue(item, 'pais_origen', 'country_of_origin', 'origen', 'origin', 'OriginCountry'),
        pais_procedencia: extractValue(item, 'pais_procedencia', 'country_of_origin', 'procedencia'),
        marca: extractValue(item, 'marca', 'brand', 'BrandName'),
        modelo: extractValue(item, 'modelo', 'model', 'ModelName'),
        material: extractValue(item, 'material', 'Material'),
        uso: extractValue(item, 'uso', 'aplicacion', 'use', 'application'),
        peso: extractValue(item, 'peso_neto', 'weight', 'net_weight', 'NetWeight'),
        peso_bruto: extractValue(item, 'peso_bruto', 'gross_weight', 'GrossWeight'),
        dimensiones: extractValue(item, 'dimensiones', 'dimensions', 'Dimensions'),
        valor_unitario: extractValue(item, 'valor_unitario', 'value', 'FOBValue', 'fob_unitario'),
        valor_total: extractValue(item, 'valor_total', 'total_value', 'TotalFOB', 'total'),
        cantidad: extractValue(item, 'cantidad_total', 'quantity', 'Qty', 'cantidad') || '1',
        unidad_medida: extractValue(item, 'unidad_medida_estadistica', 'unit_of_measure', 'UnitCode', 'unidad'),
        moneda: extractValue(item, 'moneda', 'currency', 'Currency'),
        incoterm: extractValue(item, 'incoterm', 'Incoterm'),
        especificacion: extractValue(item, 'especificacion', 'specification', 'ProductSpecification'),
        ano: extractValue(item, 'ano', 'year', 'ProductYear'),
        observaciones: extractValue(item, 'observaciones', 'notas', 'notes', 'observations')
    };
    
    console.log('🔄 Datos mapeados:', mapped);
    
    // Función auxiliar para setear valores de forma segura
    const setInputValue = (fieldId, value) => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.value = value || '';
            if (value) {
                console.log(`✅ Campo ${fieldId} rellenado con: ${value}`);
            }
        } else {
            console.warn(`⚠️ Campo ${fieldId} no encontrado en el HTML`);
        }
    };
    
    // Campos obligatorios
    setInputValue('edit-hs-code', mapped.hs ? formatearCodigoHS(mapped.hs) : '');
    setInputValue('edit-description', mapped.descripcion);
    setInputValue('edit-dai', mapped.dai);
    setInputValue('edit-itbis', mapped.itbis);
    setInputValue('edit-product-name', mapped.descripcion_comercial);
    setInputValue('edit-origin', mapped.pais_origen);
    
    // Campos opcionales
    setInputValue('edit-brand', mapped.marca);
    setInputValue('edit-model', mapped.modelo);
    setInputValue('edit-material', mapped.material);
    setInputValue('edit-use', mapped.uso);
    setInputValue('edit-weight', mapped.peso);
    setInputValue('edit-dimensions', mapped.dimensiones);
    setInputValue('edit-value', mapped.valor_unitario);
    setInputValue('edit-quantity', mapped.cantidad);
    setInputValue('edit-observations', mapped.observaciones);
    
    // Mostrar un resumen de los campos cargados en consola
    const loadedFields = Object.entries(mapped).filter(([k, v]) => v !== null && v !== '').length;
    console.log(`✅ Formulario rellenado: ${loadedFields}/${Object.keys(mapped).length} campos con datos`);
    
    // Si hay campos sin llenar obligatorios, mostrar advertencia
    const requiredFields = ['hs', 'descripcion', 'dai', 'itbis', 'descripcion_comercial', 'pais_origen'];
    const missingRequired = requiredFields.filter(f => !mapped[f]);
    if (missingRequired.length > 0) {
        console.warn(`⚠️ Campos obligatorios sin datos: ${missingRequired.join(', ')}`);
        showNotification(`Algunos campos obligatorios están vacíos. Por favor, complételos antes de guardar.`, 'warning');
    }
}

function clearEditForm() {
    const form = document.getElementById('edit-form');
    const inputs = form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.value = '';
        input.classList.remove('valid', 'error');
    });
    clearValidation();
}

function validateRequiredFields() {
    const requiredFields = [
        { id: 'edit-hs-code', name: 'Código HS' },
        { id: 'edit-description', name: 'Descripción Arancelaria' },
        { id: 'edit-dai', name: 'DAI (%)' },
        { id: 'edit-itbis', name: 'ITBIS (%)' },
        { id: 'edit-product-name', name: 'Nombre del Producto' },
        { id: 'edit-origin', name: 'País de Origen' }
    ];
    
    const errors = [];
    let isValid = true;
    
    requiredFields.forEach(field => {
        const input = document.getElementById(field.id);
        const value = input.value.trim();
        
        if (!value) {
            errors.push(field.name);
            input.classList.add('error');
            input.classList.remove('valid');
            isValid = false;
        } else {
            input.classList.add('valid');
            input.classList.remove('error');
        }
    });
    
    // Validación específica para código HS
    const hsCode = document.getElementById('edit-hs-code').value;
    if (hsCode && !/^\d{4}\.\d{2}\.\d{2}\.\d{2}$/.test(hsCode)) {
        if (!errors.includes('Código HS')) {
            errors.push('Código HS (formato incorrecto)');
        }
        document.getElementById('edit-hs-code').classList.add('error');
        isValid = false;
    }
    
    // Mostrar errores si existen
    if (errors.length > 0) {
        showValidationErrors(errors);
    } else {
        clearValidation();
    }
    
    return isValid;
}

function showValidationErrors(errors) {
    const summary = document.getElementById('validation-summary');
    const list = document.getElementById('validation-list');
    
    list.innerHTML = '';
    errors.forEach(error => {
        const li = document.createElement('li');
        li.textContent = error;
        list.appendChild(li);
    });
    
    summary.style.display = 'block';
    summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearValidation() {
    document.getElementById('validation-summary').style.display = 'none';
    const inputs = document.querySelectorAll('.form-input');
    inputs.forEach(input => {
        input.classList.remove('valid', 'error');
    });
}

function validateAndSave() {
    if (!validateRequiredFields()) {
        showNotification('Por favor, complete todos los campos obligatorios', 'error');
        return;
    }
    
    // Recopilar datos del formulario con TODOS los campos
    const editedData = {
        hs: document.getElementById('edit-hs-code').value,
        descripcion_arancelaria: document.getElementById('edit-description').value,
        descripcion_comercial: document.getElementById('edit-product-name').value,
        dai: parseFloat(document.getElementById('edit-dai').value),
        itbis: parseFloat(document.getElementById('edit-itbis').value),
        pais_origen: document.getElementById('edit-origin').value,
        marca: document.getElementById('edit-brand').value,
        modelo: document.getElementById('edit-model').value,
        material: document.getElementById('edit-material').value,
        uso: document.getElementById('edit-use').value,
        peso_neto: parseFloat(document.getElementById('edit-weight').value) || null,
        dimensiones: document.getElementById('edit-dimensions').value,
        valor_unitario: parseFloat(document.getElementById('edit-value').value) || null,
        cantidad_total: parseInt(document.getElementById('edit-quantity').value) || 1,
        observaciones: document.getElementById('edit-observations').value,
        fecha_clasificacion: new Date().toISOString(),
        validado: true,
        editado: true
    };
    
    console.log('💾 Guardando datos editados:', editedData);
    
    // Actualizar el resultado actual
    if (Array.isArray(resultadoActual)) {
        // Múltiples productos - actualizar el específico
        resultadoActual[currentEditingIndex] = { ...resultadoActual[currentEditingIndex], ...editedData };
        if (!editedClassification) editedClassification = [];
        editedClassification[currentEditingIndex] = editedData;
        console.log(`✅ Producto ${currentEditingIndex} actualizado`);
    } else {
        // Producto único - mergear con datos existentes
        resultadoActual = { ...resultadoActual, ...editedData };
        editedClassification = resultadoActual;
        console.log('✅ Producto único actualizado');
    }
    
    // IMPORTANTE: Sincronizar con window.resultadoActual
    window.resultadoActual = resultadoActual;
    window.editedClassification = editedClassification;
    
    console.log('📊 resultadoActual después de editar:', resultadoActual);
    
    // Actualizar la vista de resultados
    updateResultsView();
    
    // Actualizar botones
    updateActionButtons();
    
    // Cerrar modal
    hideEditForm();
    
    showNotification('✅ Clasificación guardada. Ahora puede exportar el XML actualizado.', 'success');
}

function updateActionButtons() {
    const isMultiProduct = Array.isArray(resultadoActual) && resultadoActual.length > 1;
    
    if (isMultiProduct) {
        // Verificar si todos los productos han sido editados
        const allEdited = editedClassification && editedClassification.length === resultadoActual.length &&
                         editedClassification.every(item => item && item.validado);
        
        const exportAllBtn = document.getElementById('btn-export-all');
        if (exportAllBtn) {
            if (allEdited) {
                exportAllBtn.style.display = 'inline-flex';
                exportAllBtn.innerHTML = '<i class="fas fa-download"></i> Exportar Todos (XML)';
                exportAllBtn.disabled = false;
                exportAllBtn.classList.add('btn-success');
                exportAllBtn.classList.remove('btn-secondary');
            } else {
                exportAllBtn.style.display = 'inline-flex';
                exportAllBtn.innerHTML = '<i class="fas fa-info-circle"></i> Edite todos los productos para exportar';
                exportAllBtn.disabled = true;
            }
        }
        
        // Actualizar botones individuales
        const editButtons = document.querySelectorAll('.btn-edit-individual');
        editButtons.forEach((btn, index) => {
            if (editedClassification && editedClassification[index] && editedClassification[index].validado) {
                btn.innerHTML = '<i class="fas fa-check-circle"></i> Editado';
                btn.classList.add('edited');
            }
        });
        
    } else {
        // Producto único
        const exportBtn = document.getElementById('btn-export');
        const editBtn = document.getElementById('btn-edit-result');
        const editHint = document.querySelector('.edit-hint');
        
        if (editedClassification && editedClassification.validado) {
            // Ya fue editado
            if (editBtn) {
                editBtn.innerHTML = '<i class="fas fa-check-circle"></i> Clasificación Editada';
                editBtn.classList.add('edited');
                editBtn.classList.remove('pulse-animation');
            }
            if (exportBtn) {
                exportBtn.classList.add('pulse-animation');
            }
            if (editHint) {
                editHint.innerHTML = '<i class="fas fa-check-circle"></i> ¡Perfecto! Ahora puedes exportar el XML con los datos actualizados.';
                editHint.style.background = 'rgba(5, 150, 105, 0.1)';
                editHint.style.borderColor = 'rgba(5, 150, 105, 0.3)';
            }
        } else {
            // No ha sido editado aún
            if (exportBtn) {
                exportBtn.classList.remove('pulse-animation');
            }
        }
    }
}

function updateResultsView() {
    const contentDiv = document.getElementById('results-content');
    
    // Limpiar contenido anterior manteniendo la info de tokens
    const tokensCard = contentDiv.querySelector('.tokens-info-card');
    contentDiv.innerHTML = '';
    
    // Re-agregar la tarjeta de tokens si existía
    if (tokensCard) {
        contentDiv.appendChild(tokensCard);
    }
    
    // Crear nueva tarjeta de resultados editada
    const editedCard = createEditedResultCard(editedClassification);
    contentDiv.appendChild(editedCard);
}

function createEditedResultCard(data) {
    const card = document.createElement('div');
    card.className = 'result-card edited-result';
    
    card.innerHTML = `
        <div class="result-header">
            <div class="hs-code">${data.hs}</div>
            <span class="edited-badge"><i class="fas fa-check-circle"></i> Editado y Validado</span>
        </div>
        
        <div class="result-content">
            <div class="result-section">
                <h4><i class="fas fa-info-circle"></i> Información Principal</h4>
                <div class="result-grid">
                    <div class="result-item">
                        <span class="label">Producto:</span>
                        <span class="value">${data.producto}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">Origen:</span>
                        <span class="value">${data.origen}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">Descripción Arancelaria:</span>
                        <span class="value">${data.descripcion}</span>
                    </div>
                </div>
            </div>
            
            <div class="result-section">
                <h4><i class="fas fa-percentage"></i> Impuestos</h4>
                <div class="result-grid">
                    <div class="result-item">
                        <span class="label">DAI:</span>
                        <span class="value">${data.dai}%</span>
                    </div>
                    <div class="result-item">
                        <span class="label">ITBIS:</span>
                        <span class="value">${data.itbis}%</span>
                    </div>
                </div>
            </div>
            
            ${data.marca || data.modelo || data.material ? `
            <div class="result-section">
                <h4><i class="fas fa-tags"></i> Detalles Adicionales</h4>
                <div class="result-grid">
                    ${data.marca ? `
                    <div class="result-item">
                        <span class="label">Marca:</span>
                        <span class="value">${data.marca}</span>
                    </div>` : ''}
                    ${data.modelo ? `
                    <div class="result-item">
                        <span class="label">Modelo:</span>
                        <span class="value">${data.modelo}</span>
                    </div>` : ''}
                    ${data.material ? `
                    <div class="result-item">
                        <span class="label">Material:</span>
                        <span class="value">${data.material}</span>
                    </div>` : ''}
                    ${data.peso ? `
                    <div class="result-item">
                        <span class="label">Peso:</span>
                        <span class="value">${data.peso} kg</span>
                    </div>` : ''}
                    ${data.valor_fob ? `
                    <div class="result-item">
                        <span class="label">Valor FOB:</span>
                        <span class="value">$${data.valor_fob.toFixed(2)} USD</span>
                    </div>` : ''}
                    <div class="result-item">
                        <span class="label">Cantidad:</span>
                        <span class="value">${data.cantidad}</span>
                    </div>
                </div>
            </div>` : ''}
            
            ${data.observaciones ? `
            <div class="result-section">
                <h4><i class="fas fa-comment"></i> Observaciones</h4>
                <p class="observations">${data.observaciones}</p>
            </div>` : ''}
        </div>
    `;
    
    return card;
}

// Función mejorada de exportación para ImportDUA
async function showExportOptions() {
    console.log('📤 Iniciando exportación ImportDUA...');
    
    // IMPORTANTE: Sincronizar variables antes de exportar
    // Usar window.resultadoActual como fuente de verdad
    if (window.resultadoActual) {
        resultadoActual = window.resultadoActual;
    }
    
    if (!resultadoActual) {
        showNotification('No hay datos para exportar', 'error');
        return;
    }
    
    // CRÍTICO: Asegurar que los productos tengan todos los campos originales de la API
    // Los campos de la API son: Description, Quantity, UnitPriceUSD, AmountUSD, Unit
    // El XML espera: ProductName, Qty, FOBValue, UnitCode
    
    const productosOriginales = window._productosOriginales || [];
    const productosActuales = window.productosClasificados || resultadoActual.ImpDeclarationProduct || [];
    
    console.log('📦 Preparando productos para exportación:');
    console.log('   - Productos originales (_productosOriginales):', productosOriginales.length);
    console.log('   - Productos actuales (productosClasificados):', productosActuales.length);
    
    if (productosOriginales.length > 0 && productosOriginales[0]) {
        console.log('   - Campos del primer producto original:', Object.keys(productosOriginales[0]));
    }
    
    // Fusionar productos: originales + actuales (actuales tienen prioridad)
    resultadoActual.ImpDeclarationProduct = productosActuales.map((productoActual, idx) => {
        // Limpiar propiedades internas
        const { _index, _isManual, ...productoLimpio } = productoActual;
        
        // Obtener producto original correspondiente
        const productoOriginalRaw = productosOriginales[idx] || {};
        const { _index: _oi, _isManual: _om, ...productoOriginal } = productoOriginalRaw;
        
        // FUSIÓN FINAL: original + actual
        const productoFinal = {
            ...productoOriginal,  // Campos originales de la API
            ...productoLimpio     // Campos editados (tienen prioridad)
        };
        
        // Debug: verificar si faltan campos importantes
        if (idx >= productosActuales.length - 5) { // Solo los últimos 5
            const tieneNombre = productoFinal.ProductName || productoFinal.Description;
            const tieneValor = productoFinal.FOBValue || productoFinal.UnitPriceUSD || productoFinal.AmountUSD;
            if (!tieneNombre || !tieneValor) {
                console.warn(`⚠️ Producto ${idx + 1} incompleto:`, {
                    ProductName: productoFinal.ProductName,
                    Description: productoFinal.Description,
                    FOBValue: productoFinal.FOBValue,
                    UnitPriceUSD: productoFinal.UnitPriceUSD,
                    camposOriginal: Object.keys(productoOriginal),
                    camposActual: Object.keys(productoLimpio)
                });
            }
        }
        
        return productoFinal;
    });
    
    console.log('📦 Productos fusionados:', resultadoActual.ImpDeclarationProduct.length);
    console.log('📊 JSON a exportar:', JSON.stringify(resultadoActual, null, 2).substring(0, 1000) + '...');
    
    // Validar campos obligatorios antes de exportar
    const erroresValidacion = validarCamposObligatoriosSIGA(resultadoActual);
    if (erroresValidacion.length > 0) {
        mostrarPanelValidacion(erroresValidacion);
        showNotification('Complete los campos obligatorios antes de exportar', 'error');
        return;
    }
    
    // Ocultar panel de validación si todo está correcto
    ocultarPanelValidacion();
    
    try {
        // Llamar al backend para generar el XML en formato ImportDUA
        const headers = {
            'Content-Type': 'application/json'
        };
        const token = localStorage.getItem('authToken');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        const response = await fetch('http://localhost:3050/generar-xml', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(resultadoActual)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.errores) {
                const mensajeError = '⚠️ Errores de validación:\n\n' + errorData.errores.join('\n');
                alert(mensajeError);
                showNotification('Corrija los errores antes de exportar', 'error');
                return;
            }
            throw new Error(`Error del servidor: ${response.status}`);
        }
        
        const xmlContent = await response.text();
        console.log('📝 XML ImportDUA generado desde el backend');
        
        const timestamp = new Date().getTime();
        const fileName = `ImportDUA_${timestamp}.xml`;
        
        downloadFile(xmlContent, fileName, 'application/xml');
        
        showNotification(`✅ XML ImportDUA exportado correctamente: ${fileName}`, 'success');
    } catch (error) {
        console.error('❌ Error al generar XML:', error);
        showNotification('Error al generar XML: ' + error.message, 'error');
    }
}

// Función para validar campos obligatorios según requisitos de SIGA
function validarCamposObligatoriosSIGA(jsonData) {
    const errores = [];
    const data = jsonData.ImportDUA?.ImpDeclaration || jsonData;
    
    console.log('🔎 Validando datos para SIGA...');
    
    // ========== CAMPOS OBLIGATORIOS DE LA DECLARACIÓN ==========
    
    // ClearanceType
    if (!data.ClearanceType || data.ClearanceType.toString().trim() === '') {
        errores.push('• ClearanceType es obligatorio (ej: IC38-002)');
    }
    
    // AreaCode
    if (!data.AreaCode || data.AreaCode.toString().trim() === '') {
        errores.push('• AreaCode es obligatorio (ej: 10150)');
    }
    
    // FormNo
    if (!data.FormNo || data.FormNo.toString().trim() === '') {
        errores.push('• FormNo es obligatorio (ej: 39155)');
    }
    
    // BLNo
    if (!data.BLNo || data.BLNo.toString().trim() === '') {
        errores.push('• BLNo es obligatorio (usar PRELIQUIDACION si no tiene)');
    }
    
    // ConsigneeCode
    if (!data.ConsigneeCode || data.ConsigneeCode.toString().trim() === '') {
        errores.push('• ConsigneeCode es obligatorio (ej: RNC214101830141)');
    }
    
    // ConsigneeName
    if (!data.ConsigneeName || data.ConsigneeName.toString().trim() === '') {
        errores.push('• ConsigneeName es obligatorio');
    }
    
    // ImporterCode
    if (!data.ImporterCode || data.ImporterCode.toString().trim() === '') {
        errores.push('• ImporterCode es obligatorio (ej: RNC214101830141)');
    }
    
    // ImporterName
    if (!data.ImporterName || data.ImporterName.toString().trim() === '') {
        errores.push('• ImporterName es obligatorio');
    }
    
    // DeclarantCode
    if (!data.DeclarantCode || data.DeclarantCode.toString().trim() === '') {
        errores.push('• DeclarantCode es obligatorio (ej: RNC214101830141)');
    }
    
    // DeclarantName
    if (!data.DeclarantName || data.DeclarantName.toString().trim() === '') {
        errores.push('• DeclarantName es obligatorio');
    }
    
    // RegimenCode
    if (!data.RegimenCode || data.RegimenCode.toString().trim() === '') {
        errores.push('• RegimenCode es obligatorio (ej: 1)');
    }
    
    // Valores numéricos obligatorios
    if (data.TotalFOB === undefined || data.TotalFOB === null || data.TotalFOB === '') {
        errores.push('• TotalFOB es obligatorio (formato: 90513.5000)');
    }
    
    if (data.InsuranceValue === undefined || data.InsuranceValue === null || data.InsuranceValue === '') {
        errores.push('• InsuranceValue es obligatorio (usar 0 si no aplica)');
    }
    
    if (data.FreightValue === undefined || data.FreightValue === null || data.FreightValue === '') {
        errores.push('• FreightValue es obligatorio (usar 0 si no aplica)');
    }
    
    if (data.OtherValue === undefined || data.OtherValue === null || data.OtherValue === '') {
        errores.push('• OtherValue es obligatorio (usar 0.0000 si no aplica)');
    }
    
    if (data.TotalCIF === undefined || data.TotalCIF === null || data.TotalCIF === '') {
        errores.push('• TotalCIF es obligatorio (TotalFOB + Insurance + Freight + Other)');
    }
    
    // ========== PROVEEDOR OBLIGATORIO ==========
    const supplier = data.ImpDeclarationSupplier || {};
    
    if (!supplier.ForeignSupplierName || supplier.ForeignSupplierName.toString().trim() === '') {
        errores.push('• ForeignSupplierName es obligatorio');
    }
    
    if (!supplier.ForeignSupplierCode || supplier.ForeignSupplierCode.toString().trim() === '') {
        errores.push('• ForeignSupplierCode es obligatorio (ej: TID724C103085)');
    }
    
    if (!supplier.ForeignSupplierNationality || supplier.ForeignSupplierNationality.toString().trim() === '') {
        errores.push('• ForeignSupplierNationality es obligatorio (código país, ej: 724)');
    }
    
    // ========== PRODUCTOS OBLIGATORIOS ==========
    const products = data.ImpDeclarationProduct || [];
    
    if (products.length === 0) {
        errores.push('• Debe haber al menos un producto');
    }
    
    products.forEach((product, index) => {
        const num = index + 1;
        
        // HSCode
        if (!product.HSCode || product.HSCode.toString().trim() === '') {
            errores.push(`• Producto ${num}: HSCode es obligatorio`);
        }
        
        // ProductName
        const nombre = product.ProductName || product.Description;
        if (!nombre || nombre.toString().trim() === '') {
            errores.push(`• Producto ${num}: ProductName es obligatorio`);
        }
        
        // ProductStatusCode
        if (!product.ProductStatusCode || product.ProductStatusCode.toString().trim() === '') {
            errores.push(`• Producto ${num}: ProductStatusCode es obligatorio (ej: IC04-001)`);
        }
        
        // FOBValue
        const fob = product.FOBValue ?? product.UnitPriceUSD ?? product.AmountUSD;
        if (fob === undefined || fob === null || fob === '') {
            errores.push(`• Producto ${num}: FOBValue es obligatorio`);
        }
        
        // UnitCode
        if (!product.UnitCode && !product.Unit) {
            errores.push(`• Producto ${num}: UnitCode es obligatorio (ej: 8)`);
        }
        
        // Qty
        const qty = product.Qty ?? product.Quantity;
        if (qty === undefined || qty === null || qty === '') {
            errores.push(`• Producto ${num}: Qty es obligatorio`);
        }
        
        // Weight
        if (product.Weight === undefined || product.Weight === null || product.Weight === '') {
            errores.push(`• Producto ${num}: Weight es obligatorio (usar 1 si no tiene)`);
        }
        
        // OriginCountry
        if (!product.OriginCountry || product.OriginCountry.toString().trim() === '') {
            errores.push(`• Producto ${num}: OriginCountry es obligatorio (código país, ej: 724)`);
        }
        
        // TempProductYN
        if (product.TempProductYN === undefined || product.TempProductYN === null || product.TempProductYN === '') {
            errores.push(`• Producto ${num}: TempProductYN debe ser true o false`);
        }
        
        // OrganicYN
        if (product.OrganicYN === undefined || product.OrganicYN === null || product.OrganicYN === '') {
            errores.push(`• Producto ${num}: OrganicYN debe ser true o false`);
        }
    });
    
    console.log('📋 Errores de validación:', errores.length > 0 ? errores : 'Sin errores');
    
    return errores;
}

// Función para generar XML en formato ImportDUA para SIGA
function generateImportDUAXML(data) {
    function escapeXML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    function getValue(obj, ...keys) {
        for (let key of keys) {
            if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
                return obj[key];
            }
        }
        return '';
    }
    
    // Si es solo código HS, devolver estructura mínima
    if (data.hs && Object.keys(data).length <= 2) {
        return `<?xml version="1.0" encoding="UTF-8"?>
<ImportDUA xmlns="http://www.aduanas.gob.do/siga" version="2.0">
    <ImpDeclarationProduct>
        <HSCode>${escapeXML(data.hs)}</HSCode>
    </ImpDeclarationProduct>
</ImportDUA>`;
    }
    
    // Buscar datos en la estructura (puede estar anidado)
    let impDeclaration = data.ImpDeclaration || {};
    let impSupplier = data.ImpDeclarationSupplier || {};
    let impProducts = data.ImpDeclarationProduct || [];
    let totales = data.TotalesCalculados || {};
    
    // Si no hay estructura ImportDUA, buscar en el objeto raíz
    if (!Array.isArray(impProducts) || impProducts.length === 0) {
        // Buscar productos en cualquier array del objeto
        for (let key in data) {
            if (Array.isArray(data[key]) && data[key].length > 0 && data[key][0].HSCode) {
                impProducts = data[key];
                break;
            }
        }
        
        // Si aún no hay productos, crear uno desde los datos raíz
        if (impProducts.length === 0) {
            impProducts = [{
                HSCode: getValue(data, 'hs', 'HSCode', 'codigo_hs'),
                ProductName: getValue(data, 'ProductName', 'descripcion_comercial', 'product_name', 'producto'),
                Qty: getValue(data, 'Qty', 'cantidad', 'quantity') || 1,
                FOBValue: getValue(data, 'FOBValue', 'valor_fob', 'valor_unitario', 'value'),
                Weight: getValue(data, 'Weight', 'peso_neto', 'peso', 'weight')
            }];
        }
    }
    
    // Construir XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ImportDUA xmlns="http://www.aduanas.gob.do/siga" version="2.0">
    <ImpDeclaration>
        <ImportationDate>${escapeXML(getValue(impDeclaration, 'ImportationDate') || new Date().toISOString().split('T')[0])}</ImportationDate>
        <FOBValue>${escapeXML(getValue(impDeclaration, 'FOBValue', totales.TotalFOB) || 0)}</FOBValue>
        <Currency>${escapeXML(getValue(impDeclaration, 'Currency') || 'USD')}</Currency>
        <DispatchType>${escapeXML(getValue(impDeclaration, 'DispatchType') || 'GENERAL')}</DispatchType>
        <CustomsAdministration>${escapeXML(getValue(impDeclaration, 'CustomsAdministration') || '')}</CustomsAdministration>
        <EntryPort>${escapeXML(getValue(impDeclaration, 'EntryPort') || '')}</EntryPort>
    </ImpDeclaration>
    
    <ImpDeclarationSupplier>
        <SupplierName>${escapeXML(getValue(impSupplier, 'SupplierName', 'nombre', 'name'))}</SupplierName>
        <SupplierAddress>${escapeXML(getValue(impSupplier, 'SupplierAddress', 'direccion', 'address'))}</SupplierAddress>
        <SupplierPhone>${escapeXML(getValue(impSupplier, 'SupplierPhone', 'telefono', 'phone'))}</SupplierPhone>
        <SupplierRNC>${escapeXML(getValue(impSupplier, 'SupplierRNC', 'rnc', 'tax_id'))}</SupplierRNC>
        <SupplierCountry>${escapeXML(getValue(impSupplier, 'SupplierCountry', 'pais', 'country') || 'US')}</SupplierCountry>
    </ImpDeclarationSupplier>
`;
    
    // Productos
    impProducts.forEach((product, index) => {
        xml += `
    <ImpDeclarationProduct>
        <ItemNumber>${index + 1}</ItemNumber>
        <HSCode>${escapeXML(getValue(product, 'HSCode', 'hs', 'codigo_hs'))}</HSCode>
        <ProductName>${escapeXML(getValue(product, 'ProductName', 'descripcion', 'descripcion_comercial', 'product_name'))}</ProductName>
        <Qty>${escapeXML(getValue(product, 'Qty', 'cantidad', 'quantity') || 1)}</Qty>
        <UnitMeasure>${escapeXML(getValue(product, 'UnitMeasure', 'unidad', 'unit') || 'UND')}</UnitMeasure>
        <FOBValue>${escapeXML(getValue(product, 'FOBValue', 'valor_fob', 'valor_unitario', 'value') || 0)}</FOBValue>
        <Weight>${escapeXML(getValue(product, 'Weight', 'peso_neto', 'peso', 'weight') || 0)}</Weight>
        <OriginCountry>${escapeXML(getValue(product, 'OriginCountry', 'pais_origen', 'origin_country') || 'US')}</OriginCountry>
        <Brand>${escapeXML(getValue(product, 'Brand', 'marca', 'brand'))}</Brand>
        <Model>${escapeXML(getValue(product, 'Model', 'modelo', 'model'))}</Model>
    </ImpDeclarationProduct>`;
    });
    
    xml += `
    
    <TotalesCalculados>
        <TotalFOB>${escapeXML(getValue(totales, 'TotalFOB') || impProducts.reduce((sum, p) => sum + (parseFloat(getValue(p, 'FOBValue') || 0) * parseFloat(getValue(p, 'Qty') || 1)), 0).toFixed(2))}</TotalFOB>
        <TotalCIF>${escapeXML(getValue(totales, 'TotalCIF', 'TotalFOB'))}</TotalCIF>
        <TotalWeight>${escapeXML(getValue(totales, 'TotalWeight') || impProducts.reduce((sum, p) => sum + parseFloat(getValue(p, 'Weight') || 0), 0).toFixed(2))}</TotalWeight>
    </TotalesCalculados>
</ImportDUA>`;
    
    return xml;
}

function exportMultipleProducts(products) {
    // Generar XML con múltiples productos
    const xmlContent = generateMultiProductXML(products);
    downloadFile(xmlContent, `clasificacion_multiple_${new Date().getTime()}.xml`, 'application/xml');
    showNotification('✅ XML con múltiples productos exportado correctamente', 'success');
}

function generateMultiProductXML(products) {
    const fecha = new Date().toISOString().split('T')[0];
    const hora = new Date().toLocaleTimeString();
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<ClasificacionesArancelarias>
    <Metadatos>
        <FechaClasificacion>${fecha}</FechaClasificacion>
        <HoraClasificacion>${hora}</HoraClasificacion>
        <Sistema>Clasificador Arancelario RD</Sistema>
        <Version>1.0</Version>
        <CantidadProductos>${products.length}</CantidadProductos>
    </Metadatos>
    <Productos>
`;
    
    products.forEach((product, index) => {
        xml += `        <Producto id="${index + 1}">
`;
        xml += generateProductXMLContent(product, '            ');
        xml += `        </Producto>
`;
    });
    
    xml += `    </Productos>
</ClasificacionesArancelarias>`;
    return xml;
}

function generateProductXMLContent(data, indent = '') {
    return `${indent}<CodigoHS>${data.hs || ''}</CodigoHS>
${indent}<DescripcionArancelaria><![CDATA[${data.descripcion_arancelaria || data.descripcion || ''}]]></DescripcionArancelaria>
${indent}<DescripcionComercial><![CDATA[${data.descripcion_comercial || data.producto || ''}]]></DescripcionComercial>
${indent}<PaisOrigen><![CDATA[${data.pais_origen || data.origen || ''}]]></PaisOrigen>
${data.marca ? `${indent}<Marca><![CDATA[${data.marca}]]></Marca>
` : ''}${data.modelo ? `${indent}<Modelo><![CDATA[${data.modelo}]]></Modelo>
` : ''}${data.material ? `${indent}<Material><![CDATA[${data.material}]]></Material>
` : ''}${data.peso_neto || data.peso ? `${indent}<PesoNeto>${data.peso_neto || data.peso}</PesoNeto>
` : ''}${data.valor_unitario || data.valor_fob ? `${indent}<ValorUnitario>${data.valor_unitario || data.valor_fob}</ValorUnitario>
` : ''}${data.cantidad_total ? `${indent}<Cantidad>${data.cantidad_total}</Cantidad>
` : ''}<Impuestos>
${indent}    <DAI>${data.dai || 0}</DAI>
${indent}    <ITBIS>${data.itbis || 18}</ITBIS>
${indent}</Impuestos>
${data.observaciones ? `${indent}<Observaciones><![CDATA[${data.observaciones}]]></Observaciones>
` : ''}${data.editado ? `${indent}<Editado>true</Editado>
` : ''}`;
}

function generateXML(data) {
    const fecha = new Date().toISOString().split('T')[0];
    const hora = new Date().toLocaleTimeString();
    
    console.log('🔍 generateXML recibió data:', JSON.stringify(data, null, 2));
    
    // Función helper para buscar valores en objetos anidados (incluyendo arrays)
    const findValue = (obj, ...keys) => {
        for (let key of keys) {
            if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
                return obj[key];
            }
        }
        // Buscar en objetos anidados
        for (let k in obj) {
            if (obj[k] !== null && obj[k] !== undefined) {
                if (Array.isArray(obj[k])) {
                    // Buscar en arrays (tomar el primer elemento)
                    if (obj[k].length > 0 && typeof obj[k][0] === 'object') {
                        const found = findValue(obj[k][0], ...keys);
                        if (found) return found;
                    }
                } else if (typeof obj[k] === 'object') {
                    const found = findValue(obj[k], ...keys);
                    if (found) return found;
                }
            }
        }
        return null;
    };
    
    // Función para recopilar todos los items de un array
    const findAllItems = (obj, arrayName) => {
        for (let k in obj) {
            if (k === arrayName && Array.isArray(obj[k])) {
                return obj[k];
            }
            if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                const found = findAllItems(obj[k], arrayName);
                if (found) return found;
            }
        }
        return null;
    };
    
    // Buscar si hay productos en array
    const productos = findAllItems(data, 'productos');
    
    // Si no hay productos en array, usar datos del objeto raíz
    if (!productos || productos.length === 0) {
        // Extraer valores buscando en todos los posibles campos
        const hs = findValue(data, 'hs', 'hs_code', 'codigo_hs', 'clasificacion_arancelaria', 'subpartida', 'partida') || '';
        const producto = findValue(data, 'descripcion_comercial', 'item_name', 'product_name', 'producto', 'nombre', 'descripcion') || '';
        const descripcion = findValue(data, 'descripcion_arancelaria', 'descripcion', 'description') || '';
        const origen = findValue(data, 'pais_origen', 'country_of_origin', 'origen', 'origin') || '';
        const cantidad = findValue(data, 'cantidad_total', 'cantidad', 'quantity') || 1;
        const peso = findValue(data, 'peso_neto', 'peso', 'net_weight', 'weight');
        const valor = findValue(data, 'valor_unitario', 'valor_fob', 'valor_total', 'valor', 'value', 'total_value');
        const marca = findValue(data, 'marca', 'brand');
        const modelo = findValue(data, 'modelo', 'model');
        const material = findValue(data, 'material');
        const uso = findValue(data, 'uso', 'use', 'aplicacion');
        const dimensiones = findValue(data, 'dimensiones', 'dimensions');
        const dai = findValue(data, 'dai', 'arancel') || 0;
        const itbis = findValue(data, 'itbis', 'impuesto', 'tax') || 18;
        const observaciones = findValue(data, 'observaciones', 'notes', 'notas');
        
        console.log('📝 Datos extraídos para XML (un solo producto):', {
            hs, producto, descripcion, origen, cantidad, peso, valor, marca, modelo, dai, itbis
        });
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<ClasificacionArancelaria>
    <Metadatos>
        <FechaClasificacion>${fecha}</FechaClasificacion>
        <HoraClasificacion>${hora}</HoraClasificacion>
        <Sistema>Clasificador Arancelario RD</Sistema>
        <Version>1.0</Version>
        <Validado>${data.validado ? 'true' : 'false'}</Validado>
        ${data.editado ? '<Editado>true</Editado>' : ''}
    </Metadatos>
    
    <Producto>
        <Nombre><![CDATA[${producto}]]></Nombre>
        <CodigoHS>${hs}</CodigoHS>
        <DescripcionArancelaria><![CDATA[${descripcion}]]></DescripcionArancelaria>
        <PaisOrigen><![CDATA[${origen}]]></PaisOrigen>
        <Cantidad>${cantidad}</Cantidad>
        ${marca ? `<Marca><![CDATA[${marca}]]></Marca>` : ''}
        ${modelo ? `<Modelo><![CDATA[${modelo}]]></Modelo>` : ''}
        ${material ? `<Material><![CDATA[${material}]]></Material>` : ''}
        ${uso ? `<Uso><![CDATA[${uso}]]></Uso>` : ''}
        ${peso ? `<Peso unidad="kg">${peso}</Peso>` : ''}
        ${dimensiones ? `<Dimensiones><![CDATA[${dimensiones}]]></Dimensiones>` : ''}
        ${valor ? `<ValorUnitario moneda="USD">${valor}</ValorUnitario>` : ''}
    </Producto>
    
    <Impuestos>
        <DAI tipo="porcentaje">${dai}</DAI>
        <ITBIS tipo="porcentaje">${itbis}</ITBIS>
    </Impuestos>
    
    ${observaciones ? `
    <Observaciones>
        <![CDATA[${observaciones}]]>
    </Observaciones>` : ''}
    
    <CalculoImpuestos>
        ${valor ? `
        <BaseImponible>${valor}</BaseImponible>
        <MontoDAI>${(valor * dai / 100).toFixed(2)}</MontoDAI>
        <BaseITBIS>${(parseFloat(valor) + (parseFloat(valor) * dai / 100)).toFixed(2)}</BaseITBIS>
        <MontoITBIS>${((parseFloat(valor) + (parseFloat(valor) * dai / 100)) * itbis / 100).toFixed(2)}</MontoITBIS>
        <TotalImpuestos>${((parseFloat(valor) * dai / 100) + ((parseFloat(valor) + (parseFloat(valor) * dai / 100)) * itbis / 100)).toFixed(2)}</TotalImpuestos>` : ''}
    </CalculoImpuestos>
</ClasificacionArancelaria>`;
    } else {
        // Generar XML con múltiples productos
        console.log('📦 Generando XML con múltiples productos:', productos.length);
        
        // Extraer información general de la factura
        const numeroFactura = findValue(data, 'numero', 'numero_factura', 'invoice_number') || '';
        const fechaFactura = findValue(data, 'fecha', 'fecha_factura', 'invoice_date') || fecha;
        const moneda = findValue(data, 'moneda', 'currency') || 'USD';
        const valorTotal = findValue(data, 'valor_total', 'total', 'total_value') || 0;
        const vendedor = findValue(data, 'vendedor', 'proveedor', 'supplier');
        const comprador = findValue(data, 'comprador', 'importador', 'buyer');
        
        let productosXML = '';
        productos.forEach((prod, index) => {
            const hs = prod.clasificacion_arancelaria || prod.hs || prod.codigo_hs || '';
            const descripcion = prod.descripcion || prod.nombre || prod.producto || '';
            const cantidad = prod.cantidad || 1;
            const precio = prod.precio_unitario || prod.precio || prod.valor || 0;
            const subtotal = prod.subtotal || (cantidad * precio);
            
            productosXML += `
    <Producto numero="${index + 1}">
        <Descripcion><![CDATA[${descripcion}]]></Descripcion>
        <CodigoHS>${hs}</CodigoHS>
        <Cantidad>${cantidad}</Cantidad>
        <PrecioUnitario moneda="${moneda}">${precio}</PrecioUnitario>
        <Subtotal moneda="${moneda}">${subtotal}</Subtotal>
    </Producto>`;
        });
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<ClasificacionArancelaria>
    <Metadatos>
        <FechaClasificacion>${fecha}</FechaClasificacion>
        <HoraClasificacion>${hora}</HoraClasificacion>
        <Sistema>Clasificador Arancelario RD</Sistema>
        <Version>1.0</Version>
        <Validado>${data.validado ? 'true' : 'false'}</Validado>
        ${data.editado ? '<Editado>true</Editado>' : ''}
    </Metadatos>
    
    <InformacionFactura>
        ${numeroFactura ? `<NumeroFactura>${numeroFactura}</NumeroFactura>` : ''}
        ${fechaFactura ? `<FechaFactura>${fechaFactura}</FechaFactura>` : ''}
        <Moneda>${moneda}</Moneda>
        ${vendedor && typeof vendedor === 'object' ? `
        <Vendedor>
            <Nombre><![CDATA[${vendedor.nombre || ''}]]></Nombre>
            ${vendedor.direccion ? `<Direccion><![CDATA[${vendedor.direccion}]]></Direccion>` : ''}
            ${vendedor.rnc ? `<RNC>${vendedor.rnc}</RNC>` : ''}
        </Vendedor>` : ''}
        ${comprador && typeof comprador === 'object' ? `
        <Comprador>
            <Nombre><![CDATA[${comprador.nombre || ''}]]></Nombre>
            ${comprador.direccion ? `<Direccion><![CDATA[${comprador.direccion}]]></Direccion>` : ''}
            ${comprador.rnc ? `<RNC>${comprador.rnc}</RNC>` : ''}
        </Comprador>` : ''}
    </InformacionFactura>
    
    <Productos totalItems="${productos.length}">
        ${productosXML}
    </Productos>
    
    <Totales>
        <ValorTotal moneda="${moneda}">${valorTotal}</ValorTotal>
    </Totales>
</ClasificacionArancelaria>`;
    }
}

function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Auto-validación en tiempo real
document.addEventListener('DOMContentLoaded', function() {
    // ... código existente ...
    
    // Agregar listeners para validación en tiempo real
    const editModal = document.getElementById('edit-modal');
    if (editModal) {
        const inputs = editModal.querySelectorAll('.form-input');
        inputs.forEach(input => {
            input.addEventListener('input', function() {
                if (this.hasAttribute('required') && this.value.trim()) {
                    this.classList.add('valid');
                    this.classList.remove('error');
                }
            });
            
            input.addEventListener('blur', function() {
                if (this.hasAttribute('required') && !this.value.trim()) {
                    this.classList.add('error');
                    this.classList.remove('valid');
                }
            });
        });
        
        // Formateo automático del código HS en clasificación manual
        const manualHsInput = document.getElementById('manual-hs-code');
        if (manualHsInput) {
            manualHsInput.addEventListener('input', function(e) {
                let value = e.target.value.replace(/\D/g, '');
                if (value.length >= 4) {
                    value = value.substring(0, 4) + '.' + value.substring(4);
                }
                if (value.length >= 7) {
                    value = value.substring(0, 7) + '.' + value.substring(7);
                }
                if (value.length >= 10) {
                    value = value.substring(0, 10) + '.' + value.substring(10, 12);
                }
                e.target.value = value;
            });
        }
    }
});

// Funciones para clasificación manual
function clearManualForm() {
    const form = document.getElementById('manual-form');
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        if (input.type === 'number' && input.id === 'manual-itbis-porcentaje') {
            input.value = '18'; // Mantener ITBIS por defecto
        } else if (input.type === 'number' && input.id === 'manual-cantidad') {
            input.value = '1'; // Mantener cantidad por defecto
        } else if (input.type === 'date' && input.id === 'manual-fecha-declaracion') {
            input.value = new Date().toISOString().split('T')[0]; // Fecha actual
        } else if (input.type === 'number' && input.id === 'manual-tasa-cambio') {
            input.value = '60.00'; // Tasa de cambio por defecto
        } else if (input.type === 'checkbox') {
            input.checked = false;
        } else {
            input.value = '';
        }
        input.classList.remove('valid', 'error');
    });
    
    // Ocultar secciones condicionales
    document.getElementById('complementary-fields').style.display = 'none';
    document.querySelector('.vehicle-fields').style.display = 'none';
    document.querySelector('.alcohol-fields').style.display = 'none';
    
    // Ocultar botones y validación
    document.getElementById('btn-save-manual').style.display = 'none';
    document.getElementById('manual-validation-summary').style.display = 'none';
    
    // Limpiar cálculos
    updateTaxCalculations();
    
    showNotification('Formulario DUA limpiado', 'info');
}

function validateManualForm() {
    const requiredFields = [
        // 1. Declaración
        { id: 'manual-fecha-declaracion', name: 'Fecha de Declaración' },
        { id: 'manual-tipo-despacho', name: 'Tipo de Despacho' },
        { id: 'manual-administracion', name: 'Administración Aduanera' },
        
        // 2. Documento de Embarque
        { id: 'manual-puerto-entrada', name: 'Puerto de Entrada' },
        { id: 'manual-pais-procedencia', name: 'País de Procedencia' },
        { id: 'manual-medio-transporte', name: 'Medio de Transporte' },
        
        // 4. Importador
        { id: 'manual-importador-nombre', name: 'Nombre del Importador' },
        { id: 'manual-importador-documento', name: 'RNC/Cédula del Importador' },
        { id: 'manual-importador-direccion', name: 'Dirección del Importador' },
        
        // 5. Agente
        { id: 'manual-agente-nombre', name: 'Nombre del Agente' },
        
        // 6. Proveedor
        { id: 'manual-proveedor-nombre', name: 'Nombre del Proveedor' },
        { id: 'manual-proveedor-pais', name: 'País del Proveedor' },
        
        // 7. Régimen
        { id: 'manual-regimen-aduanero', name: 'Régimen Aduanero' },
        
        // 8. Mercancía
        { id: 'manual-hs-code', name: 'Código S.A. (HS)' },
        { id: 'manual-producto', name: 'Nombre del Producto' },
        { id: 'manual-especificacion', name: 'Especificación' },
        { id: 'manual-unidad', name: 'Unidad' },
        { id: 'manual-cantidad', name: 'Cantidad' },
        { id: 'manual-fob-unitario', name: 'FOB Unitario' },
        { id: 'manual-pais-origen', name: 'País de Origen' },
        
        // 10. Documentos
        { id: 'manual-tipo-documento', name: 'Tipo de Documento' },
        { id: 'manual-numero-documento', name: 'Número de Documento' },
        { id: 'manual-fecha-documento', name: 'Fecha del Documento' },
        
        // 12. Valoración
        { id: 'manual-tasa-cambio', name: 'Tasa de Cambio' },
        { id: 'manual-valor-fob-total', name: 'Valor FOB Total' },
        
        // 13. Peso
        { id: 'manual-peso-bruto', name: 'Peso Bruto' },
        { id: 'manual-peso-neto', name: 'Peso Neto' },
        
        // Impuestos
        { id: 'manual-dai-porcentaje', name: 'DAI (%)' },
        { id: 'manual-itbis-porcentaje', name: 'ITBIS (%)' }
    ];
    
    const errors = [];
    let isValid = true;
    
    requiredFields.forEach(field => {
        const input = document.getElementById(field.id);
        if (!input) return;
        
        const value = input.value.trim();
        
        if (!value) {
            errors.push(field.name);
            input.classList.add('error');
            input.classList.remove('valid');
            isValid = false;
        } else {
            input.classList.add('valid');
            input.classList.remove('error');
        }
    });
    
    // Validaciones específicas
    const hsCode = document.getElementById('manual-hs-code').value;
    if (hsCode && !/^\d{4}\.\d{2}\.\d{2}\.\d{2}$/.test(hsCode)) {
        if (!errors.includes('Código S.A. (HS)')) {
            errors.push('Código S.A. (HS) (formato incorrecto)');
        }
        document.getElementById('manual-hs-code').classList.add('error');
        isValid = false;
    }
    
    // Validación de pesos
    const pesoBruto = parseFloat(document.getElementById('manual-peso-bruto').value) || 0;
    const pesoNeto = parseFloat(document.getElementById('manual-peso-neto').value) || 0;
    
    if (pesoBruto < pesoNeto) {
        errors.push('Peso bruto debe ser mayor o igual al peso neto');
        document.getElementById('manual-peso-bruto').classList.add('error');
        document.getElementById('manual-peso-neto').classList.add('error');
        isValid = false;
    }
    
    // Mostrar errores si existen
    if (errors.length > 0) {
        showManualValidationErrors(errors);
        showNotification('Complete los campos obligatorios marcados en rojo', 'error');
    } else {
        clearManualValidation();
        document.getElementById('btn-save-manual').style.display = 'inline-flex';
        showNotification('Validación exitosa. La DUA está lista para generar.', 'success');
    }
    
    return isValid;
}

function saveManualClassification() {
    if (!validateManualForm()) {
        return;
    }
    
    // Recopilar todos los datos del formulario DUA
    const duaData = {
        // 1. Declaración
        fecha_declaracion: document.getElementById('manual-fecha-declaracion').value,
        tipo_despacho: document.getElementById('manual-tipo-despacho').value,
        administracion_aduanera: document.getElementById('manual-administracion').value,
        
        // 2. Documento de Embarque
        puerto_entrada: document.getElementById('manual-puerto-entrada').value,
        pais_procedencia: document.getElementById('manual-pais-procedencia').value,
        empresa_transportista: document.getElementById('manual-empresa-transportista').value,
        numero_viaje: document.getElementById('manual-numero-viaje').value,
        nacionalidad_transporte: document.getElementById('manual-nacionalidad-transporte').value,
        medio_transporte: document.getElementById('manual-medio-transporte').value,
        fecha_llegada: document.getElementById('manual-fecha-llegada').value,
        
        // 3. Depósito
        tipo_localizacion: document.getElementById('manual-tipo-localizacion').value,
        deposito: document.getElementById('manual-deposito').value,
        
        // 4. Importador
        importador: {
            nombre: document.getElementById('manual-importador-nombre').value,
            documento: document.getElementById('manual-importador-documento').value,
            direccion: document.getElementById('manual-importador-direccion').value,
            telefono: document.getElementById('manual-importador-telefono').value,
            email: document.getElementById('manual-importador-email').value
        },
        
        // 5. Agente
        agente: {
            nombre: document.getElementById('manual-agente-nombre').value,
            licencia: document.getElementById('manual-agente-licencia').value
        },
        
        // 6. Proveedor
        proveedor: {
            nombre: document.getElementById('manual-proveedor-nombre').value,
            documento: document.getElementById('manual-proveedor-documento').value,
            pais: document.getElementById('manual-proveedor-pais').value,
            direccion: document.getElementById('manual-proveedor-direccion').value,
            telefono: document.getElementById('manual-proveedor-telefono').value,
            email: document.getElementById('manual-proveedor-email').value
        },
        
        // 7. Régimen
        regimen_aduanero: document.getElementById('manual-regimen-aduanero').value,
        acuerdo_comercial: document.getElementById('manual-acuerdo-comercial').value,
        
        // 8. Mercancía
        mercancia: {
            hs: document.getElementById('manual-hs-code').value,
            marca: document.getElementById('manual-marca').value,
            modelo: document.getElementById('manual-modelo').value,
            estado: document.getElementById('manual-estado').value,
            producto: document.getElementById('manual-producto').value,
            ano: document.getElementById('manual-ano').value,
            especificacion: document.getElementById('manual-especificacion').value,
            unidad: document.getElementById('manual-unidad').value,
            cantidad: parseFloat(document.getElementById('manual-cantidad').value),
            fob_unitario: parseFloat(document.getElementById('manual-fob-unitario').value),
            certificado_origen: document.getElementById('manual-certificado-origen').value,
            pais_origen: document.getElementById('manual-pais-origen').value,
            // Vehículos
            chasis: document.getElementById('manual-chasis').value,
            motor: document.getElementById('manual-motor').value,
            color: document.getElementById('manual-color').value,
            cilindraje: document.getElementById('manual-cilindraje').value,
            descripcion_complementaria: document.getElementById('manual-descripcion-complementaria').value
        },
        
        // 9. Contenedor
        contenedor: {
            numero: document.getElementById('manual-numero-contenedor').value,
            tipo: document.getElementById('manual-tipo-contenedor').value,
            sello: document.getElementById('manual-sello').value,
            placa: document.getElementById('manual-numero-placa').value,
            peso: parseFloat(document.getElementById('manual-peso-contenedor').value) || null,
            organica: document.getElementById('manual-organica').value,
            // Alcoholes
            grado_alcohol: parseFloat(document.getElementById('manual-grado-alcohol').value) || null,
            serie: document.getElementById('manual-serie').value,
            precio_menor: parseFloat(document.getElementById('manual-precio-menor').value) || null
        },
        
        // 10. Documentos
        documento: {
            tipo: document.getElementById('manual-tipo-documento').value,
            numero: document.getElementById('manual-numero-documento').value,
            fecha: document.getElementById('manual-fecha-documento').value,
            monto: parseFloat(document.getElementById('manual-monto-documento').value) || null,
            pais: document.getElementById('manual-pais-documento').value,
            observacion: document.getElementById('manual-observacion-documento').value
        },
        
        // 12. Valoración
        valoracion: {
            tasa_cambio: parseFloat(document.getElementById('manual-tasa-cambio').value),
            flete: parseFloat(document.getElementById('manual-flete').value) || 0,
            valor_fob_total: parseFloat(document.getElementById('manual-valor-fob-total').value),
            otros_gastos: parseFloat(document.getElementById('manual-otros-gastos').value) || 0,
            seguro: parseFloat(document.getElementById('manual-seguro').value) || 0,
            valor_cif_usd: parseFloat(document.getElementById('manual-valor-cif-usd').value) || 0,
            valor_cif_rd: parseFloat(document.getElementById('manual-valor-cif-rd').value) || 0
        },
        
        // 13. Peso
        peso_bruto: parseFloat(document.getElementById('manual-peso-bruto').value),
        peso_neto: parseFloat(document.getElementById('manual-peso-neto').value),
        
        // 14. Observación
        observacion_general: document.getElementById('manual-observacion-general').value,
        
        // 15. Datos Complementarios
        datos_complementarios: document.getElementById('manual-datos-complementarios').checked,
        complementarios: {
            numero_factura: document.getElementById('manual-numero-factura').value,
            fecha_factura: document.getElementById('manual-fecha-factura').value,
            comisiones: document.getElementById('manual-comisiones').value,
            monto_comisiones: parseFloat(document.getElementById('manual-monto-comisiones').value) || null,
            asistencia: document.getElementById('manual-asistencia').value,
            monto_asistencia: parseFloat(document.getElementById('manual-monto-asistencia').value) || null,
            canones: document.getElementById('manual-canones').value,
            monto_canones: parseFloat(document.getElementById('manual-monto-canones').value) || null,
            vinculacion: document.getElementById('manual-vinculacion').value,
            determinacion_valor: document.getElementById('manual-determinacion-valor').value
        },
        
        // Impuestos
        impuestos: {
            dai_porcentaje: parseFloat(document.getElementById('manual-dai-porcentaje').value),
            itbis_porcentaje: parseFloat(document.getElementById('manual-itbis-porcentaje').value),
            selectivo_porcentaje: parseFloat(document.getElementById('manual-selectivo-porcentaje').value) || 0,
            otros_porcentaje: parseFloat(document.getElementById('manual-otros-impuestos-porcentaje').value) || 0
        },
        
        // Metadatos
        fecha_creacion: new Date().toISOString(),
        validado: true,
        tipo: 'dua_manual'
    };
    
    // Calcular valores finales
    duaData.calculos = calculateFinalTaxes(duaData);
    
    // Establecer como resultado actual para usar en exportación
    resultadoActual = duaData;
    editedClassification = duaData;
    
    // IMPORTANTE: Sincronizar con window.resultadoActual
    window.resultadoActual = duaData;
    window.editedClassification = duaData;
    
    // Crear vista de resultado DUA
    showDUAResult(duaData);
    
    showNotification('DUA generada correctamente. Puede exportar el XML completo.', 'success');
}

function calculateFinalTaxes(data) {
    const baseCIF = data.valoracion.valor_fob_total + data.valoracion.flete + data.valoracion.seguro + data.valoracion.otros_gastos;
    const dai = baseCIF * (data.impuestos.dai_porcentaje / 100);
    const baseITBIS = baseCIF + dai;
    const itbis = baseITBIS * (data.impuestos.itbis_porcentaje / 100);
    const selectivo = baseCIF * (data.impuestos.selectivo_porcentaje / 100);
    const otros = baseCIF * (data.impuestos.otros_porcentaje / 100);
    const totalImpuestos = dai + itbis + selectivo + otros;
    const totalPagar = baseCIF + totalImpuestos;
    
    return {
        base_cif_usd: baseCIF,
        base_cif_rd: baseCIF * data.valoracion.tasa_cambio,
        dai_monto: dai,
        itbis_monto: itbis,
        selectivo_monto: selectivo,
        otros_monto: otros,
        total_impuestos: totalImpuestos,
        total_pagar: totalPagar,
        total_rd: totalPagar * data.valoracion.tasa_cambio
    };
}

function showManualResult(data) {
    const resultsDiv = document.getElementById('results');
    const contentDiv = document.getElementById('results-content');
    
    // Limpiar contenido anterior
    contentDiv.innerHTML = '';
    
    // Crear tarjeta de resultado manual
    const manualCard = document.createElement('div');
    manualCard.className = 'result-card manual-result';
    
    manualCard.innerHTML = `
        <div class="result-header">
            <div class="hs-code">${data.hs}</div>
            <span class="manual-badge"><i class="fas fa-user-edit"></i> Clasificación Manual</span>
        </div>
        
        <div class="result-content">
            <div class="result-section">
                <h4><i class="fas fa-info-circle"></i> Información Principal</h4>
                <div class="result-grid">
                    <div class="result-item">
                        <span class="label">Producto:</span>
                        <span class="value">${data.producto}</span>
                    </div>
                    <div class="result-item">
                        <span class="label">Origen:</span>
                        <span class="value">${data.origen}</span>
                    </div>
                    <div class="result-item full-width">
                        <span class="label">Descripción Arancelaria:</span>
                        <span class="value">${data.descripcion}</span>
                    </div>
                </div>
            </div>
            
            <div class="result-section">
                <h4><i class="fas fa-percentage"></i> Impuestos y Aranceles</h4>
                <div class="result-grid">
                    <div class="result-item">
                        <span class="label">DAI:</span>
                        <span class="value">${data.dai}%</span>
                    </div>
                    <div class="result-item">
                        <span class="label">ITBIS:</span>
                        <span class="value">${data.itbis}%</span>
                    </div>
                    ${data.impuesto_selectivo ? `
                    <div class="result-item">
                        <span class="label">Impuesto Selectivo:</span>
                        <span class="value">${data.impuesto_selectivo}%</span>
                    </div>` : ''}
                    ${data.otros_impuestos ? `
                    <div class="result-item">
                        <span class="label">Otros Impuestos:</span>
                        <span class="value">${data.otros_impuestos}</span>
                    </div>` : ''}
                </div>
            </div>
            
            ${data.marca || data.modelo || data.material ? `
            <div class="result-section">
                <h4><i class="fas fa-tags"></i> Detalles del Producto</h4>
                <div class="result-grid">
                    ${data.marca ? `
                    <div class="result-item">
                        <span class="label">Marca:</span>
                        <span class="value">${data.marca}</span>
                    </div>` : ''}
                    ${data.modelo ? `
                    <div class="result-item">
                        <span class="label">Modelo:</span>
                        <span class="value">${data.modelo}</span>
                    </div>` : ''}
                    ${data.material ? `
                    <div class="result-item">
                        <span class="label">Material:</span>
                        <span class="value">${data.material}</span>
                    </div>` : ''}
                    ${data.peso ? `
                    <div class="result-item">
                        <span class="label">Peso:</span>
                        <span class="value">${data.peso} kg</span>
                    </div>` : ''}
                    ${data.dimensiones ? `
                    <div class="result-item">
                        <span class="label">Dimensiones:</span>
                        <span class="value">${data.dimensiones}</span>
                    </div>` : ''}
                </div>
            </div>` : ''}
            
            ${data.valor_fob || data.unidad_medida || data.incoterm ? `
            <div class="result-section">
                <h4><i class="fas fa-dollar-sign"></i> Información Comercial</h4>
                <div class="result-grid">
                    ${data.valor_fob ? `
                    <div class="result-item">
                        <span class="label">Valor FOB:</span>
                        <span class="value">$${data.valor_fob.toFixed(2)} USD</span>
                    </div>` : ''}
                    <div class="result-item">
                        <span class="label">Cantidad:</span>
                        <span class="value">${data.cantidad} ${data.unidad_medida || 'unidades'}</span>
                    </div>
                    ${data.incoterm ? `
                    <div class="result-item">
                        <span class="label">Incoterm:</span>
                        <span class="value">${data.incoterm}</span>
                    </div>` : ''}
                </div>
            </div>` : ''}
            
            ${data.observaciones ? `
            <div class="result-section">
                <h4><i class="fas fa-comment"></i> Observaciones</h4>
                <p class="observations">${data.observaciones}</p>
            </div>` : ''}
            
            ${data.valor_fob ? `
            <div class="result-section tax-calculations">
                <h4><i class="fas fa-calculator"></i> Cálculo de Impuestos</h4>
                <div class="tax-grid">
                    <div class="tax-item">
                        <span class="tax-label">Base Imponible:</span>
                        <span class="tax-value">$${data.valor_fob.toFixed(2)}</span>
                    </div>
                    <div class="tax-item">
                        <span class="tax-label">DAI (${data.dai}%):</span>
                        <span class="tax-value">$${(data.valor_fob * data.dai / 100).toFixed(2)}</span>
                    </div>
                    <div class="tax-item">
                        <span class="tax-label">Base ITBIS:</span>
                        <span class="tax-value">$${(data.valor_fob + (data.valor_fob * data.dai / 100)).toFixed(2)}</span>
                    </div>
                    <div class="tax-item">
                        <span class="tax-label">ITBIS (${data.itbis}%):</span>
                        <span class="tax-value">$${((data.valor_fob + (data.valor_fob * data.dai / 100)) * data.itbis / 100).toFixed(2)}</span>
                    </div>
                    ${data.impuesto_selectivo ? `
                    <div class="tax-item">
                        <span class="tax-label">Selectivo (${data.impuesto_selectivo}%):</span>
                        <span class="tax-value">$${(data.valor_fob * data.impuesto_selectivo / 100).toFixed(2)}</span>
                    </div>` : ''}
                    <div class="tax-item total">
                        <span class="tax-label">Total Impuestos:</span>
                        <span class="tax-value">$${(() => {
                            const dai = data.valor_fob * data.dai / 100;
                            const baseItbis = data.valor_fob + dai;
                            const itbis = baseItbis * data.itbis / 100;
                            const selectivo = data.impuesto_selectivo ? data.valor_fob * data.impuesto_selectivo / 100 : 0;
                            return (dai + itbis + selectivo).toFixed(2);
                        })()}</span>
                    </div>
                </div>
            </div>` : ''}
        </div>
    `;
    
    contentDiv.appendChild(manualCard);
    
    // Agregar botón de exportación
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'results-actions-container';
    actionsContainer.innerHTML = `
        <div class="action-buttons">
            <button id="btn-export-manual" class="btn-success export-btn">
                <i class="fas fa-download"></i> Exportar XML
            </button>
            <button class="btn-secondary" onclick="clearManualForm(); document.getElementById('results').style.display = 'none';">
                <i class="fas fa-plus"></i> Nueva Clasificación
            </button>
        </div>
        <p class="edit-hint">
            <i class="fas fa-check-circle"></i> 
            Clasificación manual completada y lista para exportar.
        </p>
    `;
    
    resultsDiv.appendChild(actionsContainer);
    
    // Event listener para exportación
    document.getElementById('btn-export-manual').addEventListener('click', () => {
        showExportOptions();
    });
    
    resultsDiv.style.display = 'block';
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
    
    // Validar y mostrar panel de campos faltantes si es necesario
    setTimeout(() => {
        validarYMostrarPanel();
    }, 500);
}

// Funciones para panel de validación visual
function mostrarPanelValidacion(errores) {
    const panel = document.getElementById('validation-panel');
    const erroresContainer = document.getElementById('validation-errors');
    
    if (!panel || !erroresContainer) return;
    
    // Limpiar errores anteriores
    erroresContainer.innerHTML = '';
    
    // Mapeo de campos a nombres legibles con formato XML
    const campoInfo = {
        // Campos generales de declaración (obligatorios)
        'ClearanceType': { label: 'Tipo de Declaración', xml: 'ClearanceType', isGeneral: true },
        'AreaCode': { label: 'Código de Área', xml: 'AreaCode', isGeneral: true },
        'FormNo': { label: 'Número de Formulario', xml: 'FormNo', isGeneral: true },
        'BLNo': { label: 'Número B/L', xml: 'BLNo', isGeneral: true },
        'ConsigneeCode': { label: 'RNC Consignatario', xml: 'ConsigneeCode', isGeneral: true },
        'ConsigneeName': { label: 'Nombre Consignatario', xml: 'ConsigneeName', isGeneral: true },
        'ImporterCode': { label: 'RNC del Importador', xml: 'ImporterCode', isGeneral: true },
        'ImporterName': { label: 'Nombre del Importador', xml: 'ImporterName', isGeneral: true },
        'DeclarantCode': { label: 'RNC del Declarante', xml: 'DeclarantCode', isGeneral: true },
        'DeclarantName': { label: 'Nombre del Declarante', xml: 'DeclarantName', isGeneral: true },
        'RegimenCode': { label: 'Código de Régimen', xml: 'RegimenCode', isGeneral: true },
        'TotalFOB': { label: 'Valor FOB Total', xml: 'TotalFOB', isGeneral: true },
        'InsuranceValue': { label: 'Valor del Seguro', xml: 'InsuranceValue', isGeneral: true },
        'FreightValue': { label: 'Valor del Flete', xml: 'FreightValue', isGeneral: true },
        'OtherValue': { label: 'Otros Valores', xml: 'OtherValue', isGeneral: true },
        'TotalCIF': { label: 'Valor CIF Total', xml: 'TotalCIF', isGeneral: true },
        // Proveedor Extranjero
        'ForeignSupplierName': { label: 'Nombre Proveedor', xml: 'ForeignSupplierName', isGeneral: true },
        'ForeignSupplierCode': { label: 'Código Proveedor', xml: 'ForeignSupplierCode', isGeneral: true },
        'ForeignSupplierNationality': { label: 'Nacionalidad Proveedor', xml: 'ForeignSupplierNationality', isGeneral: true },
        // Campos de productos
        'HSCode': { label: 'Código Arancelario', xml: 'HSCode', isProduct: true },
        'ProductName': { label: 'Nombre del Producto', xml: 'ProductName', isProduct: true },
        'ProductStatusCode': { label: 'Estado del Producto', xml: 'ProductStatusCode', isProduct: true },
        'FOBValue': { label: 'Valor FOB', xml: 'FOBValue', isProduct: true },
        'UnitCode': { label: 'Código de Unidad', xml: 'UnitCode', isProduct: true },
        'Qty': { label: 'Cantidad', xml: 'Qty', isProduct: true },
        'Weight': { label: 'Peso', xml: 'Weight', isProduct: true },
        'OriginCountry': { label: 'País de Origen', xml: 'OriginCountry', isProduct: true },
        'TempProductYN': { label: '¿Producto Temporal?', xml: 'TempProductYN', isProduct: true },
        'OrganicYN': { label: '¿Producto Orgánico?', xml: 'OrganicYN', isProduct: true }
    };
    
    // Crear elementos de error clickeables
    errores.forEach((error, index) => {
        const errorItem = document.createElement('div');
        errorItem.className = 'validation-error-item';
        
        // Extraer el nombre del campo del mensaje de error
        let campoId = null;
        let campoData = null;
        for (const [campo, info] of Object.entries(campoInfo)) {
            if (error.includes(campo)) {
                campoId = campo;
                campoData = info;
                break;
            }
        }
        
        // Para productos, extraer el índice si existe
        let productIndex = null;
        const productMatch = error.match(/Producto (\d+):/);
        if (productMatch) {
            productIndex = parseInt(productMatch[1]) - 1;
        }
        
        // Crear HTML del error con información del campo XML
        const xmlTag = campoData ? `<span class="xml-tag-error">(${campoData.xml})</span>` : '';
        
        errorItem.innerHTML = `
            <div class="validation-error-icon">
                <i class="fas fa-exclamation-circle"></i>
            </div>
            <div class="validation-error-text">
                <strong>${index + 1}.</strong> ${error} ${xmlTag}
            </div>
            <div class="validation-error-action">
                <i class="fas fa-arrow-right"></i>
            </div>
        `;
        
        // Hacer el item clickeable
        errorItem.style.cursor = 'pointer';
        errorItem.title = 'Click para ir al campo';
        
        errorItem.onclick = () => {
            // Si es un campo de producto, abrir el modal de edición del producto
            if (campoData && campoData.isProduct && productIndex !== null) {
                console.log(`📝 Abriendo modal para producto ${productIndex + 1}, campo ${campoId}`);
                
                // Usar la función del products-manager.js
                if (typeof window.irACampoProducto === 'function') {
                    window.irACampoProducto(campoId, productIndex);
                } else if (typeof window.editarProductoCompleto === 'function') {
                    window.editarProductoCompleto(productIndex);
                    // Esperar y luego enfocar el campo
                    setTimeout(() => {
                        const inputField = document.getElementById(`modal-${campoId}`);
                        if (inputField) {
                            inputField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            inputField.focus();
                            inputField.classList.add('input-destacado');
                            setTimeout(() => inputField.classList.remove('input-destacado'), 2000);
                        }
                    }, 400);
                }
                return;
            }
            
            // Si es un campo general, abrir el modal de declaración general
            if (campoData && campoData.isGeneral) {
                console.log(`📝 Abriendo modal de declaración para campo ${campoId}`);
                abrirModalDeclaracionGeneral(campoId);
                return;
            }
            
            // Si es un campo general, buscar en la vista de resultados
            let fieldElement = document.querySelector(`[data-field-key="${campoId}"]`) ||
                              document.querySelector(`[data-field-key$="${campoId}"]`) ||
                              document.querySelector(`[data-field-key*=".${campoId}"]`) ||
                              document.querySelector(`[data-field-key*="${campoId}"]`);
            
            if (fieldElement) {
                console.log('✅ Campo encontrado:', fieldElement);
                
                // Ocultar el panel de validación temporalmente
                panel.style.opacity = '0.3';
                panel.style.transition = 'opacity 0.3s';
                
                // Hacer scroll al campo
                setTimeout(() => {
                    fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Resaltar el campo
                    fieldElement.style.border = '3px solid #dc2626';
                    fieldElement.style.boxShadow = '0 0 15px rgba(220, 38, 38, 0.5)';
                    fieldElement.style.transform = 'scale(1.02)';
                    fieldElement.style.transition = 'all 0.3s ease';
                    fieldElement.style.backgroundColor = '#fee2e2';
                    
                    // Abrir edición
                    setTimeout(() => {
                        fieldElement.click();
                        panel.style.opacity = '1';
                    }, 600);
                    
                    // Restaurar estilos
                    setTimeout(() => {
                        fieldElement.style.border = '';
                        fieldElement.style.boxShadow = '';
                        fieldElement.style.transform = '';
                        fieldElement.style.backgroundColor = '';
                    }, 3000);
                }, 200);
            } else {
                // Si no se encuentra, abrir el modal de declaración general
                console.log('Campo no encontrado en vista, abriendo modal de declaración');
                abrirModalDeclaracionGeneral(campoId);
            }
        };
        
        erroresContainer.appendChild(errorItem);
    });
    
    // Mostrar el panel
    panel.style.display = 'block';
    
    // Hacer scroll al panel
    setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

function ocultarPanelValidacion() {
    const panel = document.getElementById('validation-panel');
    if (panel) {
        panel.style.display = 'none';
    }
}

// ================================================
// MODAL DE DECLARACIÓN GENERAL (Campos SIGA)
// ================================================

/**
 * Abre el modal para editar los campos generales de la declaración
 * @param {string} focusField - Campo a enfocar después de abrir el modal
 */
function abrirModalDeclaracionGeneral(focusField = null) {
    // Obtener datos actuales
    const data = resultadoActual?.ImportDUA?.ImpDeclaration || resultadoActual || {};
    
    // Obtener datos del proveedor extranjero
    const supplier = data.ImpDeclarationSupplier || {};
    
    // Crear modal si no existe
    let modalOverlay = document.getElementById('declaration-modal-overlay');
    
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'declaration-modal-overlay';
        modalOverlay.className = 'product-modal-overlay';
        document.body.appendChild(modalOverlay);
    }
    
    // Valores actuales
    const vals = {
        ClearanceType: data.ClearanceType || '',
        AreaCode: data.AreaCode || '10150',
        FormNo: data.FormNo || '',
        BLNo: data.BLNo || '',
        ManifestNo: data.ManifestNo || '',
        ConsigneeCode: data.ConsigneeCode || '',
        ConsigneeName: data.ConsigneeName || '',
        ConsigneeNationality: data.ConsigneeNationality || '214',
        CargoControlNo: data.CargoControlNo || 'SN',
        CommercialInvoiceNo: data.CommercialInvoiceNo || '',
        DestinationLocationCode: data.DestinationLocationCode || '',
        EntryPort: data.EntryPort || '',
        DepartureCountryCode: data.DepartureCountryCode || '',
        TransportCompanyCode: data.TransportCompanyCode || '',
        TransportNationality: data.TransportNationality || '',
        TransportMethod: data.TransportMethod || '',
        ImporterCode: data.ImporterCode || '',
        ImporterName: data.ImporterName || '',
        ImporterNationality: data.ImporterNationality || '214',
        BrokerEmployeeCode: data.BrokerEmployeeCode || '',
        BrokerCompanyCode: data.BrokerCompanyCode || '',
        DeclarantCode: data.DeclarantCode || '',
        DeclarantName: data.DeclarantName || '',
        DeclarantNationality: data.DeclarantNationality || '214',
        RegimenCode: data.RegimenCode || '1',
        AgreementCode: data.AgreementCode || '',
        TotalFOB: data.TotalFOB || '',
        InsuranceValue: data.InsuranceValue || '0',
        FreightValue: data.FreightValue || '0',
        OtherValue: data.OtherValue || '0',
        TotalCIF: data.TotalCIF || '',
        TotalWeight: data.TotalWeight || '',
        NetWeight: data.NetWeight || '',
        Remark: data.Remark || '',
        // Proveedor Extranjero
        ForeignSupplierName: supplier.ForeignSupplierName || '',
        ForeignSupplierCode: supplier.ForeignSupplierCode || '',
        ForeignSupplierNationality: supplier.ForeignSupplierNationality || ''
    };
    
    modalOverlay.innerHTML = `
        <div class="product-modal product-modal-full">
            <div class="product-modal-header" style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);">
                <h3><i class="fas fa-file-invoice"></i> Datos de la Declaración (ImpDeclaration)</h3>
                <button class="product-modal-close" onclick="cerrarModalDeclaracion()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="product-modal-body">
                <!-- SECCIÓN: CAMPOS OBLIGATORIOS -->
                <div class="form-section-header obligatorio">
                    <i class="fas fa-star"></i>
                    <span>Campos Obligatorios SIGA</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="decl-field-ClearanceType">
                        <label>
                            <i class="fas fa-file-signature"></i>
                            Tipo de Despacho <span class="xml-tag">(ClearanceType)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-ClearanceType" value="${escapeHtml(vals.ClearanceType)}" 
                               placeholder="IC38-002" class="campo-obligatorio">
                        <small>Ej: IC38-002 (Definitiva), IC38-001 (Temporal), IC04-001 (Especial)</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-ImporterCode">
                        <label>
                            <i class="fas fa-id-card"></i>
                            RNC del Importador <span class="xml-tag">(ImporterCode)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-ImporterCode" value="${escapeHtml(vals.ImporterCode)}" 
                               placeholder="RNC123456789" class="campo-obligatorio">
                        <small>Debe comenzar con RNC seguido de números</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-DeclarantCode">
                        <label>
                            <i class="fas fa-user-tie"></i>
                            RNC del Declarante <span class="xml-tag">(DeclarantCode)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-DeclarantCode" value="${escapeHtml(vals.DeclarantCode)}" 
                               placeholder="RNC123456789" class="campo-obligatorio">
                        <small>Debe comenzar con RNC seguido de números</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-RegimenCode">
                        <label>
                            <i class="fas fa-balance-scale"></i>
                            Código de Régimen <span class="xml-tag">(RegimenCode)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-RegimenCode" value="${escapeHtml(vals.RegimenCode)}" 
                               placeholder="1" class="campo-obligatorio">
                        <small>Ej: 1 (Definitivo), 4 (Temporal), 70 (Zona Franca)</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-FormNo">
                        <label>
                            <i class="fas fa-hashtag"></i>
                            Número de Formulario <span class="xml-tag">(FormNo)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-FormNo" value="${escapeHtml(vals.FormNo)}" 
                               placeholder="Ej: 39155" class="campo-obligatorio">
                        <small>Número único del formulario de declaración</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-BLNo">
                        <label>
                            <i class="fas fa-ship"></i>
                            Número B/L <span class="xml-tag">(BLNo)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-BLNo" value="${escapeHtml(vals.BLNo)}" 
                               placeholder="PRELIQUIDACION" class="campo-obligatorio">
                        <small>Usar PRELIQUIDACION si no tiene número B/L</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-ConsigneeCode">
                        <label>
                            <i class="fas fa-barcode"></i>
                            RNC Consignatario <span class="xml-tag">(ConsigneeCode)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-ConsigneeCode" value="${escapeHtml(vals.ConsigneeCode)}" 
                               placeholder="RNC214101830141" class="campo-obligatorio">
                        <small>Debe comenzar con RNC seguido de números</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-ConsigneeName">
                        <label>
                            <i class="fas fa-user"></i>
                            Nombre Consignatario <span class="xml-tag">(ConsigneeName)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-ConsigneeName" value="${escapeHtml(vals.ConsigneeName)}" 
                               placeholder="Nombre o Razón Social" class="campo-obligatorio">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-TotalFOB">
                        <label>
                            <i class="fas fa-dollar-sign"></i>
                            Valor FOB Total <span class="xml-tag">(TotalFOB)</span> <span class="required">*</span>
                        </label>
                        <input type="number" id="decl-TotalFOB" value="${vals.TotalFOB}" 
                               placeholder="0.0000" step="0.0001" min="0" class="campo-obligatorio"
                               oninput="calcularTotalCIF()">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-InsuranceValue">
                        <label>
                            <i class="fas fa-shield-alt"></i>
                            Valor del Seguro <span class="xml-tag">(InsuranceValue)</span> <span class="required">*</span>
                        </label>
                        <input type="number" id="decl-InsuranceValue" value="${vals.InsuranceValue}" 
                               placeholder="0.00" step="0.01" min="0" class="campo-obligatorio"
                               oninput="calcularTotalCIF()">
                        <small>Usar 0 si no aplica</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-FreightValue">
                        <label>
                            <i class="fas fa-truck"></i>
                            Valor del Flete <span class="xml-tag">(FreightValue)</span> <span class="required">*</span>
                        </label>
                        <input type="number" id="decl-FreightValue" value="${vals.FreightValue}" 
                               placeholder="0.00" step="0.01" min="0" class="campo-obligatorio"
                               oninput="calcularTotalCIF()">
                        <small>Usar 0 si no aplica</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-OtherValue">
                        <label>
                            <i class="fas fa-coins"></i>
                            Otros Valores <span class="xml-tag">(OtherValue)</span>
                        </label>
                        <input type="number" id="decl-OtherValue" value="${vals.OtherValue}" 
                               placeholder="0.0000" step="0.0001" min="0"
                               oninput="calcularTotalCIF()">
                    </div>
                </div>

                <!-- SECCIÓN: PROVEEDOR EXTRANJERO -->
                <div class="form-section-header obligatorio">
                    <i class="fas fa-globe"></i>
                    <span>Proveedor Extranjero (ImpDeclarationSupplier)</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group full-width" id="decl-field-ForeignSupplierName">
                        <label>
                            <i class="fas fa-building"></i>
                            Nombre del Proveedor <span class="xml-tag">(ForeignSupplierName)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-ForeignSupplierName" value="${escapeHtml(vals.ForeignSupplierName)}" 
                               placeholder="Nombre de la empresa proveedora" class="campo-obligatorio">
                        <small>Nombre completo del proveedor extranjero</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-ForeignSupplierCode">
                        <label>
                            <i class="fas fa-id-badge"></i>
                            Código del Proveedor <span class="xml-tag">(ForeignSupplierCode)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-ForeignSupplierCode" value="${escapeHtml(vals.ForeignSupplierCode)}" 
                               placeholder="TID724C103085" class="campo-obligatorio">
                        <small>Formato: TID + código país + identificador (ej: TID724C103085)</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-ForeignSupplierNationality">
                        <label>
                            <i class="fas fa-flag"></i>
                            Nacionalidad Proveedor <span class="xml-tag">(ForeignSupplierNationality)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="decl-ForeignSupplierNationality" value="${escapeHtml(vals.ForeignSupplierNationality)}" 
                               placeholder="724" class="campo-obligatorio">
                        <small>Código del país (ej: 724=España, 840=USA, 156=China)</small>
                    </div>
                </div>

                <!-- SECCIÓN: IMPORTADOR -->
                <div class="form-section-header">
                    <i class="fas fa-building"></i>
                    <span>Datos del Importador</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group full-width" id="decl-field-ImporterName">
                        <label>
                            <i class="fas fa-user"></i>
                            Nombre del Importador <span class="xml-tag">(ImporterName)</span>
                        </label>
                        <input type="text" id="decl-ImporterName" value="${escapeHtml(vals.ImporterName)}" 
                               placeholder="Nombre o Razón Social">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-ImporterNationality">
                        <label>
                            <i class="fas fa-flag"></i>
                            Nacionalidad <span class="xml-tag">(ImporterNationality)</span>
                        </label>
                        <input type="text" id="decl-ImporterNationality" value="${escapeHtml(vals.ImporterNationality)}" 
                               placeholder="214 = Rep. Dominicana">
                    </div>
                </div>

                <!-- SECCIÓN: DECLARANTE -->
                <div class="form-section-header">
                    <i class="fas fa-user-tie"></i>
                    <span>Datos del Declarante / Agente Aduanal</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group full-width" id="decl-field-DeclarantName">
                        <label>
                            <i class="fas fa-user"></i>
                            Nombre del Declarante <span class="xml-tag">(DeclarantName)</span>
                        </label>
                        <input type="text" id="decl-DeclarantName" value="${escapeHtml(vals.DeclarantName)}" 
                               placeholder="Nombre del Agente Aduanal">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-BrokerCompanyCode">
                        <label>
                            <i class="fas fa-id-badge"></i>
                            Código Agencia <span class="xml-tag">(BrokerCompanyCode)</span>
                        </label>
                        <input type="text" id="decl-BrokerCompanyCode" value="${escapeHtml(vals.BrokerCompanyCode)}" 
                               placeholder="Código de la agencia">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-BrokerEmployeeCode">
                        <label>
                            <i class="fas fa-id-card-alt"></i>
                            Código Empleado <span class="xml-tag">(BrokerEmployeeCode)</span>
                        </label>
                        <input type="text" id="decl-BrokerEmployeeCode" value="${escapeHtml(vals.BrokerEmployeeCode)}" 
                               placeholder="Código del empleado">
                    </div>
                </div>

                <!-- SECCIÓN: DOCUMENTOS -->
                <div class="form-section-header">
                    <i class="fas fa-file-alt"></i>
                    <span>Documentos y Referencias</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="decl-field-ManifestNo">
                        <label>
                            <i class="fas fa-file-invoice"></i>
                            Número de Manifiesto <span class="xml-tag">(ManifestNo)</span>
                        </label>
                        <input type="text" id="decl-ManifestNo" value="${escapeHtml(vals.ManifestNo)}" 
                               placeholder="Número del manifiesto">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-CommercialInvoiceNo">
                        <label>
                            <i class="fas fa-receipt"></i>
                            N° Factura Comercial <span class="xml-tag">(CommercialInvoiceNo)</span>
                        </label>
                        <input type="text" id="decl-CommercialInvoiceNo" value="${escapeHtml(vals.CommercialInvoiceNo)}" 
                               placeholder="Número de factura">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-CargoControlNo">
                        <label>
                            <i class="fas fa-boxes"></i>
                            Control de Carga <span class="xml-tag">(CargoControlNo)</span>
                        </label>
                        <input type="text" id="decl-CargoControlNo" value="${escapeHtml(vals.CargoControlNo)}" 
                               placeholder="SN si no aplica">
                    </div>
                </div>

                <!-- SECCIÓN: TRANSPORTE -->
                <div class="form-section-header">
                    <i class="fas fa-shipping-fast"></i>
                    <span>Información de Transporte</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="decl-field-EntryPort">
                        <label>
                            <i class="fas fa-anchor"></i>
                            Puerto de Entrada <span class="xml-tag">(EntryPort)</span>
                        </label>
                        <input type="text" id="decl-EntryPort" value="${escapeHtml(vals.EntryPort)}" 
                               placeholder="Puerto de entrada">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-DepartureCountryCode">
                        <label>
                            <i class="fas fa-plane-departure"></i>
                            País de Embarque <span class="xml-tag">(DepartureCountryCode)</span>
                        </label>
                        <input type="text" id="decl-DepartureCountryCode" value="${escapeHtml(vals.DepartureCountryCode)}" 
                               placeholder="Código del país">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-TransportMethod">
                        <label>
                            <i class="fas fa-route"></i>
                            Método de Transporte <span class="xml-tag">(TransportMethod)</span>
                        </label>
                        <input type="text" id="decl-TransportMethod" value="${escapeHtml(vals.TransportMethod)}" 
                               placeholder="1">
                        <small>Ej: 1 (Marítimo), 2 (Aéreo), 3 (Terrestre), 4 (Postal)</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-TransportCompanyCode">
                        <label>
                            <i class="fas fa-truck-loading"></i>
                            Código Transportista <span class="xml-tag">(TransportCompanyCode)</span>
                        </label>
                        <input type="text" id="decl-TransportCompanyCode" value="${escapeHtml(vals.TransportCompanyCode)}" 
                               placeholder="Código de la empresa">
                    </div>
                </div>

                <!-- SECCIÓN: PESOS Y TOTALES -->
                <div class="form-section-header">
                    <i class="fas fa-weight"></i>
                    <span>Pesos y Totales</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group full-width" id="decl-field-TotalCIF">
                        <label>
                            <i class="fas fa-calculator"></i>
                            Valor CIF Total <span class="xml-tag">(TotalCIF)</span>
                            <span class="auto-calc-badge" style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; margin-left: 8px;">Auto-calculado</span>
                        </label>
                        <input type="number" id="decl-TotalCIF" value="${vals.TotalCIF}" 
                               placeholder="0.0000" step="0.0001" min="0" readonly
                               style="background-color: #f0fdf4; border: 2px solid #10b981; font-weight: bold;">
                        <small style="color: #10b981;"><i class="fas fa-info-circle"></i> Se calcula automáticamente: TotalCIF = TotalFOB + Seguro + Flete + Otros</small>
                    </div>
                    
                    <div class="product-form-group" id="decl-field-TotalWeight">
                        <label>
                            <i class="fas fa-weight-hanging"></i>
                            Peso Total (kg) <span class="xml-tag">(TotalWeight)</span>
                        </label>
                        <input type="number" id="decl-TotalWeight" value="${vals.TotalWeight}" 
                               placeholder="0.00" step="0.01" min="0">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-NetWeight">
                        <label>
                            <i class="fas fa-balance-scale-right"></i>
                            Peso Neto (kg) <span class="xml-tag">(NetWeight)</span>
                        </label>
                        <input type="number" id="decl-NetWeight" value="${vals.NetWeight}" 
                               placeholder="0.00" step="0.01" min="0">
                    </div>
                    
                    <div class="product-form-group" id="decl-field-AreaCode">
                        <label>
                            <i class="fas fa-map-marker-alt"></i>
                            Código de Área <span class="xml-tag">(AreaCode)</span>
                        </label>
                        <input type="text" id="decl-AreaCode" value="${escapeHtml(vals.AreaCode)}" 
                               placeholder="10150">
                    </div>
                </div>

                <!-- SECCIÓN: OBSERVACIONES -->
                <div class="form-section-header">
                    <i class="fas fa-sticky-note"></i>
                    <span>Observaciones</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group full-width" id="decl-field-Remark">
                        <label>
                            <i class="fas fa-comment-alt"></i>
                            Observaciones <span class="xml-tag">(Remark)</span>
                        </label>
                        <textarea id="decl-Remark" rows="3" 
                                  placeholder="Observaciones adicionales...">${escapeHtml(vals.Remark)}</textarea>
                    </div>
                </div>
            </div>
            
            <div class="product-modal-footer">
                <button class="btn-modal cancel" onclick="cerrarModalDeclaracion()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
                <button class="btn-modal save" onclick="guardarDeclaracionGeneral()">
                    <i class="fas fa-check"></i> Guardar Cambios
                </button>
            </div>
        </div>
    `;
    
    // Mostrar modal
    setTimeout(() => {
        modalOverlay.classList.add('active');
        
        // Agregar listeners para quitar el error al escribir
        agregarListenersQuitarError();
        
        // Marcar campos con error
        marcarCamposConErrorEnModal();
        
        // Calcular TotalCIF inicial si hay valores
        calcularTotalCIF();
        
        // Si hay un campo específico para enfocar
        if (focusField) {
            setTimeout(() => {
                const fieldContainer = document.getElementById(`decl-field-${focusField}`);
                const inputField = document.getElementById(`decl-${focusField}`);
                
                if (fieldContainer) {
                    fieldContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    fieldContainer.classList.add('campo-destacado');
                    setTimeout(() => fieldContainer.classList.remove('campo-destacado'), 2000);
                }
                
                if (inputField) {
                    inputField.focus();
                    inputField.classList.add('input-destacado');
                    setTimeout(() => inputField.classList.remove('input-destacado'), 2000);
                }
            }, 300);
        }
    }, 10);
}

/**
 * Agrega listeners a los campos del modal de declaración para quitar el error al escribir
 */
function agregarListenersQuitarError() {
    // Campos obligatorios que pueden tener error
    const camposObligatorios = [
        'decl-ClearanceType',
        'decl-ImporterCode', 
        'decl-DeclarantCode',
        'decl-RegimenCode',
        'decl-TotalFOB',
        'decl-InsuranceValue',
        'decl-FreightValue',
        'decl-ForeignSupplierName',
        'decl-ForeignSupplierCode',
        'decl-ForeignSupplierNationality'
    ];
    
    camposObligatorios.forEach(campoId => {
        const input = document.getElementById(campoId);
        if (input) {
            // Listener para cuando escribe
            input.addEventListener('input', function() {
                quitarErrorDeCampo(campoId);
            });
            
            // También para selects (change)
            input.addEventListener('change', function() {
                quitarErrorDeCampo(campoId);
            });
        }
    });
}

/**
 * Quita el estilo de error de un campo específico
 */
function quitarErrorDeCampo(campoId) {
    // Obtener el nombre del campo (sin el prefijo 'decl-')
    const nombreCampo = campoId.replace('decl-', '');
    
    // Quitar clase de error del input
    const input = document.getElementById(campoId);
    if (input) {
        input.classList.remove('input-error', 'campo-error', 'con-error');
        input.style.borderColor = '';
        input.style.backgroundColor = '';
    }
    
    // Quitar del contenedor del campo
    const fieldContainer = document.getElementById(`decl-field-${nombreCampo}`);
    if (fieldContainer) {
        fieldContainer.classList.remove('has-error', 'campo-error');
        // Quitar alerta inline si existe
        const alertaInline = fieldContainer.querySelector('.field-inline-alert');
        if (alertaInline) {
            alertaInline.remove();
        }
    }
    
    // También buscar en la vista principal de resultados
    const detailItems = document.querySelectorAll(`[data-field-key*="${nombreCampo}"]`);
    detailItems.forEach(item => {
        item.classList.remove('has-error');
        const alerta = item.querySelector('.field-inline-alert');
        if (alerta) alerta.remove();
    });
    
    // Actualizar el panel de validación (quitar este error específico)
    actualizarPanelValidacionSinCampo(nombreCampo);
}

/**
 * Marca los campos con error en el modal de declaración
 */
function marcarCamposConErrorEnModal() {
    const datosActuales = window.resultadoActual || resultadoActual;
    if (!datosActuales) return;
    
    const errores = validarCamposObligatoriosSIGA(datosActuales);
    
    errores.forEach(error => {
        // Campos generales
        const camposGenerales = ['ClearanceType', 'ImporterCode', 'DeclarantCode', 'RegimenCode', 'TotalFOB', 'InsuranceValue', 'FreightValue'];
        
        camposGenerales.forEach(campo => {
            if (error.includes(campo)) {
                const input = document.getElementById(`decl-${campo}`);
                const container = document.getElementById(`decl-field-${campo}`);
                
                if (input) {
                    input.classList.add('input-error', 'con-error');
                }
                if (container) {
                    container.classList.add('campo-error');
                }
            }
        });
    });
}

// Exportar para uso global
window.marcarCamposConErrorEnModal = marcarCamposConErrorEnModal;

/**
 * Actualiza el panel de validación quitando errores del campo especificado
 */
function actualizarPanelValidacionSinCampo(nombreCampo) {
    const erroresContainer = document.getElementById('validation-errors');
    if (!erroresContainer) return;
    
    // Buscar y eliminar el error de este campo
    const errores = erroresContainer.querySelectorAll('.validation-error-item');
    errores.forEach(errorItem => {
        if (errorItem.textContent.includes(nombreCampo)) {
            errorItem.style.transition = 'all 0.3s ease';
            errorItem.style.opacity = '0';
            errorItem.style.transform = 'translateX(-20px)';
            setTimeout(() => errorItem.remove(), 300);
        }
    });
    
    // Si no quedan errores, ocultar el panel
    setTimeout(() => {
        const erroresRestantes = erroresContainer.querySelectorAll('.validation-error-item');
        if (erroresRestantes.length === 0) {
            ocultarPanelValidacion();
        }
    }, 350);
}

/**
 * Calcula automáticamente el TotalCIF sumando TotalFOB + InsuranceValue + FreightValue + OtherValue
 */
function calcularTotalCIF() {
    const getNumValue = (id) => {
        const el = document.getElementById(id);
        if (!el) return 0;
        const val = parseFloat(el.value);
        return isNaN(val) ? 0 : val;
    };
    
    const totalFOB = getNumValue('decl-TotalFOB');
    const insuranceValue = getNumValue('decl-InsuranceValue');
    const freightValue = getNumValue('decl-FreightValue');
    const otherValue = getNumValue('decl-OtherValue');
    
    const totalCIF = totalFOB + insuranceValue + freightValue + otherValue;
    
    const cifInput = document.getElementById('decl-TotalCIF');
    if (cifInput) {
        cifInput.value = totalCIF.toFixed(4);
        
        // Efecto visual al actualizar
        cifInput.style.transition = 'background-color 0.3s';
        cifInput.style.backgroundColor = '#d1fae5';
        setTimeout(() => {
            cifInput.style.backgroundColor = '#f0fdf4';
        }, 300);
    }
    
    console.log(`📊 TotalCIF calculado: ${totalFOB} + ${insuranceValue} + ${freightValue} + ${otherValue} = ${totalCIF}`);
}

// Exportar función globalmente
window.calcularTotalCIF = calcularTotalCIF;

/**
 * Cierra el modal de declaración general
 */
function cerrarModalDeclaracion() {
    const modalOverlay = document.getElementById('declaration-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
}

/**
 * Guarda los cambios de la declaración general
 */
function guardarDeclaracionGeneral() {
    // Forzar que cualquier input pendiente se procese
    document.activeElement?.blur();
    
    // Pequeño delay para asegurar que todos los valores estén actualizados
    setTimeout(() => {
        guardarDeclaracionGeneralReal();
    }, 50);
}

function guardarDeclaracionGeneralReal() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };
    const getNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return undefined;
        const val = el.value.trim();
        if (val === '') return undefined;
        const num = parseFloat(val);
        return isNaN(num) ? undefined : num;
    };
    
    // Crear objeto con los datos de la declaración
    const datosDeclaracion = {
        ClearanceType: getVal('decl-ClearanceType'),
        AreaCode: getVal('decl-AreaCode'),
        FormNo: getVal('decl-FormNo'),
        BLNo: getVal('decl-BLNo'),
        ManifestNo: getVal('decl-ManifestNo'),
        ConsigneeCode: getVal('decl-ConsigneeCode'),
        ConsigneeName: getVal('decl-ConsigneeName'),
        ConsigneeNationality: getVal('decl-ConsigneeNationality'),
        CargoControlNo: getVal('decl-CargoControlNo'),
        CommercialInvoiceNo: getVal('decl-CommercialInvoiceNo'),
        EntryPort: getVal('decl-EntryPort'),
        DepartureCountryCode: getVal('decl-DepartureCountryCode'),
        TransportCompanyCode: getVal('decl-TransportCompanyCode'),
        TransportMethod: getVal('decl-TransportMethod'),
        ImporterCode: getVal('decl-ImporterCode'),
        ImporterName: getVal('decl-ImporterName'),
        ImporterNationality: getVal('decl-ImporterNationality'),
        BrokerEmployeeCode: getVal('decl-BrokerEmployeeCode'),
        BrokerCompanyCode: getVal('decl-BrokerCompanyCode'),
        DeclarantCode: getVal('decl-DeclarantCode'),
        DeclarantName: getVal('decl-DeclarantName'),
        DeclarantNationality: getVal('decl-DeclarantNationality'),
        RegimenCode: getVal('decl-RegimenCode'),
        AgreementCode: getVal('decl-AgreementCode'),
        TotalFOB: getNum('decl-TotalFOB'),
        InsuranceValue: getNum('decl-InsuranceValue'),
        FreightValue: getNum('decl-FreightValue'),
        OtherValue: getNum('decl-OtherValue'),
        TotalCIF: getNum('decl-TotalCIF'),
        TotalWeight: getNum('decl-TotalWeight'),
        NetWeight: getNum('decl-NetWeight'),
        Remark: getVal('decl-Remark')
    };
    
    // Datos del proveedor extranjero
    const datosSupplier = {
        ForeignSupplierName: getVal('decl-ForeignSupplierName'),
        ForeignSupplierCode: getVal('decl-ForeignSupplierCode'),
        ForeignSupplierNationality: getVal('decl-ForeignSupplierNationality')
    };
    
    console.log('📝 Datos antes de limpiar:', JSON.stringify(datosDeclaracion, null, 2));
    console.log('📝 Datos Proveedor:', JSON.stringify(datosSupplier, null, 2));
    
    // NO eliminar campos obligatorios aunque estén undefined
    // Solo limpiar campos no obligatorios que estén vacíos
    const camposObligatorios = ['ClearanceType', 'ImporterCode', 'DeclarantCode', 'RegimenCode', 'TotalFOB', 'InsuranceValue', 'FreightValue'];
    Object.keys(datosDeclaracion).forEach(key => {
        // No eliminar campos obligatorios
        if (camposObligatorios.includes(key)) return;
        // Eliminar campos vacíos que no son obligatorios
        if (datosDeclaracion[key] === undefined || datosDeclaracion[key] === '') {
            delete datosDeclaracion[key];
        }
    });
    
    console.log('📝 Datos después de limpiar:', JSON.stringify(datosDeclaracion, null, 2));
    
    // Actualizar window.resultadoActual directamente
    if (!window.resultadoActual) {
        window.resultadoActual = {};
    }
    
    // Preservar productos existentes
    const productosActuales = window.resultadoActual.ImpDeclarationProduct || 
                              window.resultadoActual.productos || 
                              (window.productosClasificados ? [...window.productosClasificados] : []);
    
    // Fusionar los datos DIRECTAMENTE en window.resultadoActual
    Object.keys(datosDeclaracion).forEach(key => {
        window.resultadoActual[key] = datosDeclaracion[key];
    });
    
    // Guardar datos del proveedor extranjero
    if (datosSupplier.ForeignSupplierName || datosSupplier.ForeignSupplierCode || datosSupplier.ForeignSupplierNationality) {
        window.resultadoActual.ImpDeclarationSupplier = {
            ForeignSupplierName: datosSupplier.ForeignSupplierName || '',
            ForeignSupplierCode: datosSupplier.ForeignSupplierCode || '',
            ForeignSupplierNationality: datosSupplier.ForeignSupplierNationality || ''
        };
    }
    
    // Asegurar que los productos se mantengan
    if (productosActuales.length > 0) {
        window.resultadoActual.ImpDeclarationProduct = productosActuales;
    }
    
    // También actualizar la referencia local
    resultadoActual = window.resultadoActual;
    
    // Actualizar editedClassification
    window.editedClassification = window.resultadoActual;
    
    console.log('📊 GUARDADO - window.resultadoActual:', window.resultadoActual);
    console.log('📊 Valores guardados - ClearanceType:', window.resultadoActual.ClearanceType, 
                'ImporterCode:', window.resultadoActual.ImporterCode,
                'DeclarantCode:', window.resultadoActual.DeclarantCode,
                'RegimenCode:', window.resultadoActual.RegimenCode,
                'TotalFOB:', window.resultadoActual.TotalFOB,
                'Supplier:', window.resultadoActual.ImpDeclarationSupplier);
    
    // Cerrar modal
    cerrarModalDeclaracion();
    
    // Limpiar TODOS los errores visuales
    document.querySelectorAll('.detail-item.has-error').forEach(item => {
        item.classList.remove('has-error');
    });
    document.querySelectorAll('.field-inline-alert').forEach(alert => alert.remove());
    document.querySelectorAll('.input-error, .con-error, .campo-error').forEach(item => {
        item.classList.remove('input-error', 'con-error', 'campo-error');
    });
    
    // Ocultar el panel de validación temporalmente
    ocultarPanelValidacion();
    
    // Revalidar campos después de un breve delay
    setTimeout(() => {
        console.log('🔄 Revalidando con datos:', window.resultadoActual);
        validarYMostrarPanel();
    }, 200);
    
    showNotification('✅ Datos de la declaración guardados correctamente', 'success');
}

// Exportar funciones globalmente
window.abrirModalDeclaracionGeneral = abrirModalDeclaracionGeneral;
window.cerrarModalDeclaracion = cerrarModalDeclaracion;
window.guardarDeclaracionGeneral = guardarDeclaracionGeneral;
window.guardarDeclaracionGeneralReal = guardarDeclaracionGeneralReal;

// Validar automáticamente al mostrar resultados
function validarYMostrarPanel() {
    // Usar SIEMPRE window.resultadoActual
    const datosActuales = window.resultadoActual;
    
    if (!datosActuales) {
        console.log('⚠️ validarYMostrarPanel: No hay datos para validar');
        return;
    }
    
    // Fusionar productos: mantener datos originales y aplicar ediciones
    const productosOriginales = datosActuales.ImpDeclarationProduct || datosActuales.productos || [];
    
    if (window.productosClasificados && window.productosClasificados.length > 0) {
        datosActuales.ImpDeclarationProduct = window.productosClasificados.map((p, idx) => {
            const { _index, _isManual, ...productoEditado } = p;
            const productoOriginal = productosOriginales[idx] || {};
            // Fusionar: original + ediciones
            return { ...productoOriginal, ...productoEditado };
        });
    }
    
    console.log('🔍 Validando datos:', {
        ClearanceType: datosActuales.ClearanceType,
        ImporterCode: datosActuales.ImporterCode,
        DeclarantCode: datosActuales.DeclarantCode,
        RegimenCode: datosActuales.RegimenCode,
        TotalFOB: datosActuales.TotalFOB,
        InsuranceValue: datosActuales.InsuranceValue,
        FreightValue: datosActuales.FreightValue,
        productos: datosActuales.ImpDeclarationProduct?.length || 0
    });
    
    const errores = validarCamposObligatoriosSIGA(datosActuales);
    
    console.log('📋 Errores encontrados:', errores.length, errores);
    
    // SIEMPRE limpiar todo primero antes de re-mostrar
    document.querySelectorAll('.detail-item.has-warning').forEach(item => {
        item.classList.remove('has-warning');
    });
    document.querySelectorAll('.detail-item.has-error').forEach(item => {
        item.classList.remove('has-error');
    });
    document.querySelectorAll('.field-inline-alert').forEach(alert => alert.remove());
    document.querySelectorAll('.input-error').forEach(item => {
        item.classList.remove('input-error', 'con-error');
    });
    document.querySelectorAll('.campo-error').forEach(item => {
        item.classList.remove('campo-error');
    });
    
    if (errores.length > 0) {
        console.log('❌ Hay', errores.length, 'errores rojos');
        mostrarPanelValidacion(errores);
        mostrarAlertasInline(errores);
        ocultarPanelAdvertencia(); // Ocultar panel amarillo si hay errores rojos
    } else {
        console.log('✅ No hay errores rojos - TODO CORRECTO');
        ocultarPanelValidacion();
        limpiarAlertasInline();
        
        // Solo marcar campos vacíos (no obligatorios) con advertencia amarilla si NO hay errores rojos
        setTimeout(() => {
            const hayAdvertencias = marcarCamposVaciosConAdvertencia();
            if (hayAdvertencias) {
                mostrarPanelAdvertencia();
            } else {
                ocultarPanelAdvertencia();
            }
        }, 300);
    }
}

// Mostrar alertas inline al lado de los campos con error
function mostrarAlertasInline(errores) {
    // Primero limpiar alertas existentes
    limpiarAlertasInline();
    
    const data = resultadoActual.ImportDUA?.ImpDeclaration || resultadoActual;
    
    // Mapear errores a campos específicos
    errores.forEach(error => {
        let campoId = null;
        let mensajeError = error.replace('• ', '');
        
        // Extraer el campo del mensaje de error
        if (error.includes('ClearanceType')) {
            campoId = 'ClearanceType';
        } else if (error.includes('ImporterCode')) {
            campoId = 'ImporterCode';
        } else if (error.includes('DeclarantCode')) {
            campoId = 'DeclarantCode';
        } else if (error.includes('RegimenCode')) {
            campoId = 'RegimenCode';
        } else if (error.includes('TotalFOB')) {
            campoId = 'TotalFOB';
        } else if (error.includes('InsuranceValue')) {
            campoId = 'InsuranceValue';
        } else if (error.includes('FreightValue')) {
            campoId = 'FreightValue';
        } else if (error.includes('ProductStatusCode')) {
            campoId = 'ProductStatusCode';
        } else if (error.includes('TempProductYN')) {
            campoId = 'TempProductYN';
        } else if (error.includes('OrganicYN')) {
            campoId = 'OrganicYN';
        }
        
        if (campoId) {
            // Buscar el elemento del campo
            const fieldElements = document.querySelectorAll(`[data-field-key*="${campoId}"]`);
            
            fieldElements.forEach(fieldElement => {
                // Marcar el campo con error
                fieldElement.classList.add('has-error');
                
                // Crear alerta inline
                const alertDiv = document.createElement('div');
                alertDiv.className = 'field-inline-alert';
                alertDiv.innerHTML = `
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="field-inline-alert-text">${mensajeError}</div>
                `;
                
                // Insertar la alerta después del campo
                fieldElement.appendChild(alertDiv);
            });
        }
    });
}

// Limpiar todas las alertas inline
function limpiarAlertasInline() {
    // Remover todas las alertas inline
    document.querySelectorAll('.field-inline-alert').forEach(alert => alert.remove());
    
    // Remover la clase de error de los campos
    document.querySelectorAll('.detail-item.has-error').forEach(item => {
        item.classList.remove('has-error');
    });
    
    // Remover la clase de advertencia de los campos
    document.querySelectorAll('.detail-item.has-warning').forEach(item => {
        item.classList.remove('has-warning');
    });
}

// Marcar campos vacíos con advertencia (amarillo)
function marcarCamposVaciosConAdvertencia() {
    console.log('🟨 Marcando campos vacíos con advertencia amarilla...');
    
    // Lista de campos obligatorios que no deben marcarse en amarillo
    const camposObligatorios = [
        'ClearanceType', 'ImporterCode', 'DeclarantCode', 'RegimenCode',
        'TotalFOB', 'InsuranceValue', 'FreightValue',
        'ProductStatusCode', 'TempProductYN', 'OrganicYN'
    ];
    
    // Obtener todos los campos en la vista
    const todosLosCampos = document.querySelectorAll('[data-field-key]');
    console.log(`📋 Total de campos encontrados: ${todosLosCampos.length}`);
    
    let contadorAdvertencias = 0;
    
    todosLosCampos.forEach(fieldElement => {
        const fieldKey = fieldElement.getAttribute('data-field-key');
        const valueElement = fieldElement.querySelector('.detail-value');
        
        if (!valueElement) return;
        
        // Obtener valor original del dataset si existe
        const valorOriginal = valueElement.dataset.originalValue || valueElement.textContent.trim();
        const value = valorOriginal.trim();
        
        // Verificar si es un campo obligatorio (comparación exacta del nombre del campo)
        const esObligatorio = camposObligatorios.some(campo => {
            const fieldKeySimple = fieldKey.split('.').pop(); // Obtener solo el último segmento
            return fieldKeySimple === campo;
        });
        
        // Considerar vacío si es: '', 'null', 'undefined', '0', '0.00', '0.0000'
        const estaVacio = value === '' || 
                         value === 'null' || 
                         value === 'undefined' || 
                         value === '(vacío)' ||
                         value === '0' ||
                         /^0\.0+$/.test(value); // Matches 0.0, 0.00, 0.0000, etc.
        
        // Si el campo está vacío y NO es obligatorio, marcarlo en amarillo
        if (!esObligatorio && estaVacio) {
            fieldElement.classList.add('has-warning');
            contadorAdvertencias++;
            console.log(`⚠️ Campo vacío (opcional): ${fieldKey} = "${value}"`);
            
            // Si el valor está completamente vacío, mostrar texto "(vacío)"
            if (value === '' || value === 'null' || value === 'undefined') {
                valueElement.textContent = '(vacío)';
                valueElement.style.fontStyle = 'italic';
                valueElement.style.opacity = '0.6';
            }
        } else {
            fieldElement.classList.remove('has-warning');
        }
    });
    
    console.log(`✅ Total de advertencias amarillas mostradas: ${contadorAdvertencias}`);
    return contadorAdvertencias > 0;
}

// Mostrar panel de advertencia amarillo
function mostrarPanelAdvertencia() {
    const panel = document.getElementById('warning-panel');
    if (panel) {
        panel.style.display = 'block';
    }
}

// Ocultar panel de advertencia amarillo
function ocultarPanelAdvertencia() {
    const panel = document.getElementById('warning-panel');
    if (panel) {
        panel.style.display = 'none';
    }
}

// NOTA: Esta función ya no es necesaria porque restaurarSesion() hace todo
// Verificar si el usuario es admin al cargar la página
// async function verificarRolAdmin() {
//     const token = localStorage.getItem('authToken');
//     if (!token) return;
//     
//     try {
//         const response = await fetch(`${API_BASE_URL}/api/auth/verificar`, {
//             headers: {
//                 'Authorization': `Bearer ${token}`
//             }
//         });
//         
//         const data = await response.json();
//         
//         if (data.success && data.usuario && data.usuario.rol === 'admin') {
//             const btnAdmin = document.getElementById('btn-admin-panel');
//             if (btnAdmin) {
//                 btnAdmin.style.display = 'inline-flex';
//             }
//         }
//     } catch (error) {
//         console.error('Error verificando rol:', error);
//     }
// }

// Ejecutar verificación al cargar
// if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', verificarRolAdmin);
// } else {
//     verificarRolAdmin();
// }

// Función para continuar sin autenticación (Modo Demo)
function continuarSinAutenticacion() {
    console.log('🎮 Iniciando modo demo sin autenticación');
    
    // Ocultar modal de login
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
    
    // Mostrar mensaje de bienvenida
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
    `;
    notification.innerHTML = '<strong>🎮 Modo Demo Activado</strong><br>Puedes usar todas las funciones sin autenticación';
    document.body.appendChild(notification);
    
    // Auto-eliminar notificación después de 4 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 4000);
    
    // Hacer scroll al inicio de la página
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==================== SISTEMA DE LOGIN ====================

// Función para generar un device fingerprint simple
function generateDeviceFingerprint() {
    // Usar la misma función que getDeviceFingerprint para consistencia
    return getDeviceFingerprint();
}

// Inicializar event listener del formulario de login
// Se ejecuta cuando el DOM está listo
(function initLoginForm() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupLoginForm);
    } else {
        setupLoginForm();
    }
})();

function setupLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (loginForm && !loginForm.hasAttribute('data-listener-added')) {
        loginForm.setAttribute('data-listener-added', 'true');
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await handleLogin();
        });
    }
}

// Función para manejar el login
async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btnLogin = document.getElementById('btn-login');
    const loginError = document.getElementById('login-error');
    
    // Validar campos
    if (!email || !password) {
        mostrarErrorLogin('Por favor completa todos los campos');
        return;
    }
    
    // Deshabilitar botón y mostrar loading
    btnLogin.disabled = true;
    btnLogin.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando sesión...';
    loginError.style.display = 'none';
    
    try {
        // Generar un device fingerprint simple
        const deviceFingerprint = generateDeviceFingerprint();
        
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': deviceFingerprint
            },
            body: JSON.stringify({
                correo: email,
                contrasena: password
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.requiere_2fa) {
                // Mostrar modal de 2FA
                mostrarModal2FA(data.usuario_id);
            } else {
                // Login exitoso sin 2FA
                console.log('✅ Login exitoso, guardando datos...', data);
                
                authToken = data.token;
                localStorage.setItem('authToken', data.token);
                console.log('💾 Token guardado en localStorage');
                
                // Guardar info del usuario si viene en la respuesta
                if (data.usuario) {
                    userInfo = {
                        ...data.usuario,
                        empresa: data.empresa,
                        plan: data.plan,
                        limites: data.limites
                    };
                    localStorage.setItem('userInfo', JSON.stringify(userInfo));
                    console.log('💾 UserInfo guardado:', userInfo);
                    
                    // Actualizar UI de tokens y dispositivos INMEDIATAMENTE
                    if (data.limites) {
                        const tokensInfo = document.getElementById('tokens-info');
                        if (tokensInfo) {
                            tokensInfo.textContent = `${(data.limites.tokens_consumidos || 0).toLocaleString()} / ${(data.limites.tokens_limite_mensual || 0).toLocaleString()} tokens`;
                            console.log('✅ Tokens actualizados en UI:', tokensInfo.textContent);
                        }
                        
                        const devicesInfo = document.getElementById('devices-info');
                        if (devicesInfo) {
                            devicesInfo.textContent = `${data.limites.dispositivos_activos || 0} / ${data.limites.dispositivos_limite || 0} dispositivos`;
                            console.log('✅ Dispositivos actualizados en UI:', devicesInfo.textContent);
                        }
                    }
                    
                    // Mostrar contenedor de auth-info
                    const authInfo = document.getElementById('auth-info');
                    if (authInfo) {
                        authInfo.style.display = 'flex';
                    }
                    
                    // Mostrar botón de historial
                    const btnHistorial = document.getElementById('tab-historial-btn');
                    if (btnHistorial) {
                        btnHistorial.style.display = 'inline-block';
                    }
                    
                    // Mostrar botón de logout
                    const btnLogout = document.querySelector('.btn-logout');
                    if (btnLogout) {
                        btnLogout.style.setProperty('display', 'inline-flex', 'important');
                        btnLogout.style.visibility = 'visible';
                        btnLogout.style.opacity = '1';
                        console.log('✅ Botón logout mostrado');
                    } else {
                        console.warn('⚠️ No se encontró el botón de logout');
                    }
                    
                    // Si es admin, mostrar botón
                    if (data.usuario.rol === 'admin') {
                        const btnAdmin = document.getElementById('btn-admin-panel');
                        if (btnAdmin) {
                            btnAdmin.style.display = 'inline-flex';
                            console.log('✅ Botón admin mostrado');
                        }
                    }
                }
                
                cerrarModalLogin();
                mostrarNotificacion('✅ Sesión iniciada correctamente', 'success');
            }
        } else {
            mostrarErrorLogin(data.mensaje || 'Credenciales incorrectas');
        }
        
    } catch (error) {
        console.error('Error en login:', error);
        mostrarErrorLogin('Error de conexión con el servidor. Verifica que el servidor esté corriendo.');
    } finally {
        // Restaurar botón
        btnLogin.disabled = false;
        btnLogin.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar Sesión';
    }
}

// Mostrar error de login
function mostrarErrorLogin(mensaje) {
    const loginError = document.getElementById('login-error');
    if (loginError) {
        loginError.textContent = mensaje;
        loginError.style.display = 'block';
    }
}

// Restaurar sesión desde localStorage
async function restaurarSesion() {
    const token = localStorage.getItem('authToken');
    const userInfoStr = localStorage.getItem('userInfo');
    const deviceFP = localStorage.getItem('deviceFingerprint');
    
    console.log('🔍 Verificando sesión...');
    console.log('  📱 Device Fingerprint en localStorage:', deviceFP);
    
    if (!token || !userInfoStr) {
        console.log('ℹ️ No hay sesión guardada');
        return;
    }
    
    // Verificar inmediatamente si el token es válido
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verificar`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success) {
                // Token válido - restaurar sesión
                authToken = token;
                userInfo = {
                    usuario: data.usuario,
                    empresa: data.empresa,
                    plan: data.plan,
                    limites: data.limites,
                    rol: data.usuario.rol
                };
                
                // Guardar datos actualizados
                localStorage.setItem('userInfo', JSON.stringify(userInfo));
                
                console.log('✅ Sesión válida restaurada');
                
                // Actualizar UI
                actualizarUIConSesion();
                
            } else {
                // Token inválido - limpiar sesión silenciosamente
                console.log('🔒 Sesión inválida - limpiando');
                limpiarSesionSilenciosamente();
            }
        } else {
            // Error de autenticación - limpiar sesión
            console.log('🔒 Sesión expirada - limpiando');
            limpiarSesionSilenciosamente();
        }
    } catch (error) {
        console.error('❌ Error verificando sesión:', error);
        // En caso de error de red, limpiar sesión por seguridad
        limpiarSesionSilenciosamente();
    }
}

// Actualizar UI cuando hay sesión válida
function actualizarUIConSesion() {
    // Actualizar información de tokens y dispositivos
    if (userInfo.limites) {
        const tokensInfo = document.getElementById('tokens-info');
        if (tokensInfo) {
            tokensInfo.textContent = `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
        }
        
        const devicesInfo = document.getElementById('devices-info');
        if (devicesInfo) {
            devicesInfo.textContent = `${userInfo.limites.dispositivos_activos} / ${userInfo.limites.dispositivos_limite} dispositivos`;
        }
    }
    
    // Mostrar contenedor de auth-info
    const authInfo = document.getElementById('auth-info');
    if (authInfo) {
        authInfo.style.display = 'flex';
    }
    
    // Mostrar botón de historial
    const btnHistorial = document.getElementById('tab-historial-btn');
    if (btnHistorial) {
        btnHistorial.style.display = 'inline-block';
    }
    
    // Mostrar botón de configuración
    const btnConfig = document.getElementById('tab-config-btn');
    if (btnConfig) {
        btnConfig.style.display = 'inline-block';
    }
    
    // Ocultar modal de login
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
    
    // Mostrar botón de logout
    const btnLogout = document.querySelector('.btn-logout');
    if (btnLogout) {
        btnLogout.style.setProperty('display', 'inline-flex', 'important');
        btnLogout.style.visibility = 'visible';
        btnLogout.style.opacity = '1';
    }
    
    // Si es admin, mostrar botón de panel
    if (userInfo.rol === 'admin') {
        const btnAdmin = document.getElementById('btn-admin-panel');
        if (btnAdmin) {
            btnAdmin.style.display = 'inline-flex';
        }
    }
}

// Limpiar sesión silenciosamente sin mostrar notificaciones
function limpiarSesionSilenciosamente() {
    authToken = null;
    userInfo = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    
    // Ocultar elementos de sesión
    const authInfo = document.getElementById('auth-info');
    if (authInfo) {
        authInfo.style.display = 'none';
    }
    
    const btnHistorial = document.getElementById('tab-historial-btn');
    if (btnHistorial) {
        btnHistorial.style.display = 'none';
    }
    
    const btnLogout = document.querySelector('.btn-logout');
    if (btnLogout) {
        btnLogout.style.display = 'none';
    }
    
    const btnAdmin = document.getElementById('btn-admin-panel');
    if (btnAdmin) {
        btnAdmin.style.display = 'none';
    }
}

// Limpiar sesión
function limpiarSesion() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userInfo');
    authToken = null;
    userInfo = null;
    
    // Ocultar contenedor auth-info
    const authInfo = document.getElementById('auth-info');
    if (authInfo) {
        authInfo.style.display = 'none';
    }
    
    // Ocultar botones
    const btnAdmin = document.getElementById('btn-admin-panel');
    if (btnAdmin) {
        btnAdmin.style.display = 'none';
    }
    
    const btnHistorial = document.getElementById('tab-historial-btn');
    if (btnHistorial) {
        btnHistorial.style.display = 'none';
    }
    
    const btnLogout = document.querySelector('.btn-logout');
    if (btnLogout) {
        btnLogout.style.display = 'none';
    }
}

// Cerrar modal de login
function cerrarModalLogin() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.style.display = 'none';
    }
}

// Mostrar modal de 2FA
function mostrarModal2FA(usuarioId) {
    const loginModal = document.getElementById('login-modal');
    const tfaModal = document.getElementById('2fa-modal');
    
    if (loginModal) loginModal.style.display = 'none';
    if (tfaModal) {
        tfaModal.style.display = 'flex';
        // Guardar usuario ID para el siguiente paso
        tfaModal.dataset.usuarioId = usuarioId;
    }
}

// Función para mostrar notificaciones
function mostrarNotificacion(mensaje, tipo = 'info') {
    const notification = document.createElement('div');
    const colores = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6',
        warning: '#f59e0b'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colores[tipo] || colores.info};
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    notification.textContent = mensaje;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 4000);
}

// ==================== CONFIGURACIÓN DE EMPRESA ====================

// Cargar configuración de defaults desde la base de datos
async function cargarDefaults() {
    if (!authToken) {
        showNotification('Debes iniciar sesión para ver la configuración', 'warning');
        return;
    }

    try {
        console.log('📋 Cargando configuración de empresa...');
        
        const response = await fetchConAuth(API_BASE_URL + '/api/config/defaults', {
            headers: {
                'Authorization': 'Bearer ' + authToken
            }
        });

        if (!response.ok) {
            throw new Error('Error al cargar configuración');
        }

        const data = await response.json();

        if (data.success) {
            const defaults = data.defaults;
            console.log('✅ Configuración cargada:', defaults);

            document.getElementById('default-clearance-type').value = defaults.ClearanceType || '';
            document.getElementById('default-regimen-code').value = defaults.RegimenCode || '';
            document.getElementById('default-area-code').value = defaults.AreaCode || '';
            document.getElementById('default-importer-code').value = defaults.ImporterCode || '';
            document.getElementById('default-importer-name').value = defaults.ImporterName || '';
            document.getElementById('default-declarant-code').value = defaults.DeclarantCode || '';
            document.getElementById('default-declarant-name').value = defaults.DeclarantName || '';
            document.getElementById('default-transport-mode').value = defaults.TransportMode || '';
            document.getElementById('default-country-dispatch').value = defaults.CountryDispatch || '';
            document.getElementById('default-country-origin').value = defaults.CountryOrigin || '';
            document.getElementById('default-payment-method').value = defaults.PaymentMethod || '';
            document.getElementById('default-incoterm').value = defaults.Incoterm || '';
            document.getElementById('default-currency').value = defaults.Currency || 'USD';

            showNotification('Configuración cargada correctamente', 'success');
        } else {
            showNotification('Error al cargar configuración', 'error');
        }
    } catch (error) {
        console.error('Error cargando defaults:', error);
        showNotification('Error de conexión al cargar configuración', 'error');
    }
}

async function guardarDefaults(event) {
    event.preventDefault();
    if (!authToken) {
        showNotification('Debes iniciar sesión para guardar configuración', 'warning');
        return;
    }
    try {
        const defaults = {
            ClearanceType: document.getElementById('default-clearance-type').value.trim(),
            RegimenCode: document.getElementById('default-regimen-code').value.trim(),
            AreaCode: document.getElementById('default-area-code').value.trim(),
            ImporterCode: document.getElementById('default-importer-code').value.trim(),
            ImporterName: document.getElementById('default-importer-name').value.trim(),
            DeclarantCode: document.getElementById('default-declarant-code').value.trim(),
            DeclarantName: document.getElementById('default-declarant-name').value.trim(),
            TransportMode: document.getElementById('default-transport-mode').value,
            CountryDispatch: document.getElementById('default-country-dispatch').value.trim().toUpperCase(),
            CountryOrigin: document.getElementById('default-country-origin').value.trim().toUpperCase(),
            PaymentMethod: document.getElementById('default-payment-method').value,
            Incoterm: document.getElementById('default-incoterm').value,
            Currency: document.getElementById('default-currency').value.trim().toUpperCase()
        };
        Object.keys(defaults).forEach(key => {
            if (!defaults[key]) delete defaults[key];
        });
        const response = await fetchConAuth(API_BASE_URL + '/api/config/defaults', {
            method: 'PUT',
            headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(defaults)
        });
        const data = await response.json();
        if (data.success) {
            showNotification('✅ Configuración guardada correctamente', 'success');
        } else {
            showNotification(data.mensaje || 'Error al guardar configuración', 'error');
        }
    } catch (error) {
        console.error('Error guardando defaults:', error);
        showNotification(error.message || 'Error al guardar configuración', 'error');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const defaultsForm = document.getElementById('defaults-form');
    if (defaultsForm) {
        defaultsForm.addEventListener('submit', guardarDefaults);
    }
});
