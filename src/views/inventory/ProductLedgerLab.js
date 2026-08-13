import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
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
    label: value,
    searchText: value,
  })),
];

const TYPE_BADGE = {
  PRODUCTION_ENTRY: "success",
  TRANSFER_IN: "success",
  RETURN: "info",
  ADJUSTMENT: "secondary",
  TRANSFER_OUT: "warning",
  SHIPMENT: "warning",
  ONLINE_SALE_DISPATCH: "primary",
  SALE_EXIT: "primary",
  SHIPMENT_REVERSAL: "info",
  ONLINE_SALE_DISPATCH_REVERSAL: "info",
};

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
  const [filters, setFilters] = useState({
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
  });
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

  return (
    <div className="content" style={{ fontSize: "0.85rem" }}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div>
          <h4 className="mb-0">Product Ledger Lab</h4>
          <small className="text-muted">
            Solo {ALLOWED_USERNAME} · cirugía product_inventory_kardex / product_inventory_location (PT + Devoluciones)
          </small>
        </div>
        <div>
          <Button color="secondary" size="sm" outline className="me-1" onClick={() => { loadStocks(); loadMovements(); }} disabled={saving}>
            Refrescar
          </Button>
          <Button color="warning" size="sm" outline className="me-1" onClick={handleReplay} disabled={!selectedStockId || saving}>
            Replay stock
          </Button>
          <Button
            color="warning"
            size="sm"
            className="me-1"
            onClick={handleReplayAll}
            disabled={!filters.locationId || saving}
            title="Recalcula todos los stocks de la bodega seleccionada"
          >
            Replay stock all
          </Button>
          <Button color="info" size="sm" outline className="me-1" onClick={openStockEditor} disabled={!selectedStock || saving}>
            Editar stock
          </Button>
          <Button color="primary" size="sm" onClick={openCreate} disabled={saving}>
            + Movimiento
          </Button>
        </div>
      </div>

      <Alert color="warning" className="py-2 px-3 mb-2">
        Mutaciones directas al ledger. Crear/editar/borrar movimiento hace <strong>Replay stock</strong> automático; el botón manual queda como recuperación.
      </Alert>

      <Row className="g-2 mb-2">
        <Col md={3}>
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
        <Col md={2}>
          <Input
            bsSize="sm"
            placeholder="Producto / código"
            value={filters.productTerm}
            onChange={(e) => setFilter("productTerm", e.target.value)}
          />
        </Col>
        <Col md={1}>
          <Input
            bsSize="sm"
            placeholder="stockId"
            value={filters.stockId}
            onChange={(e) => setFilter("stockId", e.target.value)}
          />
        </Col>
        <Col md={2}>
          <FilterableSelect
            options={MOVEMENT_TYPE_OPTIONS}
            value={filters.type}
            onChange={(v) => setFilter("type", v || "")}
            placeholder="Tipo"
          />
        </Col>
        <Col md={1}>
          <Input
            bsSize="sm"
            placeholder="Talla"
            value={filters.sizeLabel}
            onChange={(e) => setFilter("sizeLabel", e.target.value)}
          />
        </Col>
        <Col md={1}>
          <Input
            bsSize="sm"
            type="date"
            value={filters.from}
            onChange={(e) => setFilter("from", e.target.value)}
          />
        </Col>
        <Col md={1}>
          <Input
            bsSize="sm"
            type="date"
            value={filters.to}
            onChange={(e) => setFilter("to", e.target.value)}
          />
        </Col>
        <Col md={1}>
          <Input
            bsSize="sm"
            placeholder="movId"
            value={filters.movementId}
            onChange={(e) => setFilter("movementId", e.target.value)}
          />
        </Col>
      </Row>
      <Row className="g-2 mb-3">
        <Col md={3}>
          <Input
            bsSize="sm"
            placeholder="Ref / número"
            value={filters.referenceTerm}
            onChange={(e) => setFilter("referenceTerm", e.target.value)}
          />
        </Col>
        <Col md={3}>
          <Input
            bsSize="sm"
            placeholder="Description contains"
            value={filters.description}
            onChange={(e) => setFilter("description", e.target.value)}
          />
        </Col>
      </Row>

      <Row>
        <Col md={4} style={{ maxHeight: "70vh", overflow: "auto" }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>Stock ({stocks.length})</strong>
            {loadingStocks && <Spinner size="sm" />}
          </div>
          <Table size="sm" hover bordered responsive className="mb-0">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Color</th>
                <th>Qty</th>
                <th>Tallas</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    cursor: "pointer",
                    background: String(selectedStockId) === String(s.id) ? "rgba(54,162,235,0.15)" : undefined,
                  }}
                  onClick={() => {
                    setSelectedStockId(s.id);
                    loadMovements({ stockId: s.id });
                  }}
                >
                  <td>
                    <div>{s.productCode}</div>
                    <small className="text-muted">{s.productName}</small>
                  </td>
                  <td>{s.colorName || "—"}</td>
                  <td>{s.quantity}</td>
                  <td><small>{sizesSummary(s)}</small></td>
                </tr>
              ))}
              {!loadingStocks && stocks.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted text-center">
                    Elige bodega o stockId
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          {selectedStock && (
            <div className="mt-2 p-2 border rounded bg-light">
              <div>
                <strong>{selectedStock.productCode}</strong>
                {" · "}
                {selectedStock.colorName || "sin color"}
                {" · loc "}
                {selectedStock.locationId}
              </div>
              <div>qty={selectedStock.quantity} min={selectedStock.min}</div>
              <div><small>sizes_data: {selectedStock.sizesData || "null"}</small></div>
            </div>
          )}
        </Col>

        <Col md={8} style={{ maxHeight: "70vh", overflow: "auto" }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>
              Movimientos ({movements.length})
              {selectedStockId || filters.stockId
                ? ` · solo ${selectedStock
                  ? `${selectedStock.productCode} / ${selectedStock.colorName || "sin color"}`
                  : "stock seleccionado"}`
                : filters.locationId
                  ? " · toda la bodega"
                  : ""}
            </strong>
            {loadingMovements && <Spinner size="sm" />}
          </div>
          <Table size="sm" hover bordered responsive className="mb-0">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Qty</th>
                <th>Talla</th>
                <th>Before</th>
                <th>After</th>
                <th>Before talla</th>
                <th>After talla</th>
                <th>Ref</th>
                <th>Desc</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const type = m.movementType || "";
                return (
                  <tr key={m.id}>
                    <td><small>{formatDateTimeGt(m.movementDate || m.createdAt)}</small></td>
                    <td>
                      <Badge color={TYPE_BADGE[type] || "light"}>{type || "—"}</Badge>
                    </td>
                    <td>{m.quantity}</td>
                    <td>{m.sizeLabel || "—"}</td>
                    <td>{m.quantityBefore}</td>
                    <td>{m.quantityAfter}</td>
                    <td>
                      {m.sizeLabel
                        ? (m.sizeStockBefore != null ? m.sizeStockBefore : "—")
                        : "—"}
                    </td>
                    <td>
                      {m.sizeLabel
                        ? (m.sizeStockAfter != null ? m.sizeStockAfter : "—")
                        : "—"}
                    </td>
                    <td>
                      <div>
                        <small>
                          {m.referenceNumber || (m.referenceId != null ? `#${m.referenceId}` : "—")}
                        </small>
                      </div>
                      {m.referenceType && (
                        <Badge color="light" className="text-dark">{m.referenceType}</Badge>
                      )}
                      <div><small className="text-muted">stock {m.stockId}</small></div>
                    </td>
                    <td><small>{m.description || "—"}</small></td>
                    <td className="text-nowrap">
                      <Button color="link" size="sm" className="p-0 me-2" onClick={() => openEdit(m)}>
                        Edit
                      </Button>
                      <Button color="link" size="sm" className="p-0 text-danger" onClick={() => handleDeleteMovement(m)}>
                        Del
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!loadingMovements && movements.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-muted text-center">
                    Sin movimientos
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Col>
      </Row>

      <Modal isOpen={editorOpen} toggle={() => !saving && setEditorOpen(false)} size="lg">
        <ModalHeader toggle={() => !saving && setEditorOpen(false)}>
          {editingId ? `Editar movimiento #${editingId}` : "Crear movimiento"}
        </ModalHeader>
        <ModalBody>
          <Row className="g-2">
            <Col md={4}>
              <Label>stockId</Label>
              <Input bsSize="sm" value={form.stockId} onChange={(e) => setForm({ ...form, stockId: e.target.value })} />
            </Col>
            <Col md={4}>
              <Label>movementType</Label>
              <Input
                bsSize="sm"
                list="product-ledger-lab-types"
                value={form.movementType}
                onChange={(e) => setForm({ ...form, movementType: e.target.value })}
              />
              <datalist id="product-ledger-lab-types">
                {PRODUCT_MOVEMENT_TYPES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Col>
            <Col md={4}>
              <Label>quantity (firmada)</Label>
              <Input bsSize="sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>sizeLabel</Label>
              <Input bsSize="sm" value={form.sizeLabel} onChange={(e) => setForm({ ...form, sizeLabel: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>quantityBefore</Label>
              <Input bsSize="sm" value={form.quantityBefore} onChange={(e) => setForm({ ...form, quantityBefore: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>quantityAfter</Label>
              <Input bsSize="sm" value={form.quantityAfter} onChange={(e) => setForm({ ...form, quantityAfter: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>createdBy</Label>
              <Input bsSize="sm" value={form.createdBy} onChange={(e) => setForm({ ...form, createdBy: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>referenceType</Label>
              <Input bsSize="sm" value={form.referenceType} onChange={(e) => setForm({ ...form, referenceType: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>referenceId</Label>
              <Input bsSize="sm" value={form.referenceId} onChange={(e) => setForm({ ...form, referenceId: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>referenceNumber</Label>
              <Input bsSize="sm" value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>referenceLineId</Label>
              <Input bsSize="sm" value={form.referenceLineId} onChange={(e) => setForm({ ...form, referenceLineId: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>movementDate</Label>
              <Input
                bsSize="sm"
                type="datetime-local"
                value={form.movementDate}
                onChange={(e) => setForm({ ...form, movementDate: e.target.value })}
              />
            </Col>
            <Col md={3}>
              <Label>unitCost</Label>
              <Input bsSize="sm" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>totalCost</Label>
              <Input bsSize="sm" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} />
            </Col>
            <Col md={12}>
              <Label>description</Label>
              <Input bsSize="sm" type="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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

      <Modal isOpen={stockEditorOpen} toggle={() => !saving && setStockEditorOpen(false)}>
        <ModalHeader toggle={() => !saving && setStockEditorOpen(false)}>
          Editar stock #{selectedStockId}
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>quantity</Label>
            <Input bsSize="sm" value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>min</Label>
            <Input bsSize="sm" value={stockForm.min} onChange={(e) => setStockForm({ ...stockForm, min: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>sizesData (JSON)</Label>
            <Input
              bsSize="sm"
              type="textarea"
              rows={4}
              value={stockForm.sizesData}
              onChange={(e) => setStockForm({ ...stockForm, sizesData: e.target.value })}
            />
          </FormGroup>
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
