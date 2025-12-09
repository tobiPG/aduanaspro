// ==========================================
// SISTEMA DE AUTENTICACIÓN
// ==========================================

// Estado de autenticación
let authToken = localStorage.getItem('authToken');
let userInfo = JSON.parse(localStorage.getItem('userInfo') || 'null');
let deviceFingerprint = localStorage.getItem('deviceFingerprint') || generarDeviceFingerprint();

// Generar device fingerprint único
function generarDeviceFingerprint() {
    const fp = 'device-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('deviceFingerprint', fp);
    return fp;
}

// Función de Login
async function login(email, password) {
    try {
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
            authToken = data.token;
            userInfo = {
                usuario: data.usuario,
                empresa: data.empresa,
                plan: data.plan,
                limites: data.limites
            };
            
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            
            // Mostrar alerta si existe
            if (data.alerta) {
                mostrarAlertaTokens(data.alerta);
            }
            
            hideLoginModal();
            updateAuthUI();
            showNotification(`¡Bienvenido ${data.usuario.nombre}!`, 'success');
            
            // Cargar historial
            cargarHistorial();
        } else {
            showNotification(data.mensaje || 'Error al iniciar sesión', 'error');
        }
    } catch (error) {
        console.error('Error en login:', error);
        showNotification('Error de conexión con el servidor', 'error');
    }
}

// Función de Registro
async function registro(nombre, email, password, empresaId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/registro`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': deviceFingerprint
            },
            body: JSON.stringify({
                nombre: nombre,
                correo: email,
                contrasena: password,
                empresa_id: empresaId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Usuario registrado correctamente. Ahora puedes iniciar sesión.', 'success');
            // Cambiar a vista de login
            document.querySelector('.tab-btn[data-tab="login"]').click();
        } else {
            showNotification(data.mensaje || 'Error al registrarse', 'error');
        }
    } catch (error) {
        console.error('Error en registro:', error);
        showNotification('Error de conexión con el servidor', 'error');
    }
}

// Función de Logout
async function logout() {
    try {
        if (authToken) {
            await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
        }
    } catch (error) {
        console.error('Error en logout:', error);
    } finally {
        authToken = null;
        userInfo = null;
        localStorage.removeItem('authToken');
        localStorage.removeItem('userInfo');
        
        showLoginModal();
        updateAuthUI();
        showNotification('Sesión cerrada', 'info');
    }
}

// Verificar sesión al cargar
async function verificarSesion() {
    if (!authToken) {
        showLoginModal();
        return false;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verificar`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            userInfo = {
                usuario: data.usuario,
                empresa: data.empresa,
                plan: data.plan,
                limites: data.limites
            };
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            
            // Mostrar alerta si existe
            if (data.alerta) {
                mostrarAlertaTokens(data.alerta);
            }
            
            hideLoginModal();
            updateAuthUI();
            return true;
        } else {
            logout();
            return false;
        }
    } catch (error) {
        console.error('Error verificando sesión:', error);
        logout();
        return false;
    }
}

// Actualizar UI con info del usuario
function updateAuthUI() {
    const authInfo = document.getElementById('auth-info');
    const historialTabBtn = document.getElementById('tab-historial-btn');
    const configTabBtn = document.getElementById('tab-config-btn');
    
    if (userInfo) {
        document.getElementById('user-name').textContent = userInfo.usuario.nombre;
        document.getElementById('user-plan').textContent = userInfo.plan.id;
        
        const tokensInfo = `${userInfo.limites.tokens_restantes.toLocaleString()} / ${userInfo.limites.tokens_limite_mensual.toLocaleString()} tokens`;
        document.getElementById('tokens-info').textContent = tokensInfo;
        
        const devicesInfo = `${userInfo.limites.dispositivos_activos} / ${userInfo.limites.dispositivos_limite} dispositivos`;
        document.getElementById('devices-info').textContent = devicesInfo;
        
        authInfo.style.display = 'flex';
        
        // Mostrar tabs de historial y configuración
        if (historialTabBtn) {
            historialTabBtn.style.display = 'block';
        }
        if (configTabBtn) {
            configTabBtn.style.display = 'block';
        }
        
        // Verificar alertas de tokens
        verificarYMostrarAlertas();
    } else {
        authInfo.style.display = 'none';
        
        // Ocultar tabs de historial y configuración
        if (historialTabBtn) {
            historialTabBtn.style.display = 'none';
        }
        if (configTabBtn) {
            configTabBtn.style.display = 'none';
        }
    }
}

// Mostrar alerta de tokens
function mostrarAlertaTokens(alerta) {
    if (!alerta) return;
    
    const colores = {
        'critico': '#dc2626',
        'alto': '#ea580c',
        'medio': '#eab308'
    };
    
    const banner = document.createElement('div');
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: ${colores[alerta.nivel]};
        color: white;
        padding: 1rem;
        text-align: center;
        font-weight: 600;
        z-index: 10000;
        animation: slideDown 0.3s ease-out;
    `;
    banner.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i> ${alerta.mensaje}
        <button onclick="this.parentElement.remove()" style="
            position: absolute;
            right: 1rem;
            background: transparent;
            border: none;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
        ">&times;</button>
    `;
    
    document.body.insertBefore(banner, document.body.firstChild);
    
    // Auto-ocultar después de 10 segundos
    setTimeout(() => banner.remove(), 10000);
}

// Mostrar/ocultar modal de login
function showLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}

function hideLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

// Variables para paginación del historial
let historialPaginaActual = 1;
let historialTotalPaginas = 1;
let historialFiltros = {
    busqueda: '',
    tipo_operacion: ''
};

// Cargar historial de clasificaciones
async function cargarHistorial(pagina = 1) {
    if (!authToken) return;
    
    const lista = document.getElementById('historial-lista');
    const loading = document.getElementById('historial-loading');
    
    if (loading) loading.style.display = 'flex';
    if (lista) lista.innerHTML = '';
    
    try {
        const params = new URLSearchParams({
            pagina: pagina,
            limite: 10,
            ...historialFiltros
        });
        
        const response = await fetch(`${API_BASE_URL}/api/historial?${params}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            historialPaginaActual = data.pagina_actual;
            historialTotalPaginas = data.total_paginas;
            
            mostrarHistorialUI(data.clasificaciones);
            actualizarPaginacion();
            
            // Cargar estadísticas
            cargarEstadisticas();
        }
    } catch (error) {
        console.error('Error cargando historial:', error);
        showNotification('Error al cargar el historial', 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Mostrar historial en UI
function mostrarHistorialUI(clasificaciones) {
    const lista = document.getElementById('historial-lista');
    if (!lista) return;
    
    lista.innerHTML = '';
    
    if (!clasificaciones || clasificaciones.length === 0) {
        lista.innerHTML = `
            <div class="historial-empty">
                <i class="fas fa-inbox"></i>
                <h3>No hay clasificaciones aún</h3>
                <p>Comienza clasificando productos para ver tu historial aquí</p>
            </div>
        `;
        return;
    }
    
    clasificaciones.forEach(item => {
        const fecha = new Date(item.fecha_creacion).toLocaleString('es-DO', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const badges = [];
        if (item.tipo_operacion) {
            badges.push(`<span class="badge badge-${item.tipo_operacion}">${item.tipo_operacion === 'import' ? 'Importación' : 'Exportación'}</span>`);
        }
        if (item.editado) {
            badges.push(`<span class="badge badge-editado">Editado</span>`);
        }
        if (item.exportado) {
            badges.push(`<span class="badge badge-exportado">Exportado</span>`);
        }
        
        let productosHTML = '';
        if (item.productos && item.productos.length > 0) {
            const productosLimitados = item.productos.slice(0, 3);
            const masProductos = item.productos.length > 3 ? ` +${item.productos.length - 3} más` : '';
            productosHTML = `
                <div class="historial-productos">
                    <h5>Productos clasificados:</h5>
                    ${productosLimitados.map(p => `
                        <span class="producto-tag">
                            <strong>${p.codigo_hs || 'N/A'}</strong> - ${p.nombre_producto || 'Sin nombre'}
                        </span>
                    `).join('')}
                    ${masProductos ? `<span class="producto-tag"><strong>${masProductos}</strong></span>` : ''}
                </div>
            `;
        }
        
        const itemHTML = `
            <div class="historial-item">
                <div class="historial-item-header">
                    <div class="historial-item-title">
                        <i class="fas fa-file-invoice"></i>
                        <h4>${item.nombre_archivo || 'Clasificación sin nombre'}</h4>
                    </div>
                    <div class="historial-item-badges">
                        ${badges.join('')}
                    </div>
                </div>
                
                <div class="historial-item-body">
                    <div class="historial-field">
                        <span class="historial-field-label">ID Clasificación</span>
                        <span class="historial-field-value">${item.clasificacion_id}</span>
                    </div>
                    <div class="historial-field">
                        <span class="historial-field-label">Tipo</span>
                        <span class="historial-field-value">${item.tipo_operacion === 'import' ? 'Importación' : 'Exportación'}</span>
                    </div>
                    <div class="historial-field">
                        <span class="historial-field-label">Productos</span>
                        <span class="historial-field-value">${item.productos?.length || 0} clasificados</span>
                    </div>
                </div>
                
                ${productosHTML}
                
                <div class="historial-item-footer">
                    <div class="historial-fecha">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${fecha}</span>
                    </div>
                    <div class="historial-actions">
                        <button class="btn-historial-action btn-view" onclick="verClasificacion('${item.clasificacion_id}')">
                            <i class="fas fa-eye"></i>
                            Ver Detalles
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        lista.insertAdjacentHTML('beforeend', itemHTML);
    });
}

// Ver detalles de una clasificación
window.verClasificacion = async function(clasificacionId) {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/historial/${clasificacionId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.clasificacion) {
            console.log('📥 Clasificación obtenida del historial:', data.clasificacion);
            console.log('📊 Resultado a mostrar:', data.clasificacion.resultado);
            console.log('📋 Tipo de resultado:', typeof data.clasificacion.resultado);
            console.log('📋 Keys del resultado:', Object.keys(data.clasificacion.resultado || {}));
            
            // Cargar el resultado en la variable global - asegurarse de que sea la estructura correcta
            const resultadoParaMostrar = data.clasificacion.resultado;
            window.resultadoActual = resultadoParaMostrar;
            if (typeof resultadoActual !== 'undefined') {
                resultadoActual = resultadoParaMostrar;
            }
            
            // Cambiar a tab de archivo primero (donde están los resultados)
            if (typeof window.showTab === 'function') {
                window.showTab('archivo');
            } else if (typeof showTab === 'function') {
                showTab('archivo');
            }
            
            // Esperar un momento para que el tab cambie
            setTimeout(() => {
                console.log('🎨 Intentando mostrar resultados...');
                
                // Mostrar los resultados
                if (typeof window.showResults === 'function') {
                    console.log('✅ Llamando a window.showResults');
                    window.showResults(data.clasificacion.resultado, null);
                } else if (typeof showResults === 'function') {
                    console.log('✅ Llamando a showResults');
                    showResults(data.clasificacion.resultado, null);
                } else {
                    console.error('❌ No se encontró la función showResults');
                }
                
                // Scroll a resultados después de un breve delay
                setTimeout(() => {
                    const resultsSection = document.getElementById('results');
                    console.log('📍 Elemento results:', resultsSection);
                    if (resultsSection) {
                        resultsSection.style.display = 'block';
                        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 300);
            }, 200);
            
            showNotification('Clasificación cargada correctamente', 'success');
        } else {
            showNotification('No se pudo cargar la clasificación', 'error');
        }
    } catch (error) {
        console.error('Error cargando clasificación:', error);
        showNotification('Error al cargar la clasificación', 'error');
    }
}

// Función de eliminar deshabilitada por seguridad
// La eliminación de clasificaciones no está permitida desde el frontend
/*
async function eliminarClasificacion(clasificacionId) {
    showNotification('La eliminación de clasificaciones no está permitida', 'warning');
}
*/

// Buscar en historial
function buscarHistorial() {
    const searchInput = document.getElementById('historial-search');
    const tipoSelect = document.getElementById('historial-tipo');
    
    historialFiltros.busqueda = searchInput?.value || '';
    historialFiltros.tipo_operacion = tipoSelect?.value || '';
    
    cargarHistorial(1);
}

// Limpiar filtros
function limpiarFiltrosHistorial() {
    const searchInput = document.getElementById('historial-search');
    const tipoSelect = document.getElementById('historial-tipo');
    
    if (searchInput) searchInput.value = '';
    if (tipoSelect) tipoSelect.value = '';
    
    historialFiltros = {
        busqueda: '',
        tipo_operacion: ''
    };
    
    cargarHistorial(1);
}

// Cambiar página
function cambiarPaginaHistorial(direccion) {
    const nuevaPagina = historialPaginaActual + direccion;
    if (nuevaPagina >= 1 && nuevaPagina <= historialTotalPaginas) {
        cargarHistorial(nuevaPagina);
    }
}

// Actualizar controles de paginación
function actualizarPaginacion() {
    const pagination = document.getElementById('historial-pagination');
    const pageInfo = document.getElementById('page-info');
    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');
    
    if (!pagination) return;
    
    if (historialTotalPaginas > 1) {
        pagination.style.display = 'flex';
        if (pageInfo) {
            pageInfo.textContent = `Página ${historialPaginaActual} de ${historialTotalPaginas}`;
        }
        if (btnPrev) {
            btnPrev.disabled = historialPaginaActual === 1;
        }
        if (btnNext) {
            btnNext.disabled = historialPaginaActual === historialTotalPaginas;
        }
    } else {
        pagination.style.display = 'none';
    }
}

// Cargar estadísticas
async function cargarEstadisticas() {
    if (!authToken) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/historial/stats/resumen`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const stats = data.estadisticas;
            console.log('📊 Estadísticas recibidas:', stats);
            document.getElementById('stat-total').textContent = stats.total || 0;
            document.getElementById('stat-mes').textContent = stats.este_mes || 0;
            document.getElementById('stat-exportados').textContent = stats.exportados || 0;
            
            // Si existe el elemento para productos (lo agregaremos en el HTML)
            const statProductos = document.getElementById('stat-productos');
            if (statProductos) {
                statProductos.textContent = stats.total_productos || 0;
            }
            
            document.getElementById('historial-stats').style.display = 'grid';
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// Event listeners para el modal de login
document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesión al cargar
    verificarSesion();
    
    // Formulario de login
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            login(email, password);
        });
    }
    
    // Formulario de registro
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const nombre = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            const empresaId = document.getElementById('register-empresa').value;
            registro(nombre, email, password, empresaId);
        });
    }
    
    // Botón de logout
    const logoutBtn = document.querySelector('.btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Campo de búsqueda del historial - buscar al presionar Enter
    const historialSearch = document.getElementById('historial-search');
    if (historialSearch) {
        historialSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                buscarHistorial();
            }
        });
    }
    
    // Formulario de configuración de defaults
    const defaultsForm = document.getElementById('defaults-form');
    if (defaultsForm) {
        defaultsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            guardarDefaults();
        });
    }
});

// ==========================================
// CONFIGURACIÓN DE DEFAULTS
// ==========================================

// Cargar valores por defecto de la empresa
async function cargarDefaults() {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/config/defaults`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.defaults) {
            const defaults = data.defaults;
            
            // Llenar los campos del formulario
            document.getElementById('default-clearance-type').value = defaults.ClearanceType || '';
            document.getElementById('default-regimen-code').value = defaults.RegimenCode || '';
            document.getElementById('default-importer-code').value = defaults.ImporterCode || '';
            document.getElementById('default-declarant-code').value = defaults.DeclarantCode || '';
            
            console.log('✅ Defaults cargados:', defaults);
        }
    } catch (error) {
        console.error('Error cargando defaults:', error);
        showNotification('Error al cargar la configuración', 'error');
    }
}

// Guardar valores por defecto
window.guardarDefaults = async function() {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    const defaults = {
        ClearanceType: document.getElementById('default-clearance-type').value.trim(),
        RegimenCode: document.getElementById('default-regimen-code').value.trim(),
        ImporterCode: document.getElementById('default-importer-code').value.trim(),
        DeclarantCode: document.getElementById('default-declarant-code').value.trim()
    };
    
    // Validar formatos
    if (defaults.ClearanceType && !/^IC\d{2}-\d{3}$/.test(defaults.ClearanceType)) {
        showNotification('Formato inválido para ClearanceType. Debe ser IC##-### (Ej: IC01-001)', 'error');
        return;
    }
    
    if (defaults.RegimenCode && !/^\d+$/.test(defaults.RegimenCode)) {
        showNotification('Formato inválido para RegimenCode. Debe ser solo números', 'error');
        return;
    }
    
    if (defaults.ImporterCode && !/^RNC\d+$/.test(defaults.ImporterCode)) {
        showNotification('Formato inválido para ImporterCode. Debe ser RNC seguido de números', 'error');
        return;
    }
    
    if (defaults.DeclarantCode && !/^RNC\d+$/.test(defaults.DeclarantCode)) {
        showNotification('Formato inválido para DeclarantCode. Debe ser RNC seguido de números', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/config/defaults`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ defaults })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('✅ Configuración guardada correctamente', 'success');
        } else {
            showNotification(data.mensaje || 'Error al guardar la configuración', 'error');
        }
    } catch (error) {
        console.error('Error guardando defaults:', error);
        showNotification('Error al guardar la configuración', 'error');
    }
};

// Cargar Top 10 códigos HS
async function cargarTopCodigosHS() {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    const loading = document.getElementById('top-hs-loading');
    const lista = document.getElementById('top-hs-list');
    
    if (loading) loading.style.display = 'flex';
    if (lista) lista.innerHTML = '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/historial/stats/resumen`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.estadisticas.top_codigos_hs) {
            const topCodigos = data.estadisticas.top_codigos_hs;
            
            if (topCodigos.length === 0) {
                lista.innerHTML = `
                    <div class="top-hs-empty">
                        <i class="fas fa-inbox"></i>
                        <p>No hay códigos HS clasificados aún</p>
                    </div>
                `;
            } else {
                topCodigos.forEach((item, index) => {
                    const itemHTML = `
                        <div class="top-hs-item">
                            <span class="hs-rank">#${index + 1}</span>
                            <span class="hs-code">${item._id || 'N/A'}</span>
                            <span class="hs-count">${item.count} ${item.count === 1 ? 'vez' : 'veces'}</span>
                        </div>
                    `;
                    lista.insertAdjacentHTML('beforeend', itemHTML);
                });
            }
        }
    } catch (error) {
        console.error('Error cargando top códigos HS:', error);
        if (lista) {
            lista.innerHTML = `
                <div class="top-hs-empty">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar estadísticas</p>
                </div>
            `;
        }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// ==========================================
// BANNER DE ALERTAS
// ==========================================

// Mostrar banner de alerta permanente
function mostrarAlertaBanner(alerta) {
    if (!alerta) return;
    
    const banner = document.getElementById('alert-banner');
    const title = document.getElementById('alert-title');
    const message = document.getElementById('alert-message');
    
    if (!banner || !title || !message) return;
    
    // Configurar contenido
    title.textContent = alerta.nivel === 'critico' ? '⚠️ ALERTA CRÍTICA' : 
                        alerta.nivel === 'alto' ? '⚠️ ALERTA IMPORTANTE' : 
                        '⚠️ AVISO';
    message.textContent = alerta.mensaje;
    
    // Aplicar clase según nivel
    banner.className = '';
    banner.classList.add('alert-' + alerta.nivel);
    
    // Mostrar banner
    banner.style.display = 'flex';
    
    // Guardar en sessionStorage para no mostrar muchas veces
    sessionStorage.setItem('alert-shown', 'true');
}

// Ocultar banner de alerta
window.ocultarAlertaBanner = function() {
    const banner = document.getElementById('alert-banner');
    if (banner) {
        banner.style.display = 'none';
    }
};

// Verificar y mostrar alertas
async function verificarYMostrarAlertas() {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    // Solo verificar si no se ha mostrado en esta sesión
    if (sessionStorage.getItem('alert-shown')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/alertas/tokens`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.alerta) {
            mostrarAlertaBanner(data.alerta);
        }
    } catch (error) {
        console.error('Error verificando alertas:', error);
    }
}

// Interceptar clasificaciones para guardar en historial
const clasificarArchivoOriginal = window.clasificarArchivo;
window.clasificarArchivo = async function() {
    const resultado = await clasificarArchivoOriginal.apply(this, arguments);
    
    // El historial se guarda automáticamente en el backend
    // cuando hay autenticación
    
    return resultado;
};

// ==========================================
// FUNCIONALIDADES DE SEGURIDAD
// ==========================================

// Variables globales para 2FA
let pendingLogin2FA = null;

// ========== PASSWORD RECOVERY ==========

function mostrarRecoveryModal() {
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('recovery-modal').style.display = 'flex';
    document.getElementById('recovery-email').value = '';
    document.getElementById('recovery-message').style.display = 'none';
    document.getElementById('recovery-error').style.display = 'none';
}

function cerrarRecoveryModal() {
    document.getElementById('recovery-modal').style.display = 'none';
    document.getElementById('login-modal').style.display = 'flex';
}

async function solicitarRecuperacion(email) {
    try {
        const btnRecovery = document.getElementById('btn-recovery');
        btnRecovery.disabled = true;
        btnRecovery.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        
        const response = await fetch(`${API_BASE_URL}/api/security/request-reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ correo: email })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('recovery-message').innerHTML = `
                <i class="fas fa-check-circle"></i>
                ${data.mensaje || 'Si el correo existe, recibirás un email con instrucciones.'}
            `;
            document.getElementById('recovery-message').style.display = 'flex';
            document.getElementById('recovery-error').style.display = 'none';
            document.getElementById('recovery-email').value = '';
        } else {
            document.getElementById('recovery-error').textContent = data.error || 'Error al solicitar recuperación';
            document.getElementById('recovery-error').style.display = 'block';
            document.getElementById('recovery-message').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error en recuperación:', error);
        document.getElementById('recovery-error').textContent = 'Error de conexión';
        document.getElementById('recovery-error').style.display = 'block';
    } finally {
        const btnRecovery = document.getElementById('btn-recovery');
        btnRecovery.disabled = false;
        btnRecovery.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Link de Recuperación';
    }
}

// Event listener para recovery form
document.getElementById('recovery-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('recovery-email').value;
    await solicitarRecuperacion(email);
});

// ========== 2FA LOGIN ==========

function mostrar2FAModal(usuarioId) {
    pendingLogin2FA = { usuarioId };
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('2fa-modal').style.display = 'flex';
    document.getElementById('2fa-code').value = '';
    document.getElementById('2fa-backup-code').checked = false;
    document.getElementById('2fa-error').style.display = 'none';
}

function cancelar2FA() {
    document.getElementById('2fa-modal').style.display = 'none';
    document.getElementById('login-modal').style.display = 'flex';
    pendingLogin2FA = null;
}

async function completarLogin2FA(codigo, esBackupCode) {
    try {
        const btn2FA = document.getElementById('btn-2fa');
        btn2FA.disabled = true;
        btn2FA.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        
        const response = await fetch(`${API_BASE_URL}/api/auth/login-2fa`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Fingerprint': deviceFingerprint
            },
            body: JSON.stringify({
                usuarioId: pendingLogin2FA.usuarioId,
                codigo: codigo,
                esBackupCode: esBackupCode
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            authToken = data.token;
            userInfo = {
                usuario: data.usuario,
                empresa: data.empresa,
                plan: data.plan,
                limites: data.limites
            };
            
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            
            document.getElementById('2fa-modal').style.display = 'none';
            updateAuthUI();
            
            if (data.backup_code_used) {
                alert('Has usado un código de respaldo. Te quedan menos códigos disponibles.');
            }
        } else {
            document.getElementById('2fa-error').textContent = 'Código inválido';
            document.getElementById('2fa-error').style.display = 'block';
        }
        
    } catch (error) {
        console.error('Error en 2FA:', error);
        document.getElementById('2fa-error').textContent = 'Error de conexión';
        document.getElementById('2fa-error').style.display = 'block';
    } finally {
        const btn2FA = document.getElementById('btn-2fa');
        btn2FA.disabled = false;
        btn2FA.innerHTML = '<i class="fas fa-check"></i> Verificar';
    }
}

// Event listener para 2FA form
document.getElementById('2fa-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('2fa-code').value;
    const esBackupCode = document.getElementById('2fa-backup-code').checked;
    await completarLogin2FA(codigo, esBackupCode);
});

// ========== 2FA SETUP ==========

async function mostrar2FASetup() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/security/2fa/enable`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Mostrar QR code
            document.getElementById('qr-code-container').innerHTML = `
                <img src="${data.qrCode}" alt="QR Code">
            `;
            
            // Mostrar secret
            document.getElementById('2fa-secret').textContent = data.secret;
            
            // Mostrar backup codes
            const backupCodesContainer = document.getElementById('backup-codes-container');
            backupCodesContainer.innerHTML = data.backupCodes.map(code => 
                `<div class="backup-code">${code}</div>`
            ).join('');
            
            // Mostrar modal
            document.getElementById('2fa-setup-modal').style.display = 'flex';
            document.getElementById('2fa-verify-code').value = '';
            document.getElementById('2fa-verify-error').style.display = 'none';
            document.getElementById('2fa-verify-success').style.display = 'none';
        } else {
            alert('Error al generar configuración 2FA');
        }
        
    } catch (error) {
        console.error('Error setup 2FA:', error);
        alert('Error de conexión');
    }
}

function cerrar2FASetupModal() {
    document.getElementById('2fa-setup-modal').style.display = 'none';
    cargar2FAStatus(); // Recargar estado
}

async function verificarYActivar2FA(codigo) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/security/2fa/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ codigo })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('2fa-verify-success').innerHTML = `
                <i class="fas fa-check-circle"></i>
                ¡2FA activado correctamente! Tu cuenta ahora está más segura.
            `;
            document.getElementById('2fa-verify-success').style.display = 'flex';
            document.getElementById('2fa-verify-error').style.display = 'none';
            
            setTimeout(() => {
                cerrar2FASetupModal();
            }, 2000);
        } else {
            document.getElementById('2fa-verify-error').textContent = 'Código inválido. Intenta de nuevo.';
            document.getElementById('2fa-verify-error').style.display = 'block';
            document.getElementById('2fa-verify-success').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error verificando 2FA:', error);
        document.getElementById('2fa-verify-error').textContent = 'Error de conexión';
        document.getElementById('2fa-verify-error').style.display = 'block';
    }
}

// Event listener para verify form
document.getElementById('2fa-verify-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codigo = document.getElementById('2fa-verify-code').value;
    await verificarYActivar2FA(codigo);
});

// ========== 2FA STATUS ==========

async function cargar2FAStatus() {
    if (!authToken) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/security/2fa/status`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        const statusBadge = document.getElementById('2fa-status-badge');
        const statusText = document.getElementById('2fa-status-text');
        const btnEnable = document.getElementById('btn-enable-2fa');
        const btnDisable = document.getElementById('btn-disable-2fa');
        const btnRegenerate = document.getElementById('btn-regenerate-codes');
        const info2FA = document.getElementById('2fa-info');
        
        if (data.enabled) {
            statusBadge.className = 'status-badge active';
            statusText.innerHTML = '<i class="fas fa-check-circle"></i> 2FA Activado';
            btnEnable.style.display = 'none';
            btnDisable.style.display = 'inline-flex';
            btnRegenerate.style.display = 'inline-flex';
            info2FA.style.display = 'block';
            
            document.getElementById('2fa-activated-date').textContent = 
                data.activatedAt ? new Date(data.activatedAt).toLocaleDateString('es-DO') : 'N/A';
            document.getElementById('2fa-backup-remaining').textContent = data.backupCodesRemaining || 0;
        } else {
            statusBadge.className = 'status-badge inactive';
            statusText.innerHTML = '<i class="fas fa-times-circle"></i> 2FA Desactivado';
            btnEnable.style.display = 'inline-flex';
            btnDisable.style.display = 'none';
            btnRegenerate.style.display = 'none';
            info2FA.style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error cargando estado 2FA:', error);
    }
}

async function deshabilitar2FA() {
    const password = prompt('Ingresa tu contraseña para deshabilitar 2FA:');
    if (!password) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/security/2fa/disable`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ contrasena: password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('2FA desactivado correctamente');
            cargar2FAStatus();
        } else {
            alert(data.error || 'Error al desactivar 2FA');
        }
        
    } catch (error) {
        console.error('Error deshabilitando 2FA:', error);
        alert('Error de conexión');
    }
}

async function regenerarBackupCodes() {
    if (!confirm('¿Regenerar códigos de respaldo? Los códigos anteriores dejarán de funcionar.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/security/2fa/regenerate-backup-codes`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const codesText = data.backupCodes.join('\n');
            alert(`Nuevos códigos de respaldo:\n\n${codesText}\n\nGuárdalos en un lugar seguro.`);
            cargar2FAStatus();
        } else {
            alert('Error al regenerar códigos');
        }
        
    } catch (error) {
        console.error('Error regenerando códigos:', error);
        alert('Error de conexión');
    }
}

// ========== ACTUALIZAR LOGIN PARA SOPORTAR 2FA ==========

// Reemplazar función login original
const loginOriginal = window.login;
window.login = async function(email, password) {
    try {
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
        
        // Si requiere 2FA
        if (data.requires_2fa) {
            mostrar2FAModal(data.usuario_id);
            return;
        }
        
        // Login exitoso sin 2FA
        if (data.success) {
            authToken = data.token;
            userInfo = {
                usuario: data.usuario,
                empresa: data.empresa,
                plan: data.plan,
                limites: data.limites
            };
            
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('userInfo', JSON.stringify(userInfo));
            
            if (data.alerta) {
                mostrarAlertaTokens(data.alerta);
            }
            
            hideLoginModal();
            updateAuthUI();
            return;
        }
        
        // Error de login
        throw new Error(data.mensaje || 'Credenciales inválidas');
        
    } catch (error) {
        throw error;
    }
};

// Cargar estado 2FA cuando se cambia a la tab de configuración
const showTabOriginal = window.showTab;
window.showTab = function(tabName) {
    showTabOriginal(tabName);
    
    if (tabName === 'configuracion' && authToken) {
        cargar2FAStatus();
    }
};

