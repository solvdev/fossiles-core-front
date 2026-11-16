import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Col,
  Collapse,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  UncontrolledDropdown,
} from "reactstrap";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { useAuth } from "contexts/AuthContext";
import AccessDenied from "components/AccessDenied";
import {
  productLedgerLabCreateMovement,
  productLedgerLabDeleteMovement,
  productLedgerLabListLocations,
  productLedgerLabListMovements,
  productLedgerLabListStocks,
  productLedgerLabReplayAllStocks,
  productLedgerLabReplayStock,
  productLedgerLabUpdateMovement,
  productLedgerLabUpdateStock,
} from "services/productLedgerLabService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  movementDelta,
  productMovementTypeLabel,
  productMovementTypeTone,
  sortedNonZeroSizeEntries,
} from "utils/productMovementHelper";
import "views/kiosks/KioskLedgerLab.css";
import "views/accounting/KioskMovementsAccounting.css";

const ALLOWED_USERNAME = "eramirez";

const PRODUCT_MOVEMENT_TYPES = [
  "PRODUCTION_ENTRY",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "SHIPMENT",
  "SHIPMENT_REVERSAL",
  "ONLINE_SALE_DISPATCH",
  "ONLINE_SALE_DISPATCH_REVERSAL",
  "SALE_EXIT",
  "RETURN",
  "ADJUSTMENT",
];

const MOVEMENT_TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos", searchText: "todos" },
  ...PRODUCT_MOVEMENT_TYPES.map((value) => ({
    value,
    label: productMovementTypeLabel(value),
    searchText: `${productMovementTypeLabel(value)} ${value}`,
  })),
];

const EMPTY_FILTERS = {
  locationId: "",
  productTerm: "",
  stockId: "",
  type: "",
  sizeLabel: "",
  from: "",
  to: "",
  referenceTerm: "",
  description: "",
  movementId: "",
};

const ADVANCED_FILTER_KEYS = ["type", "sizeLabel", "from", "to", "movementId", "referenceTerm", "description"];

function IconButton({ icon, title, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      className={`kll-icon-btn${danger ? " danger" : ""}`}
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      <i className={`nc-icon ${icon}`} />
    </button>
  );
}

function FieldLabel({ children }) {
  return <span className="kll-label">{children}</span>;
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="kll-empty">
      <div className="kll-empty-icon"><i className={`nc-icon ${icon}`} /></div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

const EMPTY_MOVEMENT_FORM = {
  stockId: "",
  movementType: "ADJUSTMENT",
  quantity: "1",
  sizeLabel: "",
  quantityBefore: "",
  quantityAfter: "",
  referenceType: "",
  referenceId: "",
  referenceNumber: "",
  referenceLineId: "",
  description: "",
  unitCost: "",
  totalCost: "",
  createdBy: "",
  movementDate: "",
};

function toLocalInputValue(iso) {
  if (!iso) return "";
  const s = String(iso);
  if (s.length >= 16) return s.slice(0, 16);
  return s;
}

function fromLocalInputValue(local) {
  if (!local) return null;
  return `${local}:00`;
}

function emptyToNull(value) {
  if (value === "" || value === undefined || value === null) return null;
  return value;
}

function numOrNull(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sizesSummary(stock) {
  if (stock?.sizes && typeof stock.sizes === "object") {
    return Object.entries(stock.sizes)
      .filter(([, v]) => Number(v) !== 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ") || "—";
  }
  return "—";
}

function movementToForm(m) {
  if (!m) return { ...EMPTY_MOVEMENT_FORM };
  return {
    stockId: m.stockId != null ? String(m.stockId) : "",
    movementType: m.movementType || "ADJUSTMENT",
    quantity: m.quantity != null ? String(m.quantity) : "",
    sizeLabel: m.sizeLabel || "",
    quantityBefore: m.quantityBefore != null ? String(m.quantityBefore) : "",
    quantityAfter: m.quantityAfter != null ? String(m.quantityAfter) : "",
    referenceType: m.referenceType || "",
    referenceId: m.referenceId != null ? String(m.referenceId) : "",
    referenceNumber: m.referenceNumber || "",
    referenceLineId: m.referenceLineId != null ? String(m.referenceLineId) : "",
    description: m.description || "",
    unitCost: m.unitCost != null ? String(m.unitCost) : "",
    totalCost: m.totalCost != null ? String(m.totalCost) : "",
    createdBy: m.createdBy != null ? String(m.createdBy) : "",
    movementDate: toLocalInputValue(m.movementDate),
  };
}

function formToPayload(form) {
  return {
    stockId: numOrNull(form.stockId),
    movementType: form.movementType || null,
    quantity: numOrNull(form.quantity),
    sizeLabel: emptyToNull(form.sizeLabel),
    quantityBefore: numOrNull(form.quantityBefore),
    quantityAfter: numOrNull(form.quantityAfter),
    referenceType: emptyToNull(form.referenceType),
    referenceId: numOrNull(form.referenceId),
    referenceNumber: emptyToNull(form.referenceNumber),
    referenceLineId: numOrNull(form.referenceLineId),
    description: emptyToNull(form.description),
    unitCost: numOrNull(form.unitCost),
    totalCost: numOrNull(form.totalCost),
    createdBy: numOrNull(form.createdBy),
    movementDate: fromLocalInputValue(form.movementDate),
  };
}

export default function ProductLedgerLab() {
  const { user, loading: authLoading, initialized } = useAuth();
  const username = String(user?.username || "").trim().toLowerCase();
  const allowed = username === ALLOWED_USERNAME;

  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [stocks, setStocks] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedStockId, setSelectedStockId] = useState(null);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_MOVEMENT_FORM);
  const [stockEditorOpen, setStockEditorOpen] = useState(false);
  const [stockForm, setStockForm] = useState({
    quantity: "",
    min: "",
    sizesData: "",
  });
  const [saving, setSaving] = useState(false);
  const movementsRequestIdRef = React.useRef(0);

  const locationOptions = useMemo(() => {
    const opts = (locations || []).map((loc) => ({
      value: String(loc.id),
      label: `${loc.code || ""} · ${loc.name || ""}`.trim(),
      searchText: `${loc.code || ""} ${loc.name || ""}`,
    }));
    return [{ value: "", label: "— Bodega —", searchText: "bodega" }, ...opts];
  }, [locations]);

  useEffect(() => {
    if (!allowed) return;
    productLedgerLabListLocations()
      .then((data) => setLocations(data || []))
      .catch((err) => showError(err.message || "No se pudieron cargar ubicaciones."));
  }, [allowed]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const activeAdvancedCount = ADVANCED_FILTER_KEYS.filter((key) => Boolean(filters[key])).length;
  const hasAnyFilter = Object.values(filters).some(Boolean);
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSelectedStockId(null);
  };

  const loadStocks = useCallback(async () => {
    if (!filters.locationId && !filters.stockId) {
      setStocks([]);
      return;
    }
    setLoadingStocks(true);
    try {
      const data = await productLedgerLabListStocks({
        locationId: filters.locationId || undefined,
        stockId: filters.stockId || undefined,
        productTerm: filters.productTerm || undefined,
      });
      setStocks(data || []);
    } catch (err) {
      showError(err.message || "Error al cargar stock.");
      setStocks([]);
    } finally {
      setLoadingStocks(false);
    }
  }, [filters.locationId, filters.stockId, filters.productTerm]);

  const loadMovements = useCallback(async (opts = {}) => {
    const stockId =
      opts.stockId !== undefined ? opts.stockId : (selectedStockId || filters.stockId || null);
    const resolvedStockId = stockId != null && stockId !== "" ? stockId : null;

    if (!filters.locationId && !resolvedStockId && !filters.movementId) {
      setMovements([]);
      return;
    }
    const requestId = ++movementsRequestIdRef.current;
    setLoadingMovements(true);
    try {
      const data = await productLedgerLabListMovements({
        locationId: resolvedStockId ? undefined : (filters.locationId || undefined),
        stockId: resolvedStockId || undefined,
        type: filters.type || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        referenceTerm: filters.referenceTerm || undefined,
        description: filters.description || undefined,
        sizeLabel: filters.sizeLabel || undefined,
        movementId: filters.movementId || undefined,
      });
      if (requestId !== movementsRequestIdRef.current) {
        return;
      }
      let rows = data || [];
      if (resolvedStockId) {
        rows = rows.filter((m) => String(m.stockId) === String(resolvedStockId));
      }
      setMovements(rows);
    } catch (err) {
      if (requestId !== movementsRequestIdRef.current) {
        return;
      }
      showError(err.message || "Error al cargar movimientos.");
      setMovements([]);
    } finally {
      if (requestId === movementsRequestIdRef.current) {
        setLoadingMovements(false);
      }
    }
  }, [filters, selectedStockId]);

  useEffect(() => {
    if (!allowed) return;
    loadStocks();
  }, [allowed, loadStocks]);

  useEffect(() => {
    if (!allowed) return;
    loadMovements();
  }, [allowed, loadMovements]);

  const selectedStock = useMemo(
    () => stocks.find((s) => String(s.id) === String(selectedStockId)) || null,
    [stocks, selectedStockId]
  );

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_MOVEMENT_FORM,
      stockId: selectedStockId != null ? String(selectedStockId) : filters.stockId || "",
      quantityBefore: selectedStock?.quantity != null ? String(selectedStock.quantity) : "",
      createdBy: user?.id != null ? String(user.id) : "",
    });
    setEditorOpen(true);
  };

  const openEdit = (movement) => {
    setEditingId(movement.id);
    setForm(movementToForm(movement));
    setEditorOpen(true);
  };

  const openStockEditor = () => {
    if (!selectedStock) return;
    setStockForm({
      quantity: selectedStock.quantity != null ? String(selectedStock.quantity) : "",
      min: selectedStock.min != null ? String(selectedStock.min) : "",
      sizesData: selectedStock.sizesData || "",
    });
    setStockEditorOpen(true);
  };

  const handleSaveMovement = async () => {
    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        await productLedgerLabUpdateMovement(editingId, payload);
        showSuccess(`Movimiento #${editingId} actualizado.`);
      } else {
        const created = await productLedgerLabCreateMovement(payload);
        showSuccess(`Movimiento #${created.id} creado.`);
      }
      setEditorOpen(false);
      await loadMovements({
        stockId: payload.stockId || selectedStockId || undefined,
      });
      await loadStocks();
    } catch (err) {
      showError(err.message || "No se pudo guardar el movimiento.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMovement = async (movement) => {
    if (!window.confirm(`¿Eliminar movimiento #${movement.id}?`)) return;
    setSaving(true);
    try {
      await productLedgerLabDeleteMovement(movement.id);
      showSuccess(`Movimiento #${movement.id} eliminado.`);
      const stockId = movement.stockId;
      await loadMovements({ stockId: stockId || selectedStockId || undefined });
      await loadStocks();
    } catch (err) {
      showError(err.message || "No se pudo eliminar.");
    } finally {
      setSaving(false);
    }
  };

  const handleReplay = async () => {
    if (!selectedStockId) {
      showError("Selecciona un stock.");
      return;
    }
    if (!window.confirm(
      `¿Recalcular quantity / sizes_data y before/after del stock #${selectedStockId}?`
    )) {
      return;
    }
    setSaving(true);
    try {
      await productLedgerLabReplayStock(selectedStockId);
      showSuccess("Cadena recalculada.");
      await loadStocks();
      await loadMovements({ stockId: selectedStockId || undefined });
    } catch (err) {
      showError(err.message || "Replay falló.");
    } finally {
      setSaving(false);
    }
  };

  const handleReplayAll = async () => {
    if (!filters.locationId) {
      showError("Selecciona una bodega.");
      return;
    }
    const locLabel =
      locationOptions.find((o) => String(o.value) === String(filters.locationId))?.label
      || `location #${filters.locationId}`;
    if (!window.confirm(
      `¿Recalcular quantity/sizes_data de TODOS los stocks de ${locLabel}?\n\n`
      + `Esto puede tardar unos segundos.`
    )) {
      return;
    }
    setSaving(true);
    try {
      const result = await productLedgerLabReplayAllStocks(filters.locationId);
      showSuccess(`Replay all listo: ${result?.stockCount ?? 0} stocks recalculados.`);
      await loadStocks();
      await loadMovements();
    } catch (err) {
      showError(err.message || "Replay all falló.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStock = async () => {
    if (!selectedStockId) return;
    setSaving(true);
    try {
      await productLedgerLabUpdateStock(selectedStockId, {
        quantity: numOrNull(stockForm.quantity),
        min: numOrNull(stockForm.min),
        sizesData: stockForm.sizesData,
      });
      showSuccess(`Stock #${selectedStockId} actualizado.`);
      setStockEditorOpen(false);
      await loadStocks();
    } catch (err) {
      showError(err.message || "No se pudo actualizar stock.");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !initialized) {
    return (
      <div className="content d-flex justify-content-center align-items-center" style={{ minHeight: 240 }}>
        <Spinner color="primary" />
      </div>
    );
  }

  if (!allowed) {
    return <AccessDenied />;
  }

  const hasScope = Boolean(filters.locationId || filters.stockId);
  const selectedSizeEntries = sortedNonZeroSizeEntries(selectedStock?.sizes);
  const movementsScopeLabel = selectedStockId || filters.stockId
    ? (selectedStock
      ? `${selectedStock.productCode} / ${selectedStock.colorName || "sin color"}`
      : "stock seleccionado")
    : null;
  const setFormField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <div className="content kll kma">
      {/* ───────── Encabezado ───────── */}
      <div className="kll-head">
        <div className="kll-title">
          <div className="kll-title-icon"><i className="nc-icon nc-layout-11" /></div>
          <div>
            <h4>
              Product Ledger Lab
              <span className="kll-lock">solo {ALLOWED_USERNAME}</span>
            </h4>
            <small>Cirugía de product_inventory_kardex / product_inventory_location (PT + Devoluciones)</small>
          </div>
        </div>
        <div className="kll-head-actions">
          <Button
            color="secondary"
            outline
            size="sm"
            onClick={() => { loadStocks(); loadMovements(); }}
            disabled={saving}
          >
            <i className="nc-icon nc-refresh-69 mr-1" /> Refrescar
          </Button>
          <UncontrolledDropdown>
            <DropdownToggle color="warning" size="sm" caret disabled={saving}>
              Replay
            </DropdownToggle>
            <DropdownMenu right>
              <DropdownItem onClick={handleReplay} disabled={!selectedStockId}>
                Stock seleccionado
                <small>Recalcula quantity / sizes_data y before/after del stock marcado</small>
              </DropdownItem>
              <DropdownItem onClick={handleReplayAll} disabled={!filters.locationId}>
                Toda la bodega
                <small>Todos los stocks de la bodega seleccionada</small>
              </DropdownItem>
            </DropdownMenu>
          </UncontrolledDropdown>
          <Button color="info" outline size="sm" onClick={openStockEditor} disabled={!selectedStock || saving}>
            <i className="nc-icon nc-ruler-pencil mr-1" /> Editar stock
          </Button>
          <Button color="primary" size="sm" onClick={openCreate} disabled={saving}>
            <i className="nc-icon nc-simple-add mr-1" /> Movimiento
          </Button>
        </div>
      </div>

      <div className="kll-callout">
        <i className="nc-icon nc-alert-circle-i" aria-hidden="true" />
        <div>
          Mutaciones directas al ledger. Crear/editar/borrar movimiento hace <strong>Replay stock</strong> automático;
          el replay manual queda como recuperación.
        </div>
      </div>

      {/* ───────── Filtros ───────── */}
      <div className="kll-card">
        <div className="kll-filters">
          <Row className="align-items-end">
            <Col lg={5} md={6} className="mb-2">
              <FieldLabel>Bodega</FieldLabel>
              <FilterableSelect
                options={locationOptions}
                value={filters.locationId}
                onChange={(v) => {
                  setFilter("locationId", v || "");
                  setSelectedStockId(null);
                }}
                placeholder="Bodega"
              />
            </Col>
            <Col lg={5} md={6} className="mb-2">
              <FieldLabel>Producto / código</FieldLabel>
              <Input
                bsSize="sm"
                placeholder="Buscar producto"
                value={filters.productTerm}
                onChange={(e) => setFilter("productTerm", e.target.value)}
              />
            </Col>
            <Col lg={2} md={4} className="mb-2">
              <FieldLabel>Stock ID</FieldLabel>
              <Input
                bsSize="sm"
                placeholder="#"
                value={filters.stockId}
                onChange={(e) => setFilter("stockId", e.target.value)}
              />
            </Col>
          </Row>

          <Collapse isOpen={advancedOpen}>
            <div className="kll-advanced">
              <Row>
                <Col lg={3} md={6} className="mb-2">
                  <FieldLabel>Tipo de movimiento</FieldLabel>
                  <FilterableSelect
                    options={MOVEMENT_TYPE_OPTIONS}
                    value={filters.type}
                    onChange={(v) => setFilter("type", v || "")}
                    placeholder="Todos los tipos"
                  />
                </Col>
                <Col lg={2} md={3} xs={6} className="mb-2">
                  <FieldLabel>Talla</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="38"
                    value={filters.sizeLabel}
                    onChange={(e) => setFilter("sizeLabel", e.target.value)}
                  />
                </Col>
                <Col lg={2} md={3} xs={6} className="mb-2">
                  <FieldLabel>Desde</FieldLabel>
                  <Input
                    bsSize="sm"
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilter("from", e.target.value)}
                  />
                </Col>
                <Col lg={2} md={3} xs={6} className="mb-2">
                  <FieldLabel>Hasta</FieldLabel>
                  <Input
                    bsSize="sm"
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilter("to", e.target.value)}
                  />
                </Col>
                <Col lg={3} md={3} xs={6} className="mb-2">
                  <FieldLabel>Mov. ID</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="#"
                    value={filters.movementId}
                    onChange={(e) => setFilter("movementId", e.target.value)}
                  />
                </Col>
                <Col lg={6} md={6} className="mb-2">
                  <FieldLabel>Referencia / número</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="OP, envío, venta…"
                    value={filters.referenceTerm}
                    onChange={(e) => setFilter("referenceTerm", e.target.value)}
                  />
                </Col>
                <Col lg={6} md={6} className="mb-2">
                  <FieldLabel>Descripción contiene</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="Texto de la descripción"
                    value={filters.description}
                    onChange={(e) => setFilter("description", e.target.value)}
                  />
                </Col>
              </Row>
            </div>
          </Collapse>

          <div className="kll-filter-foot">
            <button type="button" className="kll-link" onClick={() => setAdvancedOpen((v) => !v)}>
              {advancedOpen ? "Ocultar filtros avanzados" : "Más filtros"}
              {activeAdvancedCount > 0 && <span className="kll-count">{activeAdvancedCount}</span>}
            </button>
            {hasAnyFilter && (
              <button type="button" className="kll-link" onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      <Row>
        {/* ───────── Stock ───────── */}
        <Col xl={4} lg={5}>
          <div className="kll-card">
            <div className="kll-card-head">
              <div className="kll-card-title">
                Stock <span className="kll-count">{stocks.length}</span>
              </div>
              {loadingStocks && <Spinner size="sm" color="primary" />}
            </div>

            {selectedStock && (
              <div className="kll-para-panel kma-selected">
                <div className="kll-para-head">
                  <div>
                    <div className="kll-para-name">{selectedStock.productCode}</div>
                    <div className="kll-para-meta">
                      <span className="kll-mono">#{selectedStock.id}</span>
                      <span>{selectedStock.colorName || "sin color"}</span>
                      <span>· loc {selectedStock.locationId}</span>
                    </div>
                  </div>
                  <div className="kma-stock-now">
                    <span className="kll-label">qty</span>
                    <b>{selectedStock.quantity}</b>
                    <small className="kll-muted">min {selectedStock.min ?? "—"}</small>
                  </div>
                </div>
                {selectedSizeEntries.length > 0 && (
                  <div className="kll-size-chips mb-2">
                    {selectedSizeEntries.map(([k, v]) => (
                      <span key={k} className={`kll-size-chip kma-static${Number(v) < 0 ? " kma-neg" : ""}`}>
                        <b>{k}</b>
                        <span>×{v}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="kll-mono kma-raw" title="sizes_data">
                  sizes_data: {selectedStock.sizesData || "null"}
                </div>
              </div>
            )}

            <div className={`kll-scroll stocks${loadingStocks ? " kll-loading" : ""}`}>
              <table className="kll-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Color</th>
                    <th className="num">Qty</th>
                    <th>Tallas</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => {
                    const qty = Number(s.quantity);
                    const sizeEntries = sortedNonZeroSizeEntries(s.sizes);
                    return (
                      <tr
                        key={s.id}
                        className={`clickable${String(selectedStockId) === String(s.id) ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedStockId(s.id);
                          loadMovements({ stockId: s.id });
                        }}
                      >
                        <td>
                          <div className="kll-prod">{s.productCode}</div>
                          <div className="kll-prod-sub" title={s.productName}>{s.productName}</div>
                        </td>
                        <td>{s.colorName || <span className="kll-muted">—</span>}</td>
                        <td className="num">
                          <span className={`kll-qty${qty === 0 ? " zero" : ""}${qty < 0 ? " neg" : ""}`}>
                            {s.quantity}
                          </span>
                        </td>
                        <td>
                          {sizeEntries.length > 0 ? (
                            <div className="kll-mini-sizes" title={sizesSummary(s)}>
                              {sizeEntries.slice(0, 6).map(([k, v]) => (
                                <span key={k} className={Number(v) < 0 ? "kma-neg" : undefined}><b>{k}</b>×{v}</span>
                              ))}
                              {sizeEntries.length > 6 && <em>+{sizeEntries.length - 6}</em>}
                            </div>
                          ) : (
                            <span className="kll-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loadingStocks && stocks.length === 0 && (
                <EmptyState
                  icon="nc-tag"
                  title={hasScope ? "Sin stock con esos filtros" : "Elige una bodega"}
                  text={hasScope
                    ? "Prueba quitando el filtro de producto."
                    : "Selecciona una bodega (o escribe un stock ID) para ver sus filas."}
                />
              )}
            </div>
          </div>
        </Col>

        {/* ───────── Movimientos ───────── */}
        <Col xl={8} lg={7}>
          <div className="kll-card">
            <div className="kll-card-head">
              <div className="kll-card-title">
                Movimientos <span className="kll-count">{movements.length}</span>
                {movementsScopeLabel ? (
                  <span className="kll-scope">
                    {movementsScopeLabel}
                    {selectedStockId && (
                      <button
                        type="button"
                        title="Ver toda la bodega"
                        aria-label="Quitar el stock seleccionado"
                        onClick={() => setSelectedStockId(null)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ) : (
                  filters.locationId && <span className="kll-sub">toda la bodega</span>
                )}
              </div>
              {loadingMovements && <Spinner size="sm" color="primary" />}
            </div>

            <div className={`kll-scroll moves${loadingMovements ? " kll-loading" : ""}`}>
              <table className="kll-table kma-lab-moves">
                <thead>
                  <tr>
                    <th>Mov.</th>
                    <th>Tipo</th>
                    <th className="num">Qty</th>
                    <th>Stock</th>
                    <th>Talla</th>
                    <th>Usuario</th>
                    <th>Referencia</th>
                    <th>Descripción</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const type = m.movementType || "";
                    const stockDelta = movementDelta(m.quantityBefore, m.quantityAfter);
                    const hasSizeFlow = m.sizeLabel && (m.sizeStockBefore != null || m.sizeStockAfter != null);
                    return (
                      <tr key={m.id}>
                        <td>
                          <div className="kll-mono"><b>#{m.id}</b></div>
                          <div className="kll-muted kma-small">
                            {formatDateTimeGt(m.movementDate || m.createdAt)}
                          </div>
                        </td>
                        <td>
                          <span className={`kma-type ${productMovementTypeTone(type)}`}>
                            {productMovementTypeLabel(type)}
                          </span>
                          {type && <div className="kll-muted kll-mono kma-code">{type}</div>}
                        </td>
                        <td className="num"><b>{m.quantity}</b></td>
                        <td>
                          <span className="kll-flow">
                            {m.quantityBefore ?? "—"}
                            <span className="arrow">→</span>
                            <b>{m.quantityAfter ?? "—"}</b>
                            {stockDelta != null && (
                              <span className={`kll-delta ${stockDelta > 0 ? "up" : stockDelta < 0 ? "down" : "flat"}`}>
                                {stockDelta > 0 ? `+${stockDelta}` : stockDelta}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          {m.sizeLabel ? (
                            <>
                              <span className="kll-size-tag">{m.sizeLabel}</span>
                              {hasSizeFlow && (
                                <div className="kll-flow kll-muted kma-size-flow">
                                  {m.sizeStockBefore ?? "—"}
                                  <span className="arrow">→</span>
                                  {m.sizeStockAfter ?? "—"}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="kll-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div>{m.username || <span className="kll-muted">—</span>}</div>
                          {m.createdBy != null && (
                            <div className="kll-muted kll-mono">#{m.createdBy}</div>
                          )}
                        </td>
                        <td>
                          <div className="kll-ref">
                            {m.referenceNumber || (m.referenceId != null ? `#${m.referenceId}` : "—")}
                          </div>
                          {m.referenceType && <span className="kll-ref-type">{m.referenceType}</span>}
                          <div className="kll-muted kll-mono" title="stock_id">stock {m.stockId}</div>
                        </td>
                        <td>
                          <div className="kll-reason" title={m.description || ""}>{m.description || "—"}</div>
                        </td>
                        <td>
                          <div className="kll-row-actions">
                            <IconButton icon="nc-ruler-pencil" title="Editar movimiento" onClick={() => openEdit(m)} />
                            <IconButton
                              icon="nc-simple-remove"
                              title="Eliminar movimiento"
                              danger
                              onClick={() => handleDeleteMovement(m)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loadingMovements && movements.length === 0 && (
                <EmptyState
                  icon="nc-paper"
                  title="Sin movimientos"
                  text={hasScope || selectedStockId || filters.movementId
                    ? "No hay movimientos con la selección y filtros actuales."
                    : "Elige una bodega o un stock para ver su historial."}
                />
              )}
            </div>
          </div>
        </Col>
      </Row>

      {/* ───────── Modal: movimiento ───────── */}
      <Modal
        isOpen={editorOpen}
        toggle={() => !saving && setEditorOpen(false)}
        size="lg"
        className="kll kll-modal"
      >
        <ModalHeader toggle={() => !saving && setEditorOpen(false)}>
          {editingId ? `Editar movimiento #${editingId}` : "Crear movimiento"}
        </ModalHeader>
        <ModalBody>
          <div className="kll-section">Movimiento</div>
          <Row>
            <Col md={4}>
              <FieldLabel>stockId</FieldLabel>
              <Input bsSize="sm" value={form.stockId} onChange={setFormField("stockId")} />
            </Col>
            <Col md={4}>
              <FieldLabel>movementType</FieldLabel>
              <Input
                bsSize="sm"
                list="product-ledger-lab-types"
                value={form.movementType}
                onChange={setFormField("movementType")}
              />
              <datalist id="product-ledger-lab-types">
                {PRODUCT_MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{productMovementTypeLabel(t)}</option>
                ))}
              </datalist>
            </Col>
            <Col md={4}>
              <FieldLabel>quantity (firmada)</FieldLabel>
              <Input bsSize="sm" value={form.quantity} onChange={setFormField("quantity")} />
            </Col>
          </Row>

          <div className="kll-section">Cantidades</div>
          <Row>
            <Col md={3}>
              <FieldLabel>sizeLabel</FieldLabel>
              <Input bsSize="sm" value={form.sizeLabel} onChange={setFormField("sizeLabel")} />
            </Col>
            <Col md={3}>
              <FieldLabel>quantityBefore</FieldLabel>
              <Input bsSize="sm" value={form.quantityBefore} onChange={setFormField("quantityBefore")} />
            </Col>
            <Col md={3}>
              <FieldLabel>quantityAfter</FieldLabel>
              <Input bsSize="sm" value={form.quantityAfter} onChange={setFormField("quantityAfter")} />
            </Col>
            <Col md={3}>
              <FieldLabel>createdBy</FieldLabel>
              <Input bsSize="sm" value={form.createdBy} onChange={setFormField("createdBy")} />
            </Col>
          </Row>

          <div className="kll-section">Referencia</div>
          <Row>
            <Col md={3}>
              <FieldLabel>referenceType</FieldLabel>
              <Input bsSize="sm" value={form.referenceType} onChange={setFormField("referenceType")} />
            </Col>
            <Col md={3}>
              <FieldLabel>referenceId</FieldLabel>
              <Input bsSize="sm" value={form.referenceId} onChange={setFormField("referenceId")} />
            </Col>
            <Col md={3}>
              <FieldLabel>referenceNumber</FieldLabel>
              <Input bsSize="sm" value={form.referenceNumber} onChange={setFormField("referenceNumber")} />
            </Col>
            <Col md={3}>
              <FieldLabel>referenceLineId</FieldLabel>
              <Input bsSize="sm" value={form.referenceLineId} onChange={setFormField("referenceLineId")} />
            </Col>
          </Row>

          <div className="kll-section">Fecha, costo y descripción</div>
          <Row>
            <Col md={4}>
              <FieldLabel>movementDate</FieldLabel>
              <Input
                bsSize="sm"
                type="datetime-local"
                value={form.movementDate}
                onChange={setFormField("movementDate")}
              />
            </Col>
            <Col md={4}>
              <FieldLabel>unitCost</FieldLabel>
              <Input bsSize="sm" value={form.unitCost} onChange={setFormField("unitCost")} />
            </Col>
            <Col md={4}>
              <FieldLabel>totalCost</FieldLabel>
              <Input bsSize="sm" value={form.totalCost} onChange={setFormField("totalCost")} />
            </Col>
            <Col md={12}>
              <FieldLabel>description</FieldLabel>
              <Input bsSize="sm" type="textarea" rows={2} value={form.description} onChange={setFormField("description")} />
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setEditorOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleSaveMovement} disabled={saving}>
            {saving ? <Spinner size="sm" /> : "Guardar"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ───────── Modal: stock ───────── */}
      <Modal
        isOpen={stockEditorOpen}
        toggle={() => !saving && setStockEditorOpen(false)}
        className="kll kll-modal"
      >
        <ModalHeader toggle={() => !saving && setStockEditorOpen(false)}>
          Editar stock #{selectedStockId}
        </ModalHeader>
        <ModalBody>
          {selectedStock && (
            <div className="kll-callout">
              <i className="nc-icon nc-alert-circle-i" aria-hidden="true" />
              <div>
                {selectedStock.productCode} · {selectedStock.colorName || "sin color"} · loc {selectedStock.locationId}
              </div>
            </div>
          )}
          <Row>
            <Col md={6}>
              <FieldLabel>quantity</FieldLabel>
              <Input bsSize="sm" value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} />
            </Col>
            <Col md={6}>
              <FieldLabel>min</FieldLabel>
              <Input bsSize="sm" value={stockForm.min} onChange={(e) => setStockForm({ ...stockForm, min: e.target.value })} />
            </Col>
            <Col md={12}>
              <FieldLabel>sizesData (JSON)</FieldLabel>
              <Input
                bsSize="sm"
                type="textarea"
                rows={4}
                className="kll-mono"
                value={stockForm.sizesData}
                onChange={(e) => setStockForm({ ...stockForm, sizesData: e.target.value })}
              />
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setStockEditorOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleSaveStock} disabled={saving}>
            {saving ? <Spinner size="sm" /> : "Guardar stock"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
