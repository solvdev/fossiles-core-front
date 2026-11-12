import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "reactstrap";
import { IconBack, IconClose, IconPlus } from "components/accounting/felUi";
import "./fel-ui.css";
import { createManualTaxInvoice } from "services/taxInvoiceService";
import { getLocations } from "services/locationService";
import { getProducts } from "services/productService";
import { lookupKioskSale } from "services/kioskExchangeService";
import { lookupTaxpayerByNit } from "services/kioskPosService";
import { formatFelCustomerName, isValidGuatemalaNit, normalizeNit } from "views/kiosks/pos/posUtils";
import Select from "react-select";
import { CONSUMIDOR_FINAL_LIMIT } from "utils/taxInvoiceLabels";

const DISCOUNT_OPTIONS = [
  { value: "0", label: "Precio normal" },
  { value: "10", label: "10% desc." },
  { value: "15", label: "15% desc." },
  { value: "20", label: "20% desc." },
  { value: "50", label: "50% desc." },
];

const emptyLine = () => ({
  productId: "",
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

  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: String(product.id),
        label: `${productLabel(product)} — ${formatMoney(product.salePrice)}`,
        searchText: `${product.code || ""} ${product.name || ""}`.toLowerCase(),
      })),
    [products]
  );

  const filterProductOption = (option, rawInput) => {
    const q = String(rawInput || "").trim().toLowerCase();
    if (!q) return true;
    return String(option.data?.searchText || option.label || "").toLowerCase().includes(q);
  };

  const linesTotal = useMemo(
    () =>
      form.lines.reduce((sum, line) => {
        const qty = Number(line.quantity) || 0;
        const price = Number(line.unitPrice) || 0;
        return sum + qty * price;
      }, 0),
    [form.lines]
  );
  const isConsumidorFinal = (normalizeNit(form.customerTaxId) || "CF") === "CF";
  const exceedsConsumidorFinalLimit =
    isConsumidorFinal && !String(form.kioskSaleNumber || "").trim() && linesTotal >= CONSUMIDOR_FINAL_LIMIT;

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
      });
      return;
    }
    const base = roundMoney(product.salePrice);
    const discountPercent = current.discountPercent || "0";
    const suggested = productLabel(product);
    const previousProduct = current.productId ? productsById.get(String(current.productId)) : null;
    const previousSuggested = previousProduct ? productLabel(previousProduct) : "";
    const currentDesc = String(current.description || "").trim();
    const keepCustom =
      currentDesc &&
      currentDesc !== previousSuggested &&
      currentDesc !== suggested;
    patchLine(index, {
      productId: String(product.id),
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
    if (exceedsConsumidorFinalLimit) {
      setError("SAT no acepta facturas a Consumidor Final (CF) de Q2,500.00 o más. Ingrese el NIT o CUI del cliente.");
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
    <div className="content fel-ui">
      <button
        type="button"
        className="fel-back"
        onClick={() => navigate("/admin/accounting/invoices")}
      >
        <IconBack /> Facturas FEL
      </button>

      <div className="fel-header">
        <div>
          <h1 className="fel-title">Nueva factura manual</h1>
          <p className="fel-subtitle">
            Se crea y se certifica ante el SAT desde el establecimiento que elijas.
          </p>
        </div>
      </div>

      {error && <div className="fel-notice fel-notice--err" role="alert">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="fel-card">
          <div className="fel-card__head">
            <h2 className="fel-card__title">Emisión</h2>
          </div>
          <div className="fel-form-grid fel-form-grid--wide">
            <div>
              <label className="fel-label" htmlFor="fel-form-location">Establecimiento emisor</label>
              <select
                id="fel-form-location"
                className="fel-select"
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
              </select>
              {!locationsLoading && establishments.length === 0 && (
                <span className="fel-help fel-help--error">
                  No hay ubicaciones con código de establecimiento FEL. Configúrelas en Catálogos → Ubicaciones.
                </span>
              )}
              {selectedEstablishment && (
                <span className="fel-help">
                  Facturará como {selectedEstablishment.felEstablishmentName || selectedEstablishment.name}
                  {selectedEstablishment.internalSeriesCode
                    ? ` · número interno serie ${selectedEstablishment.internalSeriesCode}`
                    : ""}
                </span>
              )}
            </div>
            <div>
              <div className="fel-label">Tipo de documento</div>
              <div style={{ minHeight: 44, display: "flex", alignItems: "center" }}>
                <span className="fel-pill fel-pill--lg">
                  {resolvedDocumentType === "FCAM" ? "Factura cambiaria (FCAM)" : "Factura (FACT)"}
                </span>
              </div>
              <span className="fel-help">
                {resolvedDocumentType === "FCAM"
                  ? "El establecimiento 1 (central) siempre emite factura cambiaria."
                  : "Lo define el establecimiento emisor."}
              </span>
            </div>
            <div>
              <label className="fel-label" htmlFor="fel-form-sale">
                Venta POS asociada <small>(opcional)</small>
              </label>
              <div className="fel-field-row">
                <input
                  id="fel-form-sale"
                  className="fel-input"
                  value={form.kioskSaleNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, kioskSaleNumber: e.target.value }))}
                  onBlur={lookupPosSale}
                  placeholder="Ej. POS-20261102-0005"
                  disabled={!form.locationId}
                />
                <button
                  type="button"
                  className="fel-btn"
                  onClick={lookupPosSale}
                  disabled={saleLookupLoading || !form.locationId || !form.kioskSaleNumber.trim()}
                >
                  {saleLookupLoading ? <Spinner size="sm" /> : "Buscar venta"}
                </button>
              </div>
              <span className="fel-help">
                Número de venta del POS. Trae el cliente y las líneas de esa venta.
              </span>
            </div>
          </div>
        </div>

        <div className="fel-card">
          <div className="fel-card__head">
            <h2 className="fel-card__title">Cliente</h2>
          </div>
          <div className="fel-form-grid">
            <div>
              <label className="fel-label" htmlFor="fel-form-nit">NIT / CF</label>
              <div className="fel-field-row">
                <input
                  id="fel-form-nit"
                  className="fel-input"
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
                <button
                  type="button"
                  className="fel-btn"
                  onClick={lookupTaxId}
                  disabled={taxLookupLoading}
                >
                  {taxLookupLoading ? <Spinner size="sm" /> : "Consultar NIT"}
                </button>
              </div>
            </div>
            <div>
              <label className="fel-label" htmlFor="fel-form-name">Nombre en factura</label>
              <input
                id="fel-form-name"
                className="fel-input"
                value={form.customerName}
                onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))}
              />
            </div>
            <div>
              <label className="fel-label" htmlFor="fel-form-address">Dirección</label>
              <input
                id="fel-form-address"
                className="fel-input"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div>
              <label className="fel-label" htmlFor="fel-form-phone">Teléfono</label>
              <input
                id="fel-form-phone"
                className="fel-input"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="fel-label" htmlFor="fel-form-email">Correo</label>
              <input
                id="fel-form-email"
                className="fel-input"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
          </div>
        </div>

        <div className="fel-card fel-card--flush">
          <div className="fel-card__head">
            <h2 className="fel-card__title">Líneas</h2>
            <button type="button" className="fel-btn fel-btn--sm" onClick={addLine}>
              <IconPlus /> Agregar línea
            </button>
          </div>
          {productsLoading && (
            <div className="fel-notice fel-notice--muted" style={{ margin: "0 20px 12px" }}>
              Cargando catálogo de productos...
            </div>
          )}
          <div className="fel-table-wrap">
            <table className="fel-table fel-lines-table" style={{ minWidth: 1020 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 250 }}>Producto</th>
                  <th style={{ minWidth: 240 }}>Descripción (personalizable)</th>
                  <th style={{ width: 100 }}>Cantidad</th>
                  <th style={{ width: 110 }}>P. lista</th>
                  <th style={{ width: 130 }}>Descuento</th>
                  <th style={{ width: 110 }}>P. unit.</th>
                  <th style={{ width: 110 }} className="is-right">Total</th>
                  <th style={{ width: 50 }}><span className="fel-visually-hidden">Quitar</span></th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => {
                  const selectedProduct =
                    productOptions.find((o) => o.value === String(line.productId || "")) || null;
                  const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
                  return (
                    <tr key={index}>
                      <td style={{ minWidth: 260 }}>
                        <Select
                          className="react-select"
                          classNamePrefix="react-select"
                          placeholder="Escribe para buscar producto..."
                          isClearable
                          isDisabled={productsLoading}
                          options={productOptions}
                          value={selectedProduct}
                          filterOption={filterProductOption}
                          onChange={(selected) =>
                            applyProductToLine(index, selected ? selected.value : "")
                          }
                          noOptionsMessage={() => "Sin coincidencias"}
                          menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                            container: (base) => ({ ...base, minWidth: 240 }),
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="fel-input"
                          aria-label={`Descripción de la línea ${index + 1}`}
                          value={line.description}
                          onChange={(e) => updateLineField(index, "description", e.target.value)}
                          placeholder="Texto libre para la factura FEL"
                        />
                      </td>
                      <td>
                        <input
                          className="fel-input"
                          type="number"
                          min="0"
                          step="0.001"
                          aria-label={`Cantidad de la línea ${index + 1}`}
                          value={line.quantity}
                          onChange={(e) => updateLineField(index, "quantity", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="fel-input"
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label={`Precio de lista de la línea ${index + 1}`}
                          value={line.basePrice}
                          onChange={(e) => updateLineField(index, "basePrice", e.target.value)}
                          title="Precio de lista / normal"
                        />
                      </td>
                      <td>
                        <select
                          className="fel-select"
                          aria-label={`Descuento de la línea ${index + 1}`}
                          value={line.discountPercent || "0"}
                          onChange={(e) => updateLineField(index, "discountPercent", e.target.value)}
                        >
                          {DISCOUNT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="fel-input"
                          type="number"
                          min="0"
                          step="0.01"
                          aria-label={`Precio unitario de la línea ${index + 1}`}
                          value={line.unitPrice}
                          onChange={(e) => updateLineField(index, "unitPrice", e.target.value)}
                          title="Precio unitario final (con descuento)"
                        />
                      </td>
                      <td className="is-right fel-num" style={{ fontWeight: 600 }}>{formatMoney(lineTotal)}</td>
                      <td>
                        <button
                          type="button"
                          className="fel-icon-btn"
                          onClick={() => removeLine(index)}
                          disabled={form.lines.length <= 1}
                          aria-label={`Quitar la línea ${index + 1}`}
                          title="Quitar línea"
                        >
                          <IconClose />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {exceedsConsumidorFinalLimit && (
            <div className="fel-notice fel-notice--warn" style={{ margin: "12px 20px 0" }} role="alert">
              SAT no acepta facturas a Consumidor Final (CF) de Q2,500.00 o más. Ingrese el NIT o CUI del cliente.
            </div>
          )}
          <div className="fel-footer-bar" style={{ marginTop: 16 }}>
            <div>
              <div className="fel-kv__label">Total de la factura</div>
              <div className="fel-footer-bar__total fel-num">{formatMoney(linesTotal)}</div>
            </div>
            <div className="d-flex flex-wrap" style={{ gap: 10 }}>
              <button
                type="button"
                className="fel-btn"
                onClick={() => navigate("/admin/accounting/invoices")}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="fel-btn fel-btn--primary"
                disabled={saving || locationsLoading || establishments.length === 0 || exceedsConsumidorFinalLimit}
              >
                {saving ? <Spinner size="sm" /> : "Crear y certificar"}
              </button>
            </div>
          </div>
        </div>

        <div className="fel-card">
          <label className="fel-label" htmlFor="fel-form-notes">
            Notas <small>(internas)</small>
          </label>
          <textarea
            id="fel-form-notes"
            className="fel-textarea"
            rows="2"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
      </form>
    </div>
  );
}

export default AccountingInvoiceForm;
