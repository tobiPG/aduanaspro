/**
 * Generador de XML ImportDUA para SIGA
 * Convierte el JSON de clasificación al formato XML requerido por Aduanas RD
 */

/**
 * Mapeo de nombres de país a códigos ISO 3166-1 numéricos
 * Usado para convertir respuestas de la API que vienen con nombres de país
 */
const COUNTRY_NAME_TO_CODE = {
  // América
  'república dominicana': '214',
  'republica dominicana': '214',
  'dominican republic': '214',
  'rd': '214',
  'estados unidos': '840',
  'united states': '840',
  'usa': '840',
  'us': '840',
  'eeuu': '840',
  'mexico': '484',
  'méxico': '484',
  'canada': '124',
  'canadá': '124',
  'brasil': '076',
  'brazil': '076',
  'colombia': '170',
  'argentina': '032',
  'chile': '152',
  'peru': '604',
  'perú': '604',
  'panama': '591',
  'panamá': '591',
  // Asia
  'china': '156',
  'japan': '392',
  'japón': '392',
  'japon': '392',
  'south korea': '410',
  'corea del sur': '410',
  'korea': '410',
  'corea': '410',
  'taiwan': '158',
  'taiwán': '158',
  'hong kong': '344',
  'india': '356',
  'vietnam': '704',
  'thailand': '764',
  'tailandia': '764',
  'indonesia': '360',
  'malaysia': '458',
  'malasia': '458',
  'singapore': '702',
  'singapur': '702',
  'philippines': '608',
  'filipinas': '608',
  // Europa
  'germany': '276',
  'alemania': '276',
  'españa': '724',
  'spain': '724',
  'france': '250',
  'francia': '250',
  'italy': '380',
  'italia': '380',
  'united kingdom': '826',
  'reino unido': '826',
  'uk': '826',
  'netherlands': '528',
  'holanda': '528',
  'paises bajos': '528',
  'portugal': '620',
  'belgium': '056',
  'bélgica': '056',
  'belgica': '056',
  'switzerland': '756',
  'suiza': '756',
  'sweden': '752',
  'suecia': '752',
  // Otros
  'australia': '036',
  'new zealand': '554',
  'nueva zelanda': '554',
  'south africa': '710',
  'sudáfrica': '710',
  'sudafrica': '710',
  'turkey': '792',
  'turquía': '792',
  'turquia': '792',
  'israel': '376',
  'egypt': '818',
  'egipto': '818',
  'russia': '643',
  'rusia': '643',
  'united arab emirates': '784',
  'emiratos arabes unidos': '784',
  'uae': '784',
};

/**
 * Convierte nombre de país a código ISO numérico
 * @param {string} countryNameOrCode - Nombre del país o código
 * @returns {string} - Código ISO numérico
 */
function normalizeCountryCode(countryNameOrCode) {
  if (!countryNameOrCode) return '';
  
  const value = String(countryNameOrCode).trim();
  
  // Si ya es un código numérico, devolverlo directamente
  if (/^\d{3}$/.test(value)) {
    return value;
  }
  
  // Buscar en el mapeo (case insensitive)
  const lowerValue = value.toLowerCase();
  if (COUNTRY_NAME_TO_CODE[lowerValue]) {
    return COUNTRY_NAME_TO_CODE[lowerValue];
  }
  
  // Si no encuentra, devolver el valor original (puede ser un código no mapeado)
  return value;
}

/**
 * Convierte un valor a string XML seguro
 */
function escapeXml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Genera una etiqueta XML con auto-cierre si está vacía
 * @param {string} tagName - Nombre de la etiqueta
 * @param {any} value - Valor del campo
 * @param {string} defaultValue - Valor por defecto si es undefined/null
 * @returns {string} - Etiqueta XML formateada
 */
function xmlTag(tagName, value, defaultValue = '') {
  const finalValue = value !== null && value !== undefined && value !== '' ? value : defaultValue;
  
  // Si el valor final está vacío, usar auto-cierre
  if (finalValue === '' || finalValue === null || finalValue === undefined) {
    return `<${tagName}/>`;
  }
  
  // Si tiene contenido, usar etiqueta normal
  return `<${tagName}>${escapeXml(finalValue)}</${tagName}>`;
}

/**
 * Formatea fecha al formato requerido por XML (ISO 8601)
 */
function formatDate(dateString) {
  if (!dateString) return '2000-01-01T12:00:00';
  try {
    const date = new Date(dateString);
    return date.toISOString().split('.')[0];
  } catch {
    return '2000-01-01T12:00:00';
  }
}

/**
 * Normaliza el HSCode a 8 dígitos (agrega ceros al final si es necesario)
 * SIGA requiere códigos arancelarios de 8 dígitos
 */
function normalizeHSCode(hsCode) {
  if (!hsCode) return '';
  // Limpiar el código: solo dígitos
  let code = String(hsCode).replace(/[^0-9]/g, '');
  
  // Si tiene menos de 8 dígitos, agregar ceros al final
  if (code.length > 0 && code.length < 8) {
    code = code.padEnd(8, '0');
  }
  
  return code;
}

/**
 * Mapeo de unidades de texto a códigos numéricos SIGA
 * Código 8 = Unidad (por defecto)
 */
const UNIT_CODE_MAP = {
  // Unidades comunes
  'pcs': '8',
  'piece': '8', 
  'pieces': '8',
  'pc': '8',
  'unit': '8',
  'units': '8',
  'unidad': '8',
  'unidades': '8',
  'ea': '8',
  'each': '8',
  // Rollos
  'roll': '8',
  'rolls': '8',
  'rollo': '8',
  'rollos': '8',
  // Metros
  'meter': '1',
  'meters': '1',
  'metro': '1',
  'metros': '1',
  'm': '1',
  // Metros cuadrados
  'm2': '2',
  'sqm': '2',
  'metros cuadrados': '2',
  // Kilogramos
  'kg': '3',
  'kgs': '3',
  'kilogram': '3',
  'kilograms': '3',
  'kilogramo': '3',
  'kilogramos': '3',
  // Litros
  'l': '4',
  'liter': '4',
  'liters': '4',
  'litro': '4',
  'litros': '4',
  // Cajas
  'box': '8',
  'boxes': '8',
  'caja': '8',
  'cajas': '8',
  // Sets
  'set': '8',
  'sets': '8',
  'juego': '8',
  'juegos': '8',
};

/**
 * Normaliza UnitCode a código numérico SIGA
 */
function normalizeUnitCode(unitCode) {
  if (!unitCode) return '8';
  
  // Si ya es un número válido, devolverlo
  const numCode = String(unitCode).trim();
  if (/^\d+$/.test(numCode)) {
    return numCode;
  }
  
  // Buscar en el mapeo (case insensitive)
  const lowerUnit = numCode.toLowerCase();
  if (UNIT_CODE_MAP[lowerUnit]) {
    return UNIT_CODE_MAP[lowerUnit];
  }
  
  // Por defecto, usar código 8 (Unidad)
  return '8';
}

/**
 * Genera el XML ImportDUA completo desde el JSON de clasificación
 */
function generarXmlImportDUA(jsonData) {
  const data = jsonData.ImportDUA?.ImpDeclaration || jsonData;
  
  // ========== VALORES POR DEFECTO PARA CAMPOS NUMÉRICOS ==========
  // Según el XML de referencia de SIGA
  const getNumericValue = (value, defaultVal = '0') => {
    if (value === null || value === undefined || value === '') {
      return defaultVal;
    }
    const num = parseFloat(value);
    return isNaN(num) ? defaultVal : num.toString();
  };
  
  // Valores monetarios con 4 decimales
  const totalFOB = getNumericValue(data.TotalFOB, '0');
  const insuranceValue = getNumericValue(data.InsuranceValue, '0');
  const freightValue = getNumericValue(data.FreightValue, '0');
  const otherValue = getNumericValue(data.OtherValue, '0');
  
  // Calcular TotalCIF automáticamente si está vacío
  let totalCIF = data.TotalCIF;
  if (!totalCIF || totalCIF === '' || totalCIF === '0') {
    const calculatedCIF = parseFloat(totalFOB) + parseFloat(insuranceValue) + parseFloat(freightValue) + parseFloat(otherValue);
    totalCIF = calculatedCIF > 0 ? calculatedCIF.toFixed(4) : '';
  }
  
  let xml = `<?xml version="1.0" encoding="utf-8"?>
<ImportDUA xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://aduanas.gob.do/XSD/ImportClearance/ImportDUA.xsd">
<ImpDeclaration xmlns="">`;

  // Datos generales de la declaración
  xml += `
<DeclarationDate>${formatDate(data.DeclarationDate)}</DeclarationDate>
${xmlTag('ClearanceType', data.ClearanceType, 'IC38-002')}
${xmlTag('AreaCode', data.AreaCode, '10150')}
${xmlTag('FormNo', data.FormNo, '40001')}
${xmlTag('BLNo', data.BLNo)}
${xmlTag('ManifestNo', data.ManifestNo)}
${xmlTag('ConsigneeCode', data.ConsigneeCode)}
${xmlTag('ConsigneeName', data.ConsigneeName)}
${xmlTag('ConsigneeNationality', data.ConsigneeNationality, '214')}
${xmlTag('CargoControlNo', data.CargoControlNo, 'SN')}
${xmlTag('CommercialInvoiceNo', data.CommercialInvoiceNo)}
${xmlTag('DestinationLocationCode', data.DestinationLocationCode)}
${xmlTag('EntryPort', data.EntryPort)}
${xmlTag('DepartureCountryCode', data.DepartureCountryCode)}
${xmlTag('TransportCompanyCode', data.TransportCompanyCode)}
${xmlTag('TransportNationality', data.TransportNationality)}
${xmlTag('TransportMethod', data.TransportMethod)}
<EntryPlanDate>${formatDate(data.EntryPlanDate)}</EntryPlanDate>
<EntryDate>${formatDate(data.EntryDate)}</EntryDate>
${xmlTag('ImporterCode', data.ImporterCode)}
${xmlTag('ImporterName', data.ImporterName)}
${xmlTag('ImporterNationality', data.ImporterNationality, '214')}
${xmlTag('BrokerEmployeeCode', data.BrokerEmployeeCode)}
${xmlTag('BrokerCompanyCode', data.BrokerCompanyCode)}
${xmlTag('DeclarantCode', data.DeclarantCode)}
${xmlTag('DeclarantName', data.DeclarantName)}
${xmlTag('DeclarantNationality', data.DeclarantNationality, '214')}
${xmlTag('RegimenCode', data.RegimenCode, '1')}
${xmlTag('AgreementCode', data.AgreementCode)}
<TotalFOB>${totalFOB}</TotalFOB>
<InsuranceValue>${insuranceValue}</InsuranceValue>
<FreightValue>${freightValue}</FreightValue>
<OtherValue>${otherValue}</OtherValue>
${xmlTag('TotalCIF', totalCIF)}
${xmlTag('TotalWeight', data.TotalWeight)}
${xmlTag('NetWeight', data.NetWeight)}
${xmlTag('Remark', data.Remark)}`;

  // Datos del proveedor
  const supplier = data.ImpDeclarationSupplier || {};
  xml += `
<ImpDeclarationSupplier>
${xmlTag('ForeignSupplierName', supplier.ForeignSupplierName)}
${xmlTag('ForeignSupplierCode', supplier.ForeignSupplierCode)}
${xmlTag('ForeignSupplierNationality', normalizeCountryCode(supplier.ForeignSupplierNationality))}
</ImpDeclarationSupplier>`;

  // Productos
  const products = data.ImpDeclarationProduct || [];
  products.forEach((product, index) => {
    // Helper para obtener valor con fallbacks (nombres alternativos de campos de API)
    const getValue = (...keys) => {
      for (const key of keys) {
        if (product[key] !== undefined && product[key] !== null && product[key] !== '') {
          return product[key];
        }
      }
      return '';
    };

    // Obtener nombre del producto (buscar en múltiples campos)
    const productName = getValue('ProductName', 'Description', 'descripcion_comercial', 'item_name', 'nombre', 'descripcion');

    // Para ProductDescription y Remark, usar el nombre del producto si no tienen valor
    const productDescription = getValue('ProductDescription', 'descripcion_arancelaria') || productName;
    const remark = getValue('Remark') || productName;

    // Normalizar HSCode a 8 dígitos
    const hsCode = normalizeHSCode(getValue('HSCode', 'hs', 'codigo_hs'));

    // Normalizar UnitCode a código numérico SIGA
    const unitCode = normalizeUnitCode(getValue('UnitCode', 'Unit'));

    // Formatear valores numéricos con 4 decimales
    const fobValue = getValue('FOBValue', 'UnitPriceUSD', 'AmountUSD', 'valor_fob', 'valor_unitario');
    const formattedFOB = fobValue ? parseFloat(fobValue).toFixed(4) : '';

    // Formatear Qty con 4 decimales
    const qty = getValue('Qty', 'Quantity', 'cantidad', 'quantity');
    const formattedQty = qty ? parseFloat(qty).toFixed(4) : '';

    // Validación: solo permitir edición/exportación para UnitCode 1, 3, 8
    if (!['1', '3', '8'].includes(unitCode)) {
      throw new Error(`Solo se permite editar/exportar productos con UnitCode 1 (unidades), 3 (kilogramos) o 8 (metros cuadrados). UnitCode actual: ${unitCode}`);
    }
    // Validación: si la unidad es kilogramos (3), qty y weight deben ser iguales
    if (unitCode === '3') {
      const weight = parseFloat(getValue('Weight', 'NetWeight', 'peso_neto'));
      const qtyNum = parseFloat(qty);
      if (!isNaN(weight) && !isNaN(qtyNum) && weight !== qtyNum) {
        throw new Error(`Para productos en kilogramos, la cantidad (Qty=${qtyNum}) y el peso (Weight=${weight}) deben ser iguales para exportar o editar el ítem.`);
      }
    }

    xml += `
<ImpDeclarationProduct>
${xmlTag('HSCode', hsCode)}
${xmlTag('ProductCode', getValue('ProductCode'), index + 1)}
${xmlTag('ProductName', productName)}
${xmlTag('BrandCode', getValue('BrandCode'))}
${xmlTag('BrandName', getValue('BrandName', 'Brand', 'marca'), 'N/A')}
${xmlTag('ModelCode', getValue('ModelCode'))}
${xmlTag('ModelName', getValue('ModelName', 'Model', 'modelo'), 'N/A')}
${xmlTag('ProductStatusCode', getValue('ProductStatusCode'), 'IC04-001')}
${xmlTag('ProductYear', getValue('ProductYear'))}
${xmlTag('FOBValue', formattedFOB)}
${xmlTag('UnitCode', unitCode)}
${xmlTag('Qty', formattedQty)}
${xmlTag('QtyPresentation', getValue('QtyPresentation'), '0')}
${xmlTag('Weight', getValue('Weight', 'NetWeight', 'peso_neto'), '1')}
${xmlTag('ProductSpecification', getValue('ProductSpecification'))}
<TempProductYN>${product.TempProductYN === undefined || product.TempProductYN === null || product.TempProductYN === '' ? 'true' : (product.TempProductYN === 'true' || product.TempProductYN === true ? 'true' : 'false')}</TempProductYN>
<CertificateOrignYN>${product.CertificateOrignYN === 'true' || product.CertificateOrignYN === true ? 'true' : 'false'}</CertificateOrignYN>
${xmlTag('CertificateOriginNo', getValue('CertificateOriginNo'))}
${xmlTag('OriginCountry', normalizeCountryCode(getValue('OriginCountry', 'OriginCountryCode', 'pais_origen')))}
<OrganicYN>${product.OrganicYN === 'true' || product.OrganicYN === true ? 'true' : 'false'}</OrganicYN>
${xmlTag('GradeAlcohol', getValue('GradeAlcohol'), '0.00')}
${xmlTag('CustomerSalesPrice', getValue('CustomerSalesPrice'), '0.0000')}
${xmlTag('ProductSerialNo', getValue('ProductSerialNo'))}
${xmlTag('VehicleType', getValue('VehicleType'))}
${xmlTag('VehicleChassis', getValue('VehicleChassis'))}
${xmlTag('VehicleColor', getValue('VehicleColor'))}
${xmlTag('VehicleMotor', getValue('VehicleMotor'))}
${xmlTag('VehicleCC', getValue('VehicleCC'), '0')}
${xmlTag('ProductDescription', productDescription)}
</ImpDeclarationProduct>`;
  });

  xml += `
</ImpDeclaration>
</ImportDUA>`;

  return xml;
}

module.exports = {
  generarXmlImportDUA,
  escapeXml,
  formatDate,
  xmlTag,
  normalizeHSCode,
  normalizeUnitCode,
  normalizeCountryCode,
  COUNTRY_NAME_TO_CODE
};
