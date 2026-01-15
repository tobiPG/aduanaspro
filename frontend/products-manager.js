// ============================================
// MÓDULO DE GESTIÓN DE PRODUCTOS
// Visualización moderna y añadir productos manuales
// ============================================

// Estado de productos
let productosClasificados = [];
let productosEditados = new Map(); // Para trackear ediciones

/**
 * Renderiza los productos clasificados con el nuevo diseño
 */
function renderizarProductos(data) {
    const container = document.getElementById('results-content');
    if (!container) return;
    
    // Extraer productos del resultado
    productosClasificados = extraerProductos(data);
    
    // Crear HTML de la vista de productos
    const html = `
        <div class="products-container">
            <!-- Header -->
            <div class="products-header">
                <div class="products-header-left">
                    <h3><i class="fas fa-boxes-stacked"></i> Productos Clasificados</h3>
                    <span class="products-count-badge">${productosClasificados.length} ${productosClasificados.length === 1 ? 'item' : 'items'}</span>
                </div>
                <div class="products-header-right">
                    <button class="btn-add-product" onclick="abrirModalAgregarProducto()">
                        <i class="fas fa-plus"></i>
                        Añadir Producto
                    </button>
                </div>
            </div>
            
            <!-- Grid de productos -->
            <div class="products-grid" id="products-grid">
                ${productosClasificados.map((prod, idx) => renderizarTarjetaProducto(prod, idx)).join('')}
                <!-- Tarjeta para añadir -->
                <div class="product-card-add" onclick="abrirModalAgregarProducto()">
                    <i class="fas fa-plus-circle"></i>
                    <span>Añadir Producto Manual</span>
                    <small>Click para agregar un nuevo item</small>
                </div>
            </div>
            
            <!-- Resumen de totales -->
            ${renderizarResumenTotales(productosClasificados)}
        </div>
    `;
    
    container.innerHTML = html;
    
    // Mostrar botones de acción
    mostrarBotonesAccion();
}

/**
 * Extrae productos del resultado de clasificación
 */
function extraerProductos(data) {
    // Buscar en diferentes estructuras posibles
    if (data.ImpDeclarationProduct && Array.isArray(data.ImpDeclarationProduct)) {
        return data.ImpDeclarationProduct.map((p, i) => ({
            ...p,
            _index: i,
            _isManual: false
        }));
    }
    
    if (data.productos && Array.isArray(data.productos)) {
        return data.productos.map((p, i) => ({
            ...p,
            _index: i,
            _isManual: false
        }));
    }
    
    // Si es un solo producto
    if (data.hs || data.HSCode) {
        return [{
            ...data,
            _index: 0,
            _isManual: false
        }];
    }
    
    return [];
}

/**
 * Renderiza una tarjeta de producto individual
 * MEJORADO: Muestra TODOS los campos disponibles del producto
 */
function renderizarTarjetaProducto(producto, index) {
    // Buscar nombre en múltiples posibles campos
    const hsCode = obtenerValor(producto, 'HSCode', 'hs', 'codigo_hs', 'CodigoHS', 'Subpartida');
    const nombre = obtenerValor(producto, 
        'ProductName', 'descripcion_comercial', 'item_name', 'nombre', 'descripcion',
        'Description', 'ItemDescription', 'ProductDescription', 'Descripcion',
        'NombreProducto', 'producto', 'Product', 'DESCRIPCION'
    );
    const descripcionArancel = obtenerValor(producto, 
        'descripcion_arancelaria', 'TariffDescription', 'ArancelDescription',
        'DescripcionArancelaria', 'TariffDesc'
    );
    
    const isManual = producto._isManual === true;
    
    // Extraer TODOS los campos del producto para mostrarlos
    const camposExcluidos = ['_index', '_isManual', 'HSCode', 'hs', 'codigo_hs'];
    const todosLosCampos = extraerTodosLosCampos(producto, camposExcluidos);
    
    return `
        <div class="product-card ${isManual ? 'manual-product' : ''}" data-product-index="${index}">
            <!-- Header -->
            <div class="product-card-header">
                <div class="product-number-badge">${index + 1}</div>
                <div class="product-hs-info">
                    <div class="product-hs-code">${formatearCodigoHS(hsCode)}</div>
                    <div class="product-hs-label">Código Arancelario</div>
                </div>
            </div>
            
            <!-- Body -->
            <div class="product-card-body">
                <!-- Nombre del producto -->
                <div class="product-name-section">
                    <div class="product-name">${escapeHtml(nombre || descripcionArancel || 'Producto ' + (index + 1))}</div>
                    ${descripcionArancel && nombre ? `<div class="product-description">${escapeHtml(descripcionArancel)}</div>` : ''}
                </div>
                
                <!-- TODOS los campos disponibles -->
                <div class="product-details-grid">
                    ${todosLosCampos.map(campo => `
                        <div class="product-detail-item ${campo.esLargo ? 'full-width' : ''}" 
                             onclick="editarCampoProducto(${index}, '${campo.key}', '${escapeHtml(campo.label)}')">
                            <div class="product-detail-label">
                                <i class="fas ${obtenerIconoCampo(campo.key)}"></i> ${escapeHtml(campo.label)}
                            </div>
                            <div class="product-detail-value ${campo.esMoney ? 'money' : ''}">${formatearValorCampo(campo.key, campo.value)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- Acciones -->
            <div class="product-card-actions">
                <button class="product-action-btn edit" onclick="editarProductoCompleto(${index})">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button class="product-action-btn duplicate" onclick="duplicarProducto(${index})">
                    <i class="fas fa-copy"></i> Duplicar
                </button>
                <button class="product-action-btn delete" onclick="eliminarProducto(${index})">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            </div>
        </div>
    `;
}

/**
 * Renderiza el resumen de totales
 */
function renderizarResumenTotales(productos) {
    const totalItems = productos.length;
    const totalFOB = productos.reduce((sum, p) => {
        const valor = parseFloat(obtenerValor(p, 'FOBValue', 'valor_fob', 'valor_unitario', 'value') || 0);
        const cant = parseFloat(obtenerValor(p, 'Qty', 'cantidad', 'quantity') || 1);
        return sum + (valor * cant);
    }, 0);
    const totalPeso = productos.reduce((sum, p) => {
        return sum + parseFloat(obtenerValor(p, 'NetWeight', 'Weight', 'peso_neto') || 0);
    }, 0);
    
    return `
        <div class="products-summary">
            <div class="products-summary-title">
                <i class="fas fa-calculator"></i> Resumen de Totales
            </div>
            <div class="products-summary-grid">
                <div class="summary-item">
                    <div class="summary-item-label">Total Items</div>
                    <div class="summary-item-value">${totalItems}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-item-label">Valor FOB Total</div>
                    <div class="summary-item-value highlight">${formatearMoneda(totalFOB)}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-item-label">Peso Total</div>
                    <div class="summary-item-value">${totalPeso.toFixed(2)} kg</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Muestra botones de acción principales
 */
function mostrarBotonesAccion() {
    // Eliminar existentes
    const existingActions = document.getElementById('results-actions');
    if (existingActions) existingActions.remove();
    
    const actionsContainer = document.createElement('div');
    actionsContainer.id = 'results-actions';
    actionsContainer.style.cssText = 'margin: 20px 0; padding: 20px; background: white; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);';
    
    actionsContainer.innerHTML = `
        <div style="text-align: center;">
            <p style="color: #64748b; margin-bottom: 15px; font-size: 0.95rem;">
                <i class="fas fa-info-circle" style="color: #3b82f6;"></i>
                Haz clic en cualquier campo para editarlo. Añade productos manuales con el botón verde.
            </p>
            <div style="display: flex; justify-content: center; gap: 15px; flex-wrap: wrap;">
                <button onclick="abrirModalAgregarProducto()" style="
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    font-size: 1rem;
                    border-radius: 12px;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    <i class="fas fa-plus"></i> Añadir Producto
                </button>
                <button onclick="window.exportarXML()" style="
                    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    font-size: 1rem;
                    border-radius: 12px;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    <i class="fas fa-download"></i> Descargar XML
                </button>
            </div>
        </div>
    `;
    
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.appendChild(actionsContainer);
    }
}

// ============================================
// MODAL PARA AÑADIR/EDITAR PRODUCTOS
// ============================================

let productoEditandoIndex = null;

/**
 * Abre el modal para agregar un nuevo producto
 */
function abrirModalAgregarProducto() {
    productoEditandoIndex = null;
    mostrarModalProducto({
        titulo: 'Añadir Nuevo Producto',
        producto: {},
        botonTexto: 'Añadir Producto'
    });
}

/**
 * Abre el modal para editar un producto existente
 */
function editarProductoCompleto(index) {
    productoEditandoIndex = index;
    const producto = productosClasificados[index];
    
    mostrarModalProducto({
        titulo: `Editar Producto #${index + 1}`,
        producto: producto,
        botonTexto: 'Guardar Cambios'
    });
}

/**
 * Muestra el modal de producto
 */
function mostrarModalProducto({ titulo, producto, botonTexto }) {
    // Crear modal si no existe
    let modalOverlay = document.getElementById('product-modal-overlay');
    
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'product-modal-overlay';
        modalOverlay.className = 'product-modal-overlay';
        document.body.appendChild(modalOverlay);
    }
    
    // Obtener valores actuales
    const hsCode = obtenerValor(producto, 'HSCode', 'hs', 'codigo_hs') || '';
    const nombre = obtenerValor(producto, 'ProductName', 'descripcion_comercial', 'item_name', 'nombre') || '';
    const cantidad = obtenerValor(producto, 'Qty', 'cantidad', 'quantity') || '';
    const unidad = obtenerValor(producto, 'UnitMeasure', 'StatisticalUnitCode', 'unidad_medida_estadistica') || 'KGM';
    const valorFOB = obtenerValor(producto, 'FOBValue', 'valor_fob', 'valor_unitario') || '';
    const pesoNeto = obtenerValor(producto, 'NetWeight', 'Weight', 'peso_neto') || '';
    const pesoBruto = obtenerValor(producto, 'GrossWeight', 'peso_bruto') || '';
    const paisOrigen = obtenerValor(producto, 'OriginCountryCode', 'OriginCountry', 'pais_origen') || '';
    const marca = obtenerValor(producto, 'Brand', 'marca') || '';
    const modelo = obtenerValor(producto, 'Model', 'modelo') || '';
    const descripcion = obtenerValor(producto, 'descripcion_arancelaria', 'TariffDescription') || '';
    
    modalOverlay.innerHTML = `
        <div class="product-modal">
            <div class="product-modal-header">
                <h3><i class="fas fa-box"></i> ${titulo}</h3>
                <button class="product-modal-close" onclick="cerrarModalProducto()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="product-modal-body">
                <div class="product-form-grid">
                    <!-- Código HS -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-barcode"></i>
                            Código HS <span class="required">*</span>
                        </label>
                        <input type="text" id="modal-hs-code" value="${escapeHtml(hsCode)}" 
                               placeholder="Ej: 8471.30.00" maxlength="12">
                    </div>
                    
                    <!-- Cantidad -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-hashtag"></i>
                            Cantidad <span class="required">*</span>
                        </label>
                        <input type="number" id="modal-cantidad" value="${cantidad}" 
                               placeholder="Ej: 10" min="0.01" step="0.01">
                    </div>
                    
                    <!-- Nombre del Producto -->
                    <div class="product-form-group full-width">
                        <label>
                            <i class="fas fa-tag"></i>
                            Nombre / Descripción Comercial <span class="required">*</span>
                        </label>
                        <input type="text" id="modal-nombre" value="${escapeHtml(nombre)}" 
                               placeholder="Descripción del producto">
                    </div>
                    
                    <!-- Valor FOB -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-dollar-sign"></i>
                            Valor FOB (USD)
                        </label>
                        <input type="number" id="modal-valor-fob" value="${valorFOB}" 
                               placeholder="Ej: 1500.00" min="0" step="0.01">
                    </div>
                    
                    <!-- Unidad de Medida -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-ruler"></i>
                            Unidad de Medida
                        </label>
                        <select id="modal-unidad">
                            <option value="KGM" ${unidad === 'KGM' ? 'selected' : ''}>Kilogramos (KGM)</option>
                            <option value="UND" ${unidad === 'UND' ? 'selected' : ''}>Unidades (UND)</option>
                            <option value="MTR" ${unidad === 'MTR' ? 'selected' : ''}>Metros (MTR)</option>
                            <option value="LTR" ${unidad === 'LTR' ? 'selected' : ''}>Litros (LTR)</option>
                            <option value="PAR" ${unidad === 'PAR' ? 'selected' : ''}>Pares (PAR)</option>
                            <option value="DOC" ${unidad === 'DOC' ? 'selected' : ''}>Docenas (DOC)</option>
                            <option value="M2" ${unidad === 'M2' ? 'selected' : ''}>Metros Cuadrados (M2)</option>
                            <option value="M3" ${unidad === 'M3' ? 'selected' : ''}>Metros Cúbicos (M3)</option>
                        </select>
                    </div>
                    
                    <!-- Peso Neto -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-weight-hanging"></i>
                            Peso Neto (kg)
                        </label>
                        <input type="number" id="modal-peso-neto" value="${pesoNeto}" 
                               placeholder="Ej: 25.5" min="0" step="0.01">
                    </div>
                    
                    <!-- Peso Bruto -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-weight"></i>
                            Peso Bruto (kg)
                        </label>
                        <input type="number" id="modal-peso-bruto" value="${pesoBruto}" 
                               placeholder="Ej: 28.0" min="0" step="0.01">
                    </div>
                    
                    <!-- País de Origen -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-globe"></i>
                            País de Origen
                        </label>
                        <select id="modal-pais-origen">
                            <option value="">Seleccionar...</option>
                            <option value="US" ${paisOrigen === 'US' || paisOrigen === '840' ? 'selected' : ''}>Estados Unidos</option>
                            <option value="CN" ${paisOrigen === 'CN' || paisOrigen === '156' ? 'selected' : ''}>China</option>
                            <option value="DE" ${paisOrigen === 'DE' || paisOrigen === '276' ? 'selected' : ''}>Alemania</option>
                            <option value="JP" ${paisOrigen === 'JP' || paisOrigen === '392' ? 'selected' : ''}>Japón</option>
                            <option value="KR" ${paisOrigen === 'KR' || paisOrigen === '410' ? 'selected' : ''}>Corea del Sur</option>
                            <option value="MX" ${paisOrigen === 'MX' || paisOrigen === '484' ? 'selected' : ''}>México</option>
                            <option value="BR" ${paisOrigen === 'BR' || paisOrigen === '076' ? 'selected' : ''}>Brasil</option>
                            <option value="ES" ${paisOrigen === 'ES' || paisOrigen === '724' ? 'selected' : ''}>España</option>
                            <option value="IT" ${paisOrigen === 'IT' || paisOrigen === '380' ? 'selected' : ''}>Italia</option>
                            <option value="FR" ${paisOrigen === 'FR' || paisOrigen === '250' ? 'selected' : ''}>Francia</option>
                            <option value="GB" ${paisOrigen === 'GB' || paisOrigen === '826' ? 'selected' : ''}>Reino Unido</option>
                            <option value="TW" ${paisOrigen === 'TW' || paisOrigen === '158' ? 'selected' : ''}>Taiwán</option>
                            <option value="IN" ${paisOrigen === 'IN' || paisOrigen === '356' ? 'selected' : ''}>India</option>
                            <option value="VN" ${paisOrigen === 'VN' || paisOrigen === '704' ? 'selected' : ''}>Vietnam</option>
                            <option value="OTHER" ${!['US','CN','DE','JP','KR','MX','BR','ES','IT','FR','GB','TW','IN','VN','840','156','276','392','410','484','076','724','380','250','826','158','356','704'].includes(paisOrigen) && paisOrigen ? 'selected' : ''}>Otro</option>
                        </select>
                    </div>
                    
                    <!-- Marca -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-copyright"></i>
                            Marca
                        </label>
                        <input type="text" id="modal-marca" value="${escapeHtml(marca)}" 
                               placeholder="Ej: Samsung, Apple, etc.">
                    </div>
                    
                    <!-- Modelo -->
                    <div class="product-form-group">
                        <label>
                            <i class="fas fa-info-circle"></i>
                            Modelo
                        </label>
                        <input type="text" id="modal-modelo" value="${escapeHtml(modelo)}" 
                               placeholder="Ej: XPS 15, Galaxy S23">
                    </div>
                    
                    <!-- Descripción Arancelaria -->
                    <div class="product-form-group full-width">
                        <label>
                            <i class="fas fa-file-alt"></i>
                            Descripción Arancelaria
                        </label>
                        <textarea id="modal-descripcion" placeholder="Descripción según el arancel...">${escapeHtml(descripcion)}</textarea>
                    </div>
                </div>
            </div>
            
            <div class="product-modal-footer">
                <button class="btn-modal cancel" onclick="cerrarModalProducto()">
                    <i class="fas fa-times"></i> Cancelar
                </button>
                <button class="btn-modal save" onclick="guardarProductoModal()">
                    <i class="fas fa-check"></i> ${botonTexto}
                </button>
            </div>
        </div>
    `;
    
    // Mostrar modal
    setTimeout(() => {
        modalOverlay.classList.add('active');
    }, 10);
    
    // Enfocar el primer campo
    setTimeout(() => {
        document.getElementById('modal-hs-code')?.focus();
    }, 300);
}

/**
 * Cierra el modal de producto
 */
function cerrarModalProducto() {
    const modalOverlay = document.getElementById('product-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('active');
    }
    productoEditandoIndex = null;
}

/**
 * Guarda el producto desde el modal (nuevo o editado)
 */
function guardarProductoModal() {
    // Obtener valores del formulario
    const hsCode = document.getElementById('modal-hs-code')?.value.trim();
    const nombre = document.getElementById('modal-nombre')?.value.trim();
    const cantidad = document.getElementById('modal-cantidad')?.value;
    
    // Validar campos obligatorios
    if (!hsCode) {
        showNotification('El código HS es obligatorio', 'error');
        document.getElementById('modal-hs-code')?.focus();
        return;
    }
    
    if (!nombre) {
        showNotification('El nombre del producto es obligatorio', 'error');
        document.getElementById('modal-nombre')?.focus();
        return;
    }
    
    if (!cantidad || parseFloat(cantidad) <= 0) {
        showNotification('La cantidad debe ser mayor a 0', 'error');
        document.getElementById('modal-cantidad')?.focus();
        return;
    }
    
    // Crear objeto de producto
    const nuevoProducto = {
        HSCode: hsCode,
        ProductName: nombre,
        descripcion_comercial: nombre,
        Qty: parseFloat(cantidad),
        cantidad: parseFloat(cantidad),
        StatisticalUnitCode: document.getElementById('modal-unidad')?.value || 'KGM',
        UnitMeasure: document.getElementById('modal-unidad')?.value || 'KGM',
        FOBValue: parseFloat(document.getElementById('modal-valor-fob')?.value) || 0,
        valor_fob: parseFloat(document.getElementById('modal-valor-fob')?.value) || 0,
        NetWeight: parseFloat(document.getElementById('modal-peso-neto')?.value) || 0,
        Weight: parseFloat(document.getElementById('modal-peso-neto')?.value) || 0,
        peso_neto: parseFloat(document.getElementById('modal-peso-neto')?.value) || 0,
        GrossWeight: parseFloat(document.getElementById('modal-peso-bruto')?.value) || 0,
        peso_bruto: parseFloat(document.getElementById('modal-peso-bruto')?.value) || 0,
        OriginCountryCode: document.getElementById('modal-pais-origen')?.value || '',
        pais_origen: document.getElementById('modal-pais-origen')?.value || '',
        Brand: document.getElementById('modal-marca')?.value.trim() || '',
        marca: document.getElementById('modal-marca')?.value.trim() || '',
        Model: document.getElementById('modal-modelo')?.value.trim() || '',
        modelo: document.getElementById('modal-modelo')?.value.trim() || '',
        descripcion_arancelaria: document.getElementById('modal-descripcion')?.value.trim() || '',
        TariffDescription: document.getElementById('modal-descripcion')?.value.trim() || '',
        ProductStatusCode: 'IC04-001',
        TempProductYN: false,
        OrganicYN: false,
        _isManual: productoEditandoIndex === null
    };
    
    // Agregar o actualizar
    if (productoEditandoIndex !== null) {
        // Actualizar existente
        productosClasificados[productoEditandoIndex] = {
            ...productosClasificados[productoEditandoIndex],
            ...nuevoProducto,
            _isManual: productosClasificados[productoEditandoIndex]._isManual // Mantener estado manual
        };
        showNotification(`Producto #${productoEditandoIndex + 1} actualizado`, 'success');
    } else {
        // Agregar nuevo
        nuevoProducto._index = productosClasificados.length;
        productosClasificados.push(nuevoProducto);
        showNotification('Producto añadido correctamente', 'success');
    }
    
    // Actualizar resultadoActual para exportación
    actualizarResultadoActual();
    
    // Cerrar modal y re-renderizar
    cerrarModalProducto();
    actualizarVistaProductos();
}

/**
 * Duplica un producto
 */
function duplicarProducto(index) {
    const productoOriginal = productosClasificados[index];
    const productoDuplicado = {
        ...productoOriginal,
        _index: productosClasificados.length,
        _isManual: true
    };
    
    productosClasificados.push(productoDuplicado);
    actualizarResultadoActual();
    actualizarVistaProductos();
    showNotification('Producto duplicado correctamente', 'success');
}

/**
 * Elimina un producto
 */
function eliminarProducto(index) {
    if (productosClasificados.length === 1) {
        showNotification('Debe haber al menos un producto', 'warning');
        return;
    }
    
    if (confirm(`¿Eliminar el producto #${index + 1}?`)) {
        productosClasificados.splice(index, 1);
        // Re-indexar
        productosClasificados.forEach((p, i) => p._index = i);
        
        actualizarResultadoActual();
        actualizarVistaProductos();
        showNotification('Producto eliminado', 'info');
    }
}

/**
 * Actualiza la vista de productos
 */
function actualizarVistaProductos() {
    const grid = document.getElementById('products-grid');
    if (!grid) {
        // Si no existe el grid, re-renderizar todo
        renderizarProductos({ ImpDeclarationProduct: productosClasificados });
        return;
    }
    
    grid.innerHTML = `
        ${productosClasificados.map((prod, idx) => renderizarTarjetaProducto(prod, idx)).join('')}
        <div class="product-card-add" onclick="abrirModalAgregarProducto()">
            <i class="fas fa-plus-circle"></i>
            <span>Añadir Producto Manual</span>
            <small>Click para agregar un nuevo item</small>
        </div>
    `;
    
    // Actualizar contador
    const badge = document.querySelector('.products-count-badge');
    if (badge) {
        badge.textContent = `${productosClasificados.length} ${productosClasificados.length === 1 ? 'item' : 'items'}`;
    }
    
    // Actualizar resumen
    const container = document.querySelector('.products-container');
    if (container) {
        const oldSummary = container.querySelector('.products-summary');
        if (oldSummary) oldSummary.remove();
        container.insertAdjacentHTML('beforeend', renderizarResumenTotales(productosClasificados));
    }
}

/**
 * Actualiza resultadoActual con los productos modificados
 */
function actualizarResultadoActual() {
    if (!window.resultadoActual) {
        window.resultadoActual = {};
    }
    
    // Actualizar el array de productos
    window.resultadoActual.ImpDeclarationProduct = productosClasificados.map(p => {
        // Limpiar propiedades internas
        const { _index, _isManual, ...productoLimpio } = p;
        return productoLimpio;
    });
    
    // También actualizar editedClassification si existe
    if (typeof window.editedClassification !== 'undefined') {
        window.editedClassification = window.resultadoActual;
    }
    
    console.log('📊 resultadoActual actualizado con', productosClasificados.length, 'productos');
}

/**
 * Edita un campo específico de un producto (inline)
 */
function editarCampoProducto(index, campo, label) {
    const producto = productosClasificados[index];
    const valorActual = obtenerValor(producto, campo) || '';
    
    // Crear prompt simple para edición rápida
    const nuevoValor = prompt(`Editar ${label}:`, valorActual);
    
    if (nuevoValor !== null && nuevoValor !== valorActual) {
        // Actualizar el campo
        productosClasificados[index][campo] = nuevoValor;
        
        // Mapear a campos alternativos según el campo
        const mapeoCampos = {
            'HSCode': ['hs', 'codigo_hs'],
            'ProductName': ['descripcion_comercial', 'item_name', 'nombre'],
            'Qty': ['cantidad', 'quantity'],
            'FOBValue': ['valor_fob', 'valor_unitario'],
            'NetWeight': ['Weight', 'peso_neto'],
            'OriginCountryCode': ['OriginCountry', 'pais_origen']
        };
        
        if (mapeoCampos[campo]) {
            mapeoCampos[campo].forEach(k => {
                productosClasificados[index][k] = nuevoValor;
            });
        }
        
        actualizarResultadoActual();
        actualizarVistaProductos();
        showNotification(`${label} actualizado`, 'success');
    }
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Obtiene un valor de un objeto buscando en múltiples claves
 */
function obtenerValor(obj, ...keys) {
    if (!obj) return null;
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
            return obj[key];
        }
    }
    return null;
}

/**
 * Formatea código HS
 */
function formatearCodigoHS(codigo) {
    if (!codigo) return 'N/A';
    let str = String(codigo).replace(/\D/g, '');
    str = str.padEnd(8, '0');
    if (str.length >= 8) {
        return `${str.substring(0, 4)}.${str.substring(4, 6)}.${str.substring(6, 8)}`;
    }
    return str;
}

/**
 * Formatea moneda
 */
function formatearMoneda(valor) {
    const num = parseFloat(valor);
    if (isNaN(num)) return '$0.00';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Escape HTML
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Extrae TODOS los campos de un producto para mostrarlos
 */
function extraerTodosLosCampos(producto, excluir = []) {
    const campos = [];
    
    // Mapeo de nombres técnicos a etiquetas legibles
    const etiquetas = {
        // Identificación
        'HSCode': 'Código HS',
        'hs': 'Código HS',
        'ProductStatusCode': 'Estado Producto',
        'ItemNo': 'Número Item',
        'LineNo': 'Línea',
        
        // Descripción
        'ProductName': 'Nombre Producto',
        'descripcion_comercial': 'Descripción Comercial',
        'item_name': 'Nombre Item',
        'Description': 'Descripción',
        'descripcion_arancelaria': 'Descripción Arancelaria',
        'TariffDescription': 'Descripción Arancel',
        
        // Cantidades
        'Qty': 'Cantidad',
        'cantidad': 'Cantidad',
        'quantity': 'Cantidad',
        'StatisticalQty': 'Cantidad Estadística',
        'PackageQty': 'Cantidad Bultos',
        
        // Unidades
        'UnitMeasure': 'Unidad Medida',
        'StatisticalUnitCode': 'Unidad Estadística',
        'unidad_medida_estadistica': 'Unidad Estadística',
        'PackageUnitCode': 'Unidad Empaque',
        
        // Valores monetarios
        'FOBValue': 'Valor FOB',
        'valor_fob': 'Valor FOB',
        'valor_unitario': 'Valor Unitario',
        'CIFValue': 'Valor CIF',
        'UnitPrice': 'Precio Unitario',
        'TotalValue': 'Valor Total',
        'InsuranceValue': 'Valor Seguro',
        'FreightValue': 'Valor Flete',
        
        // Pesos
        'NetWeight': 'Peso Neto (kg)',
        'Weight': 'Peso (kg)',
        'peso_neto': 'Peso Neto (kg)',
        'GrossWeight': 'Peso Bruto (kg)',
        'peso_bruto': 'Peso Bruto (kg)',
        
        // Origen
        'OriginCountryCode': 'País Origen',
        'OriginCountry': 'País Origen',
        'pais_origen': 'País Origen',
        'country_of_origin': 'País Origen',
        'ProvenanceCountryCode': 'País Procedencia',
        'pais_procedencia': 'País Procedencia',
        
        // Marca/Modelo
        'Brand': 'Marca',
        'marca': 'Marca',
        'Model': 'Modelo',
        'modelo': 'Modelo',
        'Specification': 'Especificación',
        'especificacion': 'Especificación',
        
        // Impuestos
        'DAI': 'DAI (%)',
        'dai': 'DAI (%)',
        'ITBIS': 'ITBIS (%)',
        'itbis': 'ITBIS (%)',
        'ISC': 'ISC (%)',
        'isc': 'ISC (%)',
        'TaxRate': 'Tasa Impuesto',
        
        // Booleanos
        'TempProductYN': 'Producto Temporal',
        'OrganicYN': 'Producto Orgánico',
        'CertificateYN': 'Requiere Certificado',
        'UsedYN': 'Usado',
        
        // Otros
        'Remark': 'Observaciones',
        'observaciones': 'Observaciones',
        'notes': 'Notas',
        'Currency': 'Moneda',
        'moneda': 'Moneda',
        'Incoterm': 'Incoterm',
        'incoterm': 'Incoterm',
        'AgreementCode': 'Código Acuerdo',
        'PreferencialCode': 'Código Preferencial'
    };
    
    // Campos que son valores monetarios
    const camposMoney = ['FOBValue', 'valor_fob', 'valor_unitario', 'CIFValue', 'UnitPrice', 'TotalValue', 'InsuranceValue', 'FreightValue'];
    
    // Campos que necesitan ancho completo (textos largos)
    const camposLargos = ['ProductName', 'descripcion_comercial', 'Description', 'descripcion_arancelaria', 'TariffDescription', 'Remark', 'observaciones', 'Specification'];
    
    // Orden preferido de campos
    const ordenCampos = [
        'ProductName', 'descripcion_comercial', 'item_name', 'Description',
        'Qty', 'cantidad', 'StatisticalQty',
        'FOBValue', 'valor_fob', 'UnitPrice', 'TotalValue',
        'NetWeight', 'peso_neto', 'GrossWeight', 'peso_bruto',
        'OriginCountryCode', 'pais_origen', 'ProvenanceCountryCode',
        'Brand', 'marca', 'Model', 'modelo',
        'UnitMeasure', 'StatisticalUnitCode',
        'DAI', 'dai', 'ITBIS', 'itbis', 'ISC', 'isc',
        'Currency', 'Incoterm',
        'TempProductYN', 'OrganicYN',
        'Remark', 'observaciones'
    ];
    
    // Crear Set de campos ya procesados para evitar duplicados
    const procesados = new Set();
    
    // Primero procesar campos en orden preferido
    for (const key of ordenCampos) {
        if (producto[key] !== undefined && producto[key] !== null && producto[key] !== '' && !excluir.includes(key)) {
            if (!procesados.has(etiquetas[key] || key)) {
                campos.push({
                    key: key,
                    label: etiquetas[key] || formatearNombreCampo(key),
                    value: producto[key],
                    esMoney: camposMoney.includes(key),
                    esLargo: camposLargos.includes(key)
                });
                procesados.add(etiquetas[key] || key);
            }
        }
    }
    
    // Luego procesar campos restantes que no están en el orden preferido
    for (const [key, value] of Object.entries(producto)) {
        if (value !== undefined && value !== null && value !== '' && 
            !excluir.includes(key) && !ordenCampos.includes(key) &&
            typeof value !== 'object') {
            
            const label = etiquetas[key] || formatearNombreCampo(key);
            if (!procesados.has(label)) {
                campos.push({
                    key: key,
                    label: label,
                    value: value,
                    esMoney: camposMoney.includes(key),
                    esLargo: String(value).length > 50
                });
                procesados.add(label);
            }
        }
    }
    
    return campos;
}

/**
 * Formatea el nombre de un campo técnico a legible
 */
function formatearNombreCampo(key) {
    return key
        .replace(/([A-Z])/g, ' $1') // Separar CamelCase
        .replace(/_/g, ' ') // Reemplazar guiones bajos
        .replace(/\b\w/g, l => l.toUpperCase()) // Capitalizar
        .trim();
}

/**
 * Obtiene el icono FontAwesome apropiado para un campo
 */
function obtenerIconoCampo(key) {
    const iconos = {
        // Cantidades
        'Qty': 'fa-hashtag',
        'cantidad': 'fa-hashtag',
        'quantity': 'fa-hashtag',
        'StatisticalQty': 'fa-chart-bar',
        'PackageQty': 'fa-boxes',
        
        // Valores
        'FOBValue': 'fa-dollar-sign',
        'valor_fob': 'fa-dollar-sign',
        'valor_unitario': 'fa-dollar-sign',
        'CIFValue': 'fa-money-bill',
        'UnitPrice': 'fa-tag',
        'TotalValue': 'fa-calculator',
        
        // Pesos
        'NetWeight': 'fa-weight-hanging',
        'Weight': 'fa-weight-hanging',
        'peso_neto': 'fa-weight-hanging',
        'GrossWeight': 'fa-weight',
        'peso_bruto': 'fa-weight',
        
        // Origen
        'OriginCountryCode': 'fa-globe',
        'OriginCountry': 'fa-globe',
        'pais_origen': 'fa-globe',
        'ProvenanceCountryCode': 'fa-map-marker-alt',
        
        // Marca/Modelo
        'Brand': 'fa-copyright',
        'marca': 'fa-copyright',
        'Model': 'fa-barcode',
        'modelo': 'fa-barcode',
        
        // Unidades
        'UnitMeasure': 'fa-ruler',
        'StatisticalUnitCode': 'fa-ruler-combined',
        
        // Impuestos
        'DAI': 'fa-percent',
        'dai': 'fa-percent',
        'ITBIS': 'fa-percent',
        'itbis': 'fa-percent',
        'ISC': 'fa-percent',
        
        // Otros
        'Currency': 'fa-coins',
        'moneda': 'fa-coins',
        'Incoterm': 'fa-ship',
        'Remark': 'fa-sticky-note',
        'ProductName': 'fa-box',
        'Description': 'fa-file-alt'
    };
    
    return iconos[key] || 'fa-info-circle';
}

/**
 * Formatea el valor de un campo según su tipo
 */
function formatearValorCampo(key, value) {
    if (value === null || value === undefined || value === '') {
        return '<span class="empty">-</span>';
    }
    
    // Campos monetarios
    const camposMoney = ['FOBValue', 'valor_fob', 'valor_unitario', 'CIFValue', 'UnitPrice', 'TotalValue', 'InsuranceValue', 'FreightValue'];
    if (camposMoney.includes(key)) {
        return formatearMoneda(value);
    }
    
    // Campos de peso
    const camposPeso = ['NetWeight', 'Weight', 'peso_neto', 'GrossWeight', 'peso_bruto'];
    if (camposPeso.includes(key) && value) {
        return `${value} kg`;
    }
    
    // Campos de porcentaje
    const camposPorcentaje = ['DAI', 'dai', 'ITBIS', 'itbis', 'ISC', 'isc', 'TaxRate'];
    if (camposPorcentaje.includes(key) && value) {
        return `${value}%`;
    }
    
    // Booleanos
    if (value === true || value === 'true') {
        return '<span style="color: #10b981;"><i class="fas fa-check"></i> Sí</span>';
    }
    if (value === false || value === 'false') {
        return '<span style="color: #94a3b8;"><i class="fas fa-times"></i> No</span>';
    }
    
    return escapeHtml(String(value));
}

// Exportar funciones globalmente
window.renderizarProductos = renderizarProductos;
window.abrirModalAgregarProducto = abrirModalAgregarProducto;
window.editarProductoCompleto = editarProductoCompleto;
window.cerrarModalProducto = cerrarModalProducto;
window.guardarProductoModal = guardarProductoModal;
window.duplicarProducto = duplicarProducto;
window.eliminarProducto = eliminarProducto;
window.editarCampoProducto = editarCampoProducto;
window.productosClasificados = productosClasificados;
window.actualizarResultadoActual = actualizarResultadoActual;
