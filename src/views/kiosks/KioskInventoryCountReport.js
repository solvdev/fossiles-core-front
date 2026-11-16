import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
  saveKioscoConteoObservations,
  pollKioscoConteoLiveSession,
  startKioscoConteo,
  terminarKioscoConteo,
} from "services/kioscoInventoryService";
import {
  getInternalCountReport,
  listInternalCountHistory,
  saveInternalCountItems,
  saveInternalCountSnapshot,
  startInternalCount,
} from "services/kioskPosService";
import {
  formatDateGt,
  formatDateTimeGt,
  getEndOfDayDatetimeLocalGuatemala,
  getNowDatetimeLocalGuatemala,
  shiftYmdGuatemala,
  toApiLocalDateTimeGuatemala,
  toDatetimeLocalGuatemala,
} from "utils/dateTimeHelper";
import { exportConteoToExcel, exportConteoToPdf } from "utils/kioscoConteoExport";
import {
  buildConteoDisplayReport,
  computeConteoRowDiferencia,
  formatConteoDiffArrow,
  formatConteoDiffDisplay,
  formatConteoProductTitle,
  formatConteoSubtotalLabel,
  resolveLivePhysicalTotal,
  resolveLiveRowDiff,
} from "utils/kioscoConteoDisplay";
import {
  applySyncItemsToReport,
  AUTO_SAVE_INTERVAL_MS,
  collectDirtyPersistKeys,
  formatSyncSince,
  LIVE_SESSION_INTERVAL_MS,
} from "utils/kioscoConteoSync";
import {
  CONTEO_COLOR_LEGEND_LEFT,
  CONTEO_COLOR_LEGEND_RIGHT,
  hexCss,
} from "utils/kioscoConteoColorLegend";
import { PRODUCT_AUDIENCE_OPTIONS, productMatchesAudienceFilter } from "utils/productAudienceHelper";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import {
  CINCHO_FILTER_OPTIONS,
  shouldShowInKioskPhysicalCount,
  isCinchoProductRow,
  isFossCinchoProductRow,
  formatCinchoClassification,
  formatFossLocationSizeSummary,
  resolveStockDimensionLabel,
  rowUsesHardwareCountMode,
  productMatchesCinchoFilter,
  productMatchesSearchFilter,
  reportHasHardwareSplitData,
  resolvePhysicalSizesSummary,
  resolveSizesSummary,
  rowKey,
  persistKey,
  sumSizeCounts,
  sumHardwareLocationByCondition,
  sumInventarioFinalByHardware,
  CINCHO_COUNT_LOCATION,
} from "utils/productCinchoHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import CinchoCountDetailModal from "./CinchoCountDetailModal";
import { isEntreCuerosLocation, kioskDimensionDisplayLabel } from "utils/kioskStockDimensionHelper";
import { ENTRECUEROS_VARIANT_FILTERS, matchesEntrecuerosVariantFilter } from "utils/entrecuerosPriceLists";
import HardwareCountModal, {
  buildHardwareLocationCounts,
  syncCountsFromHardware,
} from "./HardwareCountModal";
import "./KioskInventoryCountReport.css";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
/** Entre Cueros: ubicaciones donde se cuenta el cincho por talla (vitrinas y bodega). */
const ENTRECUEROS_CINCHO_COUNT_LOCATIONS = COUNT_LOCATION_KEYS;
const CINCHO_VITRINE_LOCATION = CINCHO_COUNT_LOCATION.VITRINE;
const CINCHO_WAREHOUSE_LOCATION = CINCHO_COUNT_LOCATION.WAREHOUSE;
const PRODUCT_INFO_COLS = 5;
const LOC_COL_WIDTH = 52;
const SUM_COL_WIDTH = 56;
const OBS_COL_MIN_WIDTH = 140;
const TRAILING_DATA_COLS = 3;
const INTERNAL_TRAILING_DATA_COLS = 1;

const locColStyle = {
  width: LOC_COL_WIDTH,
  minWidth: LOC_COL_WIDTH,
  maxWidth: LOC_COL_WIDTH,
  padding: "4px",
  textAlign: "center",
  boxSizing: "border-box",
};

const sumColStyle = {
  width: SUM_COL_WIDTH,
  minWidth: SUM_COL_WIDTH,
  textAlign: "right",
  boxSizing: "border-box",
};

function useCompactLayout(maxWidth = 640) {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = (event) => setCompact(event.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    setCompact(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, [maxWidth]);
  return compact;
}

/** Diferencia absoluta minima (unidades) para considerar una discrepancia relevante. Debe reflejar
 * KioscoInventoryCountService.DIFF_ALERT_THRESHOLD en el backend. */
const DIFF_ALERT_THRESHOLD = 3;

function conteoStatusMeta(status, internalMode = false) {
  if (internalMode && status === "SAVED") return { label: "Guardado", color: "success", tone: "ok" };
  // Paper Dashboard no define badge-secondary (fondo transparente + texto blanco).
  if (status === "CERRADO") return { label: "Cerrado", color: "default", tone: "closed" };
  if (status === "REVISADO") return { label: "Revisado", color: "success", tone: "ok" };
  if (status === "CONTADO") return { label: "Contado", color: "info", tone: "info" };
  return { label: "Borrador", color: "warning", tone: "draft" };
}

function StatusPill({ status, internalMode = false, large = false }) {
  const meta = conteoStatusMeta(status, internalMode);
  return (
    <span className={`kc-status kc-status--${meta.tone}${large ? " is-large" : ""}`}>
      <span className="kc-status-dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const WORKFLOW_STEPS = [
  { key: "DRAFT", label: "Conteo", hint: "Borrador editable" },
  { key: "CONTADO", label: "Contado", hint: "Vitrinas bloqueadas" },
  { key: "REVISADO", label: "Revisado", hint: "Supervisor" },
  { key: "CERRADO", label: "Cerrado", hint: "Solo lectura" },
];

/** Línea de tiempo del ciclo del conteo (solo visual). */
function WorkflowStepper({ status }) {
  const currentIdx = Math.max(0, WORKFLOW_STEPS.findIndex((step) => step.key === status));
  return (
    <ol className="kc-steps" aria-label="Etapas del conteo">
      {WORKFLOW_STEPS.map((step, idx) => {
        const state = idx < currentIdx || (idx === currentIdx && status === "CERRADO")
          ? "is-done"
          : idx === currentIdx ? "is-current" : "";
        return (
          <li key={step.key} className={state} aria-current={idx === currentIdx ? "step" : undefined}>
            <span className="kc-step-dot">{state === "is-done" ? "✓" : idx + 1}</span>
            <span className="kc-step-text">
              <strong>{step.label}</strong>
              <small>{step.hint}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const NOTICE_ICONS = { info: "i", warn: "!", danger: "!", ok: "✓", muted: "i" };

function Notice({ tone = "info", children, className = "" }) {
  return (
    <div className={`kc-notice kc-notice--${tone} ${className}`.trim()} role={tone === "danger" ? "alert" : undefined}>
      <span className="kc-notice-icon" aria-hidden="true">{NOTICE_ICONS[tone] || "i"}</span>
      <div className="kc-notice-body">{children}</div>
    </div>
  );
}

const initials = (name) =>
  String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/** Enter / Shift+Enter: baja o sube a la misma ubicación de la fila siguiente/anterior. */
const focusSiblingCountCell = (current, direction) => {
  const root = current.closest(".kiosk-conteo");
  const loc = current.getAttribute("data-loc");
  if (!root || !loc) return;
  const cells = Array.from(root.querySelectorAll(`input.kiosk-conteo-qty[data-loc="${loc}"]`))
    .filter((el) => !el.disabled && !el.readOnly);
  const next = cells[cells.indexOf(current) + direction];
  if (next) next.focus();
};

const KARDEX_COLUMNS = [
  { key: "inventarioInicial", label: "Ini.", title: "Inventario Inicial" },
  { key: "comprasAjustes", label: "Comp.", title: "Compras / Ajustes / Ingreso de cambio" },
  { key: "anulacionCompras", label: "A.C.", title: "Anulación Compras" },
  { key: "entradas", label: "Ent.", title: "Entradas (distribución)" },
  { key: "ventas", label: "Vtas.", title: "Ventas / Cambio con diferencia a cobrar" },
  { key: "anulacionVenta", label: "A.V.", title: "Anulación Venta" },
  { key: "salida", label: "Sal.", title: "Salida / Cambio sin diferencia o saldo a favor del cliente" },
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

const withLiveRowTotals = (row, editedCounts, editedSizeCounts, editedSizeCountsByLocation) => {
  const rKey = rowKey(row);
  const counts = editedCounts[rKey] || row.counts || {};
  const physicalSizes = editedSizeCounts[rKey] ?? row.physicalSizes;
  const physicalSizesByLocation = editedSizeCountsByLocation[rKey] ?? row.physicalSizesByLocation;
  const total = resolveLivePhysicalTotal(row, counts, physicalSizes, physicalSizesByLocation);
  return {
    ...row,
    counts,
    total,
    diferencia: computeConteoRowDiferencia(total, row),
  };
};

const resolveRowDiffForEdit = (row, editedCounts, editedSizeCounts, editedSizeCountsByLocation) => {
  const rKey = rowKey(row);
  return resolveLiveRowDiff(
    row,
    editedCounts[rKey] || row.counts || {},
    editedSizeCounts[rKey] ?? row.physicalSizes,
    editedSizeCountsByLocation[rKey] ?? row.physicalSizesByLocation
  );
};

const resolveRowObservation = (row, editedObservations) => {
  const rKey = rowKey(row);
  if (Object.prototype.hasOwnProperty.call(editedObservations, rKey)) {
    return editedObservations[rKey];
  }
  return row.observation || "";
};

const diffColor = (diferencia) => {
  const n = Number(diferencia || 0);
  if (n === 0) return "#111827";
  return n > 0 ? "#16a34a" : "#dc2626";
};

/** Fondo de alerta: verde si sobrante, rojo si faltante. */
const diffAlertBackground = (diferencia) => {
  const n = Number(diferencia || 0);
  if (Math.abs(n) < DIFF_ALERT_THRESHOLD) return undefined;
  return n > 0 ? "#f0fdf4" : "#fef2f2";
};

const sumFilteredRows = (rows) => {
  const totalCounts = {};
  COUNT_LOCATION_KEYS.forEach((k) => {
    totalCounts[k] = rows.reduce((s, r) => s + Number((r.counts || {})[k] || 0), 0);
  });
  const sumField = (key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  const inventarioFinal = sumField("inventarioFinal");
  return {
    inventarioInicial: sumField("inventarioInicial"),
    comprasAjustes: sumField("comprasAjustes"),
    anulacionCompras: sumField("anulacionCompras"),
    entradas: sumField("entradas"),
    ventas: sumField("ventas"),
    anulacionVenta: sumField("anulacionVenta"),
    salida: sumField("salida"),
    salidaDevolucion: sumField("salidaDevolucion"),
    inventarioFinal,
    counts: totalCounts,
    total,
    diferencia: computeConteoRowDiferencia(total, { inventarioFinal }),
  };
};

const fmt = (v) => formatDateGt(v, { month: "short" });
const fmtDt = (v) => (v ? formatDateTimeGt(v) : null);
const fmtPeriodRange = (fromAt, toAt, fromDate, toDate) => {
  const a = fromAt || fromDate;
  const b = toAt || toDate;
  if (!a && !b) return "—";
  if (fromAt || toAt) {
    return `${fmtDt(a) || "—"} — ${fmtDt(b) || "—"}`;
  }
  return `${fmt(a)} — ${fmt(b)}`;
};

// ─── Columnas fijas para alinear cabecera y datos ─────────────────────────────
function CountTableColGroup({ showKardex, kardexColumns, vitrineOnlyView = false }) {
  return (
    <colgroup>
      <col className="kiosk-conteo-product" />
      <col className="kiosk-conteo-color" />
      <col className="kiosk-conteo-size" />
      <col className="kiosk-conteo-tipo" />
      <col className="kiosk-conteo-hw" />
      {showKardex && kardexColumns.map((col) => (
        <col key={col.key} className="kiosk-conteo-kardex" />
      ))}
      {COUNT_LOCATION_KEYS.map((k) => (
        <col key={k} className="kiosk-conteo-loc" />
      ))}
      <col className="kiosk-conteo-sum" />
      {!vitrineOnlyView && (
        <>
          <col className="kiosk-conteo-sum" />
          <col className="kiosk-conteo-obs" />
        </>
      )}
    </colgroup>
  );
}

function ProductIdentity({ row }) {
  const code = String(row?.productCode || "").trim();
  const name = formatConteoProductTitle(row) || "—";
  return (
    <div className="kiosk-conteo-identity">
      {code ? <span className="kiosk-conteo-product-code">{code}</span> : null}
      <span className="kiosk-conteo-product-name">{name}</span>
    </div>
  );
}

function qtyClassName(value, disabled) {
  return [
    "kiosk-conteo-qty",
    disabled ? "is-disabled" : "",
    Number(value || 0) > 0 ? "has-value" : "",
  ].filter(Boolean).join(" ");
}

// ─── Celda de conteo editable ─────────────────────────────────────────────────
function CountCell({ value, onChange, disabled, onOpen, readOnly, locKey }) {
  const className = qtyClassName(value, disabled);

  if (readOnly && onOpen) {
    return (
      <button
        type="button"
        className={`${className} is-modal`}
        onClick={onOpen}
        disabled={disabled}
        data-loc={locKey}
        title={`Contar ${locKey || ""} por herraje NUEVO / VIEJO`.trim()}
      >
        {value ?? 0}
      </button>
    );
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      step="1"
      className={className}
      value={value ?? 0}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      onFocus={(e) => {
        e.target.select();
        if (onOpen) onOpen();
      }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        focusSiblingCountCell(e.currentTarget, e.shiftKey ? -1 : 1);
      }}
      // Evita que la rueda del mouse cambie la cantidad por accidente al desplazarse.
      onWheel={(e) => e.currentTarget.blur()}
      data-loc={locKey}
      aria-label={locKey ? `Cantidad en ${locKey}` : undefined}
      readOnly={readOnly}
      disabled={disabled}
    />
  );
}

function HardwareQtyChips({ nuevo, viejo }) {
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 3, verticalAlign: "middle" }}>
      <span
        title="Herraje nuevo"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#4338ca",
          background: "#eef2ff",
          padding: "1px 5px",
          borderRadius: 4,
          lineHeight: 1.2,
        }}
      >
        N {Number(nuevo || 0)}
      </span>
      <span
        title="Herraje viejo"
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#b45309",
          background: "#fffbeb",
          padding: "1px 5px",
          borderRadius: 4,
          lineHeight: 1.2,
        }}
      >
        V {Number(viejo || 0)}
      </span>
    </span>
  );
}

/** Desglose N/V: sistema (kardex) vs físico (conteo por vitrina). */
function HardwareSplitSummaryCell({ row, hardwareLocationCounts, useHardwareSplit, vitrineOnlyView, entreCueros = false }) {
  if (!useHardwareSplit || entreCueros) {
    return <span>{kioskDimensionDisplayLabel(row.hardwareCondition, { entreCueros })}</span>;
  }

  const system = sumInventarioFinalByHardware(row.inventarioFinalByHardware);
  const physical = sumHardwareLocationByCondition(hardwareLocationCounts);
  const hasSystem = system.NUEVO > 0 || system.VIEJO > 0 || row.inventarioFinalByHardware;
  const hasPhysical = physical.NUEVO > 0 || physical.VIEJO > 0;

  return (
    <div style={{ fontSize: 10, lineHeight: 1.45, minWidth: 96 }}>
      {!vitrineOnlyView && (
        <div style={{ whiteSpace: "nowrap" }}>
          <span style={{ color: "#6b7280", fontWeight: 600 }}>Sist.</span>
          {hasSystem || row.inventarioFinal != null ? (
            <HardwareQtyChips nuevo={system.NUEVO} viejo={system.VIEJO} />
          ) : (
            <span style={{ color: "#9ca3af", marginLeft: 4 }}>—</span>
          )}
        </div>
      )}
      <div style={{ whiteSpace: "nowrap" }}>
        <span style={{ color: "#6b7280", fontWeight: 600 }}>Fís.</span>
        {hasPhysical ? (
          <HardwareQtyChips nuevo={physical.NUEVO} viejo={physical.VIEJO} />
        ) : (
          <span style={{ color: "#9ca3af", marginLeft: 4 }}>—</span>
        )}
      </div>
    </div>
  );
}

// ─── Celda de observación (solo filas con diferencia) ─────────────────────────
function ObservationCell({ value, onChange, disabled, show }) {
  if (!show) {
    return <span className="kc-obs-empty">—</span>;
  }
  if (disabled) {
    return (
      <span className={`kc-obs-readonly${value ? "" : " is-empty"}`}>
        {value || "—"}
      </span>
    );
  }
  return (
    <input
      type="text"
      className={`kc-obs-input${value ? " has-value" : ""}`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Motivo / nota"
      style={{ minWidth: OBS_COL_MIN_WIDTH - 8 }}
    />
  );
}

function buildCountRowModel({
  row,
  counts,
  physicalSizes,
  physicalSizesByLocation,
  editedHardwareLocationCounts,
  hardwareSplitEnabled,
  entreCueros,
}) {
  const total = resolveLivePhysicalTotal(row, counts, physicalSizes, physicalSizesByLocation);
  const diferencia = computeConteoRowDiferencia(total, row);
  const isCincho = isCinchoProductRow(row);
  const isFoss = isFossCinchoProductRow(row);
  const isExpandedSizeRow = !!row.sizeLabel;
  const rKey = rowKey(row);
  const useHardwareModal = hardwareSplitEnabled
    && !isExpandedSizeRow
    && !isFoss
    && rowUsesHardwareCountMode({
      hardwareLocationCounts: editedHardwareLocationCounts?.[rKey] ?? row.hardwareLocationCounts,
      counts,
      physicalSizes,
      physicalSizesByLocation,
    });
  const physicalSummary = !isExpandedSizeRow && isFoss && physicalSizesByLocation
    ? formatFossLocationSizeSummary(physicalSizesByLocation)
    : !isExpandedSizeRow ? resolvePhysicalSizesSummary({ ...row, physicalSizes }) : "";
  const sizeCell = isExpandedSizeRow
    ? row.sizeLabel
    : (resolveSizesSummary(row) || "—");
  const countLocationDisabled = (locKey) => {
    if (!isExpandedSizeRow || !isCincho) return false;
    // Entre Cueros: el cincho por talla se cuenta en todas las ubicaciones (V1–V7, E, BO).
    if (entreCueros) {
      return false;
    }
    if (isFoss) {
      return locKey !== CINCHO_VITRINE_LOCATION && locKey !== CINCHO_WAREHOUSE_LOCATION;
    }
    return locKey !== CINCHO_VITRINE_LOCATION;
  };
  return {
    total,
    diferencia,
    isCincho,
    isFoss,
    isExpandedSizeRow,
    rKey,
    useHardwareModal,
    physicalSummary,
    sizeCell,
    countLocationDisabled,
    diffArrow: formatConteoDiffArrow(diferencia),
    diffLabel: formatConteoDiffDisplay(diferencia),
  };
}

// ─── Fila de datos ────────────────────────────────────────────────────────────
function DataRow({
  row,
  showKardex,
  kardexColumns,
  counts,
  physicalSizes,
  physicalSizesByLocation,
  observation,
  onCountChange,
  onObservationChange,
  onOpenCinchoModal,
  onOpenHardwareModal,
  disabled,
  editedHardwareLocationCounts,
  vitrineOnlyView = false,
  hardwareSplitEnabled = false,
  entreCueros = false,
}) {
  const {
    total, diferencia, isCincho, isFoss, isExpandedSizeRow, rKey,
    useHardwareModal, physicalSummary, sizeCell, countLocationDisabled,
    diffArrow, diffLabel,
  } = buildCountRowModel({
    row,
    counts,
    physicalSizes,
    physicalSizesByLocation,
    editedHardwareLocationCounts,
    hardwareSplitEnabled,
    entreCueros,
  });
  const rowTone = vitrineOnlyView || diferencia === 0
    ? ""
    : Math.abs(diferencia) >= DIFF_ALERT_THRESHOLD
      ? (diferencia > 0 ? " is-over" : " is-short")
      : " is-minor";
  return (
    <tr className={`kc-row${rowTone}`}>
      <td className="kiosk-conteo-product">
        <ProductIdentity row={row} />
      </td>
      <td className="kiosk-conteo-color" style={{ fontSize: 12, color: "#6b7280" }}>{row.colorName || "—"}</td>
      <td className="kiosk-conteo-size" style={{ fontSize: 11, color: "#374151" }}>
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
      <td className="kiosk-conteo-tipo" style={{ fontSize: 11, color: "#374151", whiteSpace: "nowrap" }}>
        {formatCinchoClassification(row)}
      </td>
      <td className="kiosk-conteo-hw" style={{ fontSize: 11, color: "#374151", verticalAlign: "middle" }}>
        {entreCueros ? (
          <span>{kioskDimensionDisplayLabel(row.hardwareCondition, { entreCueros: true })}</span>
        ) : resolveStockDimensionLabel(row.hardwareCondition) ? (
          <span>{resolveStockDimensionLabel(row.hardwareCondition)}</span>
        ) : hardwareSplitEnabled ? (
          <HardwareSplitSummaryCell
            row={row}
            hardwareLocationCounts={editedHardwareLocationCounts?.[rKey] ?? row.hardwareLocationCounts}
            useHardwareSplit={useHardwareModal}
            vitrineOnlyView={vitrineOnlyView}
            entreCueros={entreCueros}
          />
        ) : (
          <span style={{ color: "#9ca3af" }}>—</span>
        )}
      </td>
      {showKardex && kardexColumns.map((col) => (
        <td key={col.key} className="text-right kiosk-conteo-kardex" style={{ fontSize: 11, color: col.key === "inventarioFinal" ? "#111" : "#6b7280" }}>
          {row[col.key]}
        </td>
      ))}
      {COUNT_LOCATION_KEYS.map((locKey) => (
        <td key={locKey} className="kiosk-conteo-loc" style={locColStyle}>
          <CountCell
            locKey={locKey}
            value={counts[locKey]}
            onChange={(v) => onCountChange(locKey, v)}
            disabled={disabled || countLocationDisabled(locKey)}
            readOnly={useHardwareModal && !countLocationDisabled(locKey)}
            onOpen={
              useHardwareModal && !disabled && !countLocationDisabled(locKey)
                ? () => onOpenHardwareModal(locKey)
                : undefined
            }
          />
        </td>
      ))}
      <td className="kiosk-conteo-sum" style={{ ...sumColStyle, fontWeight: 600, fontSize: 12 }}>{total}</td>
      {!vitrineOnlyView && (
        <>
          <td className="kiosk-conteo-sum" style={{
            ...sumColStyle,
            fontWeight: 700,
            fontSize: 12,
            color: diffColor(diferencia),
            background: diffAlertBackground(diferencia),
          }}>
            {diffArrow && <span style={{ marginRight: 2 }}>{diffArrow}</span>}
            {diffLabel}
          </td>
          <td style={{ fontSize: 11, padding: "2px 4px", verticalAlign: "middle" }}>
            <ObservationCell
              value={observation}
              onChange={onObservationChange}
              disabled={disabled}
              show={diferencia !== 0}
            />
          </td>
        </>
      )}
    </tr>
  );
}

function CountProductCard({
  row,
  showKardex,
  kardexColumns,
  counts,
  physicalSizes,
  physicalSizesByLocation,
  observation,
  onCountChange,
  onObservationChange,
  onOpenCinchoModal,
  onOpenHardwareModal,
  disabled,
  editedHardwareLocationCounts,
  vitrineOnlyView = false,
  hardwareSplitEnabled = false,
  entreCueros = false,
}) {
  const {
    total, diferencia, isCincho, isFoss, rKey,
    useHardwareModal, physicalSummary, sizeCell, countLocationDisabled,
    diffArrow, diffLabel,
  } = buildCountRowModel({
    row,
    counts,
    physicalSizes,
    physicalSizesByLocation,
    editedHardwareLocationCounts,
    hardwareSplitEnabled,
    entreCueros,
  });
  const herrajeLabel = entreCueros
    ? kioskDimensionDisplayLabel(row.hardwareCondition, { entreCueros: true })
    : (resolveStockDimensionLabel(row.hardwareCondition) || null);

  return (
    <article className={`kiosk-conteo-card${diferencia !== 0 && !vitrineOnlyView ? " is-alert" : ""}`}>
      <div className="kiosk-conteo-card-title">
        <ProductIdentity row={row} />
      </div>
      <div className="kiosk-conteo-card-meta">
        <span><strong>Color</strong> {row.colorName || "—"}</span>
        <span><strong>Talla</strong> {sizeCell}</span>
        <span><strong>Tipo</strong> {formatCinchoClassification(row) || "—"}</span>
        {herrajeLabel ? <span><strong>{entreCueros ? "Variante" : "Herraje"}</strong> {herrajeLabel}</span> : null}
        {physicalSummary ? <span><strong>Físico</strong> {physicalSummary}</span> : null}
      </div>
      {!entreCueros && hardwareSplitEnabled && (
        <div className="mb-2">
          <HardwareSplitSummaryCell
            row={row}
            hardwareLocationCounts={editedHardwareLocationCounts?.[rKey] ?? row.hardwareLocationCounts}
            useHardwareSplit={useHardwareModal}
            vitrineOnlyView={vitrineOnlyView}
            entreCueros={entreCueros}
          />
        </div>
      )}
      {isCincho && !row.sizeLabel && (
        <Button
          color="link"
          size="sm"
          className="p-0 mb-2"
          style={{ fontSize: 12, fontWeight: 600 }}
          onClick={() => onOpenCinchoModal(row.productId)}
          disabled={disabled}
        >
          {isFoss ? "Contar E/BO por talla" : "Contar por talla"}
        </Button>
      )}
      {showKardex && (
        <div className="kiosk-conteo-kardex-grid">
          {kardexColumns.map((col) => (
            <div key={col.key} className="kiosk-conteo-metric" title={col.title}>
              <span>{col.label}</span>
              <strong>{row[col.key] ?? 0}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="kiosk-conteo-vitrine-grid">
        {COUNT_LOCATION_KEYS.map((locKey) => (
          <label key={locKey} className="kiosk-conteo-vitrine">
            <span>{locKey}</span>
            <CountCell
              locKey={locKey}
              value={counts[locKey]}
              onChange={(v) => onCountChange(locKey, v)}
              disabled={disabled || countLocationDisabled(locKey)}
              readOnly={useHardwareModal && !countLocationDisabled(locKey)}
              onOpen={
                useHardwareModal && !disabled && !countLocationDisabled(locKey)
                  ? () => onOpenHardwareModal(locKey)
                  : undefined
              }
            />
          </label>
        ))}
      </div>
      <div className="kiosk-conteo-card-foot">
        <div className="kiosk-conteo-card-total">
          <label>Total físico</label>
          <strong>{total}</strong>
        </div>
        {!vitrineOnlyView && (
          <div className="kiosk-conteo-card-diff" style={{ color: diffColor(diferencia), background: diffAlertBackground(diferencia) || "#f8fafc" }}>
            <label>Diferencia</label>
            <strong>{diffArrow ? `${diffArrow} ` : ""}{diffLabel}</strong>
          </div>
        )}
        {!vitrineOnlyView && (
          <div className="kiosk-conteo-card-obs">
            <ObservationCell
              value={observation}
              onChange={onObservationChange}
              disabled={disabled}
              show={diferencia !== 0}
            />
          </div>
        )}
      </div>
    </article>
  );
}

function CompactSummary({ label, row, vitrineOnlyView = false, dark = false }) {
  const diffArrow = formatConteoDiffArrow(row.diferencia);
  const diffLabel = formatConteoDiffDisplay(row.diferencia ?? 0);
  return (
    <div className={dark ? "kiosk-conteo-grand-total" : "kiosk-conteo-subtotal"}>
      <span>{label}</span>
      <span>Total {row.total ?? 0}</span>
      {!vitrineOnlyView && (
        <span style={{ color: dark ? "#fff" : diffColor(row.diferencia ?? 0) }}>
          Dif. {diffArrow ? `${diffArrow} ` : ""}{diffLabel}
        </span>
      )}
    </div>
  );
}

// ─── Fila de subtotal / total ─────────────────────────────────────────────────
function SummaryRow({ label, row, showKardex, kardexColumns, bg = "#f8fafc", textColor = "#0f172a", bold = false, vitrineOnlyView = false }) {
  const style = { background: bg, fontSize: 11, fontWeight: bold ? 700 : 600, color: textColor };
  const diffArrow = formatConteoDiffArrow(row.diferencia);
  const diffLabel = formatConteoDiffDisplay(row.diferencia ?? 0);
  return (
    <tr style={style} className={bold ? "kc-grand-row" : "kc-subtotal-row"}>
      <td colSpan={PRODUCT_INFO_COLS} style={style}>{label}</td>
      {showKardex && kardexColumns.map((col) => (
        <td key={col.key} className="text-right" style={style}>{row[col.key]}</td>
      ))}
      {COUNT_LOCATION_KEYS.map((k) => (
        <td key={k} style={{ ...style, ...locColStyle, textAlign: "right" }}>{(row.counts || {})[k] ?? 0}</td>
      ))}
      <td style={{ ...style, ...sumColStyle }}>{row.total}</td>
      {!vitrineOnlyView && (
        <>
          <td style={{
            ...style,
            ...sumColStyle,
            color: bold && Number(row.diferencia ?? 0) === 0 ? textColor : diffColor(row.diferencia ?? 0),
          }}>
            {diffArrow && <span style={{ marginRight: 2 }}>{diffArrow}</span>}
            {diffLabel}
          </td>
          <td style={{ ...style, fontSize: 11 }} />
        </>
      )}
    </tr>
  );
}

function DifferenceSummary({ totals, breakdown, productCount = 0, vitrineOnlyView = false }) {
  if (!totals) return null;
  const net = breakdown.sobrante - breakdown.faltante;
  const conDiferencia = breakdown.conSobrante + breakdown.conFaltante;
  const plural = (n, word) => `${n} ${word}${n !== 1 ? "s" : ""}`;
  const cards = [
    {
      key: "productos",
      label: "Productos visibles",
      value: productCount,
      detail: vitrineOnlyView
        ? "Según filtros aplicados"
        : conDiferencia > 0 ? `${plural(conDiferencia, "producto")} con diferencia` : "Sin diferencias",
      tone: "neutral",
    },
    {
      key: "fisico",
      label: "Total físico",
      value: totals.total ?? 0,
      detail: vitrineOnlyView ? "Suma de vitrinas, E y BO" : `Sistema: ${totals.inventarioFinal ?? 0}`,
      tone: "brand",
    },
  ];
  if (!vitrineOnlyView) {
    cards.push(
      {
        key: "sobrante",
        label: "Total sobrante",
        value: formatConteoDiffDisplay(breakdown.sobrante),
        detail: `${plural(breakdown.conSobrante, "producto")} con físico > sistema`,
        tone: "ok",
      },
      {
        key: "faltante",
        label: "Total faltante",
        value: `−${breakdown.faltante}`,
        detail: `${plural(breakdown.conFaltante, "producto")} con físico < sistema`,
        tone: "bad",
      },
      {
        key: "neto",
        label: "Neto (Dif. general)",
        value: formatConteoDiffDisplay(net),
        detail: `Sobrante − faltante = ${formatConteoDiffDisplay(net)}`,
        tone: net === 0 ? "neutral" : net > 0 ? "ok" : "bad",
        valueColor: diffColor(totals.diferencia ?? 0),
      }
    );
  }

  return (
    <div className="kc-kpis">
      {cards.map((card) => (
        <div key={card.key} className={`kc-kpi kc-kpi--${card.tone}`}>
          <div className="kc-kpi-label">{card.label}</div>
          <div className="kc-kpi-value" style={card.valueColor ? { color: card.valueColor } : undefined}>
            {card.value}
          </div>
          <div className="kc-kpi-detail">{card.detail}</div>
        </div>
      ))}
    </div>
  );
}

function ColorLegendChip({ item }) {
  return (
    <div className="kc-legend-chip">
      <span className="kc-legend-swatch" title={item.label} style={{ background: hexCss(item.color) }} />
      <span>{item.label}</span>
    </div>
  );
}

function ConteoColorLegend() {
  return (
    <div className="kc-legend-grid">
      {[...CONTEO_COLOR_LEGEND_LEFT, ...CONTEO_COLOR_LEGEND_RIGHT].map((item) => (
        <ColorLegendChip key={item.label} item={item} />
      ))}
    </div>
  );
}

// ─── Grupo de categoría colapsable ────────────────────────────────────────────
function CategoryGroup({
  category,
  showKardex,
  kardexColumns,
  editedCounts,
  editedSizeCounts,
  editedSizeCountsByLocation,
  editedHardwareLocationCounts,
  editedObservations,
  onCountChange,
  onObservationChange,
  onOpenCinchoModal,
  onOpenHardwareModal,
  disabled,
  vitrineOnlyView = false,
  hardwareSplitEnabled = false,
  entreCueros = false,
  compact = false,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const trailingCols = vitrineOnlyView ? INTERNAL_TRAILING_DATA_COLS : TRAILING_DATA_COLS;
  const hasDiff = category.rows.some((row) => {
    const rKey = rowKey(row);
    return resolveLiveRowDiff(
      row,
      editedCounts[rKey] || row.counts || {},
      editedSizeCounts[rKey] ?? row.physicalSizes,
      editedSizeCountsByLocation[rKey] ?? row.physicalSizesByLocation
    ) !== 0;
  });
  const rowNodes = category.rows.map((row) => {
    const rKey = rowKey(row);
    const rowProps = {
      row,
      showKardex,
      kardexColumns,
      counts: editedCounts[rKey] || row.counts || {},
      physicalSizes: editedSizeCounts[rKey] ?? row.physicalSizes,
      physicalSizesByLocation: editedSizeCountsByLocation[rKey] ?? row.physicalSizesByLocation,
      observation: resolveRowObservation(row, editedObservations),
      onCountChange: (locKey, v) => onCountChange(rKey, locKey, v),
      onObservationChange: (v) => onObservationChange(rKey, v),
      onOpenCinchoModal,
      onOpenHardwareModal: (locKey) => onOpenHardwareModal(rKey, locKey, row),
      disabled,
      editedHardwareLocationCounts,
      vitrineOnlyView,
      hardwareSplitEnabled,
      entreCueros,
    };
    return compact
      ? <CountProductCard key={rKey} {...rowProps} />
      : <DataRow key={rKey} {...rowProps} />;
  });

  if (compact) {
    return (
      <section className="kiosk-conteo-cat">
        <button
          type="button"
          className="kiosk-conteo-cat-toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          <span className={`kc-chevron${collapsed ? " is-collapsed" : ""}`} aria-hidden="true">▾</span>
          <strong className="kc-cat-name">{category.categoryName}</strong>
          <span className="kc-count-pill">
            {category.rows.length} producto{category.rows.length !== 1 ? "s" : ""}
          </span>
          {hasDiff && !vitrineOnlyView && (
            <span className="kc-diff-pill">Diferencias</span>
          )}
        </button>
        {!collapsed && (
          <>
            <div className="kiosk-conteo-cards">{rowNodes}</div>
            <CompactSummary
              label={formatConteoSubtotalLabel(category.categoryName)}
              row={category.subtotal}
              vitrineOnlyView={vitrineOnlyView}
            />
          </>
        )}
      </section>
    );
  }

  return (
    <>
      <tr
        className="kc-cat-row"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <td
          colSpan={PRODUCT_INFO_COLS + (showKardex ? kardexColumns.length : 0) + COUNT_LOCATION_KEYS.length + trailingCols}
        >
          <span className="kc-cat-row-inner">
            <span className={`kc-chevron${collapsed ? " is-collapsed" : ""}`} aria-hidden="true">▾</span>
            <strong className="kc-cat-name">{category.categoryName}</strong>
            <span className="kc-count-pill">
              {category.rows.length} producto{category.rows.length !== 1 ? "s" : ""}
            </span>
            {hasDiff && !vitrineOnlyView && (
              <span className="kc-diff-pill">Diferencias</span>
            )}
          </span>
        </td>
      </tr>
      {!collapsed && (
        <>
          {rowNodes}
          <SummaryRow
            label={formatConteoSubtotalLabel(category.categoryName)}
            row={category.subtotal}
            showKardex={showKardex}
            kardexColumns={kardexColumns}
            vitrineOnlyView={vitrineOnlyView}
          />
        </>
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
function KioskInventoryCountReport({ locationId, internalMode = false, initialCountId = null }) {
  const compact = useCompactLayout(640);
  const entreCueros = isEntreCuerosLocation(locationId);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedCounts, setEditedCounts] = useState({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [showReviewBox, setShowReviewBox] = useState(false);
  const [sessionObservations, setSessionObservations] = useState("");
  const [savingObservations, setSavingObservations] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [cinchoFilter, setCinchoFilter] = useState("");
  const [variantFilter, setVariantFilter] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("");
  const [showKardex, setShowKardex] = useState(() => !internalMode);
  const [editedSizeCounts, setEditedSizeCounts] = useState({});
  const [editedSizeCountsByLocation, setEditedSizeCountsByLocation] = useState({});
  const [editedObservations, setEditedObservations] = useState({});
  const [editedHardwareLocationCounts, setEditedHardwareLocationCounts] = useState({});
  const [hardwareModal, setHardwareModal] = useState(null);
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
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [internalNotes, setInternalNotes] = useState("");
  const [liveParticipants, setLiveParticipants] = useState([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState("idle");
  const [lastAutoSaveAt, setLastAutoSaveAt] = useState(null);
  const [remoteSyncNotice, setRemoteSyncNotice] = useState("");
  const [hardwareSplitEnabled, setHardwareSplitEnabled] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(null);
  const nvSplitEnabled = hardwareSplitEnabled && !entreCueros;
  const lastSyncSinceRef = useRef(null);
  const autoSavingRef = useRef(false);

  const isSubcountView = report?.reportType === "SUBCONTEO";
  const tableShowKardex = internalMode ? false : showKardex;
  const trailingDataCols = internalMode ? INTERNAL_TRAILING_DATA_COLS : TRAILING_DATA_COLS;
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
        if (productCategoryFilter) {
          const catId = category.categoryId != null ? String(category.categoryId) : "none";
          const catName = String(category.categoryName || "").trim().toLowerCase();
          const filter = String(productCategoryFilter);
          if (filter === "none") {
            if (category.categoryId != null && catName && catName !== "sin categoría" && catName !== "sin categoria") {
              return null;
            }
          } else if (catId !== filter && catName !== filter.toLowerCase()) {
            return null;
          }
        }
        const rows = category.rows.filter(
          (row) =>
            shouldShowInKioskPhysicalCount(row)
            && productMatchesSearchFilter(row, debouncedSearch)
            && productMatchesAudienceFilter(row, audienceFilter)
            && productMatchesCinchoFilter(row, cinchoFilter)
            && (!entreCueros || matchesEntrecuerosVariantFilter(row, variantFilter))
        );
        if (rows.length === 0) return null;
        const rowsWithLiveTotals = rows.map((row) =>
          withLiveRowTotals(row, editedCounts, editedSizeCounts, editedSizeCountsByLocation)
        );
        return { ...category, rows: rowsWithLiveTotals, subtotal: sumFilteredRows(rowsWithLiveTotals) };
      })
      .filter(Boolean);
  }, [
    displayReport,
    debouncedSearch,
    audienceFilter,
    cinchoFilter,
    variantFilter,
    entreCueros,
    productCategoryFilter,
    editedCounts,
    editedSizeCounts,
    editedSizeCountsByLocation,
  ]);

  const productCategoryOptions = useMemo(() => {
    const map = new Map();
    (displayReport?.categories || []).forEach((category) => {
      const id = category.categoryId != null ? String(category.categoryId) : "none";
      if (map.has(id)) return;
      map.set(id, {
        value: id,
        label: category.categoryName || "Sin categoría",
        searchText: category.categoryName || "sin categoria",
      });
    });
    return [
      { value: "", label: "Todas las categorías", searchText: "todas" },
      ...Array.from(map.values()).sort((a, b) =>
        a.label.localeCompare(b.label, "es", { sensitivity: "base" })
      ),
    ];
  }, [displayReport]);

  const allReportRows = useMemo(
    () => (displayReport?.categories || []).flatMap((category) => category.rows),
    [displayReport]
  );

  useEffect(() => {
    if (!report?.id || internalMode) return;
    setHardwareSplitEnabled(reportHasHardwareSplitData(allReportRows));
  }, [report?.id, internalMode, allReportRows]);

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

  const cinchoModalHardwareSplit = useMemo(() => {
    if (!nvSplitEnabled || !cinchoModalRows.length) return false;
    const parentRows = cinchoModalRows.filter((row) => !row.sizeLabel);
    const rowsToCheck = parentRows.length ? parentRows : cinchoModalRows;
    return rowsToCheck.every((row) => {
      const key = rowKey(row);
      return rowUsesHardwareCountMode({
        hardwareLocationCounts: editedHardwareLocationCounts[key] ?? row.hardwareLocationCounts,
        counts: editedCounts[key] ?? row.counts,
        physicalSizes: editedSizeCounts[key] ?? row.physicalSizes,
        physicalSizesByLocation: editedSizeCountsByLocation[key] ?? row.physicalSizesByLocation,
      });
    });
  }, [
    cinchoModalRows,
    editedHardwareLocationCounts,
    editedCounts,
    editedSizeCounts,
    editedSizeCountsByLocation,
    nvSplitEnabled,
  ]);

  const filteredTotalGeneral = useMemo(() => {
    const allRows = filteredCategories.flatMap((c) => c.rows);
    if (allRows.length === 0) return null;
    return sumFilteredRows(allRows);
  }, [filteredCategories]);

  const diffBreakdown = useMemo(() => {
    const allRows = filteredCategories.flatMap((c) => c.rows);
    let sobrante = 0;
    let faltante = 0;
    let conSobrante = 0;
    let conFaltante = 0;
    allRows.forEach((row) => {
      const d = Number(row.diferencia || 0);
      if (d > 0) {
        sobrante += d;
        conSobrante += 1;
      } else if (d < 0) {
        faltante += -d;
        conFaltante += 1;
      }
    });
    return { sobrante, faltante, conSobrante, conFaltante };
  }, [filteredCategories]);

  const loadHistorial = useCallback(async (locId) => {
    if (!locId) {
      setHistorial([]);
      return;
    }
    try {
      setLoadingHistorial(true);
      const data = internalMode
        ? await listInternalCountHistory(Number(locId))
        : await getKioscoConteoHistorial(Number(locId));
      setHistorial(data || []);
    } catch {
      setHistorial([]);
    } finally {
      setLoadingHistorial(false);
    }
  }, [internalMode]);

  useEffect(() => {
    void loadHistorial(locationId);
    if (!internalMode) {
      setReport(null);
      setPrincipalReport(null);
      setSubcountAsOf("");
    }
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
    setEditedHardwareLocationCounts({});
    setEditedObservations({});
    if (entreCueros) {
      setHardwareSplitEnabled(false);
    }
  }, [locationId, loadHistorial, internalMode, entreCueros]);

  // Siguiente conteo: día siguiente al último cerrado; si no hay, ahora GT → fin de día GT.
  useEffect(() => {
    if (internalMode || from || loadingHistorial) return;
    const closed = (historial || [])
      .filter((s) => String(s.status || "").toUpperCase() === "CERRADO" && s.periodTo)
      .sort((a, b) => String(b.periodTo).localeCompare(String(a.periodTo)));
    if (closed.length) {
      const lastTo = String(closed[0].periodTo).slice(0, 10);
      const nextYmd = shiftYmdGuatemala(lastTo, 1);
      setFrom(`${nextYmd}T00:00`);
      setTo(getEndOfDayDatetimeLocalGuatemala(nextYmd));
      return;
    }
    setFrom(getNowDatetimeLocalGuatemala());
    setTo(getEndOfDayDatetimeLocalGuatemala());
  }, [historial, loadingHistorial, internalMode, from]);

  const openReport = (data, { isPrincipal = true } = {}) => {
    setReport(data);
    lastSyncSinceRef.current = new Date();
    setLiveParticipants([]);
    setAutoSaveStatus("idle");
    setRemoteSyncNotice("");
    if (isPrincipal && data?.reportType !== "SUBCONTEO") {
      setPrincipalReport(data);
      if (data?.periodToAt || data?.periodTo) {
        setSubcountAsOf((prev) =>
          prev
            || toDatetimeLocalGuatemala(data.periodToAt)
            || getEndOfDayDatetimeLocalGuatemala(data.periodTo)
        );
      }
    }
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
    setEditedHardwareLocationCounts({});
    setEditedObservations({});
    setReviewNotes(data.notes || "");
    setSessionObservations(data.observations || "");
    setShowReviewBox(false);
    setCinchoModalProductId(null);
  };

  useEffect(() => {
    if (!internalMode || !locationId) return;
    const loadDraft = async () => {
      try {
        setLoading(true);
        const data = await startInternalCount(Number(locationId));
        openReport(data);
      } catch (err) {
        showError(err.message || "No se pudo cargar el conteo interno.");
      } finally {
        setLoading(false);
      }
    };
    void loadDraft();
  }, [internalMode, locationId]);

  const handleOpen = async () => {
    if (!locationId || !from || !to) {
      showError("Selecciona un kiosko y el rango (fecha y hora Guatemala).");
      return;
    }
    const fromApi = toApiLocalDateTimeGuatemala(from);
    const toApi = toApiLocalDateTimeGuatemala(to);
    if (!fromApi || !toApi) {
      showError("Fecha/hora inválida. Usa hora Guatemala.");
      return;
    }
    if (fromApi > toApi) {
      showError("La fecha/hora inicial no puede ser posterior a la final.");
      return;
    }
    try {
      setLoading(true);
      const data = await startKioscoConteo(Number(locationId), fromApi, toApi);
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
      const data = internalMode
        ? await getInternalCountReport(countId)
        : await getKioscoConteoReport(countId);
      openReport(data, { isPrincipal: !internalMode });
    } catch (err) {
      showError(err.message || "No se pudo cargar el conteo.");
    } finally {
      setLoading(false);
    }
  };

  // Enlace directo a un conteo (desde Liquidación): se carga una sola vez.
  const initialCountLoadedRef = useRef(false);
  useEffect(() => {
    if (!initialCountId || !locationId || initialCountLoadedRef.current) return;
    initialCountLoadedRef.current = true;
    handleLoadSession(initialCountId);
  }, [initialCountId, locationId, handleLoadSession]);

  const resolvePrincipalForSubcount = () => {
    const parentReport = report?.reportType === "SUBCONTEO" ? principalReport : report;
    if (!parentReport?.id) {
      showError("No hay un conteo principal cargado.");
      return null;
    }
    if (!subcountAsOf) {
      showError("Selecciona la fecha y hora de corte del inventario sistema (hora Guatemala).");
      return null;
    }
    const asOfApi = toApiLocalDateTimeGuatemala(subcountAsOf);
    const periodFromAt =
      toApiLocalDateTimeGuatemala(parentReport.periodFromAt)
      || toApiLocalDateTimeGuatemala(`${parentReport.periodFrom}T00:00:00`);
    const periodToAt =
      toApiLocalDateTimeGuatemala(parentReport.periodToAt)
      || toApiLocalDateTimeGuatemala(getEndOfDayDatetimeLocalGuatemala(parentReport.periodTo));
    if (!asOfApi || asOfApi < periodFromAt || asOfApi > periodToAt) {
      showError("La fecha/hora de corte debe estar dentro del período del conteo (hora Guatemala).");
      return null;
    }
    return { parentReport, asOfApi };
  };

  const handleViewSubconteo = async () => {
    const resolved = resolvePrincipalForSubcount();
    if (!resolved) return;
    const { parentReport, asOfApi } = resolved;
    try {
      setLoadingSubcount(true);
      setPrincipalReport(parentReport);
      const data = await getKioscoSubconteo(parentReport.id, asOfApi);
      setReport(data);
      setEditedCounts({});
      setEditedSizeCounts({});
      setEditedSizeCountsByLocation({});
    setEditedHardwareLocationCounts({});
      setEditedObservations({});
      setCinchoModalProductId(null);
      setShowKardex(true);
    } catch (err) {
      showError(err.message || "No se pudo generar el subconteo.");
    } finally {
      setLoadingSubcount(false);
    }
  };

  const handleExportCutoff = async (format) => {
    const resolved = resolvePrincipalForSubcount();
    if (!resolved) return;
    const { parentReport, asOfApi } = resolved;
    try {
      setExportingCutoff(true);
      const data = await getKioscoSubconteo(parentReport.id, asOfApi);
      if (!data) {
        showError("No hay datos para exportar al corte.");
        return;
      }
      const payload = buildConteoDisplayReport({
        ...data,
        reportType: data.reportType || "SUBCONTEO",
        asOfDate: data.asOfDate || String(asOfApi).slice(0, 10),
        asOfAt: data.asOfAt || asOfApi,
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
        observations: parentReport.observations || sessionObservations || payload.observations || "",
        notes: parentReport.notes || payload.notes || "",
        categories: visibleCategories,
        totalGeneral: allVisible.length ? sumFilteredRows(allVisible) : payload.totalGeneral,
      };
      if (format === "pdf") {
        exportConteoToPdf(exportPayload, { showKardex: true, includeVitrines: false });
        showSuccess(`PDF inventario al corte ${fmtDt(asOfApi) || fmt(subcountAsOf)} listo.`);
      } else {
        exportConteoToExcel(exportPayload, { showKardex: true, includeVitrines: false });
        showSuccess(`Excel inventario al corte ${fmtDt(asOfApi) || fmt(subcountAsOf)} descargado.`);
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
    setEditedHardwareLocationCounts({});
    setEditedObservations({});
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

  const handleObservationChange = (rKey, value) => {
    setEditedObservations((prev) => ({ ...prev, [rKey]: value }));
  };

  const appendObservationFields = (item, groupRows, sample) => {
    const hasSizeRows = groupRows.some((r) => r.sizeLabel);
    if (!hasSizeRows) {
      const rKey = rowKey(sample);
      if (Object.prototype.hasOwnProperty.call(editedObservations, rKey)) {
        item.observation = editedObservations[rKey];
      }
      return item;
    }
    const sizeObservations = {};
    groupRows.forEach((row) => {
      if (!row.sizeLabel) return;
      const rKey = rowKey(row);
      if (Object.prototype.hasOwnProperty.call(editedObservations, rKey)) {
        sizeObservations[row.sizeLabel] = editedObservations[rKey];
      }
    });
    if (Object.keys(sizeObservations).length > 0) {
      item.sizeObservations = sizeObservations;
    }
    return item;
  };

  const handleApplyCinchoModal = ({
    fossMode,
    sizeCountsByRowKey,
    sizeCountsByLocationByRowKey,
    hardwareLocationCountsByRowKey,
    applyToVitrine,
  }) => {
    setEditedSizeCounts((prev) => ({ ...prev, ...sizeCountsByRowKey }));
    if (fossMode && sizeCountsByLocationByRowKey) {
      setEditedSizeCountsByLocation((prev) => ({ ...prev, ...sizeCountsByLocationByRowKey }));
    }
    if (hardwareLocationCountsByRowKey) {
      setEditedHardwareLocationCounts((prev) => ({ ...prev, ...hardwareLocationCountsByRowKey }));
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
        } else if (hardwareLocationCountsByRowKey?.[rKey]) {
          next[rKey] = syncCountsFromHardware(
            prev[rKey] || baseRow?.counts || {},
            hardwareLocationCountsByRowKey[rKey]
          );
        } else {
          const sizeTotal = sumSizeCounts(sizes);
          next[rKey] = applySizeTotalToLocations(sizeTotal, prev[rKey], baseRow?.counts || {});
        }
      });
      return next;
    });
  };

  const handleOpenHardwareModal = (rKey, locationKey, row) => {
    setHardwareModal({
      rowKey: rKey,
      locationKey,
      productLabel: `${row.productCode || ""} ${formatConteoProductTitle(row)}`.trim(),
      initialCounts: (editedHardwareLocationCounts[rKey] || row.hardwareLocationCounts || {})[locationKey],
    });
  };

  const closeHardwareModal = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setHardwareModal(null);
  };

  const handleApplyHardwareModal = ({ locationKey, hardwareCounts, total }) => {
    if (!hardwareModal?.rowKey) return;
    const rKey = hardwareModal.rowKey;
    setEditedHardwareLocationCounts((prev) => {
      const merged = buildHardwareLocationCounts(prev[rKey] || {}, locationKey, hardwareCounts);
      return { ...prev, [rKey]: merged };
    });
    setEditedCounts((prev) => {
      const baseRow = allReportRows.find((r) => rowKey(r) === rKey);
      const nextLocCounts = buildHardwareLocationCounts(
        editedHardwareLocationCounts[rKey] || baseRow?.hardwareLocationCounts || {},
        locationKey,
        hardwareCounts
      );
      const synced = syncCountsFromHardware(prev[rKey] || baseRow?.counts || {}, nextLocCounts);
      synced[locationKey] = total;
      return { ...prev, [rKey]: synced };
    });
    closeHardwareModal();
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
    Object.keys(editedHardwareLocationCounts).forEach(markDirty);
    Object.keys(editedObservations).forEach(markDirty);
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
          hardwareCondition: sample.hardwareCondition || undefined,
        };
        if (Object.prototype.hasOwnProperty.call(editedHardwareLocationCounts, rKey)) {
          item.hardwareLocationCounts = editedHardwareLocationCounts[rKey];
          item.counts = syncCountsFromHardware(
            editedCounts[rKey] || sample.counts || {},
            editedHardwareLocationCounts[rKey]
          );
        } else if (editedCounts[rKey]) {
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
        return appendObservationFields(item, groupRows, sample);
      }

      if (entreCueros && isCinchoProductRow(sample)) {
        const byLocation = {};
        const physicalSizesByTotal = {};
        const parentCountsByLocation = { ...(sample.counts || {}) };
        ENTRECUEROS_CINCHO_COUNT_LOCATIONS.forEach((locKey) => {
          parentCountsByLocation[locKey] = 0;
        });
        groupRows.forEach((row) => {
          if (!row.sizeLabel) return;
          const counts = { ...(row.counts || {}), ...(editedCounts[rowKey(row)] || {}) };
          let sizeTotal = 0;
          ENTRECUEROS_CINCHO_COUNT_LOCATIONS.forEach((locKey) => {
            const qty = Number(counts[locKey] || 0);
            if (!byLocation[locKey]) byLocation[locKey] = {};
            byLocation[locKey][row.sizeLabel] = qty;
            parentCountsByLocation[locKey] += qty;
            sizeTotal += qty;
          });
          physicalSizesByTotal[row.sizeLabel] = sizeTotal;
        });
        const entreCuerosItem = {
          productId: sample.productId,
          colorId: sample.colorId || null,
          hardwareCondition: sample.hardwareCondition || undefined,
          counts: parentCountsByLocation,
          physicalSizes: physicalSizesByTotal,
          physicalSizesByLocation: byLocation,
        };
        return appendObservationFields(entreCuerosItem, groupRows, sample);
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
        hardwareCondition: sample.hardwareCondition || undefined,
        counts: parentCounts,
        physicalSizes,
      };
      if (foss) {
        item.physicalSizesByLocation = byLocation;
      }
      const parentKey = rowKey(sample);
      if (Object.prototype.hasOwnProperty.call(editedHardwareLocationCounts, parentKey)) {
        item.hardwareLocationCounts = editedHardwareLocationCounts[parentKey];
        item.counts = syncCountsFromHardware(parentCounts, editedHardwareLocationCounts[parentKey]);
      }
      return appendObservationFields(item, groupRows, sample);
    }).filter(Boolean);
  };

  const clearEditedCounts = () => {
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
    setEditedHardwareLocationCounts({});
    setEditedObservations({});
  };

  const performAutoSave = useCallback(async () => {
    if (!report || internalMode || report.status !== "DRAFT" || isSubcountView) return;
    if (autoSavingRef.current || saving || finalizing) return;
    const items = buildDirtyItemsPayload();
    if (!items?.length) return;
    try {
      autoSavingRef.current = true;
      setAutoSaveStatus("saving");
      const data = await saveKioscoConteoItems(report.id, items);
      setReport(data);
      clearEditedCounts();
      lastSyncSinceRef.current = new Date();
      setLastAutoSaveAt(new Date());
      setAutoSaveStatus("saved");
    } catch {
      setAutoSaveStatus("error");
    } finally {
      autoSavingRef.current = false;
    }
  }, [
    report,
    internalMode,
    isSubcountView,
    saving,
    finalizing,
    editedCounts,
    editedSizeCounts,
    editedSizeCountsByLocation,
    editedHardwareLocationCounts,
    editedObservations,
    allReportRows,
  ]);

  const pollLiveCollaboration = useCallback(async () => {
    if (!report?.id || internalMode || report.status !== "DRAFT" || isSubcountView) return;
    try {
      const since = formatSyncSince(lastSyncSinceRef.current);
      const data = await pollKioscoConteoLiveSession(report.id, since);
      setLiveParticipants(data.participants || []);
      if (data.serverTime) {
        lastSyncSinceRef.current = new Date(data.serverTime);
      }
      if (data.items?.length) {
        const dirtyKeys = collectDirtyPersistKeys(
          editedCounts,
          editedSizeCounts,
          editedSizeCountsByLocation,
          editedHardwareLocationCounts,
          editedObservations,
          allReportRows
        );
        const { report: mergedReport, mergedCount, mergedBy } = applySyncItemsToReport(
          report,
          data.items,
          dirtyKeys
        );
        if (mergedCount > 0) {
          setReport(mergedReport);
          const who = mergedBy || "Otra persona";
          setRemoteSyncNotice(`${who} actualizó ${mergedCount} producto${mergedCount !== 1 ? "s" : ""}`);
        }
      }
    } catch {
      // Polling silencioso — no interrumpe el conteo.
    }
  }, [
    report,
    internalMode,
    isSubcountView,
    editedCounts,
    editedSizeCounts,
    editedSizeCountsByLocation,
    editedHardwareLocationCounts,
    editedObservations,
    allReportRows,
  ]);

  useEffect(() => {
    if (internalMode || !report?.id || report.status !== "DRAFT" || isSubcountView) {
      setLiveParticipants([]);
      return undefined;
    }
    if (!lastSyncSinceRef.current) {
      lastSyncSinceRef.current = new Date();
    }
    void pollLiveCollaboration();
    const liveTimer = setInterval(() => void pollLiveCollaboration(), LIVE_SESSION_INTERVAL_MS);
    const saveTimer = setInterval(() => void performAutoSave(), AUTO_SAVE_INTERVAL_MS);
    return () => {
      clearInterval(liveTimer);
      clearInterval(saveTimer);
    };
  }, [
    internalMode,
    report?.id,
    report?.status,
    isSubcountView,
    pollLiveCollaboration,
    performAutoSave,
  ]);

  useEffect(() => {
    if (!remoteSyncNotice) return undefined;
    const timer = setTimeout(() => setRemoteSyncNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [remoteSyncNotice]);

  const handleSave = async () => {
    if (!report) return;
    const items = buildDirtyItemsPayload();
    if (!items?.length) {
      showError("No hay cambios para guardar.");
      return;
    }
    try {
      setSaving(true);
      const data = internalMode
        ? await saveInternalCountItems(report.id, items)
        : await saveKioscoConteoItems(report.id, items);
      setReport(data);
      clearEditedCounts();
      if (!internalMode) {
        lastSyncSinceRef.current = new Date();
        await loadHistorial(locationId);
      }
      showSuccess(internalMode ? "Conteo interno guardado." : "Conteo guardado correctamente.");
    } catch (err) {
      showError(err.message || "No se pudo guardar el conteo.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInternalSnapshot = async () => {
    if (!report || !internalMode) return;
    const items = buildDirtyItemsPayload();
    try {
      setSavingSnapshot(true);
      if (items?.length) {
        const saved = await saveInternalCountItems(report.id, items);
        setReport(saved);
        clearEditedCounts();
      }
      const data = await saveInternalCountSnapshot(report.id, internalNotes);
      setReport(data);
      await loadHistorial(locationId);
      showSuccess("Snapshot del conteo interno guardado.");
    } catch (err) {
      showError(err.message || "No se pudo guardar el snapshot.");
    } finally {
      setSavingSnapshot(false);
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
      if (String(sessionObservations || "") !== String(report.observations || "")) {
        const withObs = await saveKioscoConteoObservations(countId, sessionObservations);
        setReport(withObs);
        setSessionObservations(withObs.observations || "");
        countId = withObs.id;
      }
      const data = await terminarKioscoConteo(countId);
      setReport(data);
      setSessionObservations(data.observations || "");
      await loadHistorial(locationId);
      showSuccess("Conteo terminado. Las vitrinas quedan bloqueadas para edición.");
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
      setSessionObservations(data.observations || "");
      setShowReviewBox(false);
      await loadHistorial(locationId);
      showSuccess("Conteo marcado como revisado.");
    } catch (err) {
      showError(err.message || "No se pudo marcar el conteo como revisado.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveObservations = async () => {
    if (!report?.id || internalMode) return;
    try {
      setSavingObservations(true);
      const data = await saveKioscoConteoObservations(report.id, sessionObservations);
      setReport(data);
      setSessionObservations(data.observations || "");
      await loadHistorial(locationId);
      showSuccess("Observaciones guardadas.");
    } catch (err) {
      showError(err.message || "No se pudieron guardar las observaciones.");
    } finally {
      setSavingObservations(false);
    }
  };

  const handleClose = async () => {
    if (!report) return;
    const pendingDiff = pendingRows.some(
      (r) => Math.abs(resolveRowDiffForEdit(r, editedCounts, editedSizeCounts, editedSizeCountsByLocation)) >= DIFF_ALERT_THRESHOLD
    );
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

  const totalCols = PRODUCT_INFO_COLS + (tableShowKardex ? kardexColumns.length : 0) + COUNT_LOCATION_KEYS.length + trailingDataCols;
  const isClosed = report?.status === "CERRADO";
  const isDraft = internalMode ? report?.status === "DRAFT" : report?.status === "DRAFT";
  const isCountLocked = internalMode
    ? report?.status === "SAVED"
    : (!isDraft || isSubcountView);
  const statusMeta = conteoStatusMeta(report?.status, internalMode);
  const exportReport = useMemo(() => {
    if (!displayReport) return null;
    if (!filteredCategories.length) return displayReport;
    const categories = filteredCategories.map((category) => ({
      ...category,
      rows: category.rows.map((row) => {
        const rKey = rowKey(row);
        if (!Object.prototype.hasOwnProperty.call(editedObservations, rKey)) return row;
        return { ...row, observation: editedObservations[rKey] };
      }),
    }));
    const allRows = categories.flatMap((category) => category.rows);
    return {
      ...displayReport,
      categories,
      totalGeneral: allRows.length ? sumFilteredRows(allRows) : displayReport.totalGeneral,
    };
  }, [displayReport, filteredCategories, editedObservations]);

  const excelExportPayload = useMemo(() => {
    const data = exportReport || displayReport;
    if (!data || !report) return data;
    return {
      ...report,
      ...data,
      observations: sessionObservations,
      reportType: report.reportType || (report.asOfDate ? "SUBCONTEO" : data.reportType),
      asOfDate: report.asOfDate ?? data.asOfDate,
    };
  }, [report, exportReport, displayReport, sessionObservations]);

  const handleExportExcel = () => {
    if (!excelExportPayload) {
      showError("No hay datos para exportar.");
      return;
    }
    exportConteoToExcel(excelExportPayload, {
      showKardex: !internalMode,
      includeVitrines: true,
      vitrineOnly: internalMode,
    });
  };

  const handleExportPdf = () => {
    if (internalMode) return;
    if (!excelExportPayload) {
      showError("No hay datos para exportar.");
      return;
    }
    exportConteoToPdf(excelExportPayload, { showKardex: true });
  };

  const pendingRows = filteredCategories.flatMap((c) => c.rows);
  const alertRows = pendingRows.filter(
    (r) => Math.abs(resolveRowDiffForEdit(r, editedCounts, editedSizeCounts, editedSizeCountsByLocation)) >= DIFF_ALERT_THRESHOLD
  );
  const showDiffBanner = !internalMode && report?.status === "REVISADO" && alertRows.length > 0;

  const dirtyRowCount = new Set([
    ...Object.keys(editedCounts),
    ...Object.keys(editedSizeCounts),
    ...Object.keys(editedSizeCountsByLocation),
    ...Object.keys(editedHardwareLocationCounts),
    ...Object.keys(editedObservations),
  ]).size;
  const visibleProductCount = pendingRows.length;
  const hasActiveFilters = Boolean(
    searchQuery || productCategoryFilter || audienceFilter || cinchoFilter || variantFilter
  );
  const clearFilters = () => {
    setSearchQuery("");
    setProductCategoryFilter("");
    setAudienceFilter("");
    setCinchoFilter("");
    setVariantFilter("");
  };
  const historyExpanded = historyOpen ?? !report;
  const observationsDirty = String(sessionObservations || "") !== String(report?.observations || "");
  const cutoffLabel = subcountAsOf
    ? (fmtDt(toApiLocalDateTimeGuatemala(subcountAsOf)) || fmt(subcountAsOf))
    : "corte";

  return (
    <div className={`kiosk-conteo${compact ? " is-compact" : ""}`}>
      {internalMode && (
        <Notice tone="info" className="mb-3">
          <strong>Mi conteo — control interno.</strong> Solo vitrinas y total físico; no compara con el sistema ni
          reemplaza el conteo oficial de supervisión. Puedes exportar a Excel cuando termines.
        </Notice>
      )}

      {/* ── Sesiones: nuevo conteo + historial ── */}
      {(locationId || !internalMode) && (
        <section className="kc-card kc-sessions">
          <header className="kc-card-head">
            <div className="kc-card-title">
              <h6>{internalMode ? "Conteos internos" : "Sesiones de conteo"}</h6>
              {locationId && !loadingHistorial && (
                <span className="kc-count-pill">{historial.length}</span>
              )}
            </div>
            <div className="kc-card-actions">
              {!internalMode && locationId && (
                <button type="button" className="kc-link" onClick={handleOpenRecipients}>
                  ✉ Destinatarios de alertas
                </button>
              )}
              {locationId && (
                <button
                  type="button"
                  className="kc-link"
                  onClick={() => void loadHistorial(locationId)}
                  disabled={loadingHistorial}
                >
                  {loadingHistorial ? <Spinner size="sm" /> : "↺ Actualizar"}
                </button>
              )}
              {locationId && historial.length > 0 && (
                <button
                  type="button"
                  className="kc-link"
                  onClick={() => setHistoryOpen(!historyExpanded)}
                  aria-expanded={historyExpanded}
                >
                  {historyExpanded ? "Ocultar historial ▴" : "Ver historial ▾"}
                </button>
              )}
            </div>
          </header>

          {!internalMode && (
            <div className="kc-new-count">
              <FormGroup className="mb-0">
                <Label className="kc-label" for="kc-from">Desde (hora Guatemala)</Label>
                <Input
                  id="kc-from"
                  type="datetime-local"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </FormGroup>
              <FormGroup className="mb-0">
                <Label className="kc-label" for="kc-to">Hasta (hora Guatemala)</Label>
                <Input
                  id="kc-to"
                  type="datetime-local"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </FormGroup>
              <button
                type="button"
                className="kc-btn kc-btn--primary kc-new-count-btn"
                onClick={() => void handleOpen()}
                disabled={loading}
              >
                {loading ? <><Spinner size="sm" className="mr-1" /> Abriendo...</> : "＋ Abrir conteo"}
              </button>
            </div>
          )}

          {locationId && historyExpanded && (
            loadingHistorial ? (
              <div className="kc-empty-inline"><Spinner size="sm" /> Cargando historial...</div>
            ) : historial.length === 0 ? (
              <div className="kc-empty-inline">
                {internalMode
                  ? "Aún no hay snapshots guardados. Usa «Guardar snapshot» cuando termines tu conteo del día."
                  : "No hay sesiones registradas para este kiosko. Crea la primera con el formulario de arriba."}
              </div>
            ) : (
              <div className="kiosk-conteo-historial">
                <table className="kc-history-table">
                  <thead>
                    <tr>
                      <th>{internalMode ? "Fecha" : "Período"}</th>
                      <th>Estado</th>
                      <th>{internalMode ? "Encargada" : "Generado por"}</th>
                      <th>{internalMode ? "Guardado el" : "Fecha creación"}</th>
                      {!internalMode && <th>Revisado por</th>}
                      <th>Observaciones</th>
                      <th aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {historial.map((s) => {
                      const isActive = report && report.id === s.id;
                      const hasPendingDiff = !internalMode && s.status === "REVISADO" && (s.maxAbsDiff ?? 0) >= DIFF_ALERT_THRESHOLD;
                      const sessionDate = internalMode ? s.countDate : null;
                      return (
                        <tr
                          key={s.id}
                          className={`${isActive ? "is-active" : ""}${hasPendingDiff ? " has-pending-diff" : ""}`}
                        >
                          <td className="kc-history-period">
                            {internalMode
                              ? fmt(sessionDate || s.periodFrom)
                              : fmtPeriodRange(s.periodFromAt, s.periodToAt, s.periodFrom, s.periodTo)}
                          </td>
                          <td className="kc-nowrap">
                            <StatusPill status={s.status} internalMode={internalMode} />
                            {hasPendingDiff && (
                              <span className="kc-diff-pill ml-1" title="Diferencia sin resolver">
                                Dif. {s.maxAbsDiff}
                              </span>
                            )}
                          </td>
                          <td>{(internalMode ? s.createdByName : s.generatedByName) || "—"}</td>
                          <td className="kc-nowrap kc-muted">
                            {internalMode
                              ? (s.savedAt ? fmtDt(s.savedAt) : "—")
                              : (s.generatedAt ? fmtDt(s.generatedAt) : "—")}
                          </td>
                          {!internalMode && <td>{s.reviewedByName || "—"}</td>}
                          <td className="kc-history-obs kc-muted" title={s.observations || s.notes || ""}>
                            {s.observations || s.notes || "—"}
                          </td>
                          <td className="text-right">
                            {isActive ? (
                              <span className="kc-open-tag">Abierto</span>
                            ) : (
                              <button
                                type="button"
                                className="kc-btn kc-btn--ghost kc-btn--sm"
                                onClick={() => void handleLoadSession(s.id)}
                                disabled={loading}
                              >
                                Cargar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      )}

      {!report ? (
        <div className="kc-empty">
          <div className="kc-empty-icon" aria-hidden="true">▤</div>
          <div>
            {internalMode ? (
              loading ? <><Spinner size="sm" className="mr-1" /> Cargando conteo interno...</> : "No se pudo cargar el conteo interno."
            ) : locationId ? (
              <>Selecciona fecha y hora Guatemala y presiona <strong>Abrir conteo</strong> para crear uno nuevo, o carga uno existente del historial.</>
            ) : (
              <>Selecciona un <strong>kiosko</strong> arriba para ver y gestionar los conteos físicos.</>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* ── Cabecera de la sesión ── */}
          <section className="kc-card kc-session">
            <div className="kc-session-main">
              <div className="kc-session-title">
                {isSubcountView ? (
                  <span className="kc-status kc-status--info is-large">
                    <span className="kc-status-dot" aria-hidden="true" />
                    Subconteo
                  </span>
                ) : (
                  <StatusPill status={report.status} internalMode={internalMode} large />
                )}
                <h5>
                  {internalMode
                    ? <>Conteo del {report.periodFrom ? fmt(report.periodFrom) : "—"}</>
                    : fmtPeriodRange(report.periodFromAt, report.periodToAt, report.periodFrom, report.periodTo)}
                </h5>
                {!internalMode && <span className="kc-muted kc-small">hora Guatemala</span>}
              </div>
              <div className="kc-session-meta">
                <span>
                  {internalMode ? "Encargada" : "Generado por"}{" "}
                  <strong>{report.generatedByName || "—"}</strong>
                  {report.generatedAt && <> · {fmtDt(report.generatedAt)}</>}
                </span>
                {!internalMode && (report.status === "REVISADO" || isClosed) && (
                  <span>
                    Revisado por <strong>{report.reviewedByName || "—"}</strong>
                    {report.reviewedAt && <> · {fmtDt(report.reviewedAt)}</>}
                  </span>
                )}
                {!internalMode && isClosed && (
                  <span>
                    Cerrado por <strong>{report.closedByName || "—"}</strong>
                    {report.closedAt && <> · {fmtDt(report.closedAt)}</>}
                  </span>
                )}
              </div>
            </div>
            {!internalMode && !isSubcountView && <WorkflowStepper status={report.status} />}
            {!internalMode && (
              <details className="kc-legend">
                <summary>Leyenda de colores</summary>
                <ConteoColorLegend />
              </details>
            )}
          </section>

          {!internalMode && isDraft && !isSubcountView && (
            <div className="kc-live">
              <div className="kc-live-left">
                <span className="kc-live-dot" aria-hidden="true" />
                <strong>Sesión en vivo</strong>
                {liveParticipants.length > 0 ? (
                  <span className="kc-participants">
                    {liveParticipants.map((p) => (
                      <span key={p.userId} className={`kc-participant${p.self ? " is-self" : ""}`} title={p.userName || "Usuario"}>
                        <span className="kc-avatar">{p.self ? "Tú" : initials(p.userName)}</span>
                        {p.self ? "Tú" : (p.userName || "Usuario")}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="kc-muted">Conectando…</span>
                )}
              </div>
              <div className="kc-live-right">
                {autoSaveStatus === "saving" && (
                  <span className="kc-save-state">
                    <Spinner size="sm" className="mr-1" /> Auto-guardando…
                  </span>
                )}
                {autoSaveStatus === "saved" && lastAutoSaveAt && (
                  <span className="kc-save-state is-ok">
                    ✓ Auto-guardado {formatDateTimeGt(lastAutoSaveAt)}
                  </span>
                )}
                {autoSaveStatus === "error" && (
                  <span className="kc-save-state is-error">Error en auto-guardado — usa Guardar conteo</span>
                )}
                {autoSaveStatus === "idle" && (
                  <span className="kc-save-state">Auto-guardado cada 45 s</span>
                )}
              </div>
              <div className="kc-live-hint">
                Dos personas pueden contar el mismo borrador: los cambios se sincronizan cada 30 s.
                No editen la misma celda a la vez; divide vitrinas o categorías si puedes.
              </div>
            </div>
          )}

          {remoteSyncNotice && (
            <Notice tone="info" className="mb-3">{remoteSyncNotice}</Notice>
          )}

          {isSubcountView && (
            <Notice tone="info" className="mb-3">
              <div className="kc-notice-row">
                <div>
                  <strong>Subconteo al {fmtDt(report.asOfAt) || fmt(report.asOfDate)} (hora Guatemala).</strong>{" "}
                  Kardex del {fmtDt(report.periodFromAt) || fmt(report.periodFrom)} al{" "}
                  {fmtDt(report.asOfAt) || fmt(report.asOfDate)}. El conteo físico es el del conteo principal;
                  la columna de inventario sistema refleja el saldo a esa fecha/hora.
                  La diferencia es físico − sistema (+ sobrante, − faltante).
                </div>
                <div className="kc-notice-actions">
                  {principalReport && (
                    <button type="button" className="kc-btn kc-btn--ghost kc-btn--sm" onClick={handleBackToPrincipal}>
                      ← Volver al conteo principal
                    </button>
                  )}
                  <button type="button" className="kc-btn kc-btn--success kc-btn--sm" onClick={handleExportExcel}>
                    ⬇ Excel inventario al {fmtDt(report.asOfAt) || fmt(report.asOfDate)}
                  </button>
                </div>
              </div>
            </Notice>
          )}

          {!internalMode && showDiffBanner && (
            <Notice tone="danger" className="mb-3">
              <strong>{alertRows.length} producto{alertRows.length !== 1 ? "s" : ""} con diferencia ≥ {DIFF_ALERT_THRESHOLD} unidades.</strong>{" "}
              Registra el ajuste manual (con motivo) en <strong>Inventario y movimientos</strong> antes de cerrar el conteo.
              Si no se resuelve en 2 días desde la revisión, se notificará automáticamente por correo a contabilidad y logística.
            </Notice>
          )}

          {report.notes && !showReviewBox && !isSubcountView && (
            <Notice tone="warn" className="mb-3">
              <strong>Áreas para corregir:</strong> {report.notes}
            </Notice>
          )}

          {internalMode && report?.status === "SAVED" && (
            <Notice tone="muted" className="mb-3">
              Snapshot guardado — solo lectura. Abre el borrador de hoy para un nuevo conteo del día.
            </Notice>
          )}

          {!internalMode && report.status === "CONTADO" && !isSubcountView && (
            <Notice tone="info" className="mb-3">
              Conteo físico terminado. Las vitrinas están bloqueadas; un supervisor puede marcarlo como revisado.
            </Notice>
          )}

          {!internalMode && isClosed && !isSubcountView && (
            <Notice tone="muted" className="mb-3">
              Este conteo está cerrado y es de solo lectura. Puedes exportarlo, pero no editarlo.
            </Notice>
          )}

          {filteredCategories.length > 0 && (
            <DifferenceSummary
              totals={filteredTotalGeneral}
              breakdown={diffBreakdown}
              productCount={visibleProductCount}
              vitrineOnlyView={internalMode}
            />
          )}

          {/* ── Barra de acciones ── */}
          <div className="kc-toolbar kiosk-conteo-actions">
            <div className="kc-toolbar-group">
              {isSubcountView && principalReport && (
                <button type="button" className="kc-btn kc-btn--ghost" onClick={handleBackToPrincipal}>
                  ← Conteo principal
                </button>
              )}
              {isDraft && !isSubcountView && (
                <>
                  <button
                    type="button"
                    className="kc-btn kc-btn--success"
                    onClick={() => void handleSave()}
                    disabled={saving || finalizing || savingSnapshot}
                  >
                    {saving ? <Spinner size="sm" /> : internalMode ? "💾 Guardar borrador" : "💾 Guardar conteo"}
                  </button>
                  {internalMode ? (
                    <button
                      type="button"
                      className="kc-btn kc-btn--primary"
                      onClick={() => void handleSaveInternalSnapshot()}
                      disabled={saving || savingSnapshot || isCountLocked}
                    >
                      {savingSnapshot ? <Spinner size="sm" /> : "📌 Guardar snapshot del día"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="kc-btn kc-btn--warn"
                      onClick={() => void handleFinalize()}
                      disabled={saving || finalizing}
                    >
                      {finalizing ? <Spinner size="sm" /> : "✓ Terminar conteo físico"}
                    </button>
                  )}
                  <span className={`kc-dirty${dirtyRowCount > 0 ? " is-dirty" : ""}`} aria-live="polite">
                    {dirtyRowCount > 0
                      ? `${dirtyRowCount} fila${dirtyRowCount !== 1 ? "s" : ""} sin guardar`
                      : "Sin cambios pendientes"}
                  </span>
                </>
              )}
              {!internalMode && report.status === "CONTADO" && !isSubcountView && (
                <button
                  type="button"
                  className={`kc-btn kc-btn--info${showReviewBox ? " is-pressed" : ""}`}
                  onClick={() => setShowReviewBox((v) => !v)}
                  disabled={saving}
                  aria-expanded={showReviewBox}
                >
                  ✔ Marcar como revisado
                </button>
              )}
              {!internalMode && report.status === "REVISADO" && !isSubcountView && (
                <button
                  type="button"
                  className="kc-btn kc-btn--danger"
                  onClick={() => void handleClose()}
                  disabled={closing}
                >
                  {closing ? <Spinner size="sm" /> : "🔒 Cerrar conteo"}
                </button>
              )}
            </div>
            <div className="kc-toolbar-group kc-toolbar-group--end">
              <div className="kc-segmented" role="group" aria-label="Exportar">
                <button type="button" className="kc-btn kc-btn--ghost" onClick={handleExportExcel}>
                  {internalMode ? "⬇ Excel conteo interno" : isSubcountView ? "⬇ Excel subconteo" : "⬇ Excel"}
                </button>
                {!internalMode && (
                  <button type="button" className="kc-btn kc-btn--ghost" onClick={handleExportPdf}>
                    🖨 PDF / Imprimir
                  </button>
                )}
              </div>
              {!internalMode && (
                <button
                  type="button"
                  className={`kc-btn kc-btn--ghost${showKardex ? "" : " is-pressed"}`}
                  onClick={() => setShowKardex((v) => !v)}
                  aria-pressed={!showKardex}
                  title="Mostrar u ocultar las columnas del Kardex del sistema"
                >
                  {showKardex ? "Ocultar Kardex" : "Mostrar Kardex"}
                </button>
              )}
            </div>
          </div>

          {/* ── Panel de revisión ── */}
          {!internalMode && showReviewBox && (
            <section className="kc-card kc-review">
              <FormGroup className="mb-2">
                <Label className="kc-label" for="kc-review-notes">Notas / áreas para corregir</Label>
                <Input
                  id="kc-review-notes"
                  type="textarea"
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
              </FormGroup>
              <div className="kc-inline-actions">
                <button type="button" className="kc-btn kc-btn--info" onClick={() => void handleReview()} disabled={saving}>
                  {saving ? <Spinner size="sm" /> : "Confirmar revisión"}
                </button>
                <button type="button" className="kc-link" onClick={() => setShowReviewBox(false)}>Cancelar</button>
              </div>
            </section>
          )}

          {/* ── Observaciones + corte de inventario ── */}
          {!internalMode && !isSubcountView && (
            <div className="kc-panels">
              <section className="kc-card kc-panel">
                <header className="kc-panel-head">
                  <h6>Observaciones generales</h6>
                  {!isClosed && observationsDirty && <span className="kc-dirty is-dirty">Sin guardar</span>}
                </header>
                <Input
                  type="textarea"
                  rows={3}
                  value={sessionObservations}
                  disabled={isClosed}
                  onChange={(e) => setSessionObservations(e.target.value)}
                  placeholder="Ej. faltante en vitrina 3, producto dañado, conteo pendiente de BO…"
                  aria-label="Observaciones generales del conteo"
                />
                <div className="kc-panel-foot">
                  <small className="kc-muted">
                    Se muestra en el encabezado del Excel/PDF. Editable hasta cerrar el conteo.
                  </small>
                  {!isClosed && (
                    <button
                      type="button"
                      className="kc-btn kc-btn--ghost kc-btn--sm"
                      onClick={() => void handleSaveObservations()}
                      disabled={savingObservations || !observationsDirty}
                    >
                      {savingObservations ? <Spinner size="sm" /> : "Guardar observaciones"}
                    </button>
                  )}
                </div>
              </section>

              <section className="kc-card kc-panel">
                <header className="kc-panel-head">
                  <h6>Inventario sistema al corte</h6>
                </header>
                <FormGroup className="mb-2">
                  <Label className="kc-label" for="kc-cutoff">Fecha y hora de corte (hora Guatemala)</Label>
                  <Input
                    id="kc-cutoff"
                    type="datetime-local"
                    value={subcountAsOf}
                    min={
                      toDatetimeLocalGuatemala(report.periodFromAt)
                      || (report.periodFrom ? `${report.periodFrom}T00:00` : undefined)
                    }
                    max={
                      toDatetimeLocalGuatemala(report.periodToAt)
                      || (report.periodTo ? getEndOfDayDatetimeLocalGuatemala(report.periodTo) : undefined)
                    }
                    onChange={(e) => setSubcountAsOf(e.target.value)}
                  />
                  <small className="kc-muted d-block mt-1">
                    Saldo del sistema hasta la fecha y hora elegidas (entradas, ventas y demás movimientos).
                  </small>
                </FormGroup>
                <div className="kc-inline-actions">
                  <button
                    type="button"
                    className="kc-btn kc-btn--ghost kc-btn--sm"
                    onClick={() => void handleViewSubconteo()}
                    disabled={loadingSubcount || exportingCutoff || !subcountAsOf}
                    title="Ver en pantalla el inventario sistema al corte elegido (hora Guatemala)"
                  >
                    {loadingSubcount ? <Spinner size="sm" /> : "Ver subconteo al corte"}
                  </button>
                  <div className="kc-segmented" role="group" aria-label="Exportar al corte">
                    <button
                      type="button"
                      className="kc-btn kc-btn--ghost kc-btn--sm"
                      onClick={() => void handleExportCutoff("excel")}
                      disabled={loadingSubcount || exportingCutoff || !subcountAsOf}
                      title={`Descargar Excel del inventario sistema al ${cutoffLabel} (hora Guatemala)`}
                    >
                      {exportingCutoff ? <Spinner size="sm" /> : "⬇ Excel"}
                    </button>
                    <button
                      type="button"
                      className="kc-btn kc-btn--ghost kc-btn--sm"
                      onClick={() => void handleExportCutoff("pdf")}
                      disabled={loadingSubcount || exportingCutoff || !subcountAsOf}
                      title={`Descargar PDF del inventario sistema al ${cutoffLabel} (hora Guatemala)`}
                    >
                      {exportingCutoff ? <Spinner size="sm" /> : "🖨 PDF"}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {internalMode && isDraft && (
            <section className="kc-card kc-panel kc-panel--narrow">
              <FormGroup className="mb-0">
                <Label className="kc-label" for="kc-internal-notes">Notas del snapshot (opcional)</Label>
                <Input
                  id="kc-internal-notes"
                  type="textarea"
                  rows={2}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Ej. turno tarde, vitrina E revisada..."
                />
              </FormGroup>
            </section>
          )}

          {/* ── Filtros ── */}
          <section className="kc-filters kiosk-conteo-filters">
            <div className="kc-filters-top">
              <div className="kc-search">
                <span className="kc-search-icon" aria-hidden="true">⌕</span>
                <Input
                  type="search"
                  placeholder="Buscar por código o nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Buscar producto"
                />
              </div>
              <div className="kc-category-select">
                <FilterableSelect
                  options={productCategoryOptions}
                  value={productCategoryFilter}
                  onChange={setProductCategoryFilter}
                  placeholder="Todas las categorías..."
                />
              </div>
              <div className="kc-filters-meta">
                <span className="kc-muted">
                  {visibleProductCount} producto{visibleProductCount !== 1 ? "s" : ""}
                </span>
                {hasActiveFilters && (
                  <button type="button" className="kc-link" onClick={clearFilters}>
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>
            <div className="kc-filters-chips kiosk-conteo-filter-chips">
              <div className="kc-chip-group" role="group" aria-label="Categoría SX">
                <span className="kc-chip-label">Cat. SX</span>
                <button
                  type="button"
                  className={`kc-chip${audienceFilter === "" ? " is-active" : ""}`}
                  aria-pressed={audienceFilter === ""}
                  onClick={() => setAudienceFilter("")}
                >
                  Todas
                </button>
                {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    className={`kc-chip${audienceFilter === opt.value ? " is-active" : ""}`}
                    aria-pressed={audienceFilter === opt.value}
                    onClick={() => setAudienceFilter(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="kc-chip-group" role="group" aria-label="Cinchos">
                <span className="kc-chip-label">Cinchos</span>
                {CINCHO_FILTER_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.value || "all"}
                    className={`kc-chip kc-chip--info${cinchoFilter === opt.value ? " is-active" : ""}`}
                    aria-pressed={cinchoFilter === opt.value}
                    onClick={() => setCinchoFilter(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {entreCueros ? (
                <div className="kc-chip-group" role="group" aria-label="Variante">
                  <span className="kc-chip-label">Variante</span>
                  {ENTRECUEROS_VARIANT_FILTERS.map((opt) => (
                    <button
                      type="button"
                      key={opt.value || "variant-all"}
                      className={`kc-chip${variantFilter === opt.value ? " is-active" : ""}`}
                      aria-pressed={variantFilter === opt.value}
                      onClick={() => setVariantFilter(opt.value)}
                    >
                      {opt.value === "" ? "Todas" : opt.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {!internalMode && !entreCueros && (
                <label className="kc-switch">
                  <input
                    type="checkbox"
                    checked={hardwareSplitEnabled}
                    onChange={(e) => setHardwareSplitEnabled(e.target.checked)}
                  />
                  <span className="kc-switch-track" aria-hidden="true" />
                  Desglose herraje N/V
                </label>
              )}
            </div>
          </section>

          {/* ── Tabla principal ── */}
          {compact ? (
            <div className="kiosk-conteo-card-list">
              {filteredCategories.length === 0 ? (
                <div className="kc-empty kc-empty--compact">
                  <div>No hay productos que coincidan con los filtros.</div>
                  {hasActiveFilters && (
                    <button type="button" className="kc-link" onClick={clearFilters}>Limpiar filtros</button>
                  )}
                </div>
              ) : (
                filteredCategories.map((category) => (
                  <CategoryGroup
                    key={category.categoryName || category.categoryId || "sin-categoria"}
                    category={category}
                    showKardex={tableShowKardex}
                    kardexColumns={kardexColumns}
                    editedCounts={editedCounts}
                    editedSizeCounts={editedSizeCounts}
                    editedSizeCountsByLocation={editedSizeCountsByLocation}
                    editedHardwareLocationCounts={editedHardwareLocationCounts}
                    editedObservations={editedObservations}
                    onCountChange={handleCountChange}
                    onObservationChange={handleObservationChange}
                    onOpenCinchoModal={setCinchoModalProductId}
                    onOpenHardwareModal={handleOpenHardwareModal}
                    disabled={isCountLocked}
                    vitrineOnlyView={internalMode}
                    hardwareSplitEnabled={nvSplitEnabled && !internalMode}
                    entreCueros={entreCueros}
                    compact
                  />
                ))
              )}
              {filteredTotalGeneral && filteredCategories.length > 0 && (
                <CompactSummary
                  label={`TOTAL GENERAL (${filteredCategories.flatMap((c) => c.rows).length} productos visibles)`}
                  row={filteredTotalGeneral}
                  vitrineOnlyView={internalMode}
                  dark
                />
              )}
            </div>
          ) : (
          <div className="kiosk-conteo-table-wrap">
            <table className="kiosk-conteo-table">
              <CountTableColGroup showKardex={tableShowKardex} kardexColumns={kardexColumns} vitrineOnlyView={internalMode} />
              <thead>
                {/* Fila de grupos */}
                <tr>
                  <th colSpan={PRODUCT_INFO_COLS} className="kiosk-conteo-th kc-th-group kc-th-group--product" style={thStyle}>Producto</th>
                  {tableShowKardex && (
                    <th colSpan={kardexColumns.length} className="kiosk-conteo-th kc-th-group kc-th-group--kardex" style={thStyle}>
                      {isSubcountView ? "Kardex al corte" : "Kardex sistema"}
                    </th>
                  )}
                  <th colSpan={COUNT_LOCATION_KEYS.length} className="kiosk-conteo-th kc-th-group kc-th-group--count" style={thStyle}>
                    Conteo físico por ubicación
                  </th>
                  <th rowSpan={2} className="kiosk-conteo-th kiosk-conteo-sum kc-th-group kc-th-group--total" style={{ ...thStyle, ...sumColStyle }}>Total</th>
                  {!internalMode && (
                    <>
                      <th rowSpan={2} className="kiosk-conteo-th kiosk-conteo-sum kc-th-group kc-th-group--diff" style={{ ...thStyle, ...sumColStyle }}>Dif.</th>
                      <th rowSpan={2} className="kiosk-conteo-th kiosk-conteo-obs kc-th-group kc-th-group--obs" style={{ ...thStyle, minWidth: OBS_COL_MIN_WIDTH }}>Observaciones</th>
                    </>
                  )}
                </tr>
                {/* Fila de columnas */}
                <tr>
                  <th className="kiosk-conteo-th kiosk-conteo-product">Producto / Código</th>
                  <th className="kiosk-conteo-th kiosk-conteo-color">Color</th>
                  <th className="kiosk-conteo-th kiosk-conteo-size">Talla</th>
                  <th className="kiosk-conteo-th kiosk-conteo-tipo">Tipo</th>
                  <th
                    className="kiosk-conteo-th kiosk-conteo-hw"
                    title={entreCueros ? "Marca / Para" : "Herraje nuevo (N) y viejo (V) — sistema y conteo físico"}
                  >
                    {entreCueros ? "Variante" : "Herraje"}
                    {entreCueros ? null : (
                      <div className="kc-th-sub">N · V</div>
                    )}
                  </th>
                  {tableShowKardex && kardexColumns.map((col) => (
                    <th key={col.key} className="kiosk-conteo-th kiosk-conteo-kardex kc-th-kardex" title={col.title}>{col.label}</th>
                  ))}
                  {COUNT_LOCATION_KEYS.map((k) => (
                    <th key={k} className="kiosk-conteo-th kiosk-conteo-loc kc-th-loc">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} className="kc-table-empty">
                      No hay productos que coincidan con los filtros.
                      {hasActiveFilters && (
                        <button type="button" className="kc-link ml-2" onClick={clearFilters}>Limpiar filtros</button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((category) => (
                    <CategoryGroup
                      key={category.categoryName || category.categoryId || "sin-categoria"}
                      category={category}
                      showKardex={tableShowKardex}
                      kardexColumns={kardexColumns}
                      editedCounts={editedCounts}
                      editedSizeCounts={editedSizeCounts}
                      editedSizeCountsByLocation={editedSizeCountsByLocation}
                      editedHardwareLocationCounts={editedHardwareLocationCounts}
                      editedObservations={editedObservations}
                      onCountChange={handleCountChange}
                      onObservationChange={handleObservationChange}
                      onOpenCinchoModal={setCinchoModalProductId}
                      onOpenHardwareModal={handleOpenHardwareModal}
                      disabled={isCountLocked}
                      vitrineOnlyView={internalMode}
                      hardwareSplitEnabled={nvSplitEnabled && !internalMode}
                      entreCueros={entreCueros}
                    />
                  ))
                )}
              </tbody>
              {filteredTotalGeneral && filteredCategories.length > 0 && (
                <tfoot>
                  <SummaryRow
                    label={`TOTAL GENERAL (${filteredCategories.flatMap((c) => c.rows).length} productos visibles)`}
                    row={filteredTotalGeneral}
                    showKardex={tableShowKardex}
                    kardexColumns={kardexColumns}
                    bg="#0f172a"
                    textColor="#fff"
                    bold
                    vitrineOnlyView={internalMode}
                  />
                </tfoot>
              )}
            </table>
          </div>
          )}

          {/* ── Leyenda / guía rápida ── */}
          <div className="kiosk-conteo-hint">
            {!internalMode && (
              <div className="kc-hint-legend">
                <span><span className="kc-hint-sample">0</span> Sin diferencia</span>
                <span><span className="kc-hint-sample is-over">n</span> Sobrante (físico &gt; sistema)</span>
                <span><span className="kc-hint-sample is-short">▼ −n</span> Faltante (físico &lt; sistema)</span>
                <span>Fondo de color solo si |diferencia| ≥ {DIFF_ALERT_THRESHOLD}</span>
              </div>
            )}
            <details className="kc-help">
              <summary>Guía rápida</summary>
              <ul>
                <li><kbd>Enter</kbd> baja a la misma ubicación del siguiente producto; <kbd>Shift</kbd>+<kbd>Enter</kbd> sube.</li>
                {internalMode ? (
                  <>
                    <li>Registra cuántas unidades hay en cada vitrina (V1–V7, E, BO).</li>
                    {entreCueros ? null : <li>Al tocar una vitrina se abre el modal de herraje NUEVO/VIEJO.</li>}
                    <li>Los cinchos FOSS usan el modal de tallas; otros cinchos pueden contar por talla.</li>
                    <li>Exporta a Excel para compartir o archivar el conteo del día.</li>
                  </>
                ) : (
                  <>
                    <li>Observaciones: solo en filas con sobrante o faltante.</li>
                    <li>Haz clic en el nombre de categoría para colapsar/expandir.</li>
                    {!tableShowKardex && <li>Kardex oculto en pantalla — actívalo con &quot;Mostrar Kardex&quot; (Excel/PDF oficiales lo incluyen).</li>}
                    {entreCueros ? (
                      <li>Cada fila es una variante (marca o Niño/Dama). No hay herraje N/V.</li>
                    ) : (
                      <li>Con el desglose N/V activo, al tocar una celda de vitrina (V1–V7, E, BO) se abre el modal herraje NUEVO/VIEJO.</li>
                    )}
                    <li>FOSS cinchos: una fila por talla y color — edite E (vitrina) y BO (bodega). Otros cinchos: edite E por talla.</li>
                  </>
                )}
              </ul>
            </details>
          </div>
        </>
      )}

      <HardwareCountModal
        isOpen={!entreCueros && hardwareModal != null}
        toggle={closeHardwareModal}
        productLabel={hardwareModal?.productLabel}
        locationKey={hardwareModal?.locationKey}
        initialCounts={hardwareModal?.initialCounts}
        onApply={handleApplyHardwareModal}
        disabled={isCountLocked}
      />

      <CinchoCountDetailModal
        isOpen={cinchoModalProductId != null}
        toggle={() => setCinchoModalProductId(null)}
        fossMode={cinchoModalFossMode}
        hardwareSplitEnabled={cinchoModalHardwareSplit}
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
