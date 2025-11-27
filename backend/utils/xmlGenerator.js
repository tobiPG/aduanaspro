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
<ClearanceType>${escapeXml(data.ClearanceType || 'IC38-002')}</ClearanceType>
<AreaCode>${escapeXml(data.AreaCode || '10150')}</AreaCode>
<FormNo>${escapeXml(data.FormNo || '40001')}</FormNo>
<BLNo>${escapeXml(data.BLNo)}</BLNo>
<ManifestNo>${escapeXml(data.ManifestNo)}</ManifestNo>
<ConsigneeCode>${escapeXml(data.ConsigneeCode)}</ConsigneeCode>
<ConsigneeName>${escapeXml(data.ConsigneeName)}</ConsigneeName>
<ConsigneeNationality>${escapeXml(data.ConsigneeNationality || '214')}</ConsigneeNationality>
<CargoControlNo>${escapeXml(data.CargoControlNo || 'SN')}</CargoControlNo>
<CommercialInvoiceNo>${escapeXml(data.CommercialInvoiceNo)}</CommercialInvoiceNo>
<DestinationLocationCode>${escapeXml(data.DestinationLocationCode)}</DestinationLocationCode>
<EntryPort>${escapeXml(data.EntryPort)}</EntryPort>
<DepartureCountryCode>${escapeXml(data.DepartureCountryCode)}</DepartureCountryCode>
<TransportCompanyCode>${escapeXml(data.TransportCompanyCode)}</TransportCompanyCode>
<TransportNationality>${escapeXml(data.TransportNationality)}</TransportNationality>
<TransportMethod>${escapeXml(data.TransportMethod)}</TransportMethod>
<EntryPlanDate>${formatDate(data.EntryPlanDate)}</EntryPlanDate>
<EntryDate>${formatDate(data.EntryDate)}</EntryDate>
<ImporterCode>${escapeXml(data.ImporterCode)}</ImporterCode>
<ImporterName>${escapeXml(data.ImporterName)}</ImporterName>
<ImporterNationality>${escapeXml(data.ImporterNationality || '214')}</ImporterNationality>
<BrokerEmployeeCode>${escapeXml(data.BrokerEmployeeCode)}</BrokerEmployeeCode>
<BrokerCompanyCode>${escapeXml(data.BrokerCompanyCode)}</BrokerCompanyCode>
<DeclarantCode>${escapeXml(data.DeclarantCode)}</DeclarantCode>
<DeclarantName>${escapeXml(data.DeclarantName)}</DeclarantName>
<DeclarantNationality>${escapeXml(data.DeclarantNationality || '214')}</DeclarantNationality>
<RegimenCode>${escapeXml(data.RegimenCode || '1')}</RegimenCode>
<AgreementCode>${escapeXml(data.AgreementCode)}</AgreementCode>
<TotalFOB>${escapeXml(data.TotalFOB || '0.0000')}</TotalFOB>
<InsuranceValue>${escapeXml(data.InsuranceValue || '0.0000')}</InsuranceValue>
<FreightValue>${escapeXml(data.FreightValue || '0.0000')}</FreightValue>
<OtherValue>${escapeXml(data.OtherValue || '0.0000')}</OtherValue>
<TotalCIF>${escapeXml(data.TotalCIF || '0.0000')}</TotalCIF>
<TotalWeight>${escapeXml(data.TotalWeight || '0.00')}</TotalWeight>
<NetWeight>${escapeXml(data.NetWeight || '0.00')}</NetWeight>
<Remark>${escapeXml(data.Remark)}</Remark>`;

  // Datos del proveedor
  const supplier = data.ImpDeclarationSupplier || {};
  xml += `
<ImpDeclarationSupplier>
<ForeignSupplierName>${escapeXml(supplier.ForeignSupplierName)}</ForeignSupplierName>
<ForeignSupplierCode>${escapeXml(supplier.ForeignSupplierCode)}</ForeignSupplierCode>
<ForeignSupplierNationality>${escapeXml(supplier.ForeignSupplierNationality)}</ForeignSupplierNationality>
</ImpDeclarationSupplier>`;

  // Productos
  const products = data.ImpDeclarationProduct || [];
  products.forEach((product, index) => {
    xml += `
<ImpDeclarationProduct>
<HSCode>${escapeXml(product.HSCode)}</HSCode>
<ProductCode>${escapeXml(product.ProductCode || (index + 1))}</ProductCode>
<ProductName>${escapeXml(product.ProductName)}</ProductName>
<BrandCode>${escapeXml(product.BrandCode)}</BrandCode>
<BrandName>${escapeXml(product.BrandName || 'N/A')}</BrandName>
<ModelCode>${escapeXml(product.ModelCode)}</ModelCode>
<ModelName>${escapeXml(product.ModelName || 'N/A')}</ModelName>
<ProductStatusCode>${escapeXml(product.ProductStatusCode || 'IC04-001')}</ProductStatusCode>
<ProductYear>${escapeXml(product.ProductYear)}</ProductYear>
<FOBValue>${escapeXml(product.FOBValue || '0.0000')}</FOBValue>
<UnitCode>${escapeXml(product.UnitCode || '8')}</UnitCode>
<Qty>${escapeXml(product.Qty || '1.0000')}</Qty>
<Weight>${escapeXml(product.Weight || '1')}</Weight>
<ProductSpecification>${escapeXml(product.ProductSpecification)}</ProductSpecification>
<TempProductYN>${escapeXml(product.TempProductYN === 'true' || product.TempProductYN === true ? 'true' : 'false')}</TempProductYN>
<CertificateOrignYN>${escapeXml(product.CertificateOrignYN === 'true' || product.CertificateOrignYN === true ? 'true' : 'false')}</CertificateOrignYN>
<CertificateOriginNo>${escapeXml(product.CertificateOriginNo)}</CertificateOriginNo>
<OriginCountry>${escapeXml(product.OriginCountry)}</OriginCountry>
<OrganicYN>${escapeXml(product.OrganicYN === 'true' || product.OrganicYN === true ? 'true' : 'false')}</OrganicYN>
<GradeAlcohol>${escapeXml(product.GradeAlcohol || '0.00')}</GradeAlcohol>
<CustomerSalesPrice>${escapeXml(product.CustomerSalesPrice || '0.0000')}</CustomerSalesPrice>
<ProductSerialNo>${escapeXml(product.ProductSerialNo)}</ProductSerialNo>
<VehicleType>${escapeXml(product.VehicleType)}</VehicleType>
<VehicleChassis>${escapeXml(product.VehicleChassis)}</VehicleChassis>
<VehicleColor>${escapeXml(product.VehicleColor)}</VehicleColor>
<VehicleMotor>${escapeXml(product.VehicleMotor)}</VehicleMotor>
<VehicleCC>${escapeXml(product.VehicleCC || '0')}</VehicleCC>
<ProductDescription>${escapeXml(product.ProductDescription)}</ProductDescription>
<Remark>${escapeXml(product.Remark)}</Remark>
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
  formatDate
};
