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
import "./KioskLedgerLab.css";
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
  accountingMovementToLabUpdate,
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

const filtersFromSearch = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    locationId: params.get("locationId") || "",
    productTerm: params.get("productTerm") || "",
    stockId: params.get("stockId") || "",
    type: params.get("type") || "",
    sizeKey: params.get("sizeKey") || "",
    from: params.get("from") || "",
    to: params.get("to") || "",
    referenceTerm: params.get("referenceTerm") || "",
    reason: params.get("reason") || "",
    affectsStockOnly: params.get("affectsStockOnly") === "true",
    movementId: params.get("movementId") || "",
    hardwareCondition: params.get("hardwareCondition") || "",
  };
};

const PARA_FILTER_OPTIONS = [
  { value: "", label: "Todas" },
  { value: "NUEVO", label: "Sin PARA" },
  { value: "NINO", label: "Niño" },
  { value: "DAMA", label: "Dama" },
  { value: "VIEJO", label: "Viejo" },
];

// Tono visual de cada tipo de movimiento (entra / venta / sale / problema / ajuste).
const TYPE_TONE = {
  ENTRADA: "in",
  TRASLADO_ENTRADA: "in",
  DEVOLUCION_CLIENTE: "in",
  DEVOLUCION_DEPOSITO: "in",
  VENTA: "sale",
  SALIDA: "out",
  TRASLADO_SALIDA: "out",
  DEVOLUCION_A_CLIENTE: "out",
  CAMBIO: "out",
  MERMA: "bad",
  ANULACION: "bad",
  AJUSTE: "adj",
};

const ADVANCED_FILTER_KEYS = [
  "type",
  "sizeKey",
  "from",
  "to",
  "movementId",
  "referenceTerm",
  "reason",
  "affectsStockOnly",
];

const EMPTY_FILTERS = {
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
};

function paraClass(hardware) {
  const h = String(hardware || "").toUpperCase();
  if (h === "NINO") return "nino";
  if (h === "DAMA") return "dama";
  if (h === "VIEJO") return "viejo";
  return "";
}

function paraLabel(hardware) {
  const h = String(hardware || "").toUpperCase();
  if (h === "NINO") return "Niño";
  if (h === "DAMA") return "Dama";
  if (h === "VIEJO") return "Viejo";
  return "";
}

function deltaOf(before, after) {
  if (before == null || after == null) return null;
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  return a - b;
}

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

function FieldLabel({ children, hint }) {
  return (
    <>
      <span className="kll-label">{children}</span>
      {hint ? <span className="kll-hint">{hint}</span> : null}
    </>
  );
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
  const [filters, setFilters] = useState(filtersFromSearch);
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
  const [savingTypeId, setSavingTypeId] = useState(null);
  const [selectedStockIds, setSelectedStockIds] = useState(() => new Set());
  const [sizeKeysToMove, setSizeKeysToMove] = useState(() => new Set());
  const [moveParaTarget, setMoveParaTarget] = useState("NINO");
  const movementsRequestIdRef = React.useRef(0);

  const activeAdvancedCount = useMemo(
    () => ADVANCED_FILTER_KEYS.filter((key) => Boolean(filters[key])).length,
    [filters]
  );
  const [advancedOpen, setAdvancedOpen] = useState(() => activeAdvancedCount > 0);
  const hasAnyFilter = useMemo(
    () => Object.keys(EMPTY_FILTERS).some((key) => key !== "locationId" && Boolean(filters[key])),
    [filters]
  );

  // Limpia todo menos el kiosko elegido.
  const clearFilters = () => {
    setFilters((prev) => ({ ...EMPTY_FILTERS, locationId: prev.locationId }));
    setSelectedStockId(null);
  };

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

  const handleQuickTypeChange = async (movement, nextType) => {
    const current = normalizeKioscoMovementType(movement?.movementType);
    if (!nextType || nextType === current) return;
    setSavingTypeId(movement.id);
    try {
      await ledgerLabUpdateMovement(movement.id, accountingMovementToLabUpdate(movement, nextType));
      showSuccess(`Movimiento #${movement.id} → ${getKioscoMovementTypeLabel(nextType)}. Stock recalculado.`);
      await loadMovements({ stockId: movement.kioscoStockId || selectedStockId || undefined });
      await loadStocks();
    } catch (err) {
      showError(err.message || "No se pudo cambiar el tipo.");
    } finally {
      setSavingTypeId(null);
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

  const hasScope = Boolean(filters.locationId || filters.stockId);
  const selectedParaLabel = paraLabel(selectedStock?.hardwareCondition);
  const movementsScopeLabel = selectedStockId || filters.stockId
    ? (selectedStock
      ? `${selectedStock.productCode} / ${selectedStock.colorName || "sin color"}`
      : "stock seleccionado")
    : null;

  return (
    <div className="content kll">
      {/* ───────── Encabezado ───────── */}
      <div className="kll-head">
        <div className="kll-title">
          <div className="kll-title-icon"><i className="nc-icon nc-layout-11" /></div>
          <div>
            <h4>
              Kiosk Ledger Lab
              <span className="kll-lock">solo {ALLOWED_USERNAME}</span>
            </h4>
            <small>Cirugía de kiosco_movement / kiosco_stock</small>
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
              Recalcular
            </DropdownToggle>
            <DropdownMenu right>
              <DropdownItem onClick={handleReplay} disabled={!selectedStockId}>
                Stock seleccionado
                <small>Recalcula before/after y current_stock de la fila marcada</small>
              </DropdownItem>
              <DropdownItem onClick={handleReplayAll} disabled={!filters.locationId}>
                Todo el kiosko
                <small>Todos los kiosco_stock del kiosko elegido</small>
              </DropdownItem>
              <DropdownItem divider />
              <DropdownItem className="kll-danger-item" onClick={handleReplayAllKiosks}>
                TODOS los kioscos
                <small>Recorre cada kiosko; puede tardar varios minutos</small>
              </DropdownItem>
            </DropdownMenu>
          </UncontrolledDropdown>
          <Button color="primary" size="sm" onClick={openCreate} disabled={saving}>
            <i className="nc-icon nc-simple-add mr-1" /> Movimiento
          </Button>
        </div>
      </div>

      {/* ───────── Filtros ───────── */}
      <div className="kll-card">
        <div className="kll-filters">
          <Row className="align-items-end">
            <Col lg={4} md={6} className="mb-2">
              <FieldLabel>Kiosko</FieldLabel>
              <FilterableSelect
                options={kioskOptions}
                value={filters.locationId}
                onChange={(v) => {
                  setFilter("locationId", v || "");
                  setSelectedStockId(null);
                }}
                placeholder="Elige un kiosko"
              />
            </Col>
            <Col lg={4} md={6} className="mb-2">
              <FieldLabel>Dimensión PARA</FieldLabel>
              <div className="kll-seg" role="group" aria-label="Filtrar dimensión PARA">
                {PARA_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value || "all"}
                    type="button"
                    className={filters.hardwareCondition === opt.value ? "active" : ""}
                    onClick={() => setFilter("hardwareCondition", opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Col>
            <Col lg={3} md={8} className="mb-2">
              <FieldLabel>Producto / código</FieldLabel>
              <Input
                bsSize="sm"
                placeholder="Buscar producto"
                value={filters.productTerm}
                onChange={(e) => setFilter("productTerm", e.target.value)}
              />
            </Col>
            <Col lg={1} md={4} className="mb-2">
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
                <Col lg={1} md={3} xs={6} className="mb-2">
                  <FieldLabel>Talla</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="38"
                    value={filters.sizeKey}
                    onChange={(e) => setFilter("sizeKey", e.target.value)}
                  />
                </Col>
                <Col lg={2} md={4} xs={6} className="mb-2">
                  <FieldLabel>Desde</FieldLabel>
                  <Input
                    bsSize="sm"
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilter("from", e.target.value)}
                  />
                </Col>
                <Col lg={2} md={4} xs={6} className="mb-2">
                  <FieldLabel>Hasta</FieldLabel>
                  <Input
                    bsSize="sm"
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilter("to", e.target.value)}
                  />
                </Col>
                <Col lg={2} md={4} xs={6} className="mb-2">
                  <FieldLabel>Mov. ID</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="#"
                    value={filters.movementId}
                    onChange={(e) => setFilter("movementId", e.target.value)}
                  />
                </Col>
                <Col lg={2} md={4} className="mb-2">
                  <label className="kll-check" htmlFor="kll-affects-only">
                    <input
                      id="kll-affects-only"
                      type="checkbox"
                      checked={filters.affectsStockOnly}
                      onChange={(e) => setFilter("affectsStockOnly", e.target.checked)}
                    />
                    Solo afecta stock
                  </label>
                </Col>
                <Col lg={6} md={6} className="mb-2">
                  <FieldLabel>Referencia / boleta / venta</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="Ej. número de boleta"
                    value={filters.referenceTerm}
                    onChange={(e) => setFilter("referenceTerm", e.target.value)}
                  />
                </Col>
                <Col lg={6} md={6} className="mb-2">
                  <FieldLabel>Motivo contiene</FieldLabel>
                  <Input
                    bsSize="sm"
                    placeholder="Texto del motivo"
                    value={filters.reason}
                    onChange={(e) => setFilter("reason", e.target.value)}
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
        <Col xl={5} lg={5}>
          <div className="kll-card">
            <div className="kll-card-head">
              <div className="kll-card-title">
                Stock <span className="kll-count">{stocks.length}</span>
              </div>
              {loadingStocks && <Spinner size="sm" color="primary" />}
            </div>

            {selectedIds.length > 0 && (
              <div className="kll-bulk">
                <strong>{selectedIds.length} marcada{selectedIds.length === 1 ? "" : "s"}</strong>
                <Button
                  color="light"
                  outline
                  size="sm"
                  onClick={() => handleAssignPara("NINO", false)}
                  disabled={saving}
                  title="Asigna PARA Niño a TODAS las tallas de cada fila"
                >
                  PARA Niño
                </Button>
                <Button
                  color="light"
                  outline
                  size="sm"
                  onClick={() => handleAssignPara("DAMA", false)}
                  disabled={saving}
                  title="Asigna PARA Dama a TODAS las tallas de cada fila"
                >
                  PARA Dama
                </Button>
                <span className="kll-bulk-sep" />
                <Button
                  color="warning"
                  size="sm"
                  onClick={() => handleAssignPara("NINO", true)}
                  disabled={saving}
                  title="Suma cantidades si ya existe Niño en ese color"
                >
                  Fusionar Niño
                </Button>
                <Button
                  color="warning"
                  size="sm"
                  onClick={() => handleAssignPara("DAMA", true)}
                  disabled={saving}
                  title="Suma cantidades si ya existe Dama en ese color"
                >
                  Fusionar Dama
                </Button>
                <span className="kll-bulk-sep" />
                <Button color="danger" size="sm" onClick={handleDeleteSelectedStocks} disabled={saving}>
                  Eliminar filas
                </Button>
                <button
                  type="button"
                  className="kll-link kll-bulk-clear"
                  onClick={() => setSelectedStockIds(new Set())}
                >
                  Quitar marcas
                </button>
              </div>
            )}

            {selectedStock ? (
              <div className="kll-para-panel">
                <div className="kll-para-head">
                  <div>
                    <div className="kll-para-name">
                      {selectedStock.productCode} · {selectedStock.colorName || "sin color"}
                    </div>
                    <div className="kll-para-meta">
                      <span className="kll-mono">#{selectedStock.id}</span>
                      <span className={`kll-para ${paraClass(selectedStock.hardwareCondition)}`}>
                        {selectedParaLabel ? `PARA ${selectedParaLabel}` : "Sin PARA"}
                      </span>
                      <span>{selectedStock.currentStock} pzs</span>
                    </div>
                  </div>
                  <div className="d-flex" style={{ gap: 6 }}>
                    <Button
                      color="info"
                      outline
                      size="sm"
                      onClick={openStockEditor}
                      disabled={saving}
                      title="Cambia todas las tallas de esta fila"
                    >
                      Editar
                    </Button>
                    <Button
                      color="success"
                      outline
                      size="sm"
                      onClick={handleSplitOpeningBySizes}
                      disabled={!hasSizesData || saving}
                      title="Borra el AJUSTE/ENTRADA agregado de inventario inicial y crea una ENTRADA por talla"
                    >
                      Desglosar
                    </Button>
                  </div>
                </div>

                {selectedSizeEntries.length > 0 ? (
                  <>
                    <span className="kll-label">
                      Marca las tallas que van a Niño o Dama · el resto se queda en esta fila
                    </span>
                    <div className="kll-size-chips">
                      {selectedSizeEntries.map(([size, qty]) => (
                        <button
                          key={size}
                          type="button"
                          className={`kll-size-chip${sizeKeysToMove.has(size) ? " on" : ""}`}
                          aria-pressed={sizeKeysToMove.has(size)}
                          onClick={() => {
                            setSizeKeysToMove((prev) => {
                              const next = new Set(prev);
                              if (next.has(size)) next.delete(size);
                              else next.add(size);
                              return next;
                            });
                          }}
                        >
                          <b>{size}</b>
                          <span>×{qty}</span>
                        </button>
                      ))}
                    </div>
                    <div className="kll-para-controls">
                      <button
                        type="button"
                        className="kll-link"
                        onClick={() => setSizeKeysToMove(new Set(selectedSizeEntries
                          .map(([size]) => size)
                          .filter((size) => KIDS_PARA_SIZES.has(String(size)))))}
                      >
                        16–32
                      </button>
                      <button
                        type="button"
                        className="kll-link"
                        onClick={() => setSizeKeysToMove(new Set(selectedSizeEntries
                          .map(([size]) => size)
                          .filter((size) => Number(size) >= 34)))}
                      >
                        34+
                      </button>
                      <button
                        type="button"
                        className="kll-link"
                        onClick={() => setSizeKeysToMove(new Set())}
                        disabled={sizeKeysToMove.size === 0}
                      >
                        Ninguna
                      </button>
                      <span className="kll-spacer" />
                      <div className="kll-seg" role="group" aria-label="PARA destino">
                        <button
                          type="button"
                          className={moveParaTarget === "NINO" ? "active" : ""}
                          onClick={() => setMoveParaTarget("NINO")}
                        >
                          Niño
                        </button>
                        <button
                          type="button"
                          className={moveParaTarget === "DAMA" ? "active" : ""}
                          onClick={() => setMoveParaTarget("DAMA")}
                        >
                          Dama
                        </button>
                      </div>
                      <Button
                        color="success"
                        size="sm"
                        onClick={handleMoveSelectedSizes}
                        disabled={saving || sizeKeysToMove.size === 0}
                      >
                        Mover {sizeKeysToMove.size > 0 ? `${sizeKeysToMove.size} talla${sizeKeysToMove.size === 1 ? "" : "s"}` : "tallas"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <span className="kll-muted">Esta fila no tiene tallas en sizes_data.</span>
                )}
              </div>
            ) : (
              <div className="kll-guide">
                <div className="kll-guide-title">Cómo asignar PARA por talla</div>
                <ol className="kll-steps">
                  <li><i>1</i><span>Haz clic en un producto/color de la lista.</span></li>
                  <li><i>2</i><span>Aquí aparecen sus tallas: marca solo las que son Niño o Dama.</span></li>
                  <li><i>3</i><span>Elige el destino y pulsa <strong>Mover tallas</strong>. Las no marcadas se quedan sin PARA.</span></li>
                </ol>
                <div className="kll-guide-note">
                  <strong>Editar</strong> y las acciones de filas marcadas cambian <em>todas</em> las tallas del color.
                </div>
              </div>
            )}

            <div className={`kll-scroll stocks${loadingStocks ? " kll-loading" : ""}`}>
              <table className="kll-table">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisibleStocks}
                        disabled={!stocks.length}
                        aria-label="Marcar todas las filas visibles"
                      />
                    </th>
                    <th>Producto</th>
                    <th>Color</th>
                    <th>PARA</th>
                    <th className="num">Cant.</th>
                    <th>Tallas</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => {
                    const sizeEntries = s.sizes && typeof s.sizes === "object"
                      ? Object.entries(s.sizes)
                        .filter(([, v]) => Number(v) > 0)
                        .sort((a, b) => Number(a[0]) - Number(b[0])
                          || String(a[0]).localeCompare(String(b[0]), "es", { numeric: true }))
                      : [];
                    const qty = Number(s.currentStock);
                    const label = paraLabel(s.hardwareCondition);
                    return (
                      <tr
                        key={s.id}
                        className={`clickable${String(selectedStockId) === String(s.id) ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedStockId(s.id);
                          loadMovements({ stockId: s.id });
                        }}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedStockIds.has(s.id)}
                            onChange={(e) => toggleStockSelected(s.id, e)}
                            aria-label={`Marcar stock ${s.id}`}
                          />
                        </td>
                        <td>
                          <div className="kll-prod">{s.productCode}</div>
                          <div className="kll-prod-sub" title={s.productName}>{s.productName}</div>
                        </td>
                        <td>{s.colorName || <span className="kll-muted">—</span>}</td>
                        <td>
                          {label ? (
                            <span className={`kll-para ${paraClass(s.hardwareCondition)}`}>{label}</span>
                          ) : (
                            <span className="kll-muted">—</span>
                          )}
                        </td>
                        <td className="num">
                          <span className={`kll-qty${qty === 0 ? " zero" : ""}${qty < 0 ? " neg" : ""}`}>
                            {s.currentStock}
                          </span>
                        </td>
                        <td>
                          {sizeEntries.length > 0 ? (
                            <div className="kll-mini-sizes" title={sizesSummary(s)}>
                              {sizeEntries.slice(0, 6).map(([k, v]) => (
                                <span key={k}><b>{k}</b>×{v}</span>
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
                  title={hasScope ? "Sin stock con esos filtros" : "Elige un kiosko"}
                  text={hasScope
                    ? "Prueba quitando el filtro de producto o PARA."
                    : "Selecciona un kiosko (o escribe un stock ID) para ver sus filas."}
                />
              )}
            </div>
          </div>
        </Col>

        {/* ───────── Movimientos ───────── */}
        <Col xl={7} lg={7}>
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
                        title="Ver todo el kiosko"
                        aria-label="Quitar el stock seleccionado"
                        onClick={() => setSelectedStockId(null)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                ) : (
                  filters.locationId && <span className="kll-sub">todo el kiosko</span>
                )}
              </div>
              {loadingMovements && <Spinner size="sm" color="primary" />}
            </div>

            <div className={`kll-scroll moves${loadingMovements ? " kll-loading" : ""}`}>
              <table className="kll-table">
                <thead>
                  <tr>
                    <th>Mov.</th>
                    <th>Tipo</th>
                    <th className="num">Cant.</th>
                    <th>Stock</th>
                    <th>Talla</th>
                    <th>Usuario</th>
                    <th>Referencia</th>
                    <th>Motivo</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const type = normalizeKioscoMovementType(m.movementType);
                    const tone = TYPE_TONE[type] || "adj";
                    const stockDelta = deltaOf(m.stockBefore, m.stockAfter);
                    const hasSizeFlow = m.sizeKey && (m.sizeStockBefore != null || m.sizeStockAfter != null);
                    return (
                      <tr key={m.id}>
                        <td>
                          <div className="kll-mono"><b>#{m.id}</b></div>
                          <div className="kll-muted" style={{ fontSize: "0.72rem" }}>
                            {formatDateTimeGt(m.createdAt)}
                          </div>
                        </td>
                        <td>
                          <span className={`kll-type ${tone}`}>
                            <select
                              value={type}
                              disabled={savingTypeId === m.id || saving}
                              onChange={(e) => void handleQuickTypeChange(m, e.target.value)}
                              aria-label={`Tipo del movimiento ${m.id}`}
                            >
                              {Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </span>
                          {!m.affectsStock && <span className="kll-flag">sin stock</span>}
                        </td>
                        <td className="num"><b>{m.quantity}</b></td>
                        <td>
                          <span className="kll-flow">
                            {m.stockBefore ?? "—"}
                            <span className="arrow">→</span>
                            <b>{m.stockAfter ?? "—"}</b>
                            {stockDelta != null && (
                              <span className={`kll-delta ${stockDelta > 0 ? "up" : stockDelta < 0 ? "down" : "flat"}`}>
                                {stockDelta > 0 ? `+${stockDelta}` : stockDelta}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          {m.sizeKey ? (
                            <>
                              <span className="kll-size-tag">{m.sizeKey}</span>
                              {hasSizeFlow && (
                                <div className="kll-flow kll-muted" style={{ fontSize: "0.72rem" }}>
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
                          {m.userId != null && (
                            <div className="kll-muted kll-mono">#{m.userId}</div>
                          )}
                        </td>
                        <td>
                          <div className="kll-ref">
                            {m.referenceSummary || m.referenceNumber || (m.referenceId != null ? `#${m.referenceId}` : "—")}
                          </div>
                          {m.referenceType && <span className="kll-ref-type">{m.referenceType}</span>}
                          <div className="kll-muted kll-mono" title="kiosco_stock_id">stock {m.kioscoStockId}</div>
                        </td>
                        <td>
                          <div className="kll-reason" title={m.reason || ""}>{m.reason || "—"}</div>
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
                    : "Elige un kiosko o un stock para ver su historial."}
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
          <div className="kll-section">Qué pasó</div>
          <Row>
            <Col md={3}>
              <FieldLabel>Stock ID</FieldLabel>
              <Input bsSize="sm" value={form.kioscoStockId} onChange={(e) => setForm({ ...form, kioscoStockId: e.target.value })} />
            </Col>
            <Col md={4}>
              <FieldLabel>Tipo</FieldLabel>
              <Input
                bsSize="sm"
                type="select"
                value={form.movementType}
                onChange={(e) => setForm({ ...form, movementType: e.target.value })}
              >
                {Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label} ({value})</option>
                ))}
              </Input>
            </Col>
            <Col md={2}>
              <FieldLabel>Cantidad</FieldLabel>
              <Input bsSize="sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </Col>
            <Col md={3}>
              <FieldLabel>Talla</FieldLabel>
              <Input bsSize="sm" placeholder="vacío = sin talla" value={form.sizeKey} onChange={(e) => setForm({ ...form, sizeKey: e.target.value })} />
            </Col>
            <Col md={4}>
              <FieldLabel>Fecha y hora</FieldLabel>
              <Input
                bsSize="sm"
                type="datetime-local"
                value={form.createdAt}
                onChange={(e) => setForm({ ...form, createdAt: e.target.value })}
              />
            </Col>
            <Col md={4}>
              <FieldLabel>Stock antes</FieldLabel>
              <Input bsSize="sm" value={form.stockBefore} onChange={(e) => setForm({ ...form, stockBefore: e.target.value })} />
            </Col>
            <Col md={4}>
              <FieldLabel>Stock después</FieldLabel>
              <Input bsSize="sm" value={form.stockAfter} onChange={(e) => setForm({ ...form, stockAfter: e.target.value })} />
            </Col>
            <Col md={12}>
              <label className="kll-check" htmlFor="kll-affects-stock" style={{ paddingTop: 0 }}>
                <input
                  id="kll-affects-stock"
                  type="checkbox"
                  checked={form.affectsStock}
                  onChange={(e) => setForm({ ...form, affectsStock: e.target.checked })}
                />
                Este movimiento afecta el stock (affectsStock)
              </label>
            </Col>
          </Row>

          <div className="kll-section">Origen del movimiento</div>
          <Row>
            <Col md={3}>
              <FieldLabel>Usuario ID</FieldLabel>
              <Input bsSize="sm" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
            </Col>
            <Col md={3}>
              <FieldLabel>Referencia ID</FieldLabel>
              <Input bsSize="sm" value={form.referenceId} onChange={(e) => setForm({ ...form, referenceId: e.target.value })} />
            </Col>
            <Col md={3}>
              <FieldLabel>Conteo físico ID</FieldLabel>
              <Input bsSize="sm" value={form.physicalCountId} onChange={(e) => setForm({ ...form, physicalCountId: e.target.value })} />
            </Col>
            <Col md={3}>
              <FieldLabel>Boleta física</FieldLabel>
              <Input bsSize="sm" value={form.physicalSlipNumber} onChange={(e) => setForm({ ...form, physicalSlipNumber: e.target.value })} />
            </Col>
          </Row>

          <div className="kll-section">Traslado</div>
          <Row>
            <Col md={6}>
              <FieldLabel>Ubicación origen (ID)</FieldLabel>
              <Input bsSize="sm" value={form.originLocationId} onChange={(e) => setForm({ ...form, originLocationId: e.target.value })} />
            </Col>
            <Col md={6}>
              <FieldLabel>Ubicación destino (ID)</FieldLabel>
              <Input bsSize="sm" value={form.destinationLocationId} onChange={(e) => setForm({ ...form, destinationLocationId: e.target.value })} />
            </Col>
          </Row>

          <div className="kll-section">Motivo</div>
          <Input bsSize="sm" type="textarea" rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
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
          <div className="kll-callout">
            <i className="nc-icon nc-alert-circle-i" />
            <span>
              Cambiar PARA aquí aplica a <strong>todas</strong> las tallas de esta fila.
              Si solo algunas van a Niño/Dama, cierra esto y usa <strong>Mover tallas</strong> en el panel de stock.
            </span>
          </div>
          <Row>
            <Col md={6}>
              <FieldLabel>Stock actual</FieldLabel>
              <Input bsSize="sm" value={stockForm.currentStock} onChange={(e) => setStockForm({ ...stockForm, currentStock: e.target.value })} />
            </Col>
            <Col md={6}>
              <FieldLabel>Stock mínimo</FieldLabel>
              <Input bsSize="sm" value={stockForm.minimumStock} onChange={(e) => setStockForm({ ...stockForm, minimumStock: e.target.value })} />
            </Col>
            <Col md={12}>
              <FieldLabel>PARA / herraje (hardwareCondition)</FieldLabel>
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
            </Col>
            <Col md={12}>
              <FieldLabel>Tallas (sizesData, JSON)</FieldLabel>
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
