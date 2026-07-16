import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
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
import {
  addKioscoNotificationRecipient,
  cerrarKioscoConteo,
  getKioscoConteoHistorial,
  getKioscoConteoReport,
  getKioscoSubconteo,
  getKioscoNotificationRecipients,
  removeKioscoNotificationRecipient,
  revisarKioscoConteo,
  saveKioscoConteoItems,
  startKioscoConteo,
  terminarKioscoConteo,
} from "services/kioscoInventoryService";
import { formatDateGt, formatDateTimeGt } from "utils/dateTimeHelper";
import { exportConteoToExcel, exportConteoToPdf } from "utils/kioscoConteoExport";
import { buildConteoDisplayReport, formatConteoSubtotalLabel } from "utils/kioscoConteoDisplay";
import { PRODUCT_AUDIENCE_OPTIONS, productMatchesAudienceFilter } from "utils/productAudienceHelper";
import {
  CINCHO_FILTER_OPTIONS,
  shouldShowInKioskPhysicalCount,
  isCinchoProductRow,
  isFossCinchoProductRow,
  formatFossLocationSizeSummary,
  productMatchesCinchoFilter,
  productMatchesSearchFilter,
  resolvePhysicalSizesSummary,
  resolveSizesSummary,
  rowKey,
  persistKey,
  sumSizeCounts,
  CINCHO_COUNT_LOCATION,
} from "utils/productCinchoHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import CinchoCountDetailModal from "./CinchoCountDetailModal";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
const CINCHO_VITRINE_LOCATION = CINCHO_COUNT_LOCATION.VITRINE;
const CINCHO_WAREHOUSE_LOCATION = CINCHO_COUNT_LOCATION.WAREHOUSE;
const PRODUCT_INFO_COLS = 3;
const LOC_COL_WIDTH = 52;
const SUM_COL_WIDTH = 56;

const locColStyle = {
  width: LOC_COL_WIDTH,
  minWidth: LOC_COL_WIDTH,
  maxWidth: LOC_COL_WIDTH,
  padding: "2px 4px",
  textAlign: "center",
  boxSizing: "border-box",
};

const sumColStyle = {
  width: SUM_COL_WIDTH,
  minWidth: SUM_COL_WIDTH,
  textAlign: "right",
  boxSizing: "border-box",
};

/** Diferencia absoluta minima (unidades) para considerar una discrepancia relevante. Debe reflejar
 * KioscoInventoryCountService.DIFF_ALERT_THRESHOLD en el backend. */
const DIFF_ALERT_THRESHOLD = 3;

function conteoStatusMeta(status) {
  if (status === "CERRADO") return { label: "🔒 Cerrado", color: "secondary" };
  if (status === "REVISADO") return { label: "✓ Revisado", color: "success" };
  if (status === "CONTADO") return { label: "✓ Contado", color: "info" };
  return { label: "Borrador", color: "warning" };
}

const KARDEX_COLUMNS = [
  { key: "inventarioInicial", label: "Ini.", title: "Inventario Inicial" },
  { key: "comprasAjustes", label: "Comp.", title: "Compras / Ajustes" },
  { key: "anulacionCompras", label: "A.C.", title: "Anulación Compras" },
  { key: "entradas", label: "Ent.", title: "Entradas (distribución)" },
  { key: "ventas", label: "Vtas.", title: "Ventas" },
  { key: "anulacionVenta", label: "A.V.", title: "Anulación Venta" },
  { key: "salida", label: "Sal.", title: "Salida" },
  { key: "inventarioFinal", label: "Fin.", title: "Inventario Final (sistema)" },
];

const subcountKardexFinalColumn = {
  key: "inventarioFinal",
  label: "Fin.corte",
  title: "Inventario final al corte (sistema)",
};

const resolveKardexColumns = (isSubcountView) =>
  isSubcountView
    ? KARDEX_COLUMNS.map((col) => (col.key === "inventarioFinal" ? subcountKardexFinalColumn : col))
    : KARDEX_COLUMNS;

const applySizeTotalToLocations = (sizeTotal, existingPartial, baseCounts) => {
  const base = { ...baseCounts, ...(existingPartial || {}) };
  const locTotal = rowTotal(base);
  if (locTotal === 0) {
    return COUNT_LOCATION_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: k === CINCHO_VITRINE_LOCATION ? sizeTotal : 0 }),
      {}
    );
  }
  const delta = sizeTotal - locTotal;
  return {
    ...base,
    [CINCHO_VITRINE_LOCATION]: Number(base[CINCHO_VITRINE_LOCATION] || 0) + delta,
  };
};

const applyFossLocationSizesToCounts = (byLocation, existingPartial, baseCounts) => {
  const base = { ...(baseCounts || {}), ...(existingPartial || {}) };
  const next = { ...base };
  next[CINCHO_VITRINE_LOCATION] = sumSizeCounts(byLocation?.[CINCHO_VITRINE_LOCATION]);
  next[CINCHO_WAREHOUSE_LOCATION] = sumSizeCounts(byLocation?.[CINCHO_WAREHOUSE_LOCATION]);
  return next;
};

const rowTotal = (counts) => COUNT_LOCATION_KEYS.reduce((s, k) => s + Number(counts[k] || 0), 0);
const rowDiff = (row, counts) => rowTotal(counts) - Number(row.inventarioFinal || 0);

const diffColor = (diferencia) => {
  if (diferencia === 0) return "#16a34a";
  return diferencia > 0 ? "#16a34a" : "#dc2626";
};

const sumFilteredRows = (rows) => {
  const totalCounts = {};
  COUNT_LOCATION_KEYS.forEach((k) => {
    totalCounts[k] = rows.reduce((s, r) => s + Number((r.counts || {})[k] || 0), 0);
  });
  const sumField = (key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  return {
    inventarioInicial: sumField("inventarioInicial"),
    comprasAjustes: sumField("comprasAjustes"),
    anulacionCompras: sumField("anulacionCompras"),
    entradas: sumField("entradas"),
    ventas: sumField("ventas"),
    anulacionVenta: sumField("anulacionVenta"),
    salida: sumField("salida"),
    inventarioFinal: sumField("inventarioFinal"),
    counts: totalCounts,
    total,
    diferencia: sumField("diferencia"),
  };
};

const fmt = (v) => formatDateGt(v, { month: "short" });
const fmtDt = (v) => (v ? formatDateTimeGt(v) : null);

// ─── Columnas fijas para alinear cabecera y datos ─────────────────────────────
function CountTableColGroup({ showKardex, kardexColumns }) {
  return (
    <colgroup>
      <col />
      <col />
      <col />
      {showKardex && kardexColumns.map((col) => (
        <col key={col.key} style={{ width: LOC_COL_WIDTH }} />
      ))}
      {COUNT_LOCATION_KEYS.map((k) => (
        <col key={k} style={{ width: LOC_COL_WIDTH }} />
      ))}
      <col style={{ width: SUM_COL_WIDTH }} />
      <col style={{ width: SUM_COL_WIDTH }} />
    </colgroup>
  );
}

// ─── Celda de conteo editable ─────────────────────────────────────────────────
function CountCell({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      step="1"
      value={value ?? 0}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      disabled={disabled}
      style={{
        width: "100%",
        maxWidth: LOC_COL_WIDTH - 8,
        padding: "2px 4px",
        fontSize: 12,
        textAlign: "right",
        border: "1px solid #d1d5db",
        borderRadius: 4,
        background: disabled ? "#f3f4f6" : value > 0 ? "#f0fdf4" : "#fff",
        boxSizing: "border-box",
      }}
    />
  );
}

// ─── Fila de datos ────────────────────────────────────────────────────────────
function DataRow({ row, showKardex, kardexColumns, counts, physicalSizes, physicalSizesByLocation, onCountChange, onOpenCinchoModal, disabled }) {
  const total = rowTotal(counts);
  const diferencia = rowDiff(row, counts);
  const isAlert = Math.abs(diferencia) >= DIFF_ALERT_THRESHOLD;
  const isCincho = isCinchoProductRow(row);
  const isFoss = isFossCinchoProductRow(row);
  const isExpandedSizeRow = !!row.sizeLabel;
  const physicalSummary = !isExpandedSizeRow && isFoss && physicalSizesByLocation
    ? formatFossLocationSizeSummary(physicalSizesByLocation)
    : !isExpandedSizeRow ? resolvePhysicalSizesSummary({ ...row, physicalSizes }) : "";
  const sizeCell = isExpandedSizeRow
    ? row.sizeLabel
    : (resolveSizesSummary(row) || "—");
  const countLocationDisabled = (locKey) => {
    if (!isExpandedSizeRow || !isCincho) return false;
    if (isFoss) {
      return locKey !== CINCHO_VITRINE_LOCATION && locKey !== CINCHO_WAREHOUSE_LOCATION;
    }
    return locKey !== CINCHO_VITRINE_LOCATION;
  };
  return (
    <tr>
      <td style={{ fontSize: 12 }}>
        <span style={{ fontWeight: 500 }}>{row.productCode}</span>
        <span style={{ color: "#6b7280" }}> {row.productName}</span>
      </td>
      <td style={{ fontSize: 12, color: "#6b7280" }}>{row.colorName || "—"}</td>
      <td style={{ fontSize: 11, color: "#374151" }}>
        <div style={{ whiteSpace: "nowrap", fontWeight: isExpandedSizeRow ? 600 : 400 }}>{sizeCell}</div>
        {physicalSummary && (
          <div style={{ fontSize: 10, color: "#2563eb", whiteSpace: "nowrap" }}>
            Físico: {physicalSummary}
          </div>
        )}
        {isCincho && !isExpandedSizeRow && (
          <Button
            color="link"
            size="sm"
            className="p-0"
            style={{ fontSize: 11, fontWeight: 600 }}
            onClick={() => onOpenCinchoModal(row.productId)}
            disabled={disabled}
          >
            {isFoss ? "Contar E/BO por talla" : "Contar por talla"}
          </Button>
        )}
      </td>
      {showKardex && kardexColumns.map((col) => (
        <td key={col.key} className="text-right" style={{ fontSize: 11, color: col.key === "inventarioFinal" ? "#111" : "#6b7280" }}>
          {row[col.key]}
        </td>
      ))}
      {COUNT_LOCATION_KEYS.map((locKey) => (
        <td key={locKey} style={locColStyle}>
          <CountCell
            value={counts[locKey]}
            onChange={(v) => onCountChange(locKey, v)}
            disabled={disabled || countLocationDisabled(locKey)}
          />
        </td>
      ))}
      <td style={{ ...sumColStyle, fontWeight: 600, fontSize: 12 }}>{total}</td>
      <td style={{
        ...sumColStyle,
        fontWeight: 700,
        fontSize: 12,
        color: diffColor(diferencia),
        background: isAlert ? "#fef2f2" : undefined,
      }}>
        {diferencia !== 0 && <span style={{ marginRight: 2 }}>{diferencia > 0 ? "▲" : "▼"}</span>}
        {diferencia > 0 ? `+${diferencia}` : diferencia}
      </td>
    </tr>
  );
}

// ─── Fila de subtotal / total ─────────────────────────────────────────────────
function SummaryRow({ label, row, showKardex, kardexColumns, bg = "#f3f4f6", textColor = "#111", bold = false }) {
  const style = { background: bg, fontSize: 11, fontWeight: bold ? 700 : 600, color: textColor };
  return (
    <tr style={style}>
      <td colSpan={PRODUCT_INFO_COLS} style={style}>{label}</td>
      {showKardex && kardexColumns.map((col) => (
        <td key={col.key} className="text-right" style={style}>{row[col.key]}</td>
      ))}
      {COUNT_LOCATION_KEYS.map((k) => (
        <td key={k} style={{ ...style, ...locColStyle, textAlign: "right" }}>{(row.counts || {})[k] ?? 0}</td>
      ))}
      <td style={{ ...style, ...sumColStyle }}>{row.total}</td>
      <td style={{
        ...style,
        ...sumColStyle,
        color: diffColor(row.diferencia ?? 0),
      }}>
        {(row.diferencia ?? 0) > 0 ? `+${row.diferencia}` : row.diferencia}
      </td>
    </tr>
  );
}

// ─── Grupo de categoría colapsable ────────────────────────────────────────────
function CategoryGroup({ category, showKardex, kardexColumns, editedCounts, editedSizeCounts, editedSizeCountsByLocation, onCountChange, onOpenCinchoModal, disabled }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasDiff = category.rows.some((r) => rowDiff(r, editedCounts[rowKey(r)] || r.counts || {}) !== 0);

  return (
    <>
      <tr
        style={{ background: "#e5e7eb", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <td
          colSpan={PRODUCT_INFO_COLS + (showKardex ? kardexColumns.length : 0) + COUNT_LOCATION_KEYS.length + 2}
          style={{ fontWeight: 700, fontSize: 12, padding: "5px 8px" }}
        >
          <span style={{ marginRight: 6 }}>{collapsed ? "▶" : "▼"}</span>
          {category.categoryName}
          <span style={{ marginLeft: 8, fontWeight: 400, color: "#6b7280", fontSize: 11 }}>
            {category.rows.length} producto{category.rows.length !== 1 ? "s" : ""}
          </span>
          {hasDiff && (
            <Badge color="danger" style={{ marginLeft: 8, fontSize: 10 }}>Diferencias</Badge>
          )}
        </td>
      </tr>
      {!collapsed && (
        <>
          {category.rows.map((row) => {
            const rKey = rowKey(row);
            const counts = editedCounts[rKey] || row.counts || {};
            const physicalSizes = editedSizeCounts[rKey] ?? row.physicalSizes;
            const physicalSizesByLocation = editedSizeCountsByLocation[rKey] ?? row.physicalSizesByLocation;
            return (
              <DataRow
                key={rKey}
                row={row}
                showKardex={showKardex}
                kardexColumns={kardexColumns}
                counts={counts}
                physicalSizes={physicalSizes}
                physicalSizesByLocation={physicalSizesByLocation}
                onCountChange={(locKey, v) => onCountChange(rKey, locKey, v)}
                onOpenCinchoModal={onOpenCinchoModal}
                disabled={disabled}
              />
            );
          })}
          <SummaryRow
            label={formatConteoSubtotalLabel(category.categoryName)}
            row={category.subtotal}
            showKardex={showKardex}
            kardexColumns={kardexColumns}
          />
        </>
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
function KioskInventoryCountReport({ locationId }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedCounts, setEditedCounts] = useState({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [showReviewBox, setShowReviewBox] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [cinchoFilter, setCinchoFilter] = useState("");
  const [showKardex, setShowKardex] = useState(false);
  const [editedSizeCounts, setEditedSizeCounts] = useState({});
  const [editedSizeCountsByLocation, setEditedSizeCountsByLocation] = useState({});
  const [cinchoModalProductId, setCinchoModalProductId] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [closing, setClosing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [showRecipientsModal, setShowRecipientsModal] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [newRecipient, setNewRecipient] = useState({ name: "", email: "" });
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [principalReport, setPrincipalReport] = useState(null);
  const [subcountAsOf, setSubcountAsOf] = useState("");
  const [loadingSubcount, setLoadingSubcount] = useState(false);
  const [exportingCutoff, setExportingCutoff] = useState(false);

  const isSubcountView = report?.reportType === "SUBCONTEO";
  const kardexColumns = useMemo(() => resolveKardexColumns(isSubcountView), [isSubcountView]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const displayReport = useMemo(() => buildConteoDisplayReport(report), [report]);

  const filteredCategories = useMemo(() => {
    if (!displayReport?.categories) return [];
    return displayReport.categories
      .map((category) => {
        const rows = category.rows.filter(
          (row) =>
            shouldShowInKioskPhysicalCount(row)
            && productMatchesSearchFilter(row, debouncedSearch)
            && productMatchesAudienceFilter(row, audienceFilter)
            && productMatchesCinchoFilter(row, cinchoFilter)
        );
        if (rows.length === 0) return null;
        return { ...category, rows, subtotal: sumFilteredRows(rows) };
      })
      .filter(Boolean);
  }, [displayReport, debouncedSearch, audienceFilter, cinchoFilter]);

  const allReportRows = useMemo(
    () => (displayReport?.categories || []).flatMap((category) => category.rows),
    [displayReport]
  );

  const cinchoModalRows = useMemo(() => {
    if (!cinchoModalProductId) return [];
    return allReportRows.filter(
      (row) => row.productId === cinchoModalProductId && isCinchoProductRow(row)
    );
  }, [allReportRows, cinchoModalProductId]);

  const cinchoModalFossMode = useMemo(
    () => cinchoModalRows.length > 0 && isFossCinchoProductRow(cinchoModalRows[0]),
    [cinchoModalRows]
  );

  const filteredTotalGeneral = useMemo(() => {
    const allRows = filteredCategories.flatMap((c) => c.rows);
    if (allRows.length === 0) return null;
    const rowsWithLiveTotals = allRows.map((row) => {
      const counts = editedCounts[rowKey(row)] || row.counts || {};
      const total = rowTotal(counts);
      return {
        ...row,
        counts,
        total,
        diferencia: rowDiff(row, counts),
      };
    });
    return sumFilteredRows(rowsWithLiveTotals);
  }, [filteredCategories, editedCounts]);

  const loadHistorial = useCallback(async (locId) => {
    if (!locId) {
      setHistorial([]);
      return;
    }
    try {
      setLoadingHistorial(true);
      const data = await getKioscoConteoHistorial(Number(locId));
      setHistorial(data || []);
    } catch {
      setHistorial([]);
    } finally {
      setLoadingHistorial(false);
    }
  }, []);

  useEffect(() => {
    void loadHistorial(locationId);
    setReport(null);
    setPrincipalReport(null);
    setSubcountAsOf("");
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
  }, [locationId, loadHistorial]);

  const openReport = (data, { isPrincipal = true } = {}) => {
    setReport(data);
    if (isPrincipal && data?.reportType !== "SUBCONTEO") {
      setPrincipalReport(data);
      if (data?.periodFrom) {
        setSubcountAsOf((prev) => prev || data.periodTo || "");
      }
    }
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
    setReviewNotes(data.notes || "");
    setShowReviewBox(false);
    setCinchoModalProductId(null);
  };

  const handleOpen = async () => {
    if (!locationId || !from || !to) {
      showError("Selecciona un kiosko y un rango de fechas.");
      return;
    }
    try {
      setLoading(true);
      const data = await startKioscoConteo(Number(locationId), from, to);
      openReport(data);
      await loadHistorial(locationId);
    } catch (err) {
      showError(err.message || "No se pudo abrir el conteo físico.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSession = async (countId) => {
    try {
      setLoading(true);
      const data = await getKioscoConteoReport(countId);
      openReport(data, { isPrincipal: true });
    } catch (err) {
      showError(err.message || "No se pudo cargar el conteo.");
    } finally {
      setLoading(false);
    }
  };

  const resolvePrincipalForSubcount = () => {
    const parentReport = report?.reportType === "SUBCONTEO" ? principalReport : report;
    if (!parentReport?.id) {
      showError("No hay un conteo principal cargado.");
      return null;
    }
    if (!subcountAsOf) {
      showError("Selecciona la fecha de corte del inventario sistema.");
      return null;
    }
    if (subcountAsOf < parentReport.periodFrom || subcountAsOf > parentReport.periodTo) {
      showError("La fecha de corte debe estar dentro del período del conteo.");
      return null;
    }
    return parentReport;
  };

  const handleViewSubconteo = async () => {
    const parentReport = resolvePrincipalForSubcount();
    if (!parentReport) return;
    try {
      setLoadingSubcount(true);
      setPrincipalReport(parentReport);
      const data = await getKioscoSubconteo(parentReport.id, subcountAsOf);
      setReport(data);
      setEditedCounts({});
      setEditedSizeCounts({});
      setEditedSizeCountsByLocation({});
      setCinchoModalProductId(null);
      setShowKardex(true);
    } catch (err) {
      showError(err.message || "No se pudo generar el subconteo.");
    } finally {
      setLoadingSubcount(false);
    }
  };

  const handleExportCutoff = async (format) => {
    const parentReport = resolvePrincipalForSubcount();
    if (!parentReport) return;
    try {
      setExportingCutoff(true);
      const data = await getKioscoSubconteo(parentReport.id, subcountAsOf);
      if (!data) {
        showError("No hay datos para exportar al corte.");
        return;
      }
      const payload = buildConteoDisplayReport({
        ...data,
        reportType: data.reportType || "SUBCONTEO",
        asOfDate: data.asOfDate || subcountAsOf,
      });
      const visibleCategories = (payload.categories || [])
        .map((category) => {
          const rows = (category.rows || []).filter(shouldShowInKioskPhysicalCount);
          if (!rows.length) return null;
          return { ...category, rows, subtotal: sumFilteredRows(rows) };
        })
        .filter(Boolean);
      const allVisible = visibleCategories.flatMap((c) => c.rows);
      const exportPayload = {
        ...payload,
        categories: visibleCategories,
        totalGeneral: allVisible.length ? sumFilteredRows(allVisible) : payload.totalGeneral,
      };
      if (format === "pdf") {
        exportConteoToPdf(exportPayload, { showKardex: true, includeVitrines: false });
        showSuccess(`PDF inventario al cierre del ${fmt(subcountAsOf)} listo.`);
      } else {
        exportConteoToExcel(exportPayload, { showKardex: true, includeVitrines: false });
        showSuccess(`Excel inventario al cierre del ${fmt(subcountAsOf)} descargado.`);
      }
    } catch (err) {
      showError(err.message || "No se pudo exportar el inventario al corte.");
    } finally {
      setExportingCutoff(false);
    }
  };

  const handleBackToPrincipal = () => {
    if (!principalReport) return;
    setReport(principalReport);
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
    setCinchoModalProductId(null);
  };

  const handleCountChange = (rKey, locKey, value) => {
    setEditedCounts((prev) => {
      const existingRow = prev[rKey];
      const baseRow = allReportRows.find((r) => rowKey(r) === rKey);
      const baseCounts = baseRow?.counts || {};
      return {
        ...prev,
        [rKey]: { ...baseCounts, ...(existingRow || {}), [locKey]: value },
      };
    });
  };

  const handleApplyCinchoModal = ({
    fossMode,
    sizeCountsByRowKey,
    sizeCountsByLocationByRowKey,
    applyToVitrine,
  }) => {
    setEditedSizeCounts((prev) => ({ ...prev, ...sizeCountsByRowKey }));
    if (fossMode && sizeCountsByLocationByRowKey) {
      setEditedSizeCountsByLocation((prev) => ({ ...prev, ...sizeCountsByLocationByRowKey }));
    }

    const shouldApplyLocations = fossMode || applyToVitrine;
    if (!shouldApplyLocations) return;

    setEditedCounts((prev) => {
      const next = { ...prev };
      Object.entries(sizeCountsByRowKey).forEach(([rKey, sizes]) => {
        const baseRow = allReportRows.find((r) => rowKey(r) === rKey);
        if (fossMode && sizeCountsByLocationByRowKey?.[rKey]) {
          next[rKey] = applyFossLocationSizesToCounts(
            sizeCountsByLocationByRowKey[rKey],
            prev[rKey],
            baseRow?.counts || {}
          );
        } else {
          const sizeTotal = sumSizeCounts(sizes);
          next[rKey] = applySizeTotalToLocations(sizeTotal, prev[rKey], baseRow?.counts || {});
        }
      });
      return next;
    });
  };

  const buildDirtyItemsPayload = () => {
    const dirtyPersistKeys = new Set();
    const markDirty = (key) => {
      const row = allReportRows.find((r) => rowKey(r) === key);
      if (row) dirtyPersistKeys.add(persistKey(row));
    };
    Object.keys(editedCounts).forEach(markDirty);
    Object.keys(editedSizeCounts).forEach(markDirty);
    Object.keys(editedSizeCountsByLocation).forEach(markDirty);
    if (dirtyPersistKeys.size === 0) return null;

    const rowsByPersist = new Map();
    allReportRows.forEach((row) => {
      const pk = persistKey(row);
      if (!rowsByPersist.has(pk)) rowsByPersist.set(pk, []);
      rowsByPersist.get(pk).push(row);
    });

    return [...dirtyPersistKeys].map((pk) => {
      const groupRows = rowsByPersist.get(pk) || [];
      const sample = groupRows[0];
      if (!sample) return null;

      const hasSizeRows = groupRows.some((r) => r.sizeLabel);
      if (!hasSizeRows) {
        const rKey = rowKey(sample);
        const item = {
          productId: sample.productId,
          colorId: sample.colorId || null,
        };
        if (editedCounts[rKey]) {
          item.counts = editedCounts[rKey];
        } else if (
          Object.prototype.hasOwnProperty.call(editedSizeCounts, rKey)
          || Object.prototype.hasOwnProperty.call(editedSizeCountsByLocation, rKey)
        ) {
          item.counts = sample.counts || {};
        }
        if (Object.prototype.hasOwnProperty.call(editedSizeCounts, rKey)) {
          item.physicalSizes = editedSizeCounts[rKey];
        }
        if (Object.prototype.hasOwnProperty.call(editedSizeCountsByLocation, rKey)) {
          item.physicalSizesByLocation = editedSizeCountsByLocation[rKey];
        }
        return item;
      }

      const foss = isFossCinchoProductRow(sample);
      const physicalSizes = {};
      const byLocation = {
        [CINCHO_VITRINE_LOCATION]: {},
        [CINCHO_WAREHOUSE_LOCATION]: {},
      };

      groupRows.forEach((row) => {
        if (!row.sizeLabel) return;
        const rKey = rowKey(row);
        const counts = { ...(row.counts || {}), ...(editedCounts[rKey] || {}) };
        if (foss) {
          byLocation[CINCHO_VITRINE_LOCATION][row.sizeLabel] = Number(counts[CINCHO_VITRINE_LOCATION] || 0);
          byLocation[CINCHO_WAREHOUSE_LOCATION][row.sizeLabel] = Number(counts[CINCHO_WAREHOUSE_LOCATION] || 0);
          physicalSizes[row.sizeLabel] =
            byLocation[CINCHO_VITRINE_LOCATION][row.sizeLabel]
            + byLocation[CINCHO_WAREHOUSE_LOCATION][row.sizeLabel];
        } else {
          physicalSizes[row.sizeLabel] = Number(counts[CINCHO_VITRINE_LOCATION] || 0);
        }
      });

      const legacyKey = `${sample.productId}-${sample.colorId || ""}`;
      if (Object.prototype.hasOwnProperty.call(editedSizeCounts, legacyKey)) {
        Object.assign(physicalSizes, editedSizeCounts[legacyKey]);
      }
      if (Object.prototype.hasOwnProperty.call(editedSizeCountsByLocation, legacyKey)) {
        Object.assign(byLocation[CINCHO_VITRINE_LOCATION], editedSizeCountsByLocation[legacyKey]?.[CINCHO_VITRINE_LOCATION] || {});
        Object.assign(byLocation[CINCHO_WAREHOUSE_LOCATION], editedSizeCountsByLocation[legacyKey]?.[CINCHO_WAREHOUSE_LOCATION] || {});
      }

      const parentCounts = { ...(sample.counts || {}) };
      if (foss) {
        parentCounts[CINCHO_VITRINE_LOCATION] = sumSizeCounts(byLocation[CINCHO_VITRINE_LOCATION]);
        parentCounts[CINCHO_WAREHOUSE_LOCATION] = sumSizeCounts(byLocation[CINCHO_WAREHOUSE_LOCATION]);
      } else {
        parentCounts[CINCHO_VITRINE_LOCATION] = sumSizeCounts(physicalSizes);
      }

      const item = {
        productId: sample.productId,
        colorId: sample.colorId || null,
        counts: parentCounts,
        physicalSizes,
      };
      if (foss) {
        item.physicalSizesByLocation = byLocation;
      }
      return item;
    }).filter(Boolean);
  };

  const clearEditedCounts = () => {
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
  };

  const handleSave = async () => {
    if (!report) return;
    const items = buildDirtyItemsPayload();
    if (!items?.length) {
      showError("No hay cambios de conteo para guardar.");
      return;
    }
    try {
      setSaving(true);
      const data = await saveKioscoConteoItems(report.id, items);
      setReport(data);
      clearEditedCounts();
      await loadHistorial(locationId);
      showSuccess("Conteo guardado correctamente.");
    } catch (err) {
      showError(err.message || "No se pudo guardar el conteo.");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!report) return;
    if (!window.confirm(
      "¿Terminar el conteo físico? Las cantidades en vitrinas quedarán bloqueadas y ya no podrán modificarse hasta la revisión."
    )) {
      return;
    }
    try {
      setFinalizing(true);
      let countId = report.id;
      const items = buildDirtyItemsPayload();
      if (items?.length) {
        const saved = await saveKioscoConteoItems(countId, items);
        setReport(saved);
        countId = saved.id;
        clearEditedCounts();
      }
      const data = await terminarKioscoConteo(countId);
      setReport(data);
      await loadHistorial(locationId);
      showSuccess("Conteo terminado. Las vitrinas están bloqueadas para edición.");
    } catch (err) {
      showError(err.message || "No se pudo terminar el conteo.");
    } finally {
      setFinalizing(false);
    }
  };

  const handleReview = async () => {
    try {
      setSaving(true);
      const data = await revisarKioscoConteo(report.id, reviewNotes);
      setReport(data);
      setShowReviewBox(false);
      await loadHistorial(locationId);
      showSuccess("Conteo marcado como revisado.");
    } catch (err) {
      showError(err.message || "No se pudo marcar el conteo como revisado.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!report) return;
    const pendingDiff = pendingRows.some((r) => Math.abs(rowDiff(r, editedCounts[rowKey(r)] || r.counts || {})) >= DIFF_ALERT_THRESHOLD);
    if (pendingDiff) {
      const confirmed = window.confirm(
        "Este conteo aún tiene diferencias sin resolver. Los ajustes deben registrarse manualmente en " +
        "Inventario y movimientos (con motivo) antes de cerrar. ¿Deseas cerrar de todos modos?"
      );
      if (!confirmed) return;
    } else if (!window.confirm("¿Cerrar este conteo? Ya no podrá editarse.")) {
      return;
    }
    try {
      setClosing(true);
      const data = await cerrarKioscoConteo(report.id);
      setReport(data);
      clearEditedCounts();
      await loadHistorial(locationId);
      showSuccess("Conteo cerrado correctamente.");
    } catch (err) {
      showError(err.message || "No se pudo cerrar el conteo.");
    } finally {
      setClosing(false);
    }
  };

  const loadRecipients = useCallback(async () => {
    try {
      setLoadingRecipients(true);
      const data = await getKioscoNotificationRecipients();
      setRecipients(data || []);
    } catch (err) {
      showError(err.message || "No se pudieron cargar los destinatarios.");
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  const handleOpenRecipients = () => {
    setShowRecipientsModal(true);
    void loadRecipients();
  };

  const handleAddRecipient = async () => {
    if (!newRecipient.name.trim() || !newRecipient.email.trim()) {
      showError("Nombre y correo son obligatorios.");
      return;
    }
    try {
      setSavingRecipient(true);
      await addKioscoNotificationRecipient(newRecipient);
      setNewRecipient({ name: "", email: "" });
      await loadRecipients();
      showSuccess("Destinatario agregado.");
    } catch (err) {
      showError(err.message || "No se pudo agregar el destinatario.");
    } finally {
      setSavingRecipient(false);
    }
  };

  const handleRemoveRecipient = async (id) => {
    if (!window.confirm("¿Eliminar este destinatario de las alertas?")) return;
    try {
      await removeKioscoNotificationRecipient(id);
      await loadRecipients();
    } catch (err) {
      showError(err.message || "No se pudo eliminar el destinatario.");
    }
  };

  const totalCols = PRODUCT_INFO_COLS + (showKardex ? kardexColumns.length : 0) + COUNT_LOCATION_KEYS.length + 2;
  const isClosed = report?.status === "CERRADO";
  const isDraft = report?.status === "DRAFT";
  const isCountLocked = !isDraft || isSubcountView;
  const statusMeta = conteoStatusMeta(report?.status);
  const exportReport = useMemo(() => {
    if (!displayReport) return null;
    if (!filteredCategories.length) return displayReport;
    const categories = filteredCategories;
    const allRows = categories.flatMap((category) => category.rows);
    return {
      ...displayReport,
      categories,
      totalGeneral: allRows.length ? sumFilteredRows(allRows) : displayReport.totalGeneral,
    };
  }, [displayReport, filteredCategories]);

  const excelExportPayload = useMemo(() => {
    const data = exportReport || displayReport;
    if (!data || !report) return data;
    return {
      ...report,
      ...data,
      reportType: report.reportType || (report.asOfDate ? "SUBCONTEO" : data.reportType),
      asOfDate: report.asOfDate ?? data.asOfDate,
    };
  }, [report, exportReport, displayReport]);

  const handleExportExcel = () => {
    if (!excelExportPayload) {
      showError("No hay datos para exportar.");
      return;
    }
    exportConteoToExcel(excelExportPayload, { showKardex: true });
  };

  const handleExportPdf = () => {
    if (!excelExportPayload) {
      showError("No hay datos para exportar.");
      return;
    }
    exportConteoToPdf(excelExportPayload, { showKardex: true });
  };

  const pendingRows = filteredCategories.flatMap((c) => c.rows);
  const alertRows = pendingRows.filter(
    (r) => Math.abs(rowDiff(r, editedCounts[rowKey(r)] || r.counts || {})) >= DIFF_ALERT_THRESHOLD
  );
  const showDiffBanner = report?.status === "REVISADO" && alertRows.length > 0;

  return (
    <div>
      {/* ── Controles de apertura ── */}
      <Row className="mb-3">
        <Col md="3">
          <FormGroup>
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormGroup>
        </Col>
        <Col md="3">
          <FormGroup>
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormGroup>
        </Col>
        <Col md="3" className="d-flex align-items-end">
          <Button color="primary" onClick={() => void handleOpen()} disabled={loading}>
            {loading ? <><Spinner size="sm" className="mr-1" /> Abriendo...</> : "Abrir conteo"}
          </Button>
        </Col>
      </Row>

      {/* ── Historial de sesiones ── */}
      {locationId && (
        <div style={{ marginBottom: 20 }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <strong style={{ fontSize: 13 }}>Sesiones de conteo existentes</strong>
            <div className="d-flex align-items-center" style={{ gap: 12 }}>
              <Button
                color="link"
                size="sm"
                style={{ padding: 0, fontSize: 12 }}
                onClick={handleOpenRecipients}
              >
                ✉ Destinatarios de alertas
              </Button>
              <Button
                color="link"
                size="sm"
                style={{ padding: 0, fontSize: 12 }}
                onClick={() => void loadHistorial(locationId)}
                disabled={loadingHistorial}
              >
                {loadingHistorial ? <Spinner size="sm" /> : "↺ Actualizar"}
              </Button>
            </div>
          </div>
          {loadingHistorial ? (
            <div className="text-center py-2"><Spinner size="sm" /> Cargando historial...</div>
          ) : historial.length === 0 ? (
            <Alert color="light" className="border mb-0 kiosk-inv-hint-alert" style={{ fontSize: 12 }}>
              No hay sesiones registradas para este kiosko. Crea la primera con el formulario de arriba.
            </Alert>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <Table size="sm" bordered responsive style={{ fontSize: 12, marginBottom: 0 }}>
                <thead style={{ background: "#f3f4f6" }}>
                  <tr>
                    <th>Período</th>
                    <th>Estado</th>
                    <th>Generado por</th>
                    <th>Fecha creación</th>
                    <th>Revisado por</th>
                    <th>Notas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((s) => {
                    const isActive = report && report.id === s.id;
                    const hasPendingDiff = s.status === "REVISADO" && (s.maxAbsDiff ?? 0) >= DIFF_ALERT_THRESHOLD;
                    return (
                      <tr
                        key={s.id}
                        style={{
                          background: isActive ? "#eff6ff" : undefined,
                          boxShadow: hasPendingDiff ? "inset 3px 0 0 #f97316" : undefined,
                        }}
                      >
                        <td style={{ whiteSpace: "nowrap", fontWeight: isActive ? 700 : 400 }}>
                          {fmt(s.periodFrom)} — {fmt(s.periodTo)}
                        </td>
                        <td>
                          <Badge
                            color={conteoStatusMeta(s.status).color}
                            style={{ fontSize: 10 }}
                          >
                            {conteoStatusMeta(s.status).label}
                          </Badge>
                          {hasPendingDiff && (
                            <Badge color="danger" style={{ fontSize: 10, marginLeft: 4 }} title="Diferencia sin resolver">
                              Dif. {s.maxAbsDiff}
                            </Badge>
                          )}
                        </td>
                        <td>{s.generatedByName || "—"}</td>
                        <td style={{ whiteSpace: "nowrap", color: "#6b7280" }}>
                          {s.generatedAt ? fmtDt(s.generatedAt) : "—"}
                        </td>
                        <td>{s.reviewedByName || "—"}</td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#6b7280" }}>
                          {s.notes || "—"}
                        </td>
                        <td>
                          <Button
                            color={isActive ? "primary" : "secondary"}
                            size="sm"
                            outline={!isActive}
                            onClick={() => !isActive && void handleLoadSession(s.id)}
                            disabled={loading || isActive}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {isActive ? "Abierto" : "Cargar"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      )}

      {!report ? (
        <Alert color="light" className="border kiosk-inv-hint-alert">
          {locationId
            ? <>Selecciona el rango de fechas y presiona <strong>Abrir conteo</strong> para crear uno nuevo, o carga uno existente de arriba.</>
            : <>Selecciona un <strong>kiosko</strong> arriba para ver y gestionar los conteos físicos.</>}
        </Alert>
      ) : (
        <>
          {/* ── Cabecera informativa ── */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 24px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
            alignItems: "center",
          }}>
            <Badge
              color={statusMeta.color}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              {statusMeta.label}
            </Badge>
            <span style={{ fontSize: 12, color: "#374151" }}>
              <strong>{report.periodFrom ? fmt(report.periodFrom) : "—"}</strong>
              {" — "}
              <strong>{report.periodTo ? fmt(report.periodTo) : "—"}</strong>
            </span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Generado por <strong style={{ color: "#111" }}>{report.generatedByName || "—"}</strong>
              {report.generatedAt && <> el {fmtDt(report.generatedAt)}</>}
            </span>
            {(report.status === "REVISADO" || isClosed) && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Revisado por <strong style={{ color: "#111" }}>{report.reviewedByName || "—"}</strong>
                {report.reviewedAt && <> el {fmtDt(report.reviewedAt)}</>}
              </span>
            )}
            {isClosed && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Cerrado por <strong style={{ color: "#111" }}>{report.closedByName || "—"}</strong>
                {report.closedAt && <> el {fmtDt(report.closedAt)}</>}
              </span>
            )}
          </div>

          {showDiffBanner && (
            <Alert color="danger" className="mb-3" style={{ fontSize: 12 }}>
              <strong>⚠ {alertRows.length} producto{alertRows.length !== 1 ? "s" : ""} con diferencia ≥ {DIFF_ALERT_THRESHOLD} unidades.</strong>{" "}
              Registra el ajuste manual (con motivo) en <strong>Inventario y movimientos</strong> antes de cerrar el conteo.
              Si no se resuelve en 2 días desde la revisión, se notificará automáticamente por correo a contabilidad y logística.
            </Alert>
          )}

          {report.notes && !showReviewBox && !isSubcountView && (
            <Alert color="warning" className="mb-3" style={{ fontSize: 12 }}>
              <strong>Áreas para corregir:</strong> {report.notes}
            </Alert>
          )}

          {isSubcountView && (
            <Alert color="info" className="mb-3" style={{ fontSize: 12 }}>
              <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: 8 }}>
                <div>
                  <strong>Subconteo del {fmt(report.asOfDate)}.</strong>{" "}
                  Kardex del {fmt(report.periodFrom)} al {fmt(report.asOfDate)}. El conteo físico es el del conteo principal;
                  la columna de inventario sistema refleja el saldo a esa fecha.
                  la diferencia es físico − sistema (+ sobrante, − faltante).
                  {principalReport && (
                    <Button color="link" className="p-0 ml-2" style={{ fontSize: 12 }} onClick={handleBackToPrincipal}>
                      Volver al conteo principal
                    </Button>
                  )}
                </div>
                <Button color="success" size="sm" onClick={handleExportExcel}>
                  ⬇ Excel inventario al {fmt(report.asOfDate)}
                </Button>
              </div>
            </Alert>
          )}

          {/* ── Filtros ── */}
          <Row className="mb-3">
            <Col md="4">
              <FormGroup className="mb-0">
                <Label style={{ fontSize: 12 }}>Buscar producto</Label>
                <Input
                  type="search"
                  placeholder="Código o nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="8">
              <Label style={{ fontSize: 12 }}>Filtros</Label>
              <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                <Button
                  size="sm"
                  color={audienceFilter === "" ? "primary" : "light"}
                  onClick={() => setAudienceFilter("")}
                >
                  Cat. SX: Todas
                </Button>
                {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    color={audienceFilter === opt.value ? "primary" : "light"}
                    onClick={() => setAudienceFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
                <span style={{ width: 1, background: "#d1d5db", margin: "0 4px" }} />
                {CINCHO_FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value || "all"}
                    size="sm"
                    color={cinchoFilter === opt.value ? "info" : "light"}
                    onClick={() => setCinchoFilter(opt.value)}
                  >
                    {opt.label === "Todos" ? "Cinchos: Todos" : opt.label}
                  </Button>
                ))}
              </div>
            </Col>
          </Row>

          {/* ── Subconteo / inventario a fecha ── */}
          {!isSubcountView && report && (
            <Row className="mb-3">
              <Col md="4">
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 12 }}>
                    Corte inventario sistema (cierre 23:59)
                  </Label>
                  <Input
                    type="date"
                    value={subcountAsOf}
                    min={report.periodFrom || undefined}
                    max={report.periodTo || undefined}
                    onChange={(e) => setSubcountAsOf(e.target.value)}
                  />
                  <small className="text-muted d-block mt-1" style={{ fontSize: 11 }}>
                    Saldo del sistema hasta las 23:59 del día elegido (entradas, ventas y demás movimientos).
                  </small>
                </FormGroup>
              </Col>
              <Col md="8" className="d-flex align-items-end flex-wrap" style={{ gap: 8 }}>
                <Button
                  color="primary"
                  size="sm"
                  outline
                  onClick={() => void handleViewSubconteo()}
                  disabled={loadingSubcount || exportingCutoff || !subcountAsOf}
                  title="Ver en pantalla el inventario sistema al cierre (23:59) del día elegido"
                >
                  {loadingSubcount ? <Spinner size="sm" /> : "Ver subconteo al corte"}
                </Button>
                <ButtonGroup size="sm">
                  <Button
                    color="success"
                    outline
                    onClick={() => void handleExportCutoff("excel")}
                    disabled={loadingSubcount || exportingCutoff || !subcountAsOf}
                    title="Descargar Excel del inventario sistema al cierre (23:59) del día elegido"
                  >
                    {exportingCutoff ? <Spinner size="sm" /> : `⬇ Excel al ${subcountAsOf ? fmt(subcountAsOf) : "corte"}`}
                  </Button>
                  <Button
                    color="success"
                    outline
                    onClick={() => void handleExportCutoff("pdf")}
                    disabled={loadingSubcount || exportingCutoff || !subcountAsOf}
                    title="Descargar PDF del inventario sistema al cierre (23:59) del día elegido"
                  >
                    {exportingCutoff ? <Spinner size="sm" /> : `🖨 PDF al ${subcountAsOf ? fmt(subcountAsOf) : "corte"}`}
                  </Button>
                </ButtonGroup>
              </Col>
            </Row>
          )}

          {/* ── Barra de acciones ── */}
          <Row className="mb-3">
            <Col>
              <div className="d-flex flex-wrap" style={{ gap: 8 }}>
                {isSubcountView && principalReport && (
                  <Button color="secondary" size="sm" outline onClick={handleBackToPrincipal}>
                    ← Conteo principal
                  </Button>
                )}
                {isDraft && !isSubcountView && (
                  <>
                    <Button color="success" size="sm" onClick={() => void handleSave()} disabled={saving || finalizing}>
                      {saving ? <Spinner size="sm" /> : "💾 Guardar conteo"}
                    </Button>
                    <Button
                      color="warning"
                      size="sm"
                      onClick={() => void handleFinalize()}
                      disabled={saving || finalizing}
                    >
                      {finalizing ? <Spinner size="sm" /> : "✓ Terminar conteo físico"}
                    </Button>
                  </>
                )}
                {report.status === "CONTADO" && !isSubcountView && (
                  <Button color="info" size="sm" outline onClick={() => setShowReviewBox((v) => !v)} disabled={saving}>
                    ✔ Marcar como revisado
                  </Button>
                )}
                {report.status === "REVISADO" && !isSubcountView && (
                  <Button color="danger" size="sm" outline onClick={() => void handleClose()} disabled={closing}>
                    {closing ? <Spinner size="sm" /> : "🔒 Cerrar conteo"}
                  </Button>
                )}
                <ButtonGroup size="sm">
                  <Button color="secondary" outline onClick={handleExportExcel}>
                    {isSubcountView ? "⬇ Excel subconteo" : "⬇ Excel"}
                  </Button>
                  <Button color="secondary" outline onClick={handleExportPdf}>
                    🖨 PDF / Imprimir
                  </Button>
                </ButtonGroup>
                <Button
                  color="light"
                  size="sm"
                  style={{ border: "1px solid #d1d5db" }}
                  onClick={() => setShowKardex((v) => !v)}
                  title="Mostrar u ocultar las columnas del Kardex del sistema"
                >
                  {showKardex ? "Ocultar Kardex" : "Mostrar Kardex"}
                </Button>
              </div>
            </Col>
          </Row>

          {report.status === "CONTADO" && (
            <Alert color="info" className="mb-3" style={{ fontSize: 12 }}>
              Conteo físico terminado. Las vitrinas están bloqueadas; un supervisor puede marcarlo como revisado.
            </Alert>
          )}

          {isClosed && (
            <Alert color="secondary" className="mb-3" style={{ fontSize: 12 }}>
              Este conteo está cerrado y es de solo lectura. Puedes exportarlo, pero no editarlo.
            </Alert>
          )}

          {/* ── Panel de revisión ── */}
          {showReviewBox && (
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <FormGroup className="mb-2">
                <Label style={{ fontWeight: 600, fontSize: 13 }}>Notas / áreas para corregir</Label>
                <Input
                  type="textarea"
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
              </FormGroup>
              <Button color="info" size="sm" onClick={() => void handleReview()} disabled={saving}>
                {saving ? <Spinner size="sm" /> : "Confirmar revisión"}
              </Button>
              <Button color="link" size="sm" onClick={() => setShowReviewBox(false)}>Cancelar</Button>
            </div>
          )}

          {/* ── Tabla principal ── */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <CountTableColGroup showKardex={showKardex} kardexColumns={kardexColumns} />
              <thead>
                {/* Fila de grupos */}
                <tr style={{ background: "#f3f4f6" }}>
                  <th colSpan={PRODUCT_INFO_COLS} style={thStyle}>Producto</th>
                  {showKardex && (
                    <th colSpan={kardexColumns.length} style={{ ...thStyle, background: "#e0e7ff", textAlign: "center" }}>
                      {isSubcountView ? "Kardex al corte" : "Kardex sistema"}
                    </th>
                  )}
                  <th colSpan={COUNT_LOCATION_KEYS.length} style={{ ...thStyle, background: "#dcfce7", textAlign: "center" }}>
                    Conteo físico por ubicación
                  </th>
                  <th rowSpan={2} style={{ ...thStyle, ...sumColStyle, background: "#fef9c3", textAlign: "center", verticalAlign: "middle" }}>Total</th>
                  <th rowSpan={2} style={{ ...thStyle, ...sumColStyle, background: "#fee2e2", textAlign: "center", verticalAlign: "middle" }}>Dif.</th>
                </tr>
                {/* Fila de columnas */}
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thStyle}>Producto / Código</th>
                  <th style={thStyle}>Color</th>
                  <th style={thStyle}>Talla</th>
                  {showKardex && kardexColumns.map((col) => (
                    <th key={col.key} style={{ ...thStyle, background: "#eef2ff" }} title={col.title}>{col.label}</th>
                  ))}
                  {COUNT_LOCATION_KEYS.map((k) => (
                    <th key={k} style={{ ...thStyle, ...locColStyle, background: "#f0fdf4" }}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} style={{ textAlign: "center", padding: 16, color: "#6b7280" }}>
                      No hay productos que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((category) => (
                    <CategoryGroup
                      key={category.categoryName || category.categoryId || "sin-categoria"}
                      category={category}
                      showKardex={showKardex}
                      kardexColumns={kardexColumns}
                      editedCounts={editedCounts}
                      editedSizeCounts={editedSizeCounts}
                      editedSizeCountsByLocation={editedSizeCountsByLocation}
                      onCountChange={handleCountChange}
                      onOpenCinchoModal={setCinchoModalProductId}
                      disabled={isCountLocked}
                    />
                  ))
                )}
              </tbody>
              {filteredTotalGeneral && filteredCategories.length > 0 && (
                <tfoot style={{ position: "sticky", bottom: 0, zIndex: 2 }}>
                  <SummaryRow
                    label={`TOTAL GENERAL (${filteredCategories.flatMap((c) => c.rows).length} productos visibles)`}
                    row={filteredTotalGeneral}
                    showKardex={showKardex}
                    kardexColumns={kardexColumns}
                    bg="#1f2937"
                    textColor="#fff"
                    bold
                  />
                </tfoot>
              )}
            </table>
          </div>

          {/* ── Leyenda ── */}
          <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span><span style={{ color: "#16a34a", fontWeight: 700 }}>▲ 0</span> Sin diferencia</span>
            <span><span style={{ color: "#16a34a", fontWeight: 700 }}>▲ +n</span> Sobrante (más físico que sistema)</span>
            <span><span style={{ color: "#dc2626", fontWeight: 700 }}>▼ −n</span> Faltante (menos físico que sistema)</span>
            <span style={{ background: "#fef2f2", padding: "1px 4px" }}>Fondo rojo: |diferencia| ≥ {DIFF_ALERT_THRESHOLD} unidades</span>
            <span>Haz clic en el nombre de categoría para colapsar/expandir</span>
            {!showKardex && <span>Kardex oculto en pantalla — actívalo con &quot;Mostrar Kardex&quot; (Excel/PDF siempre lo incluyen)</span>}
            <span>FOSS cinchos: una fila por talla y color — edite E (vitrina) y BO (bodega). Otros cinchos: edite E por talla.</span>
          </div>
        </>
      )}

      <CinchoCountDetailModal
        isOpen={cinchoModalProductId != null}
        toggle={() => setCinchoModalProductId(null)}
        fossMode={cinchoModalFossMode}
        productRows={cinchoModalRows.map((row) => ({
          ...row,
          physicalSizes: editedSizeCounts[rowKey(row)] ?? row.physicalSizes,
          physicalSizesByLocation: editedSizeCountsByLocation[rowKey(row)] ?? row.physicalSizesByLocation,
        }))}
        rowKey={rowKey}
        editedSizeCounts={editedSizeCounts}
        editedSizeCountsByLocation={editedSizeCountsByLocation}
        editedCounts={editedCounts}
        onApply={handleApplyCinchoModal}
        disabled={isCountLocked}
      />

      {/* ── Modal de destinatarios de alertas ── */}
      <Modal isOpen={showRecipientsModal} toggle={() => setShowRecipientsModal(false)}>
        <ModalHeader toggle={() => setShowRecipientsModal(false)}>Destinatarios de alertas de diferencias</ModalHeader>
        <ModalBody>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            Si un conteo revisado sigue con diferencias ≥ {DIFF_ALERT_THRESHOLD} unidades pasados 2 días,
            se envía un correo automático a estos destinatarios (contabilidad, logística, etc.).
          </p>
          <Row className="mb-2">
            <Col md="5">
              <Input
                placeholder="Nombre"
                value={newRecipient.name}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, name: e.target.value }))}
              />
            </Col>
            <Col md="5">
              <Input
                placeholder="Correo"
                type="email"
                value={newRecipient.email}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, email: e.target.value }))}
              />
            </Col>
            <Col md="2">
              <Button color="primary" block onClick={() => void handleAddRecipient()} disabled={savingRecipient}>
                {savingRecipient ? <Spinner size="sm" /> : "Agregar"}
              </Button>
            </Col>
          </Row>
          {loadingRecipients ? (
            <div className="text-center py-3"><Spinner size="sm" /> Cargando destinatarios...</div>
          ) : recipients.length === 0 ? (
            <Alert color="light" className="border mb-0 kiosk-inv-hint-alert" style={{ fontSize: 12 }}>
              No hay destinatarios configurados todavía.
            </Alert>
          ) : (
            <Table size="sm" bordered style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      <Button color="link" size="sm" style={{ padding: 0, color: "#dc2626" }} onClick={() => void handleRemoveRecipient(r.id)}>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowRecipientsModal(false)}>Cerrar</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

const thStyle = {
  border: "1px solid #e5e7eb",
  padding: "4px 6px",
  fontWeight: 700,
  fontSize: 11,
  whiteSpace: "nowrap",
};

export default KioskInventoryCountReport;
