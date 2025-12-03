/**
 * Generador de XML ImportDUA para SIGA
 * Convierte el JSON de clasificación al formato XML requerido por Aduanas RD
 */

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
 * Genera el XML ImportDUA completo desde el JSON de clasificación
 */
function generarXmlImportDUA(jsonData) {
  const data = jsonData.ImportDUA?.ImpDeclaration || jsonData;
  
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
${xmlTag('TotalFOB', data.TotalFOB)}
${xmlTag('InsuranceValue', data.InsuranceValue)}
${xmlTag('FreightValue', data.FreightValue)}
${xmlTag('OtherValue', data.OtherValue, '0.0000')}
${xmlTag('TotalCIF', data.TotalCIF)}
${xmlTag('TotalWeight', data.TotalWeight)}
${xmlTag('NetWeight', data.NetWeight)}
${xmlTag('Remark', data.Remark)}`;

  // Datos del proveedor
  const supplier = data.ImpDeclarationSupplier || {};
  xml += `
<ImpDeclarationSupplier>
${xmlTag('ForeignSupplierName', supplier.ForeignSupplierName)}
${xmlTag('ForeignSupplierCode', supplier.ForeignSupplierCode)}
${xmlTag('ForeignSupplierNationality', supplier.ForeignSupplierNationality)}
</ImpDeclarationSupplier>`;

  // Productos
  const products = data.ImpDeclarationProduct || [];
  products.forEach((product, index) => {
    xml += `
<ImpDeclarationProduct>
${xmlTag('HSCode', product.HSCode)}
${xmlTag('ProductCode', product.ProductCode, index + 1)}
${xmlTag('ProductName', product.ProductName)}
${xmlTag('BrandCode', product.BrandCode)}
${xmlTag('BrandName', product.BrandName, 'N/A')}
${xmlTag('ModelCode', product.ModelCode)}
${xmlTag('ModelName', product.ModelName, 'N/A')}
${xmlTag('ProductStatusCode', product.ProductStatusCode, 'IC04-001')}
${xmlTag('ProductYear', product.ProductYear)}
${xmlTag('FOBValue', product.FOBValue)}
${xmlTag('UnitCode', product.UnitCode, '8')}
${xmlTag('Qty', product.Qty)}
${xmlTag('Weight', product.Weight)}
${xmlTag('ProductSpecification', product.ProductSpecification)}
<TempProductYN>${product.TempProductYN === 'true' || product.TempProductYN === true ? 'true' : 'false'}</TempProductYN>
<CertificateOrignYN>${product.CertificateOrignYN === 'true' || product.CertificateOrignYN === true ? 'true' : 'false'}</CertificateOrignYN>
${xmlTag('CertificateOriginNo', product.CertificateOriginNo)}
${xmlTag('OriginCountry', product.OriginCountry)}
<OrganicYN>${product.OrganicYN === 'true' || product.OrganicYN === true ? 'true' : 'false'}</OrganicYN>
${xmlTag('GradeAlcohol', product.GradeAlcohol)}
${xmlTag('CustomerSalesPrice', product.CustomerSalesPrice)}
${xmlTag('ProductSerialNo', product.ProductSerialNo)}
${xmlTag('VehicleType', product.VehicleType)}
${xmlTag('VehicleChassis', product.VehicleChassis)}
${xmlTag('VehicleColor', product.VehicleColor)}
${xmlTag('VehicleMotor', product.VehicleMotor)}
${xmlTag('VehicleCC', product.VehicleCC)}
${xmlTag('ProductDescription', product.ProductDescription)}
${xmlTag('Remark', product.Remark)}
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
  xmlTag
};
