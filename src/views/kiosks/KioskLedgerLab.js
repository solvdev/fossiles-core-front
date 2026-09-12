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
  ledgerLabDeleteStock,
  ledgerLabListMovements,
  ledgerLabListStocks,
  ledgerLabMoveSizes,
  ledgerLabReclassifyStocks,
  ledgerLabReplayAllKiosks,
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

const KIDS_PARA_SIZES = new Set(["16", "18", "20", "22", "24", "26", "28", "30", "32"]);

const HARDWARE_OPTIONS = [
  { value: "NUEVO", label: "NUEVO (sin PARA / herraje nuevo)" },
  { value: "VIEJO", label: "VIEJO" },
  { value: "NINO", label: "NINO (Niño)" },
  { value: "DAMA", label: "DAMA" },
];

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
  DEVOLUCION_A_CLIENTE: "warning",
  DEVOLUCION_DEPOSITO: "info",
  TRASLADO_SALIDA: "warning",
  MERMA: "danger",
  AJUSTE: "dark",
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
    hardwareCondition: "",
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
  const [selectedStockIds, setSelectedStockIds] = useState(() => new Set());
  const [sizeKeysToMove, setSizeKeysToMove] = useState(() => new Set());
  const [moveParaTarget, setMoveParaTarget] = useState("NINO");
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
        hardwareCondition: filters.hardwareCondition || undefined,
      });
      setStocks(data || []);
    } catch (err) {
      showError(err.message || "Error al cargar stock.");
      setStocks([]);
    } finally {
      setLoadingStocks(false);
    }
  }, [filters.locationId, filters.stockId, filters.productTerm, filters.hardwareCondition]);

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

  const selectedSizeEntries = useMemo(() => {
    const sizes = selectedStock?.sizes;
    if (!sizes || typeof sizes !== "object") return [];
    return Object.entries(sizes)
      .filter(([, qty]) => Number(qty) > 0)
      .sort((a, b) => Number(a[0]) - Number(b[0]) || String(a[0]).localeCompare(String(b[0]), "es", { numeric: true }));
  }, [selectedStock]);

  useEffect(() => {
    setSizeKeysToMove(new Set());
  }, [selectedStockId]);

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

  const handleReplayAllKiosks = async () => {
    if (!window.confirm(
      "¿Recalcular stock_before/after y current_stock de TODOS los kioscos?\n\n"
      + "Esto recorre cada kiosko y puede tardar varios minutos."
    )) {
      return;
    }
    setSaving(true);
    try {
      const result = await ledgerLabReplayAllKiosks();
      showSuccess(
        `Replay all kioscos listo: ${result?.stockCount ?? 0} stocks recalculados `
        + `en ${result?.locationCount ?? 0} kioscos.`
      );
      await loadStocks();
      await loadMovements();
    } catch (err) {
      showError(err.message || "Replay all kioscos falló.");
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

  const handleMoveSelectedSizes = async () => {
    if (!selectedStockId) {
      showError("Selecciona un stock.");
      return;
    }
    const sizeKeys = [...sizeKeysToMove];
    if (!sizeKeys.length) {
      showError("Marca las tallas que van a Niño o Dama. Las no marcadas se quedan sin PARA.");
      return;
    }
    const label = moveParaTarget === "NINO" ? "Niño" : moveParaTarget === "DAMA" ? "Dama" : moveParaTarget;
    if (!window.confirm(
      `¿Mover tallas ${sizeKeys.join(", ")} a PARA ${label}?\n`
      + "Las demás tallas de esta fila se quedan como están."
    )) {
      return;
    }
    setSaving(true);
    try {
      const moved = await ledgerLabMoveSizes(selectedStockId, {
        hardwareCondition: moveParaTarget,
        sizeKeys,
      });
      showSuccess(`Tallas ${sizeKeys.join(", ")} movidas a ${label} (stock #${moved?.id || "?"}).`);
      setSizeKeysToMove(new Set());
      await loadStocks();
      await loadMovements({ stockId: moved?.id || selectedStockId });
      if (moved?.id) setSelectedStockId(moved.id);
    } catch (err) {
      showError(err.message || "No se pudieron mover las tallas.");
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

  const selectedIds = [...selectedStockIds];
  const allVisibleSelected = stocks.length > 0 && stocks.every((s) => selectedStockIds.has(s.id));

  const toggleStockSelected = (id, event) => {
    event.stopPropagation();
    setSelectedStockIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisibleStocks = () => {
    setSelectedStockIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        stocks.forEach((s) => next.delete(s.id));
      } else {
        stocks.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const handleAssignPara = async (hardware, mergeIfExists) => {
    if (!selectedIds.length) {
      showError("Selecciona filas de stock.");
      return;
    }
    const label = hardware === "NINO" ? "Niño" : hardware === "DAMA" ? "Dama" : hardware;
    const mergeHint = mergeIfExists
      ? "\nSi ya existe esa dimensión en el mismo color, se FUSIONAN cantidades (suma)."
      : "\nSi ya existe esa dimensión en el mismo color, se omite (no suma). Borra el duplicado si es la misma captura.";
    if (!window.confirm(`¿Asignar PARA ${label} a ${selectedIds.length} fila(s)?${mergeHint}`)) {
      return;
    }
    setSaving(true);
    try {
      const result = await ledgerLabReclassifyStocks({
        stockIds: selectedIds,
        hardwareCondition: hardware,
        mergeIfExists,
      });
      const conflictText = (result.conflicts || []).length
        ? `\n${result.conflicts.slice(0, 8).join("\n")}`
        : "";
      showSuccess(
        `PARA ${label}: ${result.updated || 0} actualizados, ${result.merged || 0} fusionados, ${
          result.skipped || 0
        } omitidos.${conflictText}`
      );
      setSelectedStockIds(new Set());
      await loadStocks();
    } catch (err) {
      showError(err.message || "No se pudo asignar PARA.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSelectedStocks = async () => {
    if (!selectedIds.length) {
      showError("Selecciona filas de stock.");
      return;
    }
    if (!window.confirm(
      `¿Eliminar ${selectedIds.length} fila(s) de stock Y todos sus movimientos?\n`
      + "Úsalo para duplicados sin PARA que ya existen como Niño/Dama."
    )) {
      return;
    }
    setSaving(true);
    try {
      let deleted = 0;
      const errors = [];
      for (const id of selectedIds) {
        try {
          await ledgerLabDeleteStock(id);
          deleted += 1;
        } catch (err) {
          errors.push(`#${id}: ${err.message || "error"}`);
        }
      }
      showSuccess(`Eliminadas ${deleted} fila(s).${errors.length ? `\n${errors.join("\n")}` : ""}`);
      setSelectedStockIds(new Set());
      setSelectedStockId(null);
      await loadStocks();
      setMovements([]);
    } catch (err) {
      showError(err.message || "No se pudo eliminar stock.");
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
            color="danger"
            size="sm"
            outline
            className="me-1"
            onClick={handleReplayAllKiosks}
            disabled={saving}
            title="Recalcula todos los kiosco_stock de TODOS los kioscos"
          >
            Replay stock TODOS los kioscos
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
          <Button color="success" size="sm" outline className="me-1" onClick={() => handleAssignPara("NINO", false)} disabled={!selectedIds.length || saving}>
            PARA Niño
          </Button>
          <Button color="success" size="sm" outline className="me-1" onClick={() => handleAssignPara("DAMA", false)} disabled={!selectedIds.length || saving}>
            PARA Dama
          </Button>
          <Button color="warning" size="sm" outline className="me-1" onClick={() => handleAssignPara("NINO", true)} disabled={!selectedIds.length || saving} title="Suma cantidades si ya existe Niño en ese color">
            Fusionar Niño
          </Button>
          <Button color="warning" size="sm" outline className="me-1" onClick={() => handleAssignPara("DAMA", true)} disabled={!selectedIds.length || saving} title="Suma cantidades si ya existe Dama en ese color">
            Fusionar Dama
          </Button>
          <Button color="danger" size="sm" outline className="me-1" onClick={handleDeleteSelectedStocks} disabled={!selectedIds.length || saving}>
            Eliminar filas
          </Button>
          <Button color="primary" size="sm" onClick={openCreate} disabled={saving}>
            + Movimiento
          </Button>
        </div>
      </div>

      <Alert color="info" className="py-2 px-3 mb-2">
        <strong>Cómo asignar PARA:</strong> 1) Clic en un color de la lista.
        2) Arriba de la tabla aparecen las tallas. 3) Marca solo las que son Niño o Dama.
        4) <strong>Mover tallas</strong>. Las no marcadas se quedan sin PARA.
        No uses <em>Editar stock</em> ni los botones verdes de arriba: esos cambian <em>todas</em> las tallas del color.
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
            type="select"
            value={filters.hardwareCondition}
            onChange={(e) => setFilter("hardwareCondition", e.target.value)}
            title="Filtrar dimensión PARA / herraje"
          >
            <option value="">Todas las dimensiones</option>
            <option value="NUEVO">Sin PARA (NUEVO)</option>
            <option value="NINO">NINO</option>
            <option value="DAMA">DAMA</option>
            <option value="VIEJO">VIEJO</option>
          </Input>
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
        <Col md={4}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>Stock ({stocks.length})</strong>
            {loadingStocks && <Spinner size="sm" />}
          </div>
          {selectedStock ? (
            <div className="mb-2 p-2 border rounded" style={{ background: "#ecfdf5" }}>
              <div className="font-weight-bold">
                {selectedStock.productCode} · {selectedStock.colorName || "sin color"} · PARA {selectedStock.hardwareCondition && selectedStock.hardwareCondition !== "NUEVO" ? selectedStock.hardwareCondition : "—"}
              </div>
              <div className="small text-muted mb-1">
                Paso: marca las tallas que van a Niño o Dama. El resto se queda en esta fila.
              </div>
              {selectedSizeEntries.length > 0 ? (
                <>
                  <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                    {selectedSizeEntries.map(([size, qty]) => (
                      <Label key={size} check className="mb-0 mr-2">
                        <Input
                          type="checkbox"
                          checked={sizeKeysToMove.has(size)}
                          onChange={() => {
                            setSizeKeysToMove((prev) => {
                              const next = new Set(prev);
                              if (next.has(size)) next.delete(size);
                              else next.add(size);
                              return next;
                            });
                          }}
                        />{" "}
                        {size}:{qty}
                      </Label>
                    ))}
                  </div>
                  <div className="d-flex flex-wrap align-items-center mt-2" style={{ gap: 6 }}>
                    <Button
                      color="secondary"
                      size="sm"
                      outline
                      onClick={() => setSizeKeysToMove(new Set(selectedSizeEntries
                        .map(([size]) => size)
                        .filter((size) => KIDS_PARA_SIZES.has(String(size)))))}
                    >
                      16–32
                    </Button>
                    <Button
                      color="secondary"
                      size="sm"
                      outline
                      onClick={() => setSizeKeysToMove(new Set(selectedSizeEntries
                        .map(([size]) => size)
                        .filter((size) => Number(size) >= 34)))}
                    >
                      34+
                    </Button>
                    <Input
                      bsSize="sm"
                      type="select"
                      style={{ width: 120 }}
                      value={moveParaTarget}
                      onChange={(e) => setMoveParaTarget(e.target.value)}
                    >
                      <option value="NINO">Niño</option>
                      <option value="DAMA">Dama</option>
                    </Input>
                    <Button
                      color="success"
                      size="sm"
                      onClick={handleMoveSelectedSizes}
                      disabled={saving || sizeKeysToMove.size === 0}
                    >
                      Mover tallas
                    </Button>
                  </div>
                </>
              ) : (
                <small>Esta fila no tiene tallas en sizes_data.</small>
              )}
            </div>
          ) : (
            <div className="small text-muted mb-2">Clic en un producto/color de la lista para asignar PARA por talla.</div>
          )}
          <div style={{ maxHeight: "55vh", overflow: "auto" }}>
          <Table size="sm" hover bordered responsive className="mb-0">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <Input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisibleStocks}
                    disabled={!stocks.length}
                  />
                </th>
                <th>Producto</th>
                <th>Color</th>
                <th>PARA</th>
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
                  <td onClick={(e) => e.stopPropagation()}>
                    <Input
                      type="checkbox"
                      checked={selectedStockIds.has(s.id)}
                      onChange={(e) => toggleStockSelected(s.id, e)}
                    />
                  </td>
                  <td>
                    <div>{s.productCode}</div>
                    <small className="text-muted">{s.productName}</small>
                  </td>
                  <td>{s.colorName || "—"}</td>
                  <td>
                    {s.hardwareCondition && s.hardwareCondition !== "NUEVO" ? (
                      <Badge color="secondary">{s.hardwareCondition}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>{s.currentStock}</td>
                  <td><small>{sizesSummary(s)}</small></td>
                </tr>
              ))}
              {!loadingStocks && stocks.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted text-center">
                    Elige kiosko o stockId
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          </div>
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
                <th>Usuario</th>
                <th>userId</th>
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
                    <td><small>{m.id}</small></td>
                    <td><small>{formatDateTimeGt(m.createdAt)}</small></td>
                    <td>
                      <Badge color={TYPE_BADGE[type] || "light"}>
                        {getKioscoMovementTypeLabel(type, m)}
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
                    <td><small>{m.username || "—"}</small></td>
                    <td><small>{m.userId != null ? m.userId : "—"}</small></td>
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
                  <td colSpan={14} className="text-muted text-center">
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
          <Alert color="warning" className="py-2">
            Cambiar PARA aquí aplica a <strong>todas</strong> las tallas de esta fila.
            Si solo algunas van a Niño/Dama, cierra esto y usa <strong>Mover tallas</strong> arriba de la lista.
          </Alert>
          <FormGroup>
            <Label>currentStock</Label>
            <Input bsSize="sm" value={stockForm.currentStock} onChange={(e) => setStockForm({ ...stockForm, currentStock: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>minimumStock</Label>
            <Input bsSize="sm" value={stockForm.minimumStock} onChange={(e) => setStockForm({ ...stockForm, minimumStock: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>hardwareCondition / PARA</Label>
            <Input
              bsSize="sm"
              type="select"
              value={stockForm.hardwareCondition}
              onChange={(e) => setStockForm({ ...stockForm, hardwareCondition: e.target.value })}
            >
              {HARDWARE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
              {stockForm.hardwareCondition
                && !HARDWARE_OPTIONS.some((opt) => opt.value === stockForm.hardwareCondition) ? (
                <option value={stockForm.hardwareCondition}>{stockForm.hardwareCondition}</option>
              ) : null}
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
