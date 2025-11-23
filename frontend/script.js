// Configuración de la API
const API_BASE_URL = 'http://localhost:3000';

// Estado global
let resultadoActual = null;
let archivoSeleccionado = null;
let authToken = null;
let userInfo = null;
let editedClassification = null; // Para almacenar la clasificación editada
let currentEditingIndex = null; // Índice del producto que se está editando

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

// Funciones de autenticación - DESHABILITADAS
async function checkAuthStatus() {
    // Acceso directo sin autenticación
    return true;
}

function showLoginModal() {
    // Modal de login deshabilitado
    console.log('Login deshabilitado - acceso directo');
}

function hideLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

// Función para mostrar interfaz principal sin autenticación
function showMainInterface() {
    hideLoginModal();
    
    // Mostrar la aplicación principal
    const mainContainer = document.querySelector('.container');
    if (mainContainer) {
        mainContainer.style.display = 'block';
    }
    
    // Configurar datos demo
    setupDemoMode();
    
    // Mostrar primera pestaña
    showTab('texto');
}

// Configurar modo demo
function setupDemoMode() {
    // Simular usuario demo con plan completo
    userInfo = {
        nombre: 'Usuario Demo',
        empresa: 'Sistema Clasificador',
        plan: {
            id: 'profesional',
            nombre: 'Plan Profesional',
            precio_mensual_usd: 59.99,
            tokens_mes: 5000,
            dispositivos_concurrentes: 5
        },
        tokens_disponibles: 4567, // Simular tokens consumidos
        tokens_usados_mes: 433
    };
    
    authToken = 'demo-token';
    
    // Actualizar interfaz con datos demo
    updateUserInterface(userInfo);
}

// Función simplificada para update user interface
function updateUserInterface(userData) {
    const userNameElement = document.querySelector('.user-name');
    const userCompanyElement = document.querySelector('.user-company');
    const tokensElement = document.getElementById('tokens-disponibles');
    const planElement = document.getElementById('user-plan');
    
    if (userNameElement) userNameElement.textContent = userData.nombre || 'Usuario Demo';
    if (userCompanyElement) userCompanyElement.textContent = userData.empresa || 'Sistema Demo';
    if (tokensElement) tokensElement.textContent = userData.tokens_disponibles?.toLocaleString() || '∞';
    if (planElement && userData.plan) planElement.textContent = userData.plan.nombre || userData.plan.id || 'Demo';
    
    // Actualizar barra de progreso de tokens si existe
    const progressBar = document.querySelector('.tokens-progress-bar');
    const progressFill = document.querySelector('.tokens-progress-fill');
    const progressText = document.querySelector('.tokens-progress-text');
    
    if (progressBar && userData.plan && userData.plan.tokens_mes > 0) {
        const usedPercentage = ((userData.tokens_usados_mes || 0) / userData.plan.tokens_mes) * 100;
        if (progressFill) progressFill.style.width = `${Math.min(usedPercentage, 100)}%`;
        if (progressText) progressText.textContent = `${userData.tokens_usados_mes || 0} / ${userData.plan.tokens_mes} tokens usados`;
    }
}

function updateUserInterface(data) {
    // Actualizar información del usuario
    document.getElementById('user-name').textContent = data.usuario.nombre;
    document.getElementById('user-plan').textContent = data.plan.id;
    
    // Actualizar información de uso
    const tokensText = `${data.limites.tokens_consumidos.toLocaleString()} / ${data.limites.tokens_limite_mensual.toLocaleString()} tokens`;
    document.getElementById('tokens-info').textContent = tokensText;
    
    const devicesText = `${data.limites.dispositivos_activos} / ${data.limites.dispositivos_limite} dispositivos`;
    document.getElementById('devices-info').textContent = devicesText;
    
    // Mostrar información del usuario
    document.getElementById('auth-info').style.display = 'flex';
    hideLoginModal();
    
    // Actualizar información de planes si está en esa pestaña
    updatePlanInfo();
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
    hideLoginModal();
    showMainInterface();
    
    // Enter key en campos de login (por si acaso)
    document.getElementById('login-email').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performLogin();
        }
    });
    
    document.getElementById('login-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performLogin();
        }
    });
    
    // Verificar autenticación al cargar
    checkAuthStatus();
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
    
    // Crear nuevo contenedor de acciones
    const actionsContainer = document.createElement('div');
    actionsContainer.id = 'results-actions';
    actionsContainer.className = 'results-actions-container';
    
    // Si hay múltiples productos, mostrar botones para cada uno
    if (Array.isArray(resultadoActual) && resultadoActual.length > 1) {
        let buttonsHTML = '<h4><i class="fas fa-edit"></i> Editar Productos Individualmente</h4>';
        buttonsHTML += '<div class="individual-edit-buttons">';
        
        resultadoActual.forEach((producto, index) => {
            const productName = producto.descripcion_comercial || producto.item_name || `Producto ${index + 1}`;
            buttonsHTML += `
                <div class="product-edit-item">
                    <div class="product-info">
                        <span class="product-number">Producto ${index + 1}</span>
                        <span class="product-name">${productName}</span>
                        <span class="product-hs">${formatearCodigoHS(producto.hs || 'N/A')}</span>
                    </div>
                    <button class="btn-edit-individual" data-product-index="${index}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                </div>
            `;
        });
        
        buttonsHTML += '</div>';
        buttonsHTML += `
            <div class="global-actions">
                <button id="btn-export-all" class="btn-success export-btn" style="display: none;">
                    <i class="fas fa-download"></i> Exportar Todos (XML)
                </button>
            </div>
        `;
        
        actionsContainer.innerHTML = buttonsHTML;
        
        // Agregar event listeners para cada botón de edición
        setTimeout(() => {
            const editButtons = actionsContainer.querySelectorAll('.btn-edit-individual');
            editButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const productIndex = parseInt(e.target.closest('.btn-edit-individual').dataset.productIndex);
                    showEditForm(productIndex);
                });
            });
            
            const exportAllBtn = document.getElementById('btn-export-all');
            if (exportAllBtn) {
                exportAllBtn.addEventListener('click', () => showExportOptions(true));
            }
        }, 10);
        
    } else {
        // Producto único - comportamiento original
        actionsContainer.innerHTML = `
            <div class="action-buttons">
                <button id="btn-edit-result" class="btn-primary edit-btn">
                    <i class="fas fa-edit"></i> Editar Clasificación
                </button>
                <button id="btn-export" class="btn-success export-btn" style="display: none;">
                    <i class="fas fa-download"></i> Exportar XML
                </button>
            </div>
            <p class="edit-hint">
                <i class="fas fa-info-circle"></i> 
                Para exportar, primero edite y valide la clasificación completando los campos obligatorios.
            </p>
        `;
        
        setTimeout(() => {
            document.getElementById('btn-edit-result').addEventListener('click', () => showEditForm(0));
            document.getElementById('btn-export').addEventListener('click', showExportOptions);
        }, 10);
    }
    
    // Agregar después del contenedor de resultados
    const resultsDiv = document.getElementById('results');
    resultsDiv.appendChild(actionsContainer);
    actionsContainer.style.display = 'block';
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
        
        <!-- Información Comercial -->
        <div class="info-grid">
            <div class="info-section">
                <h4><i class="fas fa-box"></i> Información del Producto</h4>
                <div class="detail-grid">
                    ${descripcion_comercial ? `
                        <div class="detail-item">
                            <div class="detail-label">Descripción Comercial</div>
                            <div class="detail-value">${descripcion_comercial}</div>
                        </div>
                    ` : ''}
                    
                    ${pais_origen && pais_origen !== 'No especificado' ? `
                        <div class="detail-item">
                            <div class="detail-label">País de Origen</div>
                            <div class="detail-value">
                                <i class="fas fa-flag"></i> ${pais_origen}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${pais_procedencia && pais_procedencia !== 'No especificado' ? `
                        <div class="detail-item">
                            <div class="detail-label">País de Procedencia</div>
                            <div class="detail-value">
                                <i class="fas fa-shipping-fast"></i> ${pais_procedencia}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Información Comercial/Financiera -->
            ${(valor_unitario && valor_unitario !== 'No especificado') || 
              (valor_total && valor_total !== 'No especificado') || 
              (cantidad_total && cantidad_total !== 'No especificado') ? `
                <div class="info-section">
                    <h4><i class="fas fa-dollar-sign"></i> Información Comercial</h4>
                    <div class="detail-grid">
                        ${valor_unitario && valor_unitario !== 'No especificado' ? `
                            <div class="detail-item">
                                <div class="detail-label">Valor Unitario</div>
                                <div class="detail-value money">${valor_unitario} ${moneda || ''}</div>
                            </div>
                        ` : ''}
                        
                        ${valor_total && valor_total !== 'No especificado' ? `
                            <div class="detail-item">
                                <div class="detail-label">Valor Total</div>
                                <div class="detail-value money">${valor_total} ${moneda || ''}</div>
                            </div>
                        ` : ''}
                        
                        ${cantidad_total && cantidad_total !== 'No especificado' && 
                          unidad_medida_estadistica && unidad_medida_estadistica !== 'No especificado' ? `
                            <div class="detail-item">
                                <div class="detail-label">Cantidad</div>
                                <div class="detail-value">
                                    <i class="fas fa-cubes"></i> ${cantidad_total} ${unidad_medida_estadistica}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${incoterm && incoterm !== 'No especificado' ? `
                            <div class="detail-item">
                                <div class="detail-label">Incoterm</div>
                                <div class="detail-value">
                                    <span class="incoterm-badge">${incoterm}</span>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            <!-- Información Física -->
            ${(peso_neto && peso_neto !== 'No especificado') || 
              (peso_bruto && peso_bruto !== 'No especificado') ? `
                <div class="info-section">
                    <h4><i class="fas fa-weight"></i> Información Física</h4>
                    <div class="detail-grid">
                        ${peso_neto && peso_neto !== 'No especificado' ? `
                            <div class="detail-item">
                                <div class="detail-label">Peso Neto</div>
                                <div class="detail-value">
                                    <i class="fas fa-balance-scale"></i> ${peso_neto}
                                </div>
                            </div>
                        ` : ''}
                        
                        ${peso_bruto && peso_bruto !== 'No especificado' ? `
                            <div class="detail-item">
                                <div class="detail-label">Peso Bruto</div>
                                <div class="detail-value">
                                    <i class="fas fa-weight-hanging"></i> ${peso_bruto}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
        </div>
        
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
                <div class="json-viewer">
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
                userInfo.limites.tokens_consumidos += result.tokens_info.total_tokens;
                const tokensText = `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
                document.getElementById('tokens-info').textContent = tokensText;
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
    
    // Mostrar información del archivo
    const fileInfo = document.getElementById('file-info');
    fileInfo.innerHTML = `
        <i class="fas fa-file"></i>
        <strong>${file.name}</strong> 
        (${(file.size / 1024 / 1024).toFixed(2)} MB)
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
    
    // Verificar autenticación - DESHABILITADO  
    // Acceso directo sin verificación
    
    const soloHS = document.getElementById('solo-hs-archivo').checked;
    
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
                userInfo.limites.tokens_consumidos += result.tokens_info.total_tokens;
                const tokensText = `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
                document.getElementById('tokens-info').textContent = tokensText;
                updatePlanInfo();
            }
            
            // Mostrar información de tokens consumidos en los resultados
            showResults(result.data, result.tokens_info);
        } else {
            throw new Error('No se pudo obtener la clasificación');
        }
        
    } catch (error) {
        console.error('Error:', error);
        showError(`Error al procesar el archivo: ${error.message}`);
    }
}

// Funciones de exportación
function convertToXML(data, rootElement = 'clasificacion_arancelaria') {
    function objectToXML(obj, indent = 0) {
        let xml = '';
        const spaces = '  '.repeat(indent);
        
        for (const [key, value] of Object.entries(obj)) {
            const cleanKey = key.replace(/[^a-zA-Z0-9_]/g, '_');
            
            if (value === null || value === undefined) {
                xml += `${spaces}<${cleanKey}></${cleanKey}>\n`;
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                xml += `${spaces}<${cleanKey}>\n`;
                xml += objectToXML(value, indent + 1);
                xml += `${spaces}</${cleanKey}>\n`;
            } else if (Array.isArray(value)) {
                xml += `${spaces}<${cleanKey}>\n`;
                value.forEach((item, index) => {
                    if (typeof item === 'object') {
                        xml += `${spaces}  <item_${index}>\n`;
                        xml += objectToXML(item, indent + 2);
                        xml += `${spaces}  </item_${index}>\n`;
                    } else {
                        xml += `${spaces}  <item>${escapeXML(item)}</item>\n`;
                    }
                });
                xml += `${spaces}</${cleanKey}>\n`;
            } else {
                xml += `${spaces}<${cleanKey}>${escapeXML(value)}</${cleanKey}>\n`;
            }
        }
        return xml;
    }
    
    function escapeXML(str) {
        if (typeof str !== 'string') str = String(str);
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${rootElement}>\n`;
    
    if (Array.isArray(data)) {
        data.forEach((item, index) => {
            xml += `  <producto_${index + 1}>\n`;
            xml += objectToXML(item, 2);
            xml += `  </producto_${index + 1}>\n`;
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
    const porcentajeUso = (userInfo.limites.tokens_consumidos / userInfo.limites.tokens_limite_mensual) * 100;
    document.getElementById('tokens-progress').style.width = `${Math.min(porcentajeUso, 100)}%`;
    
    const tokensUsageText = `${userInfo.limites.tokens_consumidos.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
    document.getElementById('tokens-usage-text').textContent = tokensUsageText;
    
    // Cambiar color de la barra según el uso
    const progressBar = document.getElementById('tokens-progress');
    if (porcentajeUso > 90) {
        progressBar.style.background = 'linear-gradient(90deg, var(--error-color), var(--warning-color))';
    } else if (porcentajeUso > 70) {
        progressBar.style.background = 'linear-gradient(90deg, var(--warning-color), var(--success-color))';
    } else {
        progressBar.style.background = 'linear-gradient(90deg, var(--success-color), var(--warning-color))';
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
    checkAuthStatus();
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
    const dataToEdit = Array.isArray(resultadoActual) ? resultadoActual[productIndex] : resultadoActual;
    
    if (!dataToEdit) {
        showNotification('No hay resultado para editar', 'error');
        return;
    }
    
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
    document.getElementById('edit-modal').style.display = 'flex';
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
    
    if (!item) return;
    
    // Campos obligatorios
    document.getElementById('edit-hs-code').value = formatearCodigoHS(item.hs) || '';
    document.getElementById('edit-description').value = item.descripcion || item.description || '';
    document.getElementById('edit-dai').value = item.dai || item.arancel || '';
    document.getElementById('edit-itbis').value = item.itbis || item.impuesto || '18.00';
    document.getElementById('edit-product-name').value = item.producto || item.nombre || '';
    document.getElementById('edit-origin').value = item.origen || item.origin || '';
    
    // Campos opcionales
    document.getElementById('edit-brand').value = item.marca || item.brand || '';
    document.getElementById('edit-model').value = item.modelo || item.model || '';
    document.getElementById('edit-material').value = item.material || '';
    document.getElementById('edit-use').value = item.uso || item.aplicacion || '';
    document.getElementById('edit-weight').value = item.peso || item.weight || '';
    document.getElementById('edit-dimensions').value = item.dimensiones || item.dimensions || '';
    document.getElementById('edit-value').value = item.valor || item.value || '';
    document.getElementById('edit-quantity').value = item.cantidad || item.quantity || '1';
    document.getElementById('edit-observations').value = item.observaciones || item.notas || '';
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
    
    // Recopilar datos del formulario
    const editedData = {
        hs: document.getElementById('edit-hs-code').value,
        descripcion: document.getElementById('edit-description').value,
        dai: parseFloat(document.getElementById('edit-dai').value),
        itbis: parseFloat(document.getElementById('edit-itbis').value),
        producto: document.getElementById('edit-product-name').value,
        origen: document.getElementById('edit-origin').value,
        marca: document.getElementById('edit-brand').value,
        modelo: document.getElementById('edit-model').value,
        material: document.getElementById('edit-material').value,
        uso: document.getElementById('edit-use').value,
        peso: parseFloat(document.getElementById('edit-weight').value) || null,
        dimensiones: document.getElementById('edit-dimensions').value,
        valor_fob: parseFloat(document.getElementById('edit-value').value) || null,
        cantidad: parseInt(document.getElementById('edit-quantity').value) || 1,
        observaciones: document.getElementById('edit-observations').value,
        fecha_clasificacion: new Date().toISOString(),
        validado: true
    };
    
    // Actualizar el resultado actual
    if (Array.isArray(resultadoActual)) {
        // Múltiples productos - actualizar el específico
        resultadoActual[currentEditingIndex] = { ...resultadoActual[currentEditingIndex], ...editedData };
        if (!editedClassification) editedClassification = [];
        editedClassification[currentEditingIndex] = editedData;
    } else {
        // Producto único
        resultadoActual = editedData;
        editedClassification = editedData;
    }
    
    // Actualizar la vista de resultados
    updateResultsView();
    
    // Actualizar botones
    updateActionButtons();
    
    // Cerrar modal
    hideEditForm();
    
    showNotification('Clasificación guardada correctamente.', 'success');
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
                btn.innerHTML = '<i class="fas fa-check"></i> Editado';
                btn.classList.add('edited');
            }
        });
        
    } else {
        // Producto único
        const exportBtn = document.getElementById('btn-export');
        const editBtn = document.getElementById('btn-edit-result');
        
        if (exportBtn && editBtn) {
            exportBtn.style.display = 'inline-flex';
            editBtn.innerHTML = '<i class="fas fa-check"></i> Editado';
            editBtn.classList.add('edited');
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

// Función mejorada de exportación
function showExportOptions() {
    if (!editedClassification) {
        showNotification('Debe editar y validar la clasificación antes de exportar', 'warning');
        document.getElementById('btn-edit-result').style.animation = 'pulse 1s ease-in-out 3';
        setTimeout(() => {
            document.getElementById('btn-edit-result').style.animation = '';
        }, 3000);
        return;
    }
    
    // Crear y descargar XML
    const xmlContent = generateXML(editedClassification);
    downloadFile(xmlContent, `clasificacion_${editedClassification.hs.replace(/\./g, '_')}_${new Date().getTime()}.xml`, 'application/xml');
    
    showNotification('XML exportado correctamente', 'success');
}

function generateXML(data) {
    const fecha = new Date().toISOString().split('T')[0];
    const hora = new Date().toLocaleTimeString();
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<ClasificacionArancelaria>
    <Metadatos>
        <FechaClasificacion>${fecha}</FechaClasificacion>
        <HoraClasificacion>${hora}</HoraClasificacion>
        <Sistema>Clasificador Arancelario RD</Sistema>
        <Version>1.0</Version>
        <Validado>true</Validado>
    </Metadatos>
    
    <Producto>
        <Nombre><![CDATA[${data.producto}]]></Nombre>
        <CodigoHS>${data.hs}</CodigoHS>
        <DescripcionArancelaria><![CDATA[${data.descripcion}]]></DescripcionArancelaria>
        <PaisOrigen><![CDATA[${data.origen}]]></PaisOrigen>
        <Cantidad>${data.cantidad}</Cantidad>
        ${data.marca ? `<Marca><![CDATA[${data.marca}]]></Marca>` : ''}
        ${data.modelo ? `<Modelo><![CDATA[${data.modelo}]]></Modelo>` : ''}
        ${data.material ? `<Material><![CDATA[${data.material}]]></Material>` : ''}
        ${data.uso ? `<Uso><![CDATA[${data.uso}]]></Uso>` : ''}
        ${data.peso ? `<Peso unidad="kg">${data.peso}</Peso>` : ''}
        ${data.dimensiones ? `<Dimensiones><![CDATA[${data.dimensiones}]]></Dimensiones>` : ''}
        ${data.valor_fob ? `<ValorFOB moneda="USD">${data.valor_fob}</ValorFOB>` : ''}
    </Producto>
    
    <Impuestos>
        <DAI tipo="porcentaje">${data.dai}</DAI>
        <ITBIS tipo="porcentaje">${data.itbis}</ITBIS>
    </Impuestos>
    
    ${data.observaciones ? `
    <Observaciones>
        <![CDATA[${data.observaciones}]]>
    </Observaciones>` : ''}
    
    <CalculoImpuestos>
        ${data.valor_fob ? `
        <BaseImponible>${data.valor_fob}</BaseImponible>
        <MontoDAI>${(data.valor_fob * data.dai / 100).toFixed(2)}</MontoDAI>
        <BaseITBIS>${(data.valor_fob + (data.valor_fob * data.dai / 100)).toFixed(2)}</BaseITBIS>
        <MontoITBIS>${((data.valor_fob + (data.valor_fob * data.dai / 100)) * data.itbis / 100).toFixed(2)}</MontoITBIS>
        <TotalImpuestos>${((data.valor_fob * data.dai / 100) + ((data.valor_fob + (data.valor_fob * data.dai / 100)) * data.itbis / 100)).toFixed(2)}</TotalImpuestos>` : ''}
    </CalculoImpuestos>
</ClasificacionArancelaria>`;
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