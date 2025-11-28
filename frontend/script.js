// Configuración de la API
const API_BASE_URL = 'http://localhost:3050';

// Estado global
let resultadoActual = null;
let archivoSeleccionado = null;
let authToken = null;
let userInfo = null;
let editedClassification = null; // Para almacenar la clasificación editada
let currentEditingIndex = null; // Índice del producto que se está editando
let currentSessionId = null; // ID de sesión para el backend

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
        
        console.log('✅ resultadoActual actualizado:', resultadoActual);
        
        showNotification('✅ JSON guardado correctamente. Ahora puedes descargar el XML con estos datos.', 'success');
        
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
    
    // Determinar el tipo de input
    const isNumeric = fieldKey.includes('dai') || fieldKey.includes('itbis') || fieldKey.includes('valor') || fieldKey.includes('peso') || fieldKey.includes('cantidad');
    const inputType = isNumeric ? 'number' : 'text';
    
    // Guardar el valor original en el dataset
    valueElement.dataset.originalValue = currentValue;
    
    // Crear input y botones usando DOM en lugar de innerHTML para evitar problemas con caracteres especiales
    const editControls = document.createElement('div');
    editControls.className = 'edit-controls';
    editControls.style.cssText = 'display: flex; gap: 5px; align-items: center; width: 100%;';
    
    // Crear input
    const input = document.createElement(isNumeric ? 'input' : 'textarea');
    input.type = inputType;
    input.id = `edit-input-${fieldKey}`;
    input.value = currentValue;
    input.style.cssText = 'flex: 1; padding: 8px; border: 2px solid #667eea; border-radius: 4px; font-size: 14px; min-height: 40px; resize: vertical;';
    input.dataset.fieldKey = fieldKey;
    input.dataset.fieldLabel = fieldLabel;
    
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            guardarCampoDirecto(fieldKey, fieldLabel, this);
        }
    });
    
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
    
    console.log('📊 JSON DESPUÉS:', JSON.stringify(resultadoActual, null, 2));
    console.log(`🔍 Verificación: resultadoActual.${fieldKey} =`, resultadoActual[fieldKey]);
    
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

// Generar device fingerprint
function getDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);

    const fingerprint = canvas.toDataURL() +
        navigator.userAgent +
        navigator.language +
        screen.width + 'x' + screen.height +
        new Date().getTimezoneOffset();

    return btoa(fingerprint).slice(0, 32);
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
                    'Authorization': `Bearer ${authToken}`
                }
            });
        } catch (error) {
            console.error('Error cerrando sesión:', error);
        }
    }
    
    authToken = null;
    userInfo = null;
    localStorage.removeItem('authToken');
    document.getElementById('auth-info').style.display = 'none';
    showLoginModal();
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
    }
    
    // Limpiar resultados y errores
    hideResults();
    hideError();
}

function showLoading() {
    document.getElementById('loading').style.display = 'block';
    hideResults();
    hideError();
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showResults(data, tokensInfo = null) {
    hideLoading();
    resultadoActual = data;
    console.log('📥 Clasificación recibida y guardada en memoria:', resultadoActual);
    
    const resultsDiv = document.getElementById('results');
    const contentDiv = document.getElementById('results-content');
    
    // Limpiar contenido anterior
    contentDiv.innerHTML = '';
    
    // Agregar información de tokens si está disponible
    if (tokensInfo) {
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
                    <span class="token-value">${tokensInfo.input_tokens.toLocaleString()}</span>
                </div>
                <div class="token-item">
                    <span class="token-label">Salida:</span>
                    <span class="token-value">${tokensInfo.output_tokens.toLocaleString()}</span>
                </div>
                <div class="token-item total">
                    <span class="token-label">Total:</span>
                    <span class="token-value">${tokensInfo.total_tokens.toLocaleString()}</span>
                </div>
            </div>
        `;
        contentDiv.appendChild(tokensCard);
    }
    
    // Si es un array de resultados (múltiples productos)
    if (Array.isArray(data)) {
        data.forEach((item, index) => {
            contentDiv.appendChild(createResultCard(item, index + 1));
        });
    } else {
        // Resultado único
        contentDiv.appendChild(createResultCard(data));
    }
    
    resultsDiv.style.display = 'block';
    
    // Mostrar botones de acción después de mostrar los resultados
    showActionButtons();
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
    document.getElementById('results').style.display = 'none';
    resultadoActual = null;
}

function showError(message) {
    hideLoading();
    document.getElementById('error-message').textContent = message;
    document.getElementById('error').style.display = 'flex';
}

function hideError() {
    document.getElementById('error').style.display = 'none';
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
        
        const response = await fetch(`${API_BASE_URL}/clasificar`, {
            method: 'POST',
            mode: 'cors',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json'
            },
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
            // Manejar errores de autenticación
            if (response.status === 401) {
                authToken = null;
                localStorage.removeItem('authToken');
                showError('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
                showLoginModal();
                return;
            } else if (response.status === 403) {
                showError(result.mensaje || 'No tienes suficientes tokens o has alcanzado el límite de dispositivos.');
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

async function clasificarArchivo() {
    if (!archivoSeleccionado) {
        showError('Por favor, selecciona un archivo primero.');
        return;
    }
    
    const soloHS = document.getElementById('solo-hs-archivo').checked;
    
    console.log('📤 Clasificando archivo:', archivoSeleccionado.name);
    console.log('🔧 Modo solo_hs:', soloHS);
    
    showLoading();
    
    try {
        const formData = new FormData();
        formData.append('archivo', archivoSeleccionado);
        formData.append('solo_hs', soloHS);
        
        const response = await fetch(`${API_BASE_URL}/clasificar-archivo`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        console.log('📡 RESPUESTA DE LA API (clasificar por archivo):');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(result, null, 2));
        
        if (!response.ok) {
            throw new Error(result.error || 'Error en la clasificación');
        }
        
        if (result.success) {
            hideLoading();
            
            // Guardar el resultado en la variable global
            resultadoActual = result.data;
            
            // Si es modo solo_hs, mostrar solo el código
            if (soloHS && result.data.hs) {
                showResults({ hs: result.data.hs }, null);
            } else {
                // Modo completo: mostrar estructura ImportDUA
                showResults(result.data, null);
            }
            
            // Scroll suave a los resultados
            document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            showNotification('✅ Clasificación completada exitosamente', 'success');
        } else {
            throw new Error('No se pudo obtener la clasificación');
        }
        
    } catch (error) {
        console.error('Error:', error);
        hideLoading();
        showError(`Error al procesar el archivo: ${error.message}`);
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
        // Cargar planes demo sin autenticación - PLANES COMPLETOS ORIGINALES
        const planesDemo = {
            planes: [
                {
                    id: 'gratuito',
                    nombre: 'Plan Gratuito',
                    precio: 0,
                    tokens_incluidos: 100,
                    max_dispositivos: 1,
                    descripcion: 'Para probar el sistema',
                    caracteristicas: [
                        '100 clasificaciones mensuales',
                        '1 dispositivo',
                        'Soporte por email',
                        'Funciones básicas'
                    ]
                },
                {
                    id: 'basico',
                    nombre: 'Plan Básico',
                    precio: 29.99,
                    tokens_incluidos: 1000,
                    max_dispositivos: 3,
                    descripcion: 'Perfecto para pequeñas empresas',
                    caracteristicas: [
                        '1,000 clasificaciones mensuales',
                        'Máximo 3 dispositivos',
                        'Soporte por email',
                        'Exportación XML básica',
                        'Historial de 3 meses'
                    ]
                },
                {
                    id: 'profesional',
                    nombre: 'Plan Profesional',
                    precio: 59.99,
                    tokens_incluidos: 5000,
                    max_dispositivos: 8,
                    descripcion: 'Ideal para empresas medianas',
                    caracteristicas: [
                        '5,000 clasificaciones mensuales',
                        'Máximo 8 dispositivos',
                        'Soporte prioritario',
                        'Exportación XML completa',
                        'API de integración',
                        'Reportes avanzados',
                        'Historial de 12 meses'
                    ]
                },
                {
                    id: 'empresarial',
                    nombre: 'Plan Empresarial',
                    precio: 149.99,
                    tokens_incluidos: 15000,
                    max_dispositivos: 25,
                    descripcion: 'Para grandes importadoras',
                    caracteristicas: [
                        '15,000 clasificaciones mensuales',
                        'Máximo 25 dispositivos',
                        'Soporte 24/7',
                        'Exportación XML ilimitada',
                        'API completa',
                        'Dashboard ejecutivo',
                        'Capacitación incluida',
                        'Historial ilimitado'
                    ]
                },
                {
                    id: 'corporativo',
                    nombre: 'Plan Corporativo',
                    precio: 299.99,
                    tokens_incluidos: 50000,
                    max_dispositivos: 100,
                    descripcion: 'Para corporaciones grandes',
                    caracteristicas: [
                        '50,000 clasificaciones mensuales',
                        'Hasta 100 dispositivos',
                        'Soporte dedicado',
                        'Integración personalizada',
                        'SLA garantizado',
                        'Consultoría incluida',
                        'Múltiples sucursales'
                    ]
                },
                {
                    id: 'ilimitado',
                    nombre: 'Plan Ilimitado',
                    precio: 599.99,
                    tokens_incluidos: -1,
                    max_dispositivos: -1,
                    descripcion: 'Sin límites para grandes corporaciones',
                    caracteristicas: [
                        'Clasificaciones ilimitadas',
                        'Dispositivos ilimitados',
                        'Soporte dedicado 24/7',
                        'Todas las funciones premium',
                        'Integración personalizada',
                        'Consultoría especializada',
                        'Implementación on-premise disponible'
                    ]
                }
            ]
        };
        
        displayPlanes(planesDemo.planes);
        
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
    
    // Plan actual demo - profesional por defecto
    const planActual = 'profesional';
    
    planesGrid.innerHTML = '';
    
    planes.forEach(plan => {
        const isCurrentPlan = plan.id === planActual;
        
        const planCard = document.createElement('div');
        planCard.className = `plan-card ${isCurrentPlan ? 'current' : 'selectable'}`;
        
        // Formatear tokens
        let tokensText;
        if (plan.tokens_incluidos === -1) {
            tokensText = 'Ilimitados';
        } else if (plan.tokens_incluidos >= 1000) {
            tokensText = (plan.tokens_incluidos / 1000) + 'K';
        } else {
            tokensText = plan.tokens_incluidos.toString();
        }
        
        // Formatear dispositivos
        let dispositivosText = plan.max_dispositivos === -1 ? 'Ilimitados' : plan.max_dispositivos;
        
        planCard.innerHTML = `
            <div class="plan-header">
                <div class="plan-name">${plan.nombre}</div>
                <div class="plan-price">$${plan.precio}/mes</div>
            </div>
            <div class="plan-details">
                <div class="plan-tokens">${tokensText} tokens/mes</div>
                <div class="plan-devices">${dispositivosText} dispositivos</div>
            </div>
            <div class="plan-description">${plan.descripcion}</div>
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
    const confirmacion = confirm(`¿Estás seguro de que quieres cambiar al plan ${planId}? (Modo Demo - cambio simulado)`);
    
    if (!confirmacion) return;
    
    try {
        // Simular cambio de plan en modo demo - TODOS LOS PLANES ORIGINALES
        const planesDemo = {
            'gratuito': { nombre: 'Plan Gratuito', precio_mensual_usd: 0, tokens_mes: 100, dispositivos_concurrentes: 1 },
            'basico': { nombre: 'Plan Básico', precio_mensual_usd: 29.99, tokens_mes: 1000, dispositivos_concurrentes: 3 },
            'profesional': { nombre: 'Plan Profesional', precio_mensual_usd: 59.99, tokens_mes: 5000, dispositivos_concurrentes: 8 },
            'empresarial': { nombre: 'Plan Empresarial', precio_mensual_usd: 149.99, tokens_mes: 15000, dispositivos_concurrentes: 25 },
            'corporativo': { nombre: 'Plan Corporativo', precio_mensual_usd: 299.99, tokens_mes: 50000, dispositivos_concurrentes: 100 },
            'ilimitado': { nombre: 'Plan Ilimitado', precio_mensual_usd: 599.99, tokens_mes: -1, dispositivos_concurrentes: -1 }
        };
        
        const nuevoPlan = planesDemo[planId];
        if (nuevoPlan) {
            // Actualizar userInfo con el nuevo plan
            userInfo.plan = {
                id: planId,
                ...nuevoPlan
            };
            userInfo.tokens_disponibles = nuevoPlan.tokens_mes === -1 ? 999999 : nuevoPlan.tokens_mes;
            userInfo.tokens_usados_mes = 0; // Reset tokens
            
            // Actualizar interfaz
            updateUserInterface(userInfo);
            updatePlanInfo();
            
            showNotification(`Plan cambiado exitosamente a ${nuevoPlan.nombre} (Demo)`, 'success');
            
            // Recargar datos de planes para actualizar la vista
            loadPlanesData();
        }
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showNotification(`Plan actualizado a ${planId} exitosamente`, 'success');
            
            // Actualizar información del usuario
            await checkAuthStatus();
            
            // Recargar datos de planes
            await loadPlanesData();
            
        } else {
            showNotification(data.mensaje || 'Error al cambiar plan', 'error');
        }
        
    } catch (error) {
        console.error('Error cambiando plan:', error);
        showNotification('Error de conexión al cambiar plan', 'error');
    }
}

async function loadConsumoHistory() {
    try {
        // await checkAuthStatus(); // Comentado - función no existe
        // Datos demo de historial de consumo
        const historialDemo = [
            { fecha: '2025-11-01', tokens: 245, tipo: 'texto' },
            { fecha: '2025-11-02', tokens: 189, tipo: 'archivo' },
            { fecha: '2025-11-03', tokens: 67, tipo: 'manual' },
            { fecha: '2025-11-04', tokens: 312, tipo: 'texto' },
            { fecha: '2025-11-05', tokens: 156, tipo: 'archivo' },
        ];
        
        const historialHtml = historialDemo.map(item => `
            <div class="history-item">
                <span class="history-date">${item.fecha}</span>
                <span class="history-type">${item.tipo}</span>
                <span class="history-tokens">${item.tokens} tokens</span>
            </div>
        `).join('');
        
        document.getElementById('consumo-history').innerHTML = `
            <div class="history-content">
                <h4>Historial de Uso (Demo)</h4>
                ${historialHtml}
            </div>
        `;
    } catch (error) {
        console.error('Error cargando historial:', error);
    }
}

function updatePlanInfo() {
    // Información de plan demo
    const planDemo = {
        id: 'profesional',
        precio_mensual_usd: 59.99,
        tokens_mes: 5000,
        dispositivos_concurrentes: 5
    };
    
    // Actualizar información del plan actual
    document.getElementById('current-plan-name').textContent = planDemo.id;
    document.getElementById('current-plan-price').textContent = `$${planDemo.precio_mensual_usd}/mes`;
    
    let tokensFormatted = (planDemo.tokens_mes / 1000).toLocaleString() + 'K';
    if (planDemo.tokens_mes >= 1000000) {
        tokensFormatted = (planDemo.tokens_mes / 1000000).toLocaleString() + 'M';
    }
    document.getElementById('current-plan-tokens').textContent = `${tokensFormatted} tokens/mes`;
    document.getElementById('current-plan-devices').textContent = `${planDemo.dispositivos_concurrentes} dispositivos`;
    
    // Actualizar barra de progreso de tokens
    if (userInfo && userInfo.limites) {
        const porcentajeUso = (userInfo.limites.tokens_consumidos / userInfo.limites.tokens_limite_mensual) * 100;
        const progressBar = document.getElementById('tokens-progress');
        if (progressBar) progressBar.style.width = `${Math.min(porcentajeUso, 100)}%`;
        
        const tokensUsageText = `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
        const usageTextElement = document.getElementById('tokens-usage-text');
        if (usageTextElement) usageTextElement.textContent = tokensUsageText;
        
        // Cambiar color de la barra según el uso
        if (progressBar) {
            if (porcentajeUso > 90) {
                progressBar.style.background = 'linear-gradient(90deg, var(--error-color), var(--warning-color))';
            } else if (porcentajeUso > 70) {
                progressBar.style.background = 'linear-gradient(90deg, var(--warning-color), var(--success-color))';
            } else {
                progressBar.style.background = 'linear-gradient(90deg, var(--success-color), var(--warning-color))';
            }
        }
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async function() {
    // Inicializar tabs
    showTab('texto');
    
    // Verificar conexión con el backend al cargar la página
    const conectado = await verificarConexion();
    
    if (conectado) {
        // Mostrar indicador visual de que está conectado
        const header = document.querySelector('.header-content p');
        header.innerHTML += ' <span style="color: #10b981;">● Conectado</span>';
    }
    
    // Enter key en textarea
    document.getElementById('producto-texto').addEventListener('keydown', function(event) {
        if (event.ctrlKey && event.key === 'Enter') {
            clasificarTexto();
        }
    });
    
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
    // Funcionamiento demo sin autenticación
    const confirmacion = confirm(`¿Estás seguro de que quieres cambiar al plan ${planId}? (Modo Demo)`);
    if (!confirmacion) return;
    
    try {
        // Simular cambio de plan en modo demo
        showNotification(`Plan cambiado exitosamente a ${planId}! (Modo Demo)`, 'success');
        
        // Recargar los planes para actualizar el estado
        setTimeout(() => {
            loadPlanesData();
        }, 1000);
        
    } catch (error) {
        console.error('Error cambiando plan:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

function updatePlanInfo() {
    if (!userInfo) return;
    
    try {
        // Actualizar información del plan actual
        document.getElementById('current-plan-name').textContent = userInfo.plan.id;
        document.getElementById('current-plan-price').textContent = `$${userInfo.plan.precio_mensual_usd}/mes`;
        
        let tokensFormatted = (userInfo.plan.tokens_mes / 1000).toLocaleString() + 'K';
        if (userInfo.plan.tokens_mes >= 1000000) {
            tokensFormatted = (userInfo.plan.tokens_mes / 1000000).toLocaleString() + 'M';
        }
        document.getElementById('current-plan-tokens').textContent = `${tokensFormatted} tokens/mes`;
        document.getElementById('current-plan-devices').textContent = `${userInfo.plan.dispositivos_concurrentes} dispositivos`;
        
        // Actualizar barra de progreso
        const porcentajeUso = (userInfo.limites.tokens_consumidos / userInfo.limites.tokens_limite_mensual) * 100;
        document.getElementById('tokens-progress').style.width = `${Math.min(porcentajeUso, 100)}%`;
        document.getElementById('tokens-usage-text').textContent = 
            `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
            
        // Cambiar color de la barra según el uso
        const progressBar = document.getElementById('tokens-progress');
        if (porcentajeUso > 90) {
            progressBar.style.background = 'linear-gradient(90deg, var(--error-color), var(--warning-color))';
        } else if (porcentajeUso > 70) {
            progressBar.style.background = 'linear-gradient(90deg, var(--warning-color), var(--success-color))';
        } else {
            progressBar.style.background = 'linear-gradient(90deg, var(--success-color), var(--primary-color))';
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
function showExportOptions() {
    console.log('📤 Iniciando exportación ImportDUA...');
    console.log('📊 JSON a exportar:', JSON.stringify(resultadoActual, null, 2));
    
    if (!resultadoActual) {
        showNotification('No hay datos para exportar', 'error');
        return;
    }
    
    // Generar XML en formato ImportDUA para SIGA
    const xmlContent = generateImportDUAXML(resultadoActual);
    console.log('📝 XML ImportDUA generado');
    
    const timestamp = new Date().getTime();
    const fileName = `ImportDUA_${timestamp}.xml`;
    
    downloadFile(xmlContent, fileName, 'application/xml');
    
    showNotification(`✅ XML ImportDUA exportado correctamente: ${fileName}`, 'success');
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
}