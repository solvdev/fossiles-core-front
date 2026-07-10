import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { createManualTaxInvoice } from "services/taxInvoiceService";
import { getLocations } from "services/locationService";
import { getProducts } from "services/productService";
import { lookupKioskSale } from "services/kioskExchangeService";
import { lookupTaxpayerByNit } from "services/kioskPosService";
import { formatFelCustomerName, isValidGuatemalaNit, normalizeNit } from "views/kiosks/pos/posUtils";

const DISCOUNT_OPTIONS = [
  { value: "0", label: "Precio normal" },
  { value: "10", label: "10% desc." },
  { value: "15", label: "15% desc." },
  { value: "20", label: "20% desc." },
  { value: "50", label: "50% desc." },
];

const emptyLine = () => ({
  productId: "",
  productSearch: "",
  description: "",
  quantity: "1",
  basePrice: "",
  discountPercent: "0",
  unitPrice: "",
});

const formatMoney = (value) =>
  `Q ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const priceWithDiscount = (basePrice, discountPercent) => {
  const base = Number(basePrice) || 0;
  const pct = Number(discountPercent) || 0;
  return roundMoney(base * (1 - pct / 100));
};

const productLabel = (product) => {
  const code = product.code ? `${product.code} · ` : "";
  return `${code}${product.name || "Producto"}`;
};

function formatEstablishmentLabel(location) {
  const parts = [location.name];
  if (location.felEstablishmentCode) {
    parts.push(`Est. ${location.felEstablishmentCode}`);
  }
  if (location.internalSeriesCode) {
    parts.push(location.internalSeriesCode);
  }
  return parts.join(" · ");
}

function AccountingInvoiceForm() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [taxLookupLoading, setTaxLookupLoading] = useState(false);
  const [saleLookupLoading, setSaleLookupLoading] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [establishments, setEstablishments] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    locationId: "",
    kioskSaleNumber: "",
    customerTaxId: "CF",
    customerName: "CONSUMIDOR FINAL",
    documentType: "FACT",
    address: "",
    phone: "",
    email: "",
    notes: "",
    lines: [emptyLine()],
  });

  useEffect(() => {
    getLocations()
      .then((rows) => {
        const eligible = (rows || [])
          .filter((loc) => String(loc.felEstablishmentCode || "").trim())
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
        setEstablishments(eligible);
        setForm((prev) => {
          if (prev.locationId) return prev;
          const defaultEst =
            eligible.find((loc) => String(loc.felEstablishmentCode || "").trim() === "1") ||
            eligible[0];
          if (!defaultEst) return prev;
          return { ...prev, locationId: String(defaultEst.id) };
        });
      })
      .catch(() => setEstablishments([]))
      .finally(() => setLocationsLoading(false));
  }, []);

  useEffect(() => {
    getProducts()
      .then((rows) => {
        const list = (Array.isArray(rows) ? rows : [])
          .filter((p) => p && (p.name || p.code))
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
        setProducts(list);
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, []);

  const selectedEstablishment = useMemo(
    () => establishments.find((loc) => String(loc.id) === String(form.locationId)) || null,
    [establishments, form.locationId]
  );

  const resolvedDocumentType = useMemo(() => {
    const code = String(selectedEstablishment?.felEstablishmentCode || "").trim();
    return code === "1" ? "FCAM" : "FACT";
  }, [selectedEstablishment]);

  useEffect(() => {
    setForm((prev) =>
      prev.documentType === resolvedDocumentType
        ? prev
        : { ...prev, documentType: resolvedDocumentType }
    );
  }, [resolvedDocumentType]);

  const productsById = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [products]);

  const linesTotal = useMemo(
    () =>
      form.lines.reduce((sum, line) => {
        const qty = Number(line.quantity) || 0;
        const price = Number(line.unitPrice) || 0;
        return sum + qty * price;
      }, 0),
    [form.lines]
  );

  const filteredProductsForLine = (line) => {
    const q = String(line.productSearch || "").trim().toLowerCase();
    if (!q) return products.slice(0, 80);
    return products
      .filter((p) => {
        const hay = `${p.code || ""} ${p.name || ""}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  };

  const patchLine = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const applyProductToLine = (index, productId) => {
    const product = productsById.get(String(productId));
    const current = form.lines[index] || emptyLine();
    if (!product) {
      patchLine(index, {
        productId: "",
        basePrice: current.basePrice,
        unitPrice: current.unitPrice,
        // Conserva la descripción personalizada si ya la escribió.
      });
      return;
    }
    const base = roundMoney(product.salePrice);
    const discountPercent = current.discountPercent || "0";
    const suggested = productLabel(product);
    const previousProduct = current.productId ? productsById.get(String(current.productId)) : null;
    const previousSuggested = previousProduct ? productLabel(previousProduct) : "";
    const currentDesc = String(current.description || "").trim();
    // Solo autocompleta descripción si está vacía o era la sugerida del producto anterior.
    const keepCustom =
      currentDesc &&
      currentDesc !== previousSuggested &&
      currentDesc !== suggested;
    patchLine(index, {
      productId: String(product.id),
      productSearch: "",
      description: keepCustom ? currentDesc : suggested,
      basePrice: String(base),
      unitPrice: String(priceWithDiscount(base, discountPercent)),
    });
  };

  const applyDiscountToLine = (index, discountPercent) => {
    const line = form.lines[index];
    const base = line.basePrice !== "" && line.basePrice != null
      ? Number(line.basePrice)
      : Number(line.unitPrice) || 0;
    patchLine(index, {
      discountPercent: String(discountPercent),
      basePrice: String(roundMoney(base)),
      unitPrice: String(priceWithDiscount(base, discountPercent)),
    });
  };

  const updateLineField = (index, field, value) => {
    if (field === "discountPercent") {
      applyDiscountToLine(index, value);
      return;
    }
    if (field === "basePrice") {
      const line = form.lines[index];
      patchLine(index, {
        basePrice: value,
        unitPrice: String(priceWithDiscount(value, line.discountPercent || "0")),
      });
      return;
    }
    patchLine(index, { [field]: value });
  };

  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));

  const removeLine = (index) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length <= 1 ? prev.lines : prev.lines.filter((_, i) => i !== index),
    }));
  };

  const lookupPosSale = async () => {
    const saleNumber = String(form.kioskSaleNumber || "").trim();
    if (!form.locationId) {
      setError("Seleccione primero el establecimiento emisor.");
      return;
    }
    if (!saleNumber) {
      return;
    }
    try {
      setSaleLookupLoading(true);
      setError("");
      const sale = await lookupKioskSale(saleNumber, form.locationId);
      const saleLines = (sale.items || []).map((item) => {
        const unit = roundMoney(item.unitPrice);
        return {
          ...emptyLine(),
          description: [item.productCode, item.productName, item.colorName].filter(Boolean).join(" "),
          quantity: String(item.quantity ?? 1),
          basePrice: String(unit),
          discountPercent: "0",
          unitPrice: String(unit),
        };
      });
      setForm((prev) => ({
        ...prev,
        kioskSaleNumber: sale.saleNumber || saleNumber,
        customerTaxId: sale.customerTaxId || prev.customerTaxId,
        customerName: sale.customerName || prev.customerName,
        address: sale.address || "",
        phone: sale.phone || "",
        email: sale.email || "",
        lines: saleLines.length > 0 ? saleLines : prev.lines,
      }));
    } catch (err) {
      setError(err.message || "No se encontró la venta POS.");
    } finally {
      setSaleLookupLoading(false);
    }
  };

  const lookupTaxId = async () => {
    const nit = normalizeNit(form.customerTaxId);
    if (!nit || nit === "CF") {
      setForm((prev) => ({ ...prev, customerTaxId: "CF", customerName: "CONSUMIDOR FINAL" }));
      return;
    }
    if (!isValidGuatemalaNit(nit)) {
      setError("El NIT ingresado no es válido.");
      return;
    }
    try {
      setTaxLookupLoading(true);
      setError("");
      const result = await lookupTaxpayerByNit(nit);
      setForm((prev) => ({
        ...prev,
        customerTaxId: result?.taxId || nit,
        customerName: formatFelCustomerName(result?.customerName || prev.customerName || ""),
      }));
    } catch (err) {
      setError(err.message || "No se pudo consultar el NIT.");
    } finally {
      setTaxLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const lines = form.lines
      .map((line) => ({
        description: String(line.description || "").trim(),
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
      }))
      .filter((line) => line.description && line.quantity > 0 && line.unitPrice > 0);

    const linkedSaleNumber = String(form.kioskSaleNumber || "").trim();
    if (!linkedSaleNumber && lines.length === 0) {
      setError("Agregue al menos una línea válida o asocie una venta POS.");
      return;
    }
    if (!form.locationId) {
      setError("Seleccione el establecimiento desde donde se emitirá la factura.");
      return;
    }

    try {
      setSaving(true);
      const invoice = await createManualTaxInvoice({
        locationId: Number(form.locationId),
        kioskSaleNumber: linkedSaleNumber || undefined,
        customerTaxId: normalizeNit(form.customerTaxId) || "CF",
        customerName: form.customerName,
        documentType: form.documentType,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
        lines: linkedSaleNumber ? undefined : lines,
      });
      navigate(`/admin/accounting/invoices/${invoice.id}`);
    } catch (err) {
      setError(err.message || "No se pudo crear la factura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Nueva factura manual</CardTitle>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Row className="mb-2">
              <Col md="8">
                <FormGroup>
                  <Label>Establecimiento emisor</Label>
                  <Input
                    type="select"
                    value={form.locationId}
                    onChange={(e) => setForm((prev) => ({ ...prev, locationId: e.target.value }))}
                    disabled={locationsLoading}
                    required
                  >
                    <option value="">
                      {locationsLoading ? "Cargando establecimientos..." : "Seleccione establecimiento"}
                    </option>
                    {establishments.map((location) => (
                      <option key={location.id} value={location.id}>
                        {formatEstablishmentLabel(location)}
                      </option>
                    ))}
                  </Input>
                  {!locationsLoading && establishments.length === 0 && (
                    <small className="text-danger d-block mt-1">
                      No hay ubicaciones con código de establecimiento FEL. Configúrelas en Catálogos → Ubicaciones.
                    </small>
                  )}
                  {selectedEstablishment && (
                    <small className="text-muted d-block mt-1">
                      Facturará como {selectedEstablishment.felEstablishmentName || selectedEstablishment.name}
                      {selectedEstablishment.internalSeriesCode
                        ? ` · número interno serie ${selectedEstablishment.internalSeriesCode}`
                        : ""}
                    </small>
                  )}
                </FormGroup>
              </Col>
            </Row>

            <Row className="mb-2">
              <Col md="5">
                <FormGroup>
                  <Label>Venta POS asociada (opcional)</Label>
                  <Input
                    value={form.kioskSaleNumber}
                    onChange={(e) => setForm((prev) => ({ ...prev, kioskSaleNumber: e.target.value }))}
                    onBlur={lookupPosSale}
                    placeholder="Número de venta = fel_transaction_id"
                    disabled={!form.locationId}
                  />
                  <small className="text-muted d-block mt-1">
                    Mismo valor que sale_number en POS. Busca la venta y usa sus datos al certificar.
                  </small>
                </FormGroup>
              </Col>
              <Col md="3" className="d-flex align-items-end">
                <Button
                  type="button"
                  color="info"
                  className="mb-3"
                  onClick={lookupPosSale}
                  disabled={saleLookupLoading || !form.locationId || !form.kioskSaleNumber.trim()}
                >
                  {saleLookupLoading ? <Spinner size="sm" /> : "Buscar venta"}
                </Button>
              </Col>
            </Row>

            <Row>
              <Col md="3">
                <FormGroup>
                  <Label>NIT / CF</Label>
                  <Input
                    value={form.customerTaxId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        customerTaxId: e.target.value,
                        customerName:
                          normalizeNit(e.target.value) === "CF" ? "CONSUMIDOR FINAL" : prev.customerName,
                      }))
                    }
                  />
                </FormGroup>
              </Col>
              <Col md="5">
                <FormGroup>
                  <Label>Nombre en factura</Label>
                  <Input
                    value={form.customerName}
                    onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
                  />
                </FormGroup>
              </Col>
              <Col md="4" className="d-flex align-items-end">
                <Button
                  type="button"
                  color="info"
                  className="mb-3 mr-2"
                  onClick={lookupTaxId}
                  disabled={taxLookupLoading}
                >
                  {taxLookupLoading ? <Spinner size="sm" /> : "Consultar NIT"}
                </Button>
              </Col>
            </Row>

            <Row>
              <Col md="4">
                <FormGroup>
                  <Label>Dirección</Label>
                  <Input
                    value={form.address}
                    onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  />
                </FormGroup>
              </Col>
              <Col md="4">
                <FormGroup>
                  <Label>Teléfono</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  />
                </FormGroup>
              </Col>
              <Col md="4">
                <FormGroup>
                  <Label>Correo</Label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </FormGroup>
              </Col>
            </Row>

            <Row>
              <Col md="4">
                <FormGroup>
                  <Label>Tipo de documento</Label>
                  <Input type="select" value={form.documentType} disabled>
                    <option value="FACT">Factura (FACT)</option>
                    <option value="FCAM">Factura Cambiaria (FCAM)</option>
                  </Input>
                  <small className="text-muted">
                    {resolvedDocumentType === "FCAM"
                      ? "Establecimiento 1 emite FCAM (complemento Abonos SAT)."
                      : "Los demás establecimientos emiten FACT."}
                  </small>
                </FormGroup>
              </Col>
            </Row>

            <FormGroup>
              <Label>Notas</Label>
              <Input
                type="textarea"
                rows="2"
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </FormGroup>

            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Líneas</h5>
              <Button type="button" color="default" size="sm" onClick={addLine}>
                Agregar línea
              </Button>
            </div>
            {productsLoading && (
              <Alert color="light" className="border py-2">
                Cargando catálogo de productos...
              </Alert>
            )}
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Producto</th>
                  <th>Descripción (personalizable)</th>
                  <th style={{ width: 110 }}>Cantidad</th>
                  <th style={{ width: 120 }}>P. lista</th>
                  <th style={{ width: 130 }}>Descuento</th>
                  <th style={{ width: 120 }}>P. unit.</th>
                  <th style={{ width: 110 }}>Total</th>
                  <th style={{ width: 50 }} />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => {
                  const options = filteredProductsForLine(line);
                  const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                  return (
                    <tr key={index}>
                      <td>
                        <Input
                          bsSize="sm"
                          className="mb-1"
                          placeholder="Buscar código o nombre..."
                          value={line.productSearch || ""}
                          onChange={(e) => updateLineField(index, "productSearch", e.target.value)}
                          disabled={productsLoading}
                        />
                        <Input
                          type="select"
                          bsSize="sm"
                          value={line.productId || ""}
                          onChange={(e) => applyProductToLine(index, e.target.value)}
                          disabled={productsLoading}
                        >
                          <option value="">Manual / sin catálogo</option>
                          {line.productId && !options.some((p) => String(p.id) === String(line.productId)) && (
                            <option value={line.productId}>
                              {line.description || `Producto #${line.productId}`}
                            </option>
                          )}
                          {options.map((product) => (
                            <option key={product.id} value={product.id}>
                              {productLabel(product)} — {formatMoney(product.salePrice)}
                            </option>
                          ))}
                        </Input>
                      </td>
                      <td>
                        <Input
                          bsSize="sm"
                          value={line.description}
                          onChange={(e) => updateLineField(index, "description", e.target.value)}
                          placeholder="Texto libre para la factura FEL"
                        />
                        <small className="text-muted">
                          Puedes dejar la del producto o escribir una descripción personalizada.
                        </small>
                      </td>
                      <td>
                        <Input
                          bsSize="sm"
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.quantity}
                          onChange={(e) => updateLineField(index, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <Input
                          bsSize="sm"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.basePrice}
                          onChange={(e) => updateLineField(index, "basePrice", e.target.value)}
                          title="Precio de lista / normal"
                        />
                      </td>
                      <td>
                        <Input
                          type="select"
                          bsSize="sm"
                          value={line.discountPercent || "0"}
                          onChange={(e) => updateLineField(index, "discountPercent", e.target.value)}
                        >
                          {DISCOUNT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </Input>
                      </td>
                      <td>
                        <Input
                          bsSize="sm"
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice}
                          onChange={(e) => updateLineField(index, "unitPrice", e.target.value)}
                          title="Precio unitario final (con descuento)"
                        />
                      </td>
                      <td className="align-middle text-right">{formatMoney(lineTotal)}</td>
                      <td>
                        <Button type="button" color="danger" size="sm" onClick={() => removeLine(index)}>
                          ×
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <div className="text-right mb-3">
              <strong>Total líneas: {formatMoney(linesTotal)}</strong>
            </div>

            <div className="text-right">
              <Button
                color="default"
                className="mr-2"
                type="button"
                onClick={() => navigate("/admin/accounting/invoices")}
              >
                Cancelar
              </Button>
              <Button
                color="primary"
                type="submit"
                disabled={saving || locationsLoading || establishments.length === 0}
              >
                {saving ? <Spinner size="sm" /> : "Crear y certificar"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export default AccountingInvoiceForm;
