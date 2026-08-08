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
import { getLocations } from "services/locationService";
import {
  ledgerLabCreateMovement,
  ledgerLabDeleteMovement,
  ledgerLabListMovements,
  ledgerLabListStocks,
  ledgerLabReplayAllStocks,
  ledgerLabReplayStock,
  ledgerLabSplitOpeningBySizes,
  ledgerLabUpdateMovement,
  ledgerLabUpdateStock,
} from "services/kioscoInventoryService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  getKioscoMovementTypeLabel,
  KIOSCO_MOVEMENT_TYPE_LABELS,
  normalizeKioscoMovementType,
} from "utils/kioskMovementHelper";
import { showError, showSuccess } from "utils/notificationHelper";

const ALLOWED_USERNAME = "eramirez";

const MOVEMENT_TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos", searchText: "todos" },
  ...Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    searchText: label,
  })),
];

const TYPE_BADGE = {
  ENTRADA: "success",
  TRASLADO_ENTRADA: "success",
  VENTA: "primary",
  DEVOLUCION_CLIENTE: "info",
  DEVOLUCION_DEPOSITO: "info",
  TRASLADO_SALIDA: "warning",
  MERMA: "danger",
  AJUSTE: "secondary",
  ANULACION: "danger",
  CAMBIO: "warning",
};

const EMPTY_MOVEMENT_FORM = {
  kioscoStockId: "",
  movementType: "ENTRADA",
  quantity: "1",
  sizeKey: "",
  stockBefore: "",
  stockAfter: "",
  referenceId: "",
  physicalCountId: "",
  physicalSlipNumber: "",
  reason: "",
  affectsStock: true,
  userId: "",
  originLocationId: "",
  destinationLocationId: "",
  createdAt: "",
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
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ") || "—";
  }
  return "—";
}

function movementToForm(m) {
  if (!m) return { ...EMPTY_MOVEMENT_FORM };
  return {
    kioscoStockId: m.kioscoStockId != null ? String(m.kioscoStockId) : "",
    movementType: normalizeKioscoMovementType(m.movementType) || "ENTRADA",
    quantity: m.quantity != null ? String(m.quantity) : "",
    sizeKey: m.sizeKey || "",
    stockBefore: m.stockBefore != null ? String(m.stockBefore) : "",
    stockAfter: m.stockAfter != null ? String(m.stockAfter) : "",
    referenceId: m.referenceId != null ? String(m.referenceId) : "",
    physicalCountId: m.physicalCountId != null ? String(m.physicalCountId) : "",
    physicalSlipNumber: m.physicalSlipNumber || "",
    reason: m.reason || "",
    affectsStock: m.affectsStock !== false,
    userId: m.userId != null ? String(m.userId) : "",
    originLocationId: m.originLocationId != null ? String(m.originLocationId) : "",
    destinationLocationId: m.destinationLocationId != null ? String(m.destinationLocationId) : "",
    createdAt: toLocalInputValue(m.createdAt),
  };
}

function formToPayload(form) {
  return {
    kioscoStockId: numOrNull(form.kioscoStockId),
    movementType: form.movementType || null,
    quantity: numOrNull(form.quantity),
    sizeKey: emptyToNull(form.sizeKey),
    stockBefore: numOrNull(form.stockBefore),
    stockAfter: numOrNull(form.stockAfter),
    referenceId: numOrNull(form.referenceId),
    physicalCountId: numOrNull(form.physicalCountId),
    physicalSlipNumber: emptyToNull(form.physicalSlipNumber),
    reason: emptyToNull(form.reason),
    affectsStock: Boolean(form.affectsStock),
    userId: numOrNull(form.userId),
    originLocationId: numOrNull(form.originLocationId),
    destinationLocationId: numOrNull(form.destinationLocationId),
    createdAt: fromLocalInputValue(form.createdAt),
  };
}

export default function KioskLedgerLab() {
  const { user, loading: authLoading, initialized } = useAuth();
  const username = String(user?.username || "").trim().toLowerCase();
  const allowed = username === ALLOWED_USERNAME;

  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState({
    locationId: "",
    productTerm: "",
    stockId: "",
    type: "",
    sizeKey: "",
    from: "",
    to: "",
    referenceTerm: "",
    reason: "",
    affectsStockOnly: false,
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
    currentStock: "",
    minimumStock: "",
    sizesData: "",
    hardwareCondition: "NUEVO",
  });
  const [saving, setSaving] = useState(false);
  const movementsRequestIdRef = React.useRef(0);

  const kioskOptions = useMemo(() => {
    const opts = (locations || [])
      .filter((location) => {
        const category = String(location?.categoria || "").toUpperCase();
        const name = String(location?.name || "").toUpperCase();
        const code = String(location?.code || "").toUpperCase();
        return category.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
      })
      .map((k) => ({
        value: String(k.id),
        label: `${k.code || ""} · ${k.name || ""}`.trim(),
        searchText: `${k.code || ""} ${k.name || ""}`,
      }));
    return [{ value: "", label: "— Kiosko —", searchText: "kiosko" }, ...opts];
  }, [locations]);

  useEffect(() => {
    if (!allowed) return;
    getLocations()
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
      const data = await ledgerLabListStocks({
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
      // Click en fila: solo ese kiosco_stock_id (producto+color).
      const data = await ledgerLabListMovements({
        locationId: resolvedStockId ? undefined : (filters.locationId || undefined),
        stockId: resolvedStockId || undefined,
        type: filters.type || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        referenceTerm: filters.referenceTerm || undefined,
        reason: filters.reason || undefined,
        sizeKey: filters.sizeKey || undefined,
        affectsStockOnly: filters.affectsStockOnly ? true : undefined,
        movementId: filters.movementId || undefined,
      });
      if (requestId !== movementsRequestIdRef.current) {
        return;
      }
      let rows = data || [];
      if (resolvedStockId) {
        rows = rows.filter((m) => String(m.kioscoStockId) === String(resolvedStockId));
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
      kioscoStockId: selectedStockId != null ? String(selectedStockId) : filters.stockId || "",
      stockBefore: selectedStock?.currentStock != null ? String(selectedStock.currentStock) : "",
      userId: user?.id != null ? String(user.id) : "",
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
      currentStock: selectedStock.currentStock != null ? String(selectedStock.currentStock) : "",
      minimumStock: selectedStock.minimumStock != null ? String(selectedStock.minimumStock) : "",
      sizesData: selectedStock.sizesData || "",
      hardwareCondition: selectedStock.hardwareCondition || "NUEVO",
    });
    setStockEditorOpen(true);
  };

  const handleSaveMovement = async () => {
    setSaving(true);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        await ledgerLabUpdateMovement(editingId, payload);
        showSuccess(`Movimiento #${editingId} actualizado.`);
      } else {
        const created = await ledgerLabCreateMovement(payload);
        showSuccess(`Movimiento #${created.id} creado.`);
      }
      setEditorOpen(false);
      await loadMovements({
        stockId: payload.kioscoStockId || selectedStockId || undefined,
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
      await ledgerLabDeleteMovement(movement.id);
      showSuccess(`Movimiento #${movement.id} eliminado.`);
      const stockId = movement.kioscoStockId;
      if (stockId && window.confirm("¿Recalcular cadena de stock de este kiosco_stock_id?")) {
        await ledgerLabReplayStock(stockId);
        showSuccess(`Replay stock #${stockId} listo.`);
      }
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
    if (!window.confirm(`¿Recalcular stock_before/after y current_stock del stock #${selectedStockId}?`)) {
      return;
    }
    setSaving(true);
    try {
      await ledgerLabReplayStock(selectedStockId);
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
      showError("Selecciona un kiosko.");
      return;
    }
    const kioskLabel =
      kioskOptions.find((o) => String(o.value) === String(filters.locationId))?.label
      || `location #${filters.locationId}`;
    if (!window.confirm(
      `¿Recalcular stock_before/after y current_stock de TODOS los stocks de ${kioskLabel}?\n\n`
      + `Esto puede tardar unos segundos.`
    )) {
      return;
    }
    setSaving(true);
    try {
      const result = await ledgerLabReplayAllStocks(filters.locationId);
      showSuccess(`Replay all listo: ${result?.stockCount ?? 0} stocks recalculados.`);
      await loadStocks();
      await loadMovements();
    } catch (err) {
      showError(err.message || "Replay all falló.");
    } finally {
      setSaving(false);
    }
  };

  const hasSizesData = Boolean(
    selectedStock?.sizesData
    && String(selectedStock.sizesData).trim()
    && String(selectedStock.sizesData).trim() !== "{}"
    && String(selectedStock.sizesData).trim() !== "null"
  );

  const handleSplitOpeningBySizes = async () => {
    if (!selectedStockId) {
      showError("Selecciona un stock.");
      return;
    }
    if (!hasSizesData) {
      showError("Este stock no tiene sizes_data con tallas.");
      return;
    }
    const sizesPreview = selectedStock?.sizes
      ? Object.entries(selectedStock.sizes)
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ")
      : selectedStock?.sizesData;
    if (!window.confirm(
      `¿Desglosar inventario inicial del stock #${selectedStockId}?\n\n`
      + `Se borrarán movimientos agregados (sin talla) de "Inventario inicial - migración" `
      + `y se crearán ENTRADAs por talla según sizes_data:\n${sizesPreview}\n\n`
      + `Luego se hará Replay automáticamente.`
    )) {
      return;
    }
    setSaving(true);
    try {
      const result = await ledgerLabSplitOpeningBySizes(selectedStockId);
      showSuccess(
        `Desglose OK: borrados ${result.deletedAggregated}, `
        + `creadas ${result.createdEntradas} ENTRADAs (${(result.sizeKeysCreated || []).join(", ")}).`
      );
      await loadStocks();
      await loadMovements({ stockId: selectedStockId || undefined });
    } catch (err) {
      showError(err.message || "No se pudo desglosar por tallas.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStock = async () => {
    if (!selectedStockId) return;
    setSaving(true);
    try {
      await ledgerLabUpdateStock(selectedStockId, {
        currentStock: numOrNull(stockForm.currentStock),
        minimumStock: numOrNull(stockForm.minimumStock),
        sizesData: stockForm.sizesData,
        hardwareCondition: stockForm.hardwareCondition || null,
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
          <h4 className="mb-0">Kiosk Ledger Lab</h4>
          <small className="text-muted">Solo {ALLOWED_USERNAME} · cirugía de kiosco_movement / kiosco_stock</small>
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
            title="Recalcula todos los kiosco_stock del kiosko seleccionado"
          >
            Replay stock all
          </Button>
          <Button
            color="success"
            size="sm"
            outline
            className="me-1"
            onClick={handleSplitOpeningBySizes}
            disabled={!selectedStockId || !hasSizesData || saving}
            title="Borra AJUSTE/ENTRADA agregado de inventario inicial y crea ENTRADA por talla"
          >
            Desglosar por tallas
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
        Mutaciones directas al ledger. Tras editar qty/tipo/orden, usa <strong>Replay stock</strong>.
      </Alert>

      <Row className="g-2 mb-2">
        <Col md={3}>
          <FilterableSelect
            options={kioskOptions}
            value={filters.locationId}
            onChange={(v) => {
              setFilter("locationId", v || "");
              setSelectedStockId(null);
            }}
            placeholder="Kiosko"
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
            value={filters.sizeKey}
            onChange={(e) => setFilter("sizeKey", e.target.value)}
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
            placeholder="Ref / boleta / venta"
            value={filters.referenceTerm}
            onChange={(e) => setFilter("referenceTerm", e.target.value)}
          />
        </Col>
        <Col md={3}>
          <Input
            bsSize="sm"
            placeholder="Reason contains"
            value={filters.reason}
            onChange={(e) => setFilter("reason", e.target.value)}
          />
        </Col>
        <Col md={2} className="d-flex align-items-center">
          <FormGroup check className="mb-0">
            <Input
              type="checkbox"
              id="affectsOnly"
              checked={filters.affectsStockOnly}
              onChange={(e) => setFilter("affectsStockOnly", e.target.checked)}
            />
            <Label check for="affectsOnly" className="ms-1">
              Solo affects_stock
            </Label>
          </FormGroup>
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
                <th>ID</th>
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
                  <td>{s.id}</td>
                  <td>
                    <div>{s.productCode}</div>
                    <small className="text-muted">{s.productName}</small>
                    {s.hardwareCondition && s.hardwareCondition !== "NUEVO" && (
                      <Badge color="secondary" className="ms-1">{s.hardwareCondition}</Badge>
                    )}
                  </td>
                  <td>{s.colorName || "—"}</td>
                  <td>{s.currentStock}</td>
                  <td><small>{sizesSummary(s)}</small></td>
                </tr>
              ))}
              {!loadingStocks && stocks.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-muted text-center">
                    Elige kiosko o stockId
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          {selectedStock && (
            <div className="mt-2 p-2 border rounded bg-light">
              <div><strong>Stock #{selectedStock.id}</strong> · loc {selectedStock.locationId}</div>
              <div>current={selectedStock.currentStock} min={selectedStock.minimumStock}</div>
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
                  ? `${selectedStock.productCode} / ${selectedStock.colorName || "sin color"} (#${selectedStockId || filters.stockId})`
                  : `stock ${selectedStockId || filters.stockId}`}`
                : filters.locationId
                  ? " · todo el kiosko"
                  : ""}
            </strong>
            {loadingMovements && <Spinner size="sm" />}
          </div>
          <Table size="sm" hover bordered responsive className="mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Qty</th>
                <th>Talla</th>
                <th>Before</th>
                <th>After</th>
                <th>Before talla</th>
                <th>After talla</th>
                <th>Ref</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const type = normalizeKioscoMovementType(m.movementType);
                return (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td><small>{formatDateTimeGt(m.createdAt)}</small></td>
                    <td>
                      <Badge color={TYPE_BADGE[type] || "light"}>
                        {getKioscoMovementTypeLabel(type)}
                      </Badge>
                      {!m.affectsStock && (
                        <Badge color="dark" className="ms-1">no stock</Badge>
                      )}
                    </td>
                    <td>{m.quantity}</td>
                    <td>{m.sizeKey || "—"}</td>
                    <td>{m.stockBefore}</td>
                    <td>{m.stockAfter}</td>
                    <td>
                      {m.sizeKey
                        ? (m.sizeStockBefore != null ? m.sizeStockBefore : "—")
                        : "—"}
                    </td>
                    <td>
                      {m.sizeKey
                        ? (m.sizeStockAfter != null ? m.sizeStockAfter : "—")
                        : "—"}
                    </td>
                    <td>
                      <div><small>{m.referenceSummary || m.referenceNumber || (m.referenceId != null ? `#${m.referenceId}` : "—")}</small></div>
                      {m.referenceType && <Badge color="light" className="text-dark">{m.referenceType}</Badge>}
                      <div><small className="text-muted">stock {m.kioscoStockId}</small></div>
                    </td>
                    <td><small>{m.reason || "—"}</small></td>
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
                  <td colSpan={10} className="text-muted text-center">
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
              <Label>kioscoStockId</Label>
              <Input bsSize="sm" value={form.kioscoStockId} onChange={(e) => setForm({ ...form, kioscoStockId: e.target.value })} />
            </Col>
            <Col md={4}>
              <Label>movementType</Label>
              <Input
                bsSize="sm"
                type="select"
                value={form.movementType}
                onChange={(e) => setForm({ ...form, movementType: e.target.value })}
              >
                {Object.keys(KIOSCO_MOVEMENT_TYPE_LABELS).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Input>
            </Col>
            <Col md={4}>
              <Label>quantity</Label>
              <Input bsSize="sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>sizeKey</Label>
              <Input bsSize="sm" value={form.sizeKey} onChange={(e) => setForm({ ...form, sizeKey: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>stockBefore</Label>
              <Input bsSize="sm" value={form.stockBefore} onChange={(e) => setForm({ ...form, stockBefore: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>stockAfter</Label>
              <Input bsSize="sm" value={form.stockAfter} onChange={(e) => setForm({ ...form, stockAfter: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>userId</Label>
              <Input bsSize="sm" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>referenceId</Label>
              <Input bsSize="sm" value={form.referenceId} onChange={(e) => setForm({ ...form, referenceId: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>physicalCountId</Label>
              <Input bsSize="sm" value={form.physicalCountId} onChange={(e) => setForm({ ...form, physicalCountId: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>physicalSlipNumber</Label>
              <Input bsSize="sm" value={form.physicalSlipNumber} onChange={(e) => setForm({ ...form, physicalSlipNumber: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>createdAt</Label>
              <Input
                bsSize="sm"
                type="datetime-local"
                value={form.createdAt}
                onChange={(e) => setForm({ ...form, createdAt: e.target.value })}
              />
            </Col>
            <Col md={3}>
              <Label>originLocationId</Label>
              <Input bsSize="sm" value={form.originLocationId} onChange={(e) => setForm({ ...form, originLocationId: e.target.value })} />
            </Col>
            <Col md={3}>
              <Label>destinationLocationId</Label>
              <Input bsSize="sm" value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })} />
            </Col>
            <Col md={3} className="d-flex align-items-end">
              <FormGroup check className="mb-2">
                <Input
                  type="checkbox"
                  id="affectsStock"
                  checked={form.affectsStock}
                  onChange={(e) => setForm({ ...form, affectsStock: e.target.checked })}
                />
                <Label check for="affectsStock" className="ms-1">affectsStock</Label>
              </FormGroup>
            </Col>
            <Col md={12}>
              <Label>reason</Label>
              <Input bsSize="sm" type="textarea" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
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
            <Label>currentStock</Label>
            <Input bsSize="sm" value={stockForm.currentStock} onChange={(e) => setStockForm({ ...stockForm, currentStock: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>minimumStock</Label>
            <Input bsSize="sm" value={stockForm.minimumStock} onChange={(e) => setStockForm({ ...stockForm, minimumStock: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>hardwareCondition</Label>
            <Input
              bsSize="sm"
              type="select"
              value={stockForm.hardwareCondition}
              onChange={(e) => setStockForm({ ...stockForm, hardwareCondition: e.target.value })}
            >
              <option value="NUEVO">NUEVO</option>
              <option value="VIEJO">VIEJO</option>
            </Input>
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
