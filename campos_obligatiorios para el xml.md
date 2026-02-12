Estos campos son obligatorios para subir XML al SIGA.
 <ClearanceType>, <ImporterCode>, <DeclarantCode>, <RegimenCode>, <TotalFOB>, <InsuranceValue>, <FreightValue>, <OtherValue>, <ProductStatusCode>, <TempProductYN> <OrganicYN> (organicYN) debe tener true o false, 

# Campos Obligatorios para XML ImportDUA - SIGA

Este documento lista los campos obligatorios para subir un XML al SIGA (Sistema Integrado de Gestión Aduanera).

---

## DECLARACIÓN (ImpDeclaration)

| Campo | Ejemplo | Descripción |
|-------|---------|-------------|
| `ClearanceType` | IC38-002 | Tipo de despacho |
| `AreaCode` | 10150 | Código de área |
| `FormNo` | 39155 | Número de formulario |
| `BLNo` | PRELIQUIDACION | Número BL (usar PRELIQUIDACION si no tiene) |
| `ConsigneeCode` | RNC214101830141 | RNC del consignatario |
| `ConsigneeName` | EMPRESA SRL | Nombre del consignatario |
| `ConsigneeNationality` | 214 | Código país (214 = RD) |
| `CargoControlNo` | SN | Número control carga |
| `ImporterCode` | RNC214101830141 | RNC del importador |
| `ImporterName` | EMPRESA SRL | Nombre del importador |
| `ImporterNationality` | 214 | Código país |
| `DeclarantCode` | RNC214101830141 | RNC del declarante |
| `DeclarantName` | EMPRESA SRL | Nombre del declarante |
| `DeclarantNationality` | 214 | Código país |
| `RegimenCode` | 1 | Código régimen |
| `TotalFOB` | 90513.5000 | Valor FOB total |
| `InsuranceValue` | 900.0000 | Valor seguro (0 si no aplica) |
| `FreightValue` | 8200.0000 | Valor flete (0 si no aplica) |
| `OtherValue` | 0.0000 | Otros valores |
| `TotalCIF` | 99613.5000 | FOB + Seguro + Flete + Otros |

---

## PROVEEDOR (ImpDeclarationSupplier)

| Campo | Ejemplo | Descripción |
|-------|---------|-------------|
| `ForeignSupplierName` | PORCELAKER CERAMICA, S.A | Nombre del proveedor |
| `ForeignSupplierCode` | TID724C103085 | Código del proveedor |
| `ForeignSupplierNationality` | 724 | Código país (724 = España) |

---

## PRODUCTOS (ImpDeclarationProduct)

| Campo | Ejemplo | Descripción |
|-------|---------|-------------|
| `HSCode` | 68022100 | Código arancelario (8-10 dígitos) |
| `ProductCode` | 1 | Número de línea |
| `ProductName` | PORCELAIN TILE 1200X600X10MM | Descripción del producto |
| `ProductStatusCode` | IC04-001 | Estado (001=Nuevo, 002=Usado) |
| `FOBValue` | 32.5000 | Valor FOB unitario |
| `UnitCode` | 8 | Código de unidad |
| `Qty` | 500.0000 | Cantidad |
| `Weight` | 1 | Peso (usar 1 si no tiene) |
| `OriginCountry` | 724 | País de origen (código) |
| `TempProductYN` | true/false | ¿Producto temporal? |
| `OrganicYN` | true/false | ¿Producto orgánico? |
| `CertificateOrignYN` | true/false | ¿Tiene certificado origen? |
| `GradeAlcohol` | 0.00 | Grado alcohol (0.00 si no aplica) |
| `CustomerSalesPrice` | 0.0000 | Precio venta (0.0000 si no aplica) |
| `VehicleCC` | 0 | CC vehículo (0 si no aplica) |
| `ProductDescription` | (mismo que ProductName) | Descripción arancelaria |
| `Remark` | (mismo que ProductName) | Observaciones |

---

## Códigos de País Comunes

| Código | País |
|--------|------|
| 214 | República Dominicana |
| 840 | Estados Unidos |
| 156 | China |
| 724 | España |
| 276 | Alemania |
| 392 | Japón |
| 410 | Corea del Sur |

---

## Códigos ProductStatusCode

| Código | Descripción |
|--------|-------------|
| IC04-001 | Nuevo |
| IC04-002 | Usado |
| IC04-003 | Reconstruido | 
