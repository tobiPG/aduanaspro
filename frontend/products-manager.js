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
function renderizarProductos(data, esActualizacion = false) {
    const container = document.getElementById('results-content');
    if (!container) return;
    
    // Extraer productos del resultado (preserva todos los campos originales)
    productosClasificados = extraerProductos(data);
    
    // IMPORTANTE: Sincronizar con window para preservar datos originales
    window.productosClasificados = productosClasificados;
    
    // Solo guardar _productosOriginales si es la PRIMERA carga (no una actualización)
    // Esto es crítico para no perder campos de la API (Description, UnitPriceUSD, etc.)
    if (!esActualizacion || !window._productosOriginales || window._productosOriginales.length === 0) {
        window._productosOriginales = JSON.parse(JSON.stringify(productosClasificados));
        console.log('📦 Productos ORIGINALES guardados:', window._productosOriginales.length);
        if (window._productosOriginales[0]) {
            console.log('📦 Campos del primer producto original:', Object.keys(window._productosOriginales[0]));
        }
    } else {
        console.log('📦 Preservando _productosOriginales existentes:', window._productosOriginales.length);
    }
    
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
                    <!-- Checkbox Global: Productos Orgánicos -->
                    <label class="global-checkbox-container" title="Marcar/desmarcar todos los productos como orgánicos">
                        <input type="checkbox" id="global-organic-checkbox" onchange="toggleOrganicTodosProductos(this.checked)">
                        <span class="global-checkbox-label">
                            <i class="fas fa-leaf"></i> Todos Orgánicos
                        </span>
                    </label>
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
                <button onclick="if(typeof abrirModalDeclaracionGeneral === 'function') abrirModalDeclaracionGeneral();" style="
                    background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    font-size: 1rem;
                    border-radius: 12px;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(30, 58, 138, 0.3);
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    <i class="fas fa-file-invoice"></i> Datos Declaración
                </button>
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
                    background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    font-size: 1rem;
                    border-radius: 12px;
                    cursor: pointer;
                    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
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
    
    // Obtener nombre del producto (buscar en múltiples campos incluyendo los de la API)
    const nombreProducto = obtenerValor(producto, 
        'ProductName', 'Description', 'descripcion_comercial', 
        'item_name', 'nombre', 'descripcion'
    ) || 'Sin nombre';
    
    // Truncar el nombre si es muy largo
    const nombreCorto = nombreProducto.length > 40 
        ? nombreProducto.substring(0, 40) + '...' 
        : nombreProducto;
    
    mostrarModalProducto({
        titulo: `Editar Item #${index + 1}: ${nombreCorto}`,
        producto: producto,
        botonTexto: 'Guardar Cambios'
    });
}

/**
 * Muestra el modal de producto con TODOS los campos del XML SIGA
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
    
    // Obtener valores actuales - TODOS los campos del XML
    // IMPORTANTE: Incluir nombres de campos de la API (Description, Quantity, UnitPriceUSD, Unit, AmountUSD)
    const vals = {
        HSCode: obtenerValor(producto, 'HSCode', 'hs', 'codigo_hs') || '',
        ProductCode: obtenerValor(producto, 'ProductCode') || '',
        // La API devuelve 'Description', mapearlo a ProductName
        ProductName: obtenerValor(producto, 'ProductName', 'Description', 'descripcion_comercial', 'item_name', 'nombre', 'descripcion') || '',
        BrandCode: obtenerValor(producto, 'BrandCode') || '',
        BrandName: obtenerValor(producto, 'BrandName', 'Brand', 'marca') || '',
        ModelCode: obtenerValor(producto, 'ModelCode') || '',
        ModelName: obtenerValor(producto, 'ModelName', 'Model', 'modelo') || '',
        ProductStatusCode: obtenerValor(producto, 'ProductStatusCode') || '',
        ProductYear: obtenerValor(producto, 'ProductYear') || '',
        // La API devuelve UnitPriceUSD o AmountUSD, mapear a FOBValue
        FOBValue: obtenerValor(producto, 'FOBValue', 'UnitPriceUSD', 'AmountUSD', 'valor_fob', 'valor_unitario') || '',
        // La API devuelve Unit, mapear a UnitCode
        UnitCode: obtenerValor(producto, 'UnitCode', 'Unit') || '',
        // La API devuelve Quantity, mapear a Qty
        Qty: obtenerValor(producto, 'Qty', 'Quantity', 'cantidad', 'quantity') || '',
        Weight: obtenerValor(producto, 'Weight', 'NetWeight', 'peso_neto') || '',
        ProductSpecification: obtenerValor(producto, 'ProductSpecification') || '',
        TempProductYN: (typeof obtenerValor(producto, 'TempProductYN') === 'undefined' || obtenerValor(producto, 'TempProductYN') === null || obtenerValor(producto, 'TempProductYN') === '' || obtenerValor(producto, 'TempProductYN') === false) ? 'true' : obtenerValor(producto, 'TempProductYN'),
        CertificateOrignYN: obtenerValor(producto, 'CertificateOrignYN') || false,
        CertificateOriginNo: obtenerValor(producto, 'CertificateOriginNo') || '',
        OriginCountry: obtenerValor(producto, 'OriginCountry', 'OriginCountryCode', 'pais_origen') || '',
        OrganicYN: obtenerValor(producto, 'OrganicYN') || false,
        GradeAlcohol: obtenerValor(producto, 'GradeAlcohol') || '',
        CustomerSalesPrice: obtenerValor(producto, 'CustomerSalesPrice') || '',
        ProductSerialNo: obtenerValor(producto, 'ProductSerialNo') || '',
        VehicleType: obtenerValor(producto, 'VehicleType') || '',
        VehicleChassis: obtenerValor(producto, 'VehicleChassis') || '',
        VehicleColor: obtenerValor(producto, 'VehicleColor') || '',
        VehicleMotor: obtenerValor(producto, 'VehicleMotor') || '',
        VehicleCC: obtenerValor(producto, 'VehicleCC') || '',
        ProductDescription: obtenerValor(producto, 'ProductDescription', 'descripcion_arancelaria') || '',
        Remark: obtenerValor(producto, 'Remark') || ''
    };
    
    modalOverlay.innerHTML = `
        <div class="product-modal product-modal-full">
            <div class="product-modal-header">
                <h3><i class="fas fa-box"></i> ${titulo}</h3>
                <button class="product-modal-close" onclick="cerrarModalProducto()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="product-modal-body">
                <!-- SECCIÓN: INFORMACIÓN BÁSICA (OBLIGATORIOS) -->
                <div class="form-section-header obligatorio">
                    <i class="fas fa-star"></i>
                    <span>Campos Obligatorios SIGA</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="field-HSCode">
                        <label>
                            <i class="fas fa-barcode"></i>
                            Código Arancelario <span class="xml-tag">(HSCode)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="modal-HSCode" value="${escapeHtml(vals.HSCode)}" 
                               placeholder="Ej: 8471.30.00.00" class="campo-obligatorio">
                    </div>
                    
                    <div class="product-form-group" id="field-ProductStatusCode">
                        <label>
                            <i class="fas fa-check-circle"></i>
                            Estado del Producto <span class="xml-tag">(ProductStatusCode)</span> <span class="required">*</span>
                        </label>
                        <input type="text" id="modal-ProductStatusCode" value="${escapeHtml(vals.ProductStatusCode || '')}" 
                               placeholder="IC04-001" class="campo-obligatorio">
                        <small>Ej: IC04-001 (Nuevo), IC04-002 (Usado), IC04-003 (Reconstruido)</small>
                    </div>
                    
                    <div class="product-form-group" id="field-TempProductYN">
                        <label>
                            <i class="fas fa-clock"></i>
                            ¿Producto Temporal? <span class="xml-tag">(TempProductYN)</span> <span class="required">*</span>
                        </label>
                        <select id="modal-TempProductYN" class="campo-obligatorio">
                            <option value="false" ${!vals.TempProductYN || vals.TempProductYN === 'false' ? 'selected' : ''}>No (false)</option>
                            <option value="true" ${vals.TempProductYN === true || vals.TempProductYN === 'true' ? 'selected' : ''}>Sí (true)</option>
                        </select>
                    </div>
                    
                    <div class="product-form-group" id="field-OrganicYN">
                        <label>
                            <i class="fas fa-leaf"></i>
                            ¿Producto Orgánico? <span class="xml-tag">(OrganicYN)</span> <span class="required">*</span>
                        </label>
                        <select id="modal-OrganicYN" class="campo-obligatorio">
                            <option value="false" ${!vals.OrganicYN || vals.OrganicYN === 'false' ? 'selected' : ''}>No (false)</option>
                            <option value="true" ${vals.OrganicYN === true || vals.OrganicYN === 'true' ? 'selected' : ''}>Sí (true)</option>
                        </select>
                    </div>
                </div>

                <!-- SECCIÓN: IDENTIFICACIÓN DEL PRODUCTO -->
                <div class="form-section-header">
                    <i class="fas fa-tag"></i>
                    <span>Identificación del Producto</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="field-ProductCode">
                        <label>
                            <i class="fas fa-hashtag"></i>
                            Código de Producto <span class="xml-tag">(ProductCode)</span>
                        </label>
                        <input type="text" id="modal-ProductCode" value="${escapeHtml(vals.ProductCode)}" 
                               placeholder="Número secuencial del producto">
                    </div>
                    
                    <div class="product-form-group full-width" id="field-ProductName">
                        <label>
                            <i class="fas fa-box"></i>
                            Nombre del Producto <span class="xml-tag">(ProductName)</span>
                        </label>
                        <input type="text" id="modal-ProductName" value="${escapeHtml(vals.ProductName)}" 
                               placeholder="Descripción comercial del producto">
                    </div>
                    
                    <div class="product-form-group full-width" id="field-ProductDescription">
                        <label>
                            <i class="fas fa-file-alt"></i>
                            Descripción del Producto <span class="xml-tag">(ProductDescription)</span>
                        </label>
                        <textarea id="modal-ProductDescription" rows="2" 
                                  placeholder="Descripción detallada...">${escapeHtml(vals.ProductDescription)}</textarea>
                    </div>
                    
                    <div class="product-form-group full-width" id="field-ProductSpecification">
                        <label>
                            <i class="fas fa-list-alt"></i>
                            Especificaciones <span class="xml-tag">(ProductSpecification)</span>
                        </label>
                        <textarea id="modal-ProductSpecification" rows="2" 
                                  placeholder="Especificaciones técnicas...">${escapeHtml(vals.ProductSpecification)}</textarea>
                    </div>
                    
                    <div class="product-form-group" id="field-ProductYear">
                        <label>
                            <i class="fas fa-calendar"></i>
                            Año del Producto <span class="xml-tag">(ProductYear)</span>
                        </label>
                        <input type="number" id="modal-ProductYear" value="${vals.ProductYear}" 
                               placeholder="Ej: 2025" min="1900" max="2100">
                    </div>
                    
                    <div class="product-form-group" id="field-ProductSerialNo">
                        <label>
                            <i class="fas fa-fingerprint"></i>
                            Número de Serie <span class="xml-tag">(ProductSerialNo)</span>
                        </label>
                        <input type="text" id="modal-ProductSerialNo" value="${escapeHtml(vals.ProductSerialNo)}" 
                               placeholder="Serial del producto">
                    </div>
                </div>

                <!-- SECCIÓN: MARCA Y MODELO -->
                <div class="form-section-header">
                    <i class="fas fa-copyright"></i>
                    <span>Marca y Modelo</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="field-BrandCode">
                        <label>
                            <i class="fas fa-barcode"></i>
                            Código de Marca <span class="xml-tag">(BrandCode)</span>
                        </label>
                        <input type="text" id="modal-BrandCode" value="${escapeHtml(vals.BrandCode)}" 
                               placeholder="Código de la marca">
                    </div>
                    
                    <div class="product-form-group" id="field-BrandName">
                        <label>
                            <i class="fas fa-trademark"></i>
                            Nombre de Marca <span class="xml-tag">(BrandName)</span>
                        </label>
                        <input type="text" id="modal-BrandName" value="${escapeHtml(vals.BrandName)}" 
                               placeholder="Ej: Samsung, Apple, Sony">
                    </div>
                    
                    <div class="product-form-group" id="field-ModelCode">
                        <label>
                            <i class="fas fa-barcode"></i>
                            Código de Modelo <span class="xml-tag">(ModelCode)</span>
                        </label>
                        <input type="text" id="modal-ModelCode" value="${escapeHtml(vals.ModelCode)}" 
                               placeholder="Código del modelo">
                    </div>
                    
                    <div class="product-form-group" id="field-ModelName">
                        <label>
                            <i class="fas fa-info-circle"></i>
                            Nombre de Modelo <span class="xml-tag">(ModelName)</span>
                        </label>
                        <input type="text" id="modal-ModelName" value="${escapeHtml(vals.ModelName)}" 
                               placeholder="Ej: Galaxy S24, iPhone 15">
                    </div>
                </div>

                <!-- SECCIÓN: CANTIDADES Y VALORES -->
                <div class="form-section-header">
                    <i class="fas fa-calculator"></i>
                    <span>Cantidades y Valores</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="field-Qty">
                        <label>
                            <i class="fas fa-sort-numeric-up"></i>
                            Cantidad <span class="xml-tag">(Qty)</span>
                        </label>
                        <input type="number" id="modal-Qty" value="${vals.Qty}" 
                               placeholder="Cantidad de unidades" min="0.01" step="0.01">
                    </div>
                    
                    <div class="product-form-group" id="field-UnitCode">
                        <label>
                            <i class="fas fa-ruler"></i>
                            Código de Unidad <span class="xml-tag">(UnitCode)</span>
                        </label>
                        <select id="modal-UnitCode">
                            <option value="1" ${vals.UnitCode == '1' ? 'selected' : ''}>1 - Unidades</option>
                            <option value="3" ${vals.UnitCode == '3' ? 'selected' : ''}>3 - Kilogramos</option>
                            <option value="8" ${vals.UnitCode == '8' ? 'selected' : ''}>8 - Metros cuadrados</option>
                        </select>
                        <small>Solo puedes seleccionar: 1 (Unidades), 3 (Kilogramos), 8 (Metros cuadrados)</small>
                    </div>
                    
                    <div class="product-form-group" id="field-FOBValue">
                        <label>
                            <i class="fas fa-dollar-sign"></i>
                            Valor FOB (USD) <span class="xml-tag">(FOBValue)</span>
                        </label>
                        <input type="number" id="modal-FOBValue" value="${vals.FOBValue}" 
                               placeholder="Valor FOB en USD" min="0" step="0.0001">
                    </div>
                    
                    <div class="product-form-group" id="field-Weight">
                        <label>
                            <i class="fas fa-weight-hanging"></i>
                            Peso (kg) <span class="xml-tag">(Weight)</span>
                        </label>
                        <input type="number" id="modal-Weight" value="${vals.Weight}" 
                               placeholder="Peso en kilogramos" min="0" step="0.01">
                    </div>
                    
                    <div class="product-form-group" id="field-CustomerSalesPrice">
                        <label>
                            <i class="fas fa-tag"></i>
                            Precio de Venta <span class="xml-tag">(CustomerSalesPrice)</span>
                        </label>
                        <input type="number" id="modal-CustomerSalesPrice" value="${vals.CustomerSalesPrice}" 
                               placeholder="Precio de venta al cliente" min="0" step="0.01">
                    </div>
                </div>

                <!-- SECCIÓN: ORIGEN Y CERTIFICACIÓN -->
                <div class="form-section-header">
                    <i class="fas fa-globe-americas"></i>
                    <span>Origen y Certificación</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="field-OriginCountry">
                        <label>
                            <i class="fas fa-flag"></i>
                            País de Origen <span class="xml-tag">(OriginCountry)</span>
                        </label>
                        <input type="text" id="modal-OriginCountry" value="${escapeHtml(vals.OriginCountry || '')}" 
                               placeholder="840">
                        <small>Código numérico del país (Ej: 840-USA, 156-China, 214-RD)</small>
                    </div>
                    
                    <div class="product-form-group" id="field-CertificateOrignYN">
                        <label>
                            <i class="fas fa-certificate"></i>
                            ¿Tiene Certificado de Origen? <span class="xml-tag">(CertificateOrignYN)</span>
                        </label>
                        <select id="modal-CertificateOrignYN">
                            <option value="false" ${!vals.CertificateOrignYN || vals.CertificateOrignYN === 'false' ? 'selected' : ''}>No (false)</option>
                            <option value="true" ${vals.CertificateOrignYN === true || vals.CertificateOrignYN === 'true' ? 'selected' : ''}>Sí (true)</option>
                        </select>
                    </div>
                    
                    <div class="product-form-group" id="field-CertificateOriginNo">
                        <label>
                            <i class="fas fa-file-contract"></i>
                            N° Certificado de Origen <span class="xml-tag">(CertificateOriginNo)</span>
                        </label>
                        <input type="text" id="modal-CertificateOriginNo" value="${escapeHtml(vals.CertificateOriginNo)}" 
                               placeholder="Número del certificado">
                    </div>
                </div>

                <!-- SECCIÓN: PRODUCTOS ESPECIALES (Alcohol) -->
                <div class="form-section-header">
                    <i class="fas fa-wine-bottle"></i>
                    <span>Productos Especiales (Alcohol)</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="field-GradeAlcohol">
                        <label>
                            <i class="fas fa-percent"></i>
                            Grado de Alcohol <span class="xml-tag">(GradeAlcohol)</span>
                        </label>
                        <input type="number" id="modal-GradeAlcohol" value="${vals.GradeAlcohol}" 
                               placeholder="% de alcohol" min="0" max="100" step="0.1">
                    </div>
                </div>

                <!-- SECCIÓN: VEHÍCULOS -->
                <div class="form-section-header">
                    <i class="fas fa-car"></i>
                    <span>Datos de Vehículo (si aplica)</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group" id="field-VehicleType">
                        <label>
                            <i class="fas fa-car-side"></i>
                            Tipo de Vehículo <span class="xml-tag">(VehicleType)</span>
                        </label>
                        <input type="text" id="modal-VehicleType" value="${escapeHtml(vals.VehicleType)}" 
                               placeholder="Ej: Sedán, SUV, Pickup">
                    </div>
                    
                    <div class="product-form-group" id="field-VehicleChassis">
                        <label>
                            <i class="fas fa-fingerprint"></i>
                            N° de Chasis <span class="xml-tag">(VehicleChassis)</span>
                        </label>
                        <input type="text" id="modal-VehicleChassis" value="${escapeHtml(vals.VehicleChassis)}" 
                               placeholder="Número de chasis (VIN)">
                    </div>
                    
                    <div class="product-form-group" id="field-VehicleColor">
                        <label>
                            <i class="fas fa-palette"></i>
                            Color del Vehículo <span class="xml-tag">(VehicleColor)</span>
                        </label>
                        <input type="text" id="modal-VehicleColor" value="${escapeHtml(vals.VehicleColor)}" 
                               placeholder="Ej: Blanco, Negro, Rojo">
                    </div>
                    
                    <div class="product-form-group" id="field-VehicleMotor">
                        <label>
                            <i class="fas fa-cog"></i>
                            N° de Motor <span class="xml-tag">(VehicleMotor)</span>
                        </label>
                        <input type="text" id="modal-VehicleMotor" value="${escapeHtml(vals.VehicleMotor)}" 
                               placeholder="Número del motor">
                    </div>
                    
                    <div class="product-form-group" id="field-VehicleCC">
                        <label>
                            <i class="fas fa-tachometer-alt"></i>
                            Cilindraje (CC) <span class="xml-tag">(VehicleCC)</span>
                        </label>
                        <input type="number" id="modal-VehicleCC" value="${vals.VehicleCC}" 
                               placeholder="Ej: 2000, 3500" min="0">
                    </div>
                </div>

                <!-- SECCIÓN: OBSERVACIONES -->
                <div class="form-section-header">
                    <i class="fas fa-sticky-note"></i>
                    <span>Observaciones</span>
                </div>
                <div class="product-form-grid">
                    <div class="product-form-group full-width" id="field-Remark">
                        <label>
                            <i class="fas fa-comment-alt"></i>
                            Observaciones <span class="xml-tag">(Remark)</span>
                        </label>
                        <textarea id="modal-Remark" rows="2" 
                                  placeholder="Observaciones adicionales...">${escapeHtml(vals.Remark)}</textarea>
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
        
        // Agregar listeners para quitar el error al escribir
        agregarListenersQuitarErrorProducto();
        
        // Marcar campos con error
        marcarCamposConErrorEnModalProducto();
    }, 10);
    
    // Enfocar el primer campo
    setTimeout(() => {
        document.getElementById('modal-HSCode')?.focus();
    }, 300);
}

/**
 * Agrega listeners a los campos del modal de producto para quitar el error al escribir
 */
function agregarListenersQuitarErrorProducto() {
    // Campos obligatorios de producto
    const camposObligatorios = [
        'modal-HSCode',
        'modal-ProductStatusCode',
        'modal-TempProductYN',
        'modal-OrganicYN'
    ];
    
    camposObligatorios.forEach(campoId => {
        const input = document.getElementById(campoId);
        if (input) {
            // Listener para cuando escribe (inputs)
            input.addEventListener('input', function() {
                quitarErrorDeCampoProducto(campoId);
            });
            
            // Listener para selects (change)
            input.addEventListener('change', function() {
                quitarErrorDeCampoProducto(campoId);
            });
        }
    });
}

/**
 * Quita el estilo de error de un campo de producto
 */
function quitarErrorDeCampoProducto(campoId) {
    // Obtener el nombre del campo (sin el prefijo 'modal-')
    const nombreCampo = campoId.replace('modal-', '');
    
    // Quitar clase de error del input
    const input = document.getElementById(campoId);
    if (input) {
        input.classList.remove('input-error', 'campo-error', 'con-error');
        input.style.borderColor = '';
        input.style.backgroundColor = '';
    }
    
    // Quitar del contenedor del campo
    const fieldContainer = document.getElementById(`field-${nombreCampo}`);
    if (fieldContainer) {
        fieldContainer.classList.remove('has-error', 'campo-error');
        // Quitar alerta inline si existe
        const alertaInline = fieldContainer.querySelector('.field-inline-alert');
        if (alertaInline) {
            alertaInline.remove();
        }
    }
    
    // Actualizar el panel de validación
    if (typeof window.actualizarPanelValidacionSinCampo === 'function') {
        // Para productos, el error incluye "Producto X: nombreCampo"
        const erroresContainer = document.getElementById('validation-errors');
        if (erroresContainer) {
            const errores = erroresContainer.querySelectorAll('.validation-error-item');
            errores.forEach(errorItem => {
                // Verificar si es un error de este campo de producto
                if (errorItem.textContent.includes(nombreCampo) && 
                    errorItem.textContent.includes(`Producto ${productoEditandoIndex + 1}`)) {
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
                    const panel = document.getElementById('validation-panel');
                    if (panel) panel.style.display = 'none';
                }
            }, 350);
        }
    }
}

/**
 * Marca los campos con error en el modal de producto
 */
function marcarCamposConErrorEnModalProducto() {
    if (productoEditandoIndex === null) return;
    
    const producto = productosClasificados[productoEditandoIndex];
    if (!producto) return;
    
    // Validar ProductStatusCode
    if (!producto.ProductStatusCode || producto.ProductStatusCode.trim() === '') {
        const input = document.getElementById('modal-ProductStatusCode');
        const container = document.getElementById('field-ProductStatusCode');
        if (input) input.classList.add('input-error', 'con-error');
        if (container) container.classList.add('campo-error');
    }
    
    // Validar TempProductYN
    if (producto.TempProductYN !== 'true' && producto.TempProductYN !== 'false' && 
        producto.TempProductYN !== true && producto.TempProductYN !== false) {
        const input = document.getElementById('modal-TempProductYN');
        const container = document.getElementById('field-TempProductYN');
        if (input) input.classList.add('input-error', 'con-error');
        if (container) container.classList.add('campo-error');
    }
    
    // Validar OrganicYN
    if (producto.OrganicYN !== 'true' && producto.OrganicYN !== 'false' && 
        producto.OrganicYN !== true && producto.OrganicYN !== false) {
        const input = document.getElementById('modal-OrganicYN');
        const container = document.getElementById('field-OrganicYN');
        if (input) input.classList.add('input-error', 'con-error');
        if (container) container.classList.add('campo-error');
    }
}

/**
 * Función para ir al campo específico desde las alertas
 */
function irACampoProducto(campoXml, productoIndex) {
    // Si hay un índice de producto, primero abrir el modal de edición
    if (productoIndex !== undefined && productoIndex !== null) {
        editarProductoCompleto(productoIndex);
        
        // Esperar a que el modal se abra y luego hacer scroll al campo
        setTimeout(() => {
            const fieldContainer = document.getElementById(`field-${campoXml}`);
            const inputField = document.getElementById(`modal-${campoXml}`);
            
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
        }, 400);
    }
}

// Exportar función globalmente
window.irACampoProducto = irACampoProducto;

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
 * Guarda el producto desde el modal (nuevo o editado) - TODOS los campos XML
 */
function guardarProductoModal() {
    // Forzar que cualquier input pendiente se procese
    document.activeElement?.blur();
    
    // Pequeño delay para asegurar que todos los valores estén actualizados
    setTimeout(() => {
        guardarProductoModalReal();
    }, 50);
}

function guardarProductoModalReal() {
    // Obtener valores del formulario - TODOS los campos XML
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : null; // null = campo no existe
    };
    const getNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const val = el.value.trim();
        if (val === '') return null; // Campo vacío = no sobrescribir
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
    };
    const getBool = (id) => {
        const el = document.getElementById(id);
        return el ? el.value === 'true' : false;
    };
    
    const hsCode = getVal('modal-HSCode');
    
    // Validar campo obligatorio principal
    if (!hsCode) {
        showNotification('El código HS (HSCode) es obligatorio', 'error');
        document.getElementById('modal-HSCode')?.focus();
        return;
    }
    
    // Crear objeto SOLO con campos que tienen valor (no sobrescribir con vacíos)
    const camposEditados = {};
    
    // Helper para agregar solo si tiene valor
    const addIfValue = (key, value) => {
        if (value !== null && value !== undefined && value !== '') {
            camposEditados[key] = value;
        }
    };
    
    // Campos obligatorios (siempre incluir si tienen valor)
    addIfValue('HSCode', hsCode);
    addIfValue('ProductStatusCode', getVal('modal-ProductStatusCode'));
    camposEditados.TempProductYN = getBool('modal-TempProductYN');
    camposEditados.OrganicYN = getBool('modal-OrganicYN');
    
    // Identificación
    addIfValue('ProductCode', getVal('modal-ProductCode'));
    addIfValue('ProductName', getVal('modal-ProductName'));
    addIfValue('ProductDescription', getVal('modal-ProductDescription'));
    addIfValue('ProductSpecification', getVal('modal-ProductSpecification'));
    addIfValue('ProductYear', getVal('modal-ProductYear'));
    addIfValue('ProductSerialNo', getVal('modal-ProductSerialNo'));
    
    // Marca y Modelo
    addIfValue('BrandCode', getVal('modal-BrandCode'));
    addIfValue('BrandName', getVal('modal-BrandName'));
    addIfValue('ModelCode', getVal('modal-ModelCode'));
    addIfValue('ModelName', getVal('modal-ModelName'));
    
    // Cantidades y Valores (solo si tienen valor numérico)
    addIfValue('Qty', getNum('modal-Qty'));
    addIfValue('UnitCode', getVal('modal-UnitCode'));
    addIfValue('FOBValue', getNum('modal-FOBValue'));
    addIfValue('Weight', getNum('modal-Weight'));
    addIfValue('CustomerSalesPrice', getNum('modal-CustomerSalesPrice'));
    
    // Origen y Certificación
    addIfValue('OriginCountry', getVal('modal-OriginCountry'));
    camposEditados.CertificateOrignYN = getBool('modal-CertificateOrignYN');
    addIfValue('CertificateOriginNo', getVal('modal-CertificateOriginNo'));
    
    // Alcohol
    addIfValue('GradeAlcohol', getVal('modal-GradeAlcohol'));
    
    // Vehículos
    addIfValue('VehicleType', getVal('modal-VehicleType'));
    addIfValue('VehicleChassis', getVal('modal-VehicleChassis'));
    addIfValue('VehicleColor', getVal('modal-VehicleColor'));
    addIfValue('VehicleMotor', getVal('modal-VehicleMotor'));
    addIfValue('VehicleCC', getVal('modal-VehicleCC'));
    
    // Observaciones
    addIfValue('Remark', getVal('modal-Remark'));
    
    // Agregar o actualizar
    if (productoEditandoIndex !== null) {
        // Obtener producto original de _productosOriginales para no perder campos de la API
        const productoOriginal = window._productosOriginales?.[productoEditandoIndex] || {};
        const productoActual = productosClasificados[productoEditandoIndex] || {};
        
        // Fusionar: original (API) + actual + editados
        // IMPORTANTE: Solo sobrescribir con campos que realmente fueron editados (tienen valor)
        // Los campos originales de la API (Description, Quantity, UnitPriceUSD, etc.) se preservan
        productosClasificados[productoEditandoIndex] = {
            ...productoOriginal,  // Campos originales de la API
            ...productoActual,    // Campos actuales 
            ...camposEditados,    // Solo campos editados con valor
            _isManual: productoActual._isManual || false,
            _index: productoEditandoIndex
        };
        
        console.log('📝 Producto actualizado:', productoEditandoIndex + 1);
        console.log('   Original API:', Object.keys(productoOriginal));
        console.log('   Campos editados:', Object.keys(camposEditados));
        
        showNotification(`Producto #${productoEditandoIndex + 1} actualizado correctamente`, 'success');
    } else {
        // Agregar nuevo
        camposEditados._index = productosClasificados.length;
        camposEditados._isManual = true;
        productosClasificados.push(camposEditados);
        showNotification('Producto añadido correctamente', 'success');
    }
    
    // Actualizar resultadoActual para exportación
    actualizarResultadoActual();
    
    // Cerrar modal y re-renderizar
    cerrarModalProducto();
    actualizarVistaProductos();
    
    // Limpiar TODOS los errores visuales antes de revalidar
    document.querySelectorAll('.detail-item.has-error').forEach(item => {
        item.classList.remove('has-error');
    });
    document.querySelectorAll('.field-inline-alert').forEach(alert => alert.remove());
    document.querySelectorAll('.input-error, .con-error').forEach(item => {
        item.classList.remove('input-error', 'con-error');
    });
    
    // Revalidar campos obligatorios
    setTimeout(() => {
        if (typeof validarYMostrarPanel === 'function') {
            validarYMostrarPanel();
        }
    }, 100);
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
        // Si no existe el grid, re-renderizar todo PERO preservando los originales
        renderizarProductos({ ImpDeclarationProduct: productosClasificados }, true);
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
 * Fusiona los datos originales con las ediciones para no perder información
 */
function actualizarResultadoActual() {
    if (!window.resultadoActual) {
        window.resultadoActual = {};
    }
    
    // Obtener productos originales para fusionar
    // IMPORTANTE: _productosOriginales tiene los campos originales de la API
    const productosOriginales = window._productosOriginales || [];
    
    console.log('🔄 Actualizando resultadoActual...');
    console.log('   productosClasificados:', productosClasificados.length);
    console.log('   _productosOriginales:', productosOriginales.length);
    
    // Actualizar el array de productos fusionando datos originales con ediciones
    window.resultadoActual.ImpDeclarationProduct = productosClasificados.map((p, idx) => {
        // Limpiar propiedades internas del producto actual
        const { _index, _isManual, ...productoActual } = p;
        
        // Obtener producto original si existe (también limpiar propiedades internas)
        const productoOriginalRaw = productosOriginales[idx] || {};
        const { _index: _oi, _isManual: _om, ...productoOriginal } = productoOriginalRaw;
        
        // FUSIÓN: original (API) + actual (incluye ediciones)
        // El producto actual ya debería tener los campos originales + ediciones
        // Pero por seguridad, fusionamos con el original
        const productoFinal = {
            ...productoOriginal,  // Campos originales de la API (Description, UnitPriceUSD, etc.)
            ...productoActual     // Campos actuales/editados (tienen prioridad)
        };
        
        // Debug para productos sin ProductName
        if (!productoFinal.ProductName && !productoFinal.Description) {
            console.warn(`⚠️ Producto ${idx + 1} sin nombre:`, {
                original: Object.keys(productoOriginal),
                actual: Object.keys(productoActual)
            });
        }
        
        return productoFinal;
    });
    
    // También actualizar editedClassification si existe
    if (typeof window.editedClassification !== 'undefined') {
        window.editedClassification = window.resultadoActual;
    }
    
    console.log('📊 resultadoActual actualizado con', productosClasificados.length, 'productos (fusionados)');
    console.log('📊 Ejemplo de producto fusionado:', window.resultadoActual.ImpDeclarationProduct[0]);
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
        'ProductCode': 'Código Producto',
        'ProductStatusCode': 'Estado Producto',
        'ItemNo': 'Número Item',
        'LineNo': 'Line Number',
        
        // Descripción
        'ProductName': 'Nombre Producto',
        'descripcion_comercial': 'Descripción Comercial',
        'item_name': 'Nombre Item',
        'Description': 'Description',
        'descripcion_arancelaria': 'Descripción Arancelaria',
        'TariffDescription': 'Descripción Arancel',
        'ProductDescription': 'Descripción Producto',
        'ProductSpecification': 'Especificación',
        
        // Cantidades - Incluir campos de API
        'Qty': 'Cantidad',
        'Quantity': 'Cantidad',
        'cantidad': 'Cantidad',
        'quantity': 'Cantidad',
        'StatisticalQty': 'Cantidad Estadística',
        'PackageQty': 'Cantidad Bultos',
        
        // Unidades - Incluir campos de API
        'UnitCode': 'Unidad',
        'Unit': 'Unit',
        'UnitMeasure': 'Unidad Medida',
        'StatisticalUnitCode': 'Unidad Estadística',
        'unidad_medida_estadistica': 'Unidad Estadística',
        'PackageUnitCode': 'Unidad Empaque',
        
        // Valores monetarios - Incluir campos de API
        'FOBValue': 'Valor FOB',
        'UnitPriceUSD': 'Unit Price USD',
        'AmountUSD': 'Amount USD',
        'valor_fob': 'Valor FOB',
        'valor_unitario': 'Valor Unitario',
        'CIFValue': 'Valor CIF',
        'UnitPrice': 'Precio Unitario',
        'TotalValue': 'Valor Total',
        'InsuranceValue': 'Valor Seguro',
        'FreightValue': 'Valor Flete',
        'CustomerSalesPrice': 'Precio Venta',
        
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
        'BrandCode': 'Código Marca',
        'BrandName': 'Marca',
        'Brand': 'Marca',
        'marca': 'Marca',
        'ModelCode': 'Código Modelo',
        'ModelName': 'Modelo',
        'Model': 'Modelo',
        'modelo': 'Modelo',
        'Specification': 'Especificación',
        'especificacion': 'Especificación',
        
        // Año y Serie
        'ProductYear': 'Año Producto',
        'ProductSerialNo': 'Número Serie',
        
        // Impuestos
        'DAI': 'DAI (%)',
        'dai': 'DAI (%)',
        'ITBIS': 'ITBIS (%)',
        'itbis': 'ITBIS (%)',
        'ISC': 'ISC (%)',
        'isc': 'ISC (%)',
        'TaxRate': 'Tasa Impuesto',
        'GradeAlcohol': 'Grado Alcohol',
        
        // Booleanos
        'TempProductYN': 'Producto Temporal',
        'OrganicYN': 'Producto Orgánico',
        'CertificateOrignYN': 'Certificate Orign Y N',
        'CertificateYN': 'Requiere Certificado',
        'UsedYN': 'Usado',
        
        // Certificados
        'CertificateOriginNo': 'N° Certificado Origen',
        
        // Vehículos
        'VehicleType': 'Tipo Vehículo',
        'VehicleChassis': 'N° Chasis',
        'VehicleColor': 'Color Vehículo',
        'VehicleMotor': 'N° Motor',
        'VehicleCC': 'Cilindraje CC',
        
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
    const camposMoney = ['FOBValue', 'valor_fob', 'valor_unitario', 'CIFValue', 'UnitPrice', 'TotalValue', 
                         'InsuranceValue', 'FreightValue', 'UnitPriceUSD', 'AmountUSD', 'CustomerSalesPrice'];
    
    // Campos que necesitan ancho completo (textos largos)
    const camposLargos = ['ProductName', 'descripcion_comercial', 'Description', 'descripcion_arancelaria', 
                          'TariffDescription', 'Remark', 'observaciones', 'Specification', 'ProductDescription', 
                          'ProductSpecification'];
    
    // Orden preferido de campos - incluir campos de API
    const ordenCampos = [
        // Descripción primero
        'ProductName', 'Description', 'descripcion_comercial', 'item_name',
        // Cantidades
        'Qty', 'Quantity', 'cantidad', 'StatisticalQty',
        // Valores
        'FOBValue', 'UnitPriceUSD', 'AmountUSD', 'valor_fob', 'UnitPrice', 'TotalValue', 'CustomerSalesPrice',
        // Unidades
        'UnitCode', 'Unit', 'UnitMeasure', 'StatisticalUnitCode',
        // Pesos
        'Weight', 'NetWeight', 'peso_neto', 'GrossWeight', 'peso_bruto',
        // Origen
        'OriginCountry', 'OriginCountryCode', 'pais_origen', 'ProvenanceCountryCode',
        // Estado
        'ProductStatusCode', 'TempProductYN', 'OrganicYN', 'CertificateOrignYN',
        // Marca/Modelo
        'BrandName', 'Brand', 'marca', 'ModelName', 'Model', 'modelo',
        // Otros
        'ProductYear', 'ProductSerialNo', 'GradeAlcohol',
        'DAI', 'dai', 'ITBIS', 'itbis', 'ISC', 'isc',
        'Currency', 'Incoterm',
        'ProductDescription', 'ProductSpecification', 'Remark', 'observaciones'
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

/**
 * Cambia el estado OrganicYN de TODOS los productos
 * @param {boolean} esOrganico - true para marcar todos como orgánicos, false para desmarcar
 */
function toggleOrganicTodosProductos(esOrganico) {
    console.log(`🌿 Cambiando OrganicYN de todos los productos a: ${esOrganico}`);
    
    // Actualizar cada producto en el array
    productosClasificados.forEach((producto, index) => {
        producto.OrganicYN = esOrganico;
        productosClasificados[index] = producto;
    });
    
    // Sincronizar con window
    window.productosClasificados = productosClasificados;
    
    // También actualizar en resultadoActual si existe
    if (window.resultadoActual && window.resultadoActual.ImpDeclarationProduct) {
        window.resultadoActual.ImpDeclarationProduct.forEach((producto, index) => {
            producto.OrganicYN = esOrganico;
        });
    }
    
    // Re-renderizar las tarjetas de productos para reflejar el cambio
    actualizarVistaProductos();
    
    // Mostrar notificación
    const mensaje = esOrganico 
        ? `✅ Todos los productos (${productosClasificados.length}) marcados como ORGÁNICOS`
        : `✅ Todos los productos (${productosClasificados.length}) marcados como NO orgánicos`;
    
    if (typeof showNotification === 'function') {
        showNotification(mensaje, 'success');
    } else {
        console.log(mensaje);
    }
}

/**
 * Actualiza la vista de productos sin perder el estado del checkbox
 */
function actualizarVistaProductos() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    
    // Re-renderizar solo el grid de productos
    grid.innerHTML = `
        ${productosClasificados.map((prod, idx) => renderizarTarjetaProducto(prod, idx)).join('')}
        <!-- Tarjeta para añadir -->
        <div class="product-card-add" onclick="abrirModalAgregarProducto()">
            <i class="fas fa-plus-circle"></i>
            <span>Añadir Producto Manual</span>
            <small>Click para agregar un nuevo item</small>
        </div>
    `;
    
    // Actualizar resumen de totales
    const resumenContainer = document.querySelector('.products-totals');
    if (resumenContainer) {
        resumenContainer.outerHTML = renderizarResumenTotales(productosClasificados);
    }
}

// Exportar funciones globalmente
window.renderizarProductos = renderizarProductos;
window.abrirModalAgregarProducto = abrirModalAgregarProducto;
window.editarProductoCompleto = editarProductoCompleto;
window.cerrarModalProducto = cerrarModalProducto;
window.toggleOrganicTodosProductos = toggleOrganicTodosProductos;
window.actualizarVistaProductos = actualizarVistaProductos;
window.guardarProductoModal = guardarProductoModal;
window.duplicarProducto = duplicarProducto;
window.eliminarProducto = eliminarProducto;
window.editarCampoProducto = editarCampoProducto;
window.productosClasificados = productosClasificados;
window.actualizarResultadoActual = actualizarResultadoActual;
