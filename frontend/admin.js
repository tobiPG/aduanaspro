// Estado Global del Admin Panel
// Nota: admin.js usa las variables globales de script.js (API_BASE_URL, authToken)
let adminData = null;
let empresasData = [];
let usuariosData = [];
let graficas = {};

// ==================== INICIALIZACIÓN ====================

document.addEventListener('DOMContentLoaded', async function() {
    // Verificar autenticación (usa authToken de script.js)
    if (!authToken) {
        authToken = localStorage.getItem('authToken');
    }
    
    if (!authToken) {
        window.location.href = 'index.html';
        return;
    }
    
    // Verificar que el usuario es admin
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/verificar`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok || !data.success) {
            alert('Sesión inválida');
            localStorage.removeItem('authToken');
            window.location.href = 'index.html';
            return;
        }
        
        // Verificar rol de admin (el backend debe incluir esta info)
        adminData = data.usuario;
        document.getElementById('admin-name').textContent = adminData.nombre;
        document.getElementById('admin-email').textContent = adminData.correo;
        
        // Cargar datos iniciales
        await cargarDashboard();
        
    } catch (error) {
        console.error('Error verificando sesión:', error);
        alert('Error de conexión');
    }
});

// ==================== NAVEGACIÓN ====================

function showSection(section) {
    // Ocultar todas las secciones
    document.querySelectorAll('.content-section').forEach(el => {
        el.classList.remove('active');
    });
    
    // Desactivar todos los nav items
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
    });
    
    // Activar sección seleccionada
    const sectionEl = document.getElementById(`section-${section}`);
    if (sectionEl) {
        sectionEl.classList.add('active');
    }
    
    // Activar nav item - buscar el nav-item que corresponde a esta sección
    document.querySelectorAll('.nav-item').forEach(el => {
        const onclick = el.getAttribute('onclick');
        if (onclick && onclick.includes(`'${section}'`)) {
            el.classList.add('active');
        }
    });
    
    // Actualizar título
    const titles = {
        'dashboard': {
            title: 'Dashboard General',
            subtitle: 'Estadísticas y métricas del sistema'
        },
        'empresas': {
            title: 'Gestión de Empresas',
            subtitle: 'Administra las empresas del sistema'
        },
        'usuarios': {
            title: 'Gestión de Usuarios',
            subtitle: 'Administra los usuarios del sistema'
        },
        'planes': {
            title: 'Planes de Suscripción',
            subtitle: 'Visualiza los planes disponibles'
        },
        'historial': {
            title: 'Historial de Clasificaciones',
            subtitle: 'Todas las clasificaciones del sistema'
        },
        'sesiones': {
            title: 'Gestión de Sesiones',
            subtitle: 'Monitorea y administra las sesiones activas'
        }
    };
    
    document.getElementById('section-title').textContent = titles[section].title;
    document.getElementById('section-subtitle').textContent = titles[section].subtitle;
    
    // Cargar datos de la sección
    switch(section) {
        case 'dashboard':
            cargarDashboard();
            break;
        case 'empresas':
            cargarEmpresas();
            break;
        case 'usuarios':
            cargarUsuarios();
            break;
        case 'planes':
            cargarPlanes();
            break;
        case 'historial':
            cargarHistorialAdmin();
            break;
        case 'sesiones':
            cargarSesionesActivas();
            break;
    }
}

function refreshData() {
    const activeSection = document.querySelector('.content-section.active').id.replace('section-', '');
    showSection(activeSection);
}

function logout() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
        localStorage.removeItem('authToken');
        window.location.href = 'index.html';
    }
}

// ==================== DASHBOARD ====================

async function cargarDashboard() {
    try {
        // Cargar estadísticas globales
        const statsResponse = await fetch(`${API_BASE_URL}/api/admin/stats/global`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const statsData = await statsResponse.json();
        
        if (statsData.success) {
            mostrarEstadisticas(statsData.estadisticas);
        }
        
        // Cargar datos de gráficas
        await actualizarGraficas();
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        showNotification('Error cargando dashboard', 'error');
    }
}

function mostrarEstadisticas(stats) {
    // Empresas
    document.getElementById('stat-empresas').textContent = stats.empresas.activas;
    document.getElementById('stat-empresas-change').textContent = 
        `Total: ${stats.empresas.total} (${stats.empresas.inactivas} inactivas)`;
    
    // Usuarios
    document.getElementById('stat-usuarios').textContent = stats.usuarios.activos;
    document.getElementById('stat-usuarios-change').textContent = 
        `Total: ${stats.usuarios.total} (${stats.usuarios.inactivos} inactivos)`;
    
    // Clasificaciones
    document.getElementById('stat-clasificaciones').textContent = 
        formatNumber(stats.clasificaciones.total);
    document.getElementById('stat-clasificaciones-mes').textContent = 
        formatNumber(stats.clasificaciones.este_mes);
    
    // Tokens
    document.getElementById('stat-tokens').textContent = 
        formatNumber(stats.tokens.total_consumido);
    document.getElementById('stat-tokens-change').textContent = 
        `Input: ${formatNumber(stats.tokens.total_input)} | Output: ${formatNumber(stats.tokens.total_output)}`;
}

async function actualizarGraficas() {
    const periodo = document.getElementById('periodo-clasificaciones')?.value || '30d';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/stats/graficas?periodo=${periodo}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            crearGraficaClasificaciones(data.graficas.clasificaciones_por_dia);
            crearGraficaTokens(data.graficas.consumo_por_dia);
            crearGraficaPlanes(data.graficas);
            crearGraficaTopEmpresas(data.graficas.top_empresas);
        }
        
    } catch (error) {
        console.error('Error actualizando gráficas:', error);
    }
}

function crearGraficaClasificaciones(datos) {
    const ctx = document.getElementById('chart-clasificaciones');
    if (!ctx) return;
    
    // Destruir gráfica anterior si existe
    if (graficas.clasificaciones) {
        graficas.clasificaciones.destroy();
    }
    
    const labels = datos.map(d => d._id);
    const values = datos.map(d => d.cantidad);
    
    graficas.clasificaciones = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Clasificaciones',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

function crearGraficaTokens(datos) {
    const ctx = document.getElementById('chart-tokens');
    if (!ctx) return;
    
    if (graficas.tokens) {
        graficas.tokens.destroy();
    }
    
    const labels = datos.map(d => d._id);
    const values = datos.map(d => d.total_tokens);
    
    graficas.tokens = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tokens',
                data: values,
                backgroundColor: '#10b981',
                borderColor: '#059669',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function crearGraficaPlanes(graficas_data) {
    const ctx = document.getElementById('chart-planes');
    if (!ctx) return;
    
    if (graficas.planes) {
        graficas.planes.destroy();
    }
    
    // Obtener distribución de planes desde estadísticas globales
    const distribucion = graficas_data.tipos_operacion || [];
    
    graficas.planes = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: distribucion.map(d => d._id || 'N/A'),
            datasets: [{
                data: distribucion.map(d => d.cantidad),
                backgroundColor: [
                    '#3b82f6',
                    '#10b981',
                    '#f59e0b',
                    '#ef4444',
                    '#8b5cf6'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

function crearGraficaTopEmpresas(datos) {
    const ctx = document.getElementById('chart-top-empresas');
    if (!ctx) return;
    
    if (graficas.topEmpresas) {
        graficas.topEmpresas.destroy();
    }
    
    const labels = datos.map(d => d.nombre);
    const values = datos.map(d => d.total_tokens);
    
    graficas.topEmpresas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tokens Consumidos',
                data: values,
                backgroundColor: '#8b5cf6',
                borderColor: '#7c3aed',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: 'y',
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}

// ==================== GESTIÓN DE EMPRESAS ====================

async function cargarEmpresas() {
    try {
        const planFilter = document.getElementById('filter-empresa-plan').value;
        const estadoFilter = document.getElementById('filter-empresa-estado').value;
        
        let url = `${API_BASE_URL}/api/admin/empresas?`;
        if (planFilter) url += `plan_id=${planFilter}&`;
        if (estadoFilter) url += `activa=${estadoFilter}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            empresasData = data.empresas;
            renderTablaEmpresas(data.empresas);
        }
        
    } catch (error) {
        console.error('Error cargando empresas:', error);
        showNotification('Error cargando empresas', 'error');
    }
}

function renderTablaEmpresas(empresas) {
    const tbody = document.getElementById('table-empresas');
    
    if (empresas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">No hay empresas registradas</td></tr>';
        return;
    }
    
    tbody.innerHTML = empresas.map(empresa => `
        <tr>
            <td>
                <div>
                    <strong>${empresa.nombre}</strong><br>
                    <small style="color: #64748b;">${empresa.empresa_id}</small>
                </div>
            </td>
            <td>
                <span class="badge badge-info">${empresa.plan_id}</span>
            </td>
            <td>${empresa.total_usuarios || 0}</td>
            <td>${formatNumber(empresa.total_clasificaciones || 0)}</td>
            <td>
                <div>
                    <small>${formatNumber(empresa.tokens_consumidos)} / ${formatNumber(empresa.tokens_limite_mensual)}</small><br>
                    <div style="background: #e2e8f0; height: 4px; border-radius: 2px; margin-top: 4px;">
                        <div style="background: #3b82f6; height: 100%; width: ${(empresa.tokens_consumidos / empresa.tokens_limite_mensual * 100)}%; border-radius: 2px;"></div>
                    </div>
                </div>
            </td>
            <td>
                <span class="badge ${empresa.activa ? 'badge-success' : 'badge-danger'}">
                    ${empresa.activa ? 'Activa' : 'Inactiva'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-view" onclick="verDetalleEmpresa('${empresa.empresa_id}')" title="Ver detalle">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn btn-edit" onclick="editarEmpresa('${empresa.empresa_id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn ${empresa.activa ? 'btn-delete' : 'btn-view'}" 
                            onclick="toggleEmpresa('${empresa.empresa_id}', ${!empresa.activa})" 
                            title="${empresa.activa ? 'Desactivar' : 'Activar'}">
                        <i class="fas fa-${empresa.activa ? 'ban' : 'check'}"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function mostrarModalEmpresa(empresaId = null) {
    const modal = document.getElementById('modal-empresa');
    const form = document.getElementById('form-empresa');
    const title = document.getElementById('modal-empresa-title');
    
    form.reset();
    
    if (empresaId) {
        title.textContent = 'Editar Empresa';
        // Cargar datos de la empresa
        const empresa = empresasData.find(e => e.empresa_id === empresaId);
        if (empresa) {
            document.getElementById('empresa-nombre').value = empresa.nombre;
            document.getElementById('empresa-plan').value = empresa.plan_id;
            document.getElementById('empresa-periodo-inicio').value = empresa.periodo_inicio;
            document.getElementById('empresa-periodo-fin').value = empresa.periodo_fin;
        }
    } else {
        title.textContent = 'Nueva Empresa';
        // Establecer fechas por defecto
        const hoy = new Date().toISOString().split('T')[0];
        const finMes = new Date();
        finMes.setMonth(finMes.getMonth() + 1);
        document.getElementById('empresa-periodo-inicio').value = hoy;
        document.getElementById('empresa-periodo-fin').value = finMes.toISOString().split('T')[0];
    }
    
    modal.classList.add('active');
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        await guardarEmpresa(empresaId);
    };
}

function cerrarModalEmpresa() {
    document.getElementById('modal-empresa').classList.remove('active');
}

async function guardarEmpresa(empresaId) {
    const datos = {
        nombre: document.getElementById('empresa-nombre').value,
        plan_id: document.getElementById('empresa-plan').value,
        periodo_inicio: document.getElementById('empresa-periodo-inicio').value,
        periodo_fin: document.getElementById('empresa-periodo-fin').value
    };
    
    try {
        const url = empresaId 
            ? `${API_BASE_URL}/api/admin/empresas/${empresaId}`
            : `${API_BASE_URL}/api/admin/empresas`;
        
        const response = await fetch(url, {
            method: empresaId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(datos)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.mensaje || 'Empresa guardada exitosamente', 'success');
            cerrarModalEmpresa();
            cargarEmpresas();
        } else {
            showNotification(data.mensaje || 'Error guardando empresa', 'error');
        }
        
    } catch (error) {
        console.error('Error guardando empresa:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function toggleEmpresa(empresaId, nuevoEstado) {
    const accion = nuevoEstado ? 'activar' : 'desactivar';
    
    if (!confirm(`¿Estás seguro de ${accion} esta empresa?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/empresas/${empresaId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ activa: nuevoEstado })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.mensaje, 'success');
            cargarEmpresas();
        } else {
            showNotification(data.mensaje || `Error al ${accion} empresa`, 'error');
        }
        
    } catch (error) {
        console.error('Error toggle empresa:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function editarEmpresa(empresaId) {
    mostrarModalEmpresa(empresaId);
}

async function verDetalleEmpresa(empresaId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/empresas/${empresaId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarDetalleEmpresa(data.empresa);
        }
        
    } catch (error) {
        console.error('Error cargando detalle:', error);
        showNotification('Error cargando detalle de empresa', 'error');
    }
}

function mostrarDetalleEmpresa(empresa) {
    const modal = document.getElementById('modal-detalle-empresa');
    
    document.getElementById('detalle-empresa-nombre').textContent = empresa.nombre;
    document.getElementById('detalle-empresa-id').textContent = empresa.empresa_id;
    document.getElementById('detalle-empresa-plan').textContent = empresa.plan_id;
    document.getElementById('detalle-empresa-estado').textContent = empresa.activa ? 'Activa' : 'Inactiva';
    document.getElementById('detalle-empresa-usuarios').textContent = empresa.total_usuarios || 0;
    document.getElementById('detalle-empresa-clasificaciones').textContent = formatNumber(empresa.total_clasificaciones || 0);
    document.getElementById('detalle-empresa-tokens').textContent = 
        `${formatNumber(empresa.tokens_consumidos)} / ${formatNumber(empresa.tokens_limite_mensual)}`;
    document.getElementById('detalle-empresa-periodo').textContent = 
        `${empresa.periodo_inicio} al ${empresa.periodo_fin}`;
    
    // Renderizar historial
    renderHistorialConsumo(empresa.historial_consumo || []);
    
    modal.classList.add('active');
    
    // Guardar empresaId para usar en resetear tokens
    modal.dataset.empresaId = empresa.empresa_id;
}

function cerrarModalDetalle() {
    document.getElementById('modal-detalle-empresa').classList.remove('active');
}

function renderHistorialConsumo(historial) {
    const tbody = document.getElementById('table-historial-consumo');
    
    if (historial.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading-cell">No hay historial disponible</td></tr>';
        return;
    }
    
    tbody.innerHTML = historial.map(item => `
        <tr>
            <td>${item.mes}-${item.anio}</td>
            <td>${formatNumber(item.total_clasificaciones)}</td>
            <td>${formatNumber(item.total_tokens)}</td>
            <td>
                <span class="badge badge-${item.porcentaje_uso > 80 ? 'warning' : 'success'}">
                    ${item.porcentaje_uso.toFixed(1)}%
                </span>
            </td>
        </tr>
    `).join('');
}

async function resetearConsumo() {
    const modal = document.getElementById('modal-detalle-empresa');
    const empresaId = modal.dataset.empresaId;
    
    if (!confirm('¿Estás seguro de resetear el consumo mensual de esta empresa?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/empresas/${empresaId}/resetear-consumo`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Consumo reseteado exitosamente', 'success');
            cerrarModalDetalle();
            cargarEmpresas();
        } else {
            showNotification(data.mensaje || 'Error reseteando consumo', 'error');
        }
        
    } catch (error) {
        console.error('Error reseteando consumo:', error);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== GESTIÓN DE USUARIOS ====================

async function cargarUsuarios() {
    try {
        const rolFilter = document.getElementById('filter-usuario-rol').value;
        const estadoFilter = document.getElementById('filter-usuario-estado').value;
        
        let url = `${API_BASE_URL}/api/admin/usuarios?`;
        if (rolFilter) url += `rol=${rolFilter}&`;
        if (estadoFilter) url += `activo=${estadoFilter}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            usuariosData = data.usuarios;
            renderTablaUsuarios(data.usuarios);
        }
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        showNotification('Error cargando usuarios', 'error');
    }
}

function renderTablaUsuarios(usuarios) {
    const tbody = document.getElementById('table-usuarios');
    
    if (usuarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No hay usuarios registrados</td></tr>';
        return;
    }
    
    tbody.innerHTML = usuarios.map(usuario => `
        <tr>
            <td>
                <div>
                    <strong>${usuario.nombre}</strong><br>
                    <small style="color: #64748b;">${usuario.correo}</small>
                </div>
            </td>
            <td>${usuario.empresa_nombre || 'N/A'}</td>
            <td>
                <span class="badge badge-${usuario.rol === 'admin' ? 'warning' : 'info'}">
                    ${usuario.rol === 'admin' ? 'Admin' : 'Usuario'}
                </span>
            </td>
            <td>${formatNumber(usuario.total_clasificaciones || 0)}</td>
            <td>
                <span class="badge ${usuario.activo ? 'badge-success' : 'badge-danger'}">
                    ${usuario.activo ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn btn-edit" onclick="editarUsuario('${usuario.usuario_id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn ${usuario.activo ? 'btn-delete' : 'btn-view'}" 
                            onclick="toggleUsuario('${usuario.usuario_id}', ${!usuario.activo})" 
                            title="${usuario.activo ? 'Desactivar' : 'Activar'}">
                        <i class="fas fa-${usuario.activo ? 'ban' : 'check'}"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function mostrarModalUsuario(usuarioId = null) {
    const modal = document.getElementById('modal-usuario');
    const form = document.getElementById('form-usuario');
    const title = document.getElementById('modal-usuario-title');
    const passwordField = document.getElementById('usuario-password').parentElement;
    
    form.reset();
    
    if (usuarioId) {
        title.textContent = 'Editar Usuario';
        passwordField.querySelector('label').textContent = 'Nueva Contraseña (dejar vacío para no cambiar)';
        document.getElementById('usuario-password').required = false;
        
        // Cargar datos del usuario
        const usuario = usuariosData.find(u => u.usuario_id === usuarioId);
        if (usuario) {
            document.getElementById('usuario-nombre').value = usuario.nombre;
            document.getElementById('usuario-correo').value = usuario.correo;
            document.getElementById('usuario-rol').value = usuario.rol || 'user';
            document.getElementById('usuario-empresa').value = usuario.empresa_id;
        }
    } else {
        title.textContent = 'Nuevo Usuario';
        passwordField.querySelector('label').textContent = 'Contraseña';
        document.getElementById('usuario-password').required = true;
    }
    
    // Cargar empresas en el select
    cargarEmpresasSelect();
    
    modal.classList.add('active');
    
    form.onsubmit = async (e) => {
        e.preventDefault();
        await guardarUsuario(usuarioId);
    };
}

function cerrarModalUsuario() {
    document.getElementById('modal-usuario').classList.remove('active');
}

async function cargarEmpresasSelect() {
    const select = document.getElementById('usuario-empresa');
    
    // Si ya tenemos empresas cargadas
    if (empresasData.length > 0) {
        select.innerHTML = '<option value="">Seleccionar empresa...</option>' +
            empresasData
                .filter(e => e.activa)
                .map(e => `<option value="${e.empresa_id}">${e.nombre}</option>`)
                .join('');
    } else {
        // Cargar empresas activas
        try {
            const response = await fetch(`${API_BASE_URL}/api/admin/empresas?activa=true`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                select.innerHTML = '<option value="">Seleccionar empresa...</option>' +
                    data.empresas.map(e => `<option value="${e.empresa_id}">${e.nombre}</option>`).join('');
            }
        } catch (error) {
            console.error('Error cargando empresas:', error);
        }
    }
}

async function guardarUsuario(usuarioId) {
    const password = document.getElementById('usuario-password').value;
    
    const datos = {
        nombre: document.getElementById('usuario-nombre').value,
        correo: document.getElementById('usuario-correo').value,
        rol: document.getElementById('usuario-rol').value,
        empresa_id: document.getElementById('usuario-empresa').value
    };
    
    // Solo incluir password si se especificó
    if (password) {
        datos.password = password;
    }
    
    try {
        const url = usuarioId 
            ? `${API_BASE_URL}/api/admin/usuarios/${usuarioId}`
            : `${API_BASE_URL}/api/admin/usuarios`;
        
        const response = await fetch(url, {
            method: usuarioId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(datos)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.mensaje || 'Usuario guardado exitosamente', 'success');
            cerrarModalUsuario();
            cargarUsuarios();
        } else {
            showNotification(data.mensaje || 'Error guardando usuario', 'error');
        }
        
    } catch (error) {
        console.error('Error guardando usuario:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function editarUsuario(usuarioId) {
    mostrarModalUsuario(usuarioId);
}

async function toggleUsuario(usuarioId, nuevoEstado) {
    const accion = nuevoEstado ? 'activar' : 'desactivar';
    
    if (!confirm(`¿Estás seguro de ${accion} este usuario?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/usuarios/${usuarioId}/toggle`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ activo: nuevoEstado })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(data.mensaje, 'success');
            cargarUsuarios();
        } else {
            showNotification(data.mensaje || `Error al ${accion} usuario`, 'error');
        }
        
    } catch (error) {
        console.error('Error toggle usuario:', error);
        showNotification('Error de conexión', 'error');
    }
}

// ==================== PLANES ====================

async function cargarPlanes() {
    // Por ahora mostrar planes estáticos
    const planesContainer = document.getElementById('planes-container');
    
    const planes = [
        {
            id: 'Free',
            nombre: 'Plan Free',
            precio: '$0',
            tokens: '10,000',
            caracteristicas: [
                '10,000 tokens mensuales',
                '1 usuario',
                'Clasificaciones ilimitadas',
                'Soporte por email'
            ]
        },
        {
            id: 'Pro',
            nombre: 'Plan Pro',
            precio: '$49',
            tokens: '100,000',
            caracteristicas: [
                '100,000 tokens mensuales',
                'Hasta 5 usuarios',
                'Clasificaciones ilimitadas',
                'Soporte prioritario',
                'Historial de 6 meses'
            ],
            destacado: true
        },
        {
            id: 'Enterprise',
            nombre: 'Plan Enterprise',
            precio: 'Custom',
            tokens: 'Ilimitados',
            caracteristicas: [
                'Tokens personalizados',
                'Usuarios ilimitados',
                'Clasificaciones ilimitadas',
                'Soporte 24/7',
                'Historial completo',
                'API dedicada'
            ]
        }
    ];
    
    planesContainer.innerHTML = planes.map(plan => `
        <div class="plan-card ${plan.destacado ? 'destacado' : ''}">
            ${plan.destacado ? '<div class="plan-badge">Más popular</div>' : ''}
            <h3>${plan.nombre}</h3>
            <div class="plan-precio">${plan.precio}</div>
            <div class="plan-tokens">${plan.tokens} tokens/mes</div>
            <ul class="plan-features">
                ${plan.caracteristicas.map(c => `<li><i class="fas fa-check"></i> ${c}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

// ==================== UTILIDADES ====================

function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('es-MX').format(num);
}

function showNotification(message, type = 'info') {
    // Crear o obtener contenedor de notificaciones
    let container = document.getElementById('notifications-container');
    
    if (!container) {
        container = document.createElement('div');
        container.id = 'notifications-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
        `;
        document.body.appendChild(container);
    }
    
    // Crear notificación
    const notification = document.createElement('div');
    notification.style.cssText = `
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        margin-bottom: 10px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    // Auto-eliminar después de 3 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// Agregar estilos para animaciones
(function() {
    const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    
    .stat-mini {
        background: white;
        border-radius: 12px;
        padding: 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .stat-mini i {
        font-size: 24px;
        color: #3b82f6;
    }
    
    .stat-mini p {
        margin: 0;
        font-size: 12px;
        color: #6b7280;
    }
    
    .stat-mini h4 {
        margin: 4px 0 0 0;
        font-size: 20px;
        color: #1f2937;
    }
`;
    document.head.appendChild(style);
})();

// ==================== HISTORIAL ====================

let historialDataAdmin = [];
let historialPaginaActual = 1;
let historialPorPagina = 50;

async function cargarHistorialAdmin() {
    try {
        const empresaFiltro = document.getElementById('filter-historial-empresa').value;
        const tipoFiltro = document.getElementById('filter-historial-tipo').value;
        const desdeFiltro = document.getElementById('filter-historial-desde').value;
        const hastaFiltro = document.getElementById('filter-historial-hasta').value;
        
        // Construir query params
        const params = new URLSearchParams({
            pagina: historialPaginaActual,
            limite: historialPorPagina
        });
        
        if (empresaFiltro) params.append('empresa_id', empresaFiltro);
        if (tipoFiltro) params.append('tipo_operacion', tipoFiltro);
        if (desdeFiltro) params.append('desde', desdeFiltro);
        if (hastaFiltro) params.append('hasta', hastaFiltro);
        
        const response = await fetch(`${API_BASE_URL}/api/admin/historial?${params}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            historialDataAdmin = data.clasificaciones;
            mostrarHistorialAdmin(data.clasificaciones);
            mostrarEstadisticasHistorial(data.estadisticas);
            
            // Cargar empresas en el filtro si está vacío
            if (document.getElementById('filter-historial-empresa').options.length === 1) {
                await cargarEmpresasParaFiltro();
            }
        } else {
            showNotification(data.mensaje || 'Error al cargar historial', 'error');
        }
        
    } catch (error) {
        console.error('Error cargando historial admin:', error);
        showNotification('Error al cargar historial', 'error');
    }
}

function mostrarHistorialAdmin(clasificaciones) {
    const tbody = document.getElementById('table-historial-admin');
    
    if (!clasificaciones || clasificaciones.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #6b7280;">No hay clasificaciones</td></tr>';
        return;
    }
    
    tbody.innerHTML = clasificaciones.map(clf => {
        const fecha = new Date(clf.fecha_creacion).toLocaleString('es-ES', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        const tipo = clf.tipo_operacion === 'import' ? '📥 Import' : '📤 Export';
        const tokens = clf.tokens_consumidos ? clf.tokens_consumidos.toLocaleString() : '0';
        const productos = clf.productos?.length || 0;
        
        return `
            <tr>
                <td>${fecha}</td>
                <td><strong>${clf.empresa_nombre || clf.empresa_id}</strong></td>
                <td>${clf.usuario_nombre || clf.usuario_id}</td>
                <td>${clf.nombre_archivo}</td>
                <td>${tipo}</td>
                <td>${productos}</td>
                <td>⚡ ${tokens}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon btn-view" onclick="verDetalleClasificacionAdmin('${clf.clasificacion_id}')" title="Ver detalle">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon btn-download" onclick="descargarXMLAdmin('${clf.clasificacion_id}')" title="Descargar XML">
                            <i class="fas fa-file-code"></i>
                        </button>
                        <button class="btn-icon btn-download" onclick="descargarJSONAdmin('${clf.clasificacion_id}')" title="Descargar JSON">
                            <i class="fas fa-file-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function mostrarEstadisticasHistorial(stats) {
    if (!stats) return;
    
    document.getElementById('stat-historial-total').textContent = stats.total_clasificaciones?.toLocaleString() || '0';
    document.getElementById('stat-historial-empresas').textContent = stats.empresas_activas || '0';
    document.getElementById('stat-historial-tokens').textContent = stats.tokens_consumidos?.toLocaleString() || '0';
    document.getElementById('stat-historial-hoy').textContent = stats.clasificaciones_hoy || '0';
}

async function cargarEmpresasParaFiltro() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/empresas`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.empresas) {
            const select = document.getElementById('filter-historial-empresa');
            data.empresas.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.empresa_id;
                option.textContent = emp.nombre;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error cargando empresas para filtro:', error);
    }
}

function limpiarFiltrosHistorial() {
    document.getElementById('filter-historial-empresa').value = '';
    document.getElementById('filter-historial-tipo').value = '';
    document.getElementById('filter-historial-desde').value = '';
    document.getElementById('filter-historial-hasta').value = '';
    historialPaginaActual = 1;
    cargarHistorialAdmin();
}

// Variable global para almacenar resultado actual
let resultadoActualAdmin = null;

async function verDetalleClasificacionAdmin(clasificacionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/historial/${clasificacionId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (!data.success || !data.clasificacion) {
            showNotification('No se pudo cargar la clasificación', 'error');
            return;
        }
        
        const clf = data.clasificacion;
        resultadoActualAdmin = clf.resultado;
        
        // Crear modal con detalles completos
        const fecha = new Date(clf.fecha_creacion).toLocaleString('es-ES');
        const tipo = clf.tipo_operacion === 'import' ? 'Importación' : 'Exportación';
        const tokens = clf.tokens_consumidos ? clf.tokens_consumidos.toLocaleString() : 'N/A';
        
        let productosHTML = '';
        if (clf.productos && clf.productos.length > 0) {
            productosHTML = clf.productos.map((prod, idx) => `
                <div style="border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 12px; background: #f9fafb;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                        <h4 style="margin: 0; color: #1f2937; font-size: 16px;">Producto ${idx + 1}</h4>
                        <span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                            ${prod.HSCode || 'N/A'}
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 14px;">
                        <p style="margin: 4px 0;"><strong>Nombre:</strong> ${prod.ProductName || 'N/A'}</p>
                        <p style="margin: 4px 0;"><strong>Código:</strong> ${prod.ProductCode || 'N/A'}</p>
                    </div>
                </div>
            `).join('');
        } else {
            productosHTML = '<p style="color: #666; text-align: center; padding: 20px;">No hay productos clasificados</p>';
        }
        
        const modal = document.createElement('div');
        modal.id = 'modal-detalle-historial-admin';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 20px;';
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; max-width: 900px; width: 100%; max-height: 90vh; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); display: flex; flex-direction: column;">
                <div style="padding: 24px; border-bottom: 2px solid #e5e7eb; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: white; font-size: 22px; font-weight: 600;">
                            <i class="fas fa-file-invoice"></i> Detalle de Clasificación (Admin)
                        </h3>
                        <button onclick="cerrarModalDetalleAdmin()" style="background: rgba(255,255,255,0.2); border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 24px; cursor: pointer; color: white;">×</button>
                    </div>
                </div>
                
                <div style="flex: 1; overflow-y: auto; padding: 24px;">
                    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
                            <div>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Empresa</p>
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">${clf.empresa_nombre || clf.empresa_id}</p>
                            </div>
                            <div>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Usuario</p>
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">${clf.usuario_nombre || clf.usuario_id}</p>
                            </div>
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
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">${tipo === 'Importación' ? '📥' : '📤'} ${tipo}</p>
                            </div>
                            <div>
                                <p style="margin: 0 0 4px 0; font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 600;">Tokens</p>
                                <p style="margin: 0; font-size: 15px; color: #1f2937; font-weight: 500;">⚡ ${tokens}</p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <h4 style="margin: 0 0 12px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
                            Productos Clasificados (${clf.productos?.length || 0})
                        </h4>
                        ${productosHTML}
                    </div>
                </div>
                
                <div style="padding: 20px; border-top: 2px solid #e5e7eb; background: #f9fafb; display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="descargarXMLAdmin('${clasificacionId}')" style="background: #10b981; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-file-code"></i> Descargar XML
                    </button>
                    <button onclick="descargarJSONAdmin('${clasificacionId}')" style="background: #3b82f6; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-file-alt"></i> Descargar JSON
                    </button>
                    <button onclick="cerrarModalDetalleAdmin()" style="background: #6b7280; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-times"></i> Cerrar
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                cerrarModalDetalleAdmin();
            }
        });
        
    } catch (error) {
        console.error('Error cargando detalle:', error);
        showNotification('Error al cargar detalle', 'error');
    }
}

function cerrarModalDetalleAdmin() {
    const modal = document.getElementById('modal-detalle-historial-admin');
    if (modal) modal.remove();
}

async function descargarXMLAdmin(clasificacionId) {
    if (!resultadoActualAdmin) {
        // Cargar el resultado si no está en memoria
        await cargarResultadoParaDescarga(clasificacionId);
    }
    
    if (!resultadoActualAdmin) {
        showNotification('No se pudo cargar el resultado', 'error');
        return;
    }
    
    try {
        // Usar la función convertToXML del script.js global
        const xml = convertToXML(resultadoActualAdmin, 'ImportDUA');
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clasificacion_${clasificacionId}_${Date.now()}.xml`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('XML descargado exitosamente', 'success');
    } catch (error) {
        console.error('Error descargando XML:', error);
        showNotification('Error al generar XML', 'error');
    }
}

async function descargarJSONAdmin(clasificacionId) {
    if (!resultadoActualAdmin) {
        await cargarResultadoParaDescarga(clasificacionId);
    }
    
    if (!resultadoActualAdmin) {
        showNotification('No se pudo cargar el resultado', 'error');
        return;
    }
    
    try {
        const json = JSON.stringify(resultadoActualAdmin, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clasificacion_${clasificacionId}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('JSON descargado exitosamente', 'success');
    } catch (error) {
        console.error('Error descargando JSON:', error);
        showNotification('Error al generar JSON', 'error');
    }
}

async function cargarResultadoParaDescarga(clasificacionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/historial/${clasificacionId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.clasificacion) {
            resultadoActualAdmin = data.clasificacion.resultado;
        }
    } catch (error) {
        console.error('Error cargando resultado:', error);
    }
}

// ==================== GESTIÓN DE SESIONES ====================

async function cargarSesionesActivas() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/sesiones/activas`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Actualizar estadísticas
            document.getElementById('stat-sesiones-activas').textContent = data.total;
            
            // Contar usuarios únicos
            const usuariosUnicos = new Set(data.sesiones.map(s => s.usuario_correo)).size;
            document.getElementById('stat-usuarios-conectados').textContent = usuariosUnicos;
            
            // Contar IPs únicas
            const ipsUnicas = new Set(data.sesiones.map(s => s.ip)).size;
            document.getElementById('stat-ips-unicas').textContent = ipsUnicas;
            
            // Renderizar tabla
            const tbody = document.getElementById('table-sesiones-activas');
            
            if (data.sesiones.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No hay sesiones activas</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.sesiones.map(sesion => {
                const fechaLogin = new Date(sesion.ts_login);
                const ultimaActividad = new Date(sesion.ts_ultima_actividad);
                const tiempoActivo = calcularTiempoActivo(sesion.ts_login);
                
                return `
                    <tr>
                        <td>
                            <div class="user-cell">
                                <strong>${sesion.usuario_nombre}</strong>
                                <span class="user-email">${sesion.usuario_correo}</span>
                            </div>
                        </td>
                        <td>${sesion.empresa_nombre}</td>
                        <td><code>${sesion.ip}</code></td>
                        <td>${formatearFecha(fechaLogin)}</td>
                        <td>${formatearFecha(ultimaActividad)}</td>
                        <td><span class="badge badge-info">${tiempoActivo}</span></td>
                        <td>
                            <button class="btn-icon btn-danger" onclick="cerrarSesion('${sesion.sesion_id}')" title="Cerrar sesión">
                                <i class="fas fa-power-off"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            showNotification('Error al cargar sesiones', 'error');
        }
    } catch (error) {
        console.error('Error cargando sesiones activas:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function confirmarCerrarTodasSesiones() {
    if (!confirm('¿Estás seguro de cerrar TODAS las sesiones activas?\n\nEsto cerrará la sesión de todos los usuarios (excepto la tuya) y tendrán que volver a iniciar sesión.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/sesiones/limpiar-todas`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`✅ ${data.mensaje}`, 'success');
            await cargarSesionesActivas(); // Recargar lista
        } else {
            showNotification('Error al cerrar sesiones', 'error');
        }
    } catch (error) {
        console.error('Error cerrando todas las sesiones:', error);
        showNotification('Error de conexión', 'error');
    }
}

async function cerrarSesion(sesionId) {
    if (!confirm('¿Cerrar esta sesión?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/sesiones/${sesionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Sesión cerrada exitosamente', 'success');
            await cargarSesionesActivas(); // Recargar lista
        } else {
            showNotification(data.mensaje || 'Error al cerrar sesión', 'error');
        }
    } catch (error) {
        console.error('Error cerrando sesión:', error);
        showNotification('Error de conexión', 'error');
    }
}

function calcularTiempoActivo(tsLogin) {
    const ahora = new Date();
    const login = new Date(tsLogin);
    const diff = ahora - login;
    
    const horas = Math.floor(diff / 3600000);
    const minutos = Math.floor((diff % 3600000) / 60000);
    
    if (horas > 0) {
        return `${horas}h ${minutos}m`;
    } else {
        return `${minutos}m`;
    }
}

function formatearFecha(fecha) {
    return fecha.toLocaleString('es-DO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
