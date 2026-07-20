import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { formatDateGt, formatDateTimeGt } from "utils/dateTimeHelper";
import { exportConteoToExcel, exportConteoToPdf } from "utils/kioscoConteoExport";
import {
  buildConteoDisplayReport,
  computeConteoRowDiferencia,
  formatConteoDiffArrow,
  formatConteoDiffDisplay,
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
import {
  CINCHO_FILTER_OPTIONS,
  shouldShowInKioskPhysicalCount,
  isCinchoProductRow,
  isFossCinchoProductRow,
  formatCinchoClassification,
  formatFossLocationSizeSummary,
  getHardwareConditionLabel,
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
import HardwareCountModal, {
  buildHardwareLocationCounts,
  syncCountsFromHardware,
} from "./HardwareCountModal";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
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

function conteoStatusMeta(status, internalMode = false) {
  if (internalMode && status === "SAVED") return { label: "Guardado", color: "success" };
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
    // Sumar diffs de fila (computeDiferenciaConteo no es lineal al agregar).
    diferencia: rows.reduce((s, r) => s + Number(r.diferencia || 0), 0),
  };
};

const fmt = (v) => formatDateGt(v, { month: "short" });
const fmtDt = (v) => (v ? formatDateTimeGt(v) : null);

// ─── Columnas fijas para alinear cabecera y datos ─────────────────────────────
function CountTableColGroup({ showKardex, kardexColumns, vitrineOnlyView = false }) {
  return (
    <colgroup>
      <col />
      <col />
      <col />
      <col style={{ width: 88 }} />
      <col style={{ width: 108 }} />
      {showKardex && kardexColumns.map((col) => (
        <col key={col.key} style={{ width: LOC_COL_WIDTH }} />
      ))}
      {COUNT_LOCATION_KEYS.map((k) => (
        <col key={k} style={{ width: LOC_COL_WIDTH }} />
      ))}
      <col style={{ width: SUM_COL_WIDTH }} />
      {!vitrineOnlyView && (
        <>
          <col style={{ width: SUM_COL_WIDTH }} />
          <col style={{ minWidth: OBS_COL_MIN_WIDTH }} />
        </>
      )}
    </colgroup>
  );
}

// ─── Celda de conteo editable ─────────────────────────────────────────────────
function CountCell({ value, onChange, disabled, onOpen, readOnly }) {
  const cellStyle = {
    width: "100%",
    maxWidth: LOC_COL_WIDTH - 8,
    padding: "2px 4px",
    fontSize: 12,
    textAlign: "right",
    border: "1px solid #d1d5db",
    borderRadius: 4,
    background: disabled ? "#f3f4f6" : value > 0 ? "#f0fdf4" : "#fff",
    boxSizing: "border-box",
  };

  if (readOnly && onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        style={{
          ...cellStyle,
          cursor: disabled ? "not-allowed" : "pointer",
          display: "block",
        }}
      >
        {value ?? 0}
      </button>
    );
  }

  return (
    <input
      type="number"
      min="0"
      step="1"
      value={value ?? 0}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      onFocus={onOpen}
      onClick={onOpen}
      readOnly={readOnly}
      disabled={disabled}
      style={cellStyle}
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
function HardwareSplitSummaryCell({ row, hardwareLocationCounts, useHardwareSplit, vitrineOnlyView }) {
  if (!useHardwareSplit) {
    const label = getHardwareConditionLabel(row.hardwareCondition);
    return <span>{label !== "—" ? label : "—"}</span>;
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
    return <span style={{ color: "#d1d5db" }}>—</span>;
  }
  if (disabled) {
    return (
      <span style={{ fontSize: 11, color: value ? "#374151" : "#9ca3af", whiteSpace: "pre-wrap" }}>
        {value || "—"}
      </span>
    );
  }
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Motivo / nota"
      style={{
        width: "100%",
        minWidth: OBS_COL_MIN_WIDTH - 8,
        padding: "2px 6px",
        fontSize: 11,
        border: "1px solid #d1d5db",
        borderRadius: 4,
        background: value ? "#fffbeb" : "#fff",
        boxSizing: "border-box",
      }}
    />
  );
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
    if (isFoss) {
      return locKey !== CINCHO_VITRINE_LOCATION && locKey !== CINCHO_WAREHOUSE_LOCATION;
    }
    return locKey !== CINCHO_VITRINE_LOCATION;
  };
  const diffArrow = formatConteoDiffArrow(diferencia);
  const diffLabel = formatConteoDiffDisplay(diferencia);
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
      <td style={{ fontSize: 11, color: "#374151", whiteSpace: "nowrap" }}>
        {formatCinchoClassification(row)}
      </td>
      <td style={{ fontSize: 11, color: "#374151", verticalAlign: "middle" }}>
        {hardwareSplitEnabled ? (
          <HardwareSplitSummaryCell
            row={row}
            hardwareLocationCounts={editedHardwareLocationCounts?.[rKey] ?? row.hardwareLocationCounts}
            useHardwareSplit={useHardwareModal}
            vitrineOnlyView={vitrineOnlyView}
          />
        ) : (
          <span style={{ color: "#9ca3af" }}>—</span>
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
            readOnly={useHardwareModal && !countLocationDisabled(locKey)}
            onOpen={
              useHardwareModal && !disabled && !countLocationDisabled(locKey)
                ? () => onOpenHardwareModal(locKey)
                : undefined
            }
          />
        </td>
      ))}
      <td style={{ ...sumColStyle, fontWeight: 600, fontSize: 12 }}>{total}</td>
      {!vitrineOnlyView && (
        <>
          <td style={{
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

// ─── Fila de subtotal / total ─────────────────────────────────────────────────
function SummaryRow({ label, row, showKardex, kardexColumns, bg = "#f3f4f6", textColor = "#111", bold = false, vitrineOnlyView = false }) {
  const style = { background: bg, fontSize: 11, fontWeight: bold ? 700 : 600, color: textColor };
  const diffArrow = formatConteoDiffArrow(row.diferencia);
  const diffLabel = formatConteoDiffDisplay(row.diferencia ?? 0);
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
      {!vitrineOnlyView && (
        <>
          <td style={{
            ...style,
            ...sumColStyle,
            color: diffColor(row.diferencia ?? 0),
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

function DifferenceSummary({ totals, breakdown }) {
  if (!totals) return null;
  const net = breakdown.sobrante - breakdown.faltante;
  const cards = [
    {
      label: "Total sobrante",
      value: formatConteoDiffDisplay(breakdown.sobrante),
      detail: `${breakdown.conSobrante} producto${breakdown.conSobrante !== 1 ? "s" : ""} con físico > sistema`,
      border: "#bbf7d0",
      background: "#f0fdf4",
      labelColor: "#15803d",
      valueColor: "#16a34a",
    },
    {
      label: "Total faltante",
      value: `−${breakdown.faltante}`,
      detail: `${breakdown.conFaltante} producto${breakdown.conFaltante !== 1 ? "s" : ""} con físico < sistema`,
      border: "#fecaca",
      background: "#fef2f2",
      labelColor: "#b91c1c",
      valueColor: "#dc2626",
    },
    {
      label: "Neto (Dif. general)",
      value: formatConteoDiffDisplay(net),
      detail: `Sobrante − faltante = ${formatConteoDiffDisplay(net)}`,
      border: "#e5e7eb",
      background: "#f9fafb",
      labelColor: "#4b5563",
      valueColor: diffColor(totals.diferencia ?? 0),
    },
  ];

  return (
    <div className="mb-3" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "stretch" }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            flex: "1 1 200px",
            border: `1px solid ${card.border}`,
            background: card.background,
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          <div style={{ fontSize: 11, color: card.labelColor, fontWeight: 600 }}>{card.label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: card.valueColor, lineHeight: 1.2 }}>
            {card.value}
          </div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{card.detail}</div>
        </div>
      ))}
    </div>
  );
}

function ColorLegendChip({ item }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 150 }}>
      <span style={{ fontSize: 11, color: "#374151", fontWeight: 600, flex: 1 }}>{item.label}</span>
      <span
        title={item.label}
        style={{
          width: 28,
          height: 16,
          borderRadius: 3,
          border: "1px solid #9ca3af",
          background: hexCss(item.color),
          flexShrink: 0,
        }}
      />
    </div>
  );
}

function ConteoColorLegend() {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 20px",
        marginLeft: "auto",
        alignItems: "flex-start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {CONTEO_COLOR_LEGEND_LEFT.map((item) => (
          <ColorLegendChip key={item.label} item={item} />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {CONTEO_COLOR_LEGEND_RIGHT.map((item) => (
          <ColorLegendChip key={item.label} item={item} />
        ))}
      </div>
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

  return (
    <>
      <tr
        style={{ background: "#e5e7eb", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <td
          colSpan={PRODUCT_INFO_COLS + (showKardex ? kardexColumns.length : 0) + COUNT_LOCATION_KEYS.length + trailingCols}
          style={{ fontWeight: 700, fontSize: 12, padding: "5px 8px" }}
        >
          <span style={{ marginRight: 6 }}>{collapsed ? "▶" : "▼"}</span>
          {category.categoryName}
          <span style={{ marginLeft: 8, fontWeight: 400, color: "#6b7280", fontSize: 11 }}>
            {category.rows.length} producto{category.rows.length !== 1 ? "s" : ""}
          </span>
          {hasDiff && !vitrineOnlyView && (
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
            const observation = resolveRowObservation(row, editedObservations);
            return (
              <DataRow
                key={rKey}
                row={row}
                showKardex={showKardex}
                kardexColumns={kardexColumns}
                counts={counts}
                physicalSizes={physicalSizes}
                physicalSizesByLocation={physicalSizesByLocation}
                observation={observation}
                onCountChange={(locKey, v) => onCountChange(rKey, locKey, v)}
                onObservationChange={(v) => onObservationChange(rKey, v)}
                onOpenCinchoModal={onOpenCinchoModal}
                onOpenHardwareModal={(locKey) => onOpenHardwareModal(rKey, locKey, row)}
                disabled={disabled}
                editedHardwareLocationCounts={editedHardwareLocationCounts}
                vitrineOnlyView={vitrineOnlyView}
                hardwareSplitEnabled={hardwareSplitEnabled}
              />
            );
          })}
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
function KioskInventoryCountReport({ locationId, internalMode = false }) {
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
        const rows = category.rows.filter(
          (row) =>
            shouldShowInKioskPhysicalCount(row)
            && productMatchesSearchFilter(row, debouncedSearch)
            && productMatchesAudienceFilter(row, audienceFilter)
            && productMatchesCinchoFilter(row, cinchoFilter)
        );
        if (rows.length === 0) return null;
        const rowsWithLiveTotals = rows.map((row) =>
          withLiveRowTotals(row, editedCounts, editedSizeCounts, editedSizeCountsByLocation)
        );
        return { ...category, rows: rowsWithLiveTotals, subtotal: sumFilteredRows(rowsWithLiveTotals) };
      })
      .filter(Boolean);
  }, [displayReport, debouncedSearch, audienceFilter, cinchoFilter, editedCounts, editedSizeCounts, editedSizeCountsByLocation]);

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
    if (!hardwareSplitEnabled || !cinchoModalRows.length) return false;
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
    hardwareSplitEnabled,
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
  }, [locationId, loadHistorial, internalMode]);

  const openReport = (data, { isPrincipal = true } = {}) => {
    setReport(data);
    lastSyncSinceRef.current = new Date();
    setLiveParticipants([]);
    setAutoSaveStatus("idle");
    setRemoteSyncNotice("");
    if (isPrincipal && data?.reportType !== "SUBCONTEO") {
      setPrincipalReport(data);
      if (data?.periodFrom) {
        setSubcountAsOf((prev) => prev || data.periodTo || "");
      }
    }
    setEditedCounts({});
    setEditedSizeCounts({});
    setEditedSizeCountsByLocation({});
    setEditedHardwareLocationCounts({});
    setEditedObservations({});
    setReviewNotes(data.notes || "");
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
      productLabel: `${row.productCode || ""} ${row.productName || ""}`.trim(),
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
      reportType: report.reportType || (report.asOfDate ? "SUBCONTEO" : data.reportType),
      asOfDate: report.asOfDate ?? data.asOfDate,
    };
  }, [report, exportReport, displayReport]);

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

  return (
    <div>
      {internalMode && (
        <Alert color="info" className="mb-3" style={{ fontSize: 13 }}>
          <strong>Mi conteo — control interno.</strong> Solo vitrinas y total físico; no compara con el sistema ni
          reemplaza el conteo oficial de supervisión. Puedes exportar a Excel cuando termines.
        </Alert>
      )}

      {!internalMode && (
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
      )}

      {/* ── Historial de sesiones ── */}
      {locationId && (
        <div style={{ marginBottom: 20 }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <strong style={{ fontSize: 13 }}>
              {internalMode ? "Historial de conteos internos" : "Sesiones de conteo existentes"}
            </strong>
            <div className="d-flex align-items-center" style={{ gap: 12 }}>
              {!internalMode && (
              <Button
                color="link"
                size="sm"
                style={{ padding: 0, fontSize: 12 }}
                onClick={handleOpenRecipients}
              >
                ✉ Destinatarios de alertas
              </Button>
              )}
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
              {internalMode
                ? "Aún no hay snapshots guardados. Usa «Guardar snapshot» cuando termines tu conteo del día."
                : "No hay sesiones registradas para este kiosko. Crea la primera con el formulario de arriba."}
            </Alert>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <Table size="sm" bordered responsive style={{ fontSize: 12, marginBottom: 0 }}>
                <thead style={{ background: "#f3f4f6" }}>
                  <tr>
                    <th>{internalMode ? "Fecha" : "Período"}</th>
                    <th>Estado</th>
                    <th>{internalMode ? "Encargada" : "Generado por"}</th>
                    <th>{internalMode ? "Guardado el" : "Fecha creación"}</th>
                    {!internalMode && <th>Revisado por</th>}
                    <th>Notas</th>
                    <th></th>
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
                        style={{
                          background: isActive ? "#eff6ff" : undefined,
                          boxShadow: hasPendingDiff ? "inset 3px 0 0 #f97316" : undefined,
                        }}
                      >
                        <td style={{ whiteSpace: "nowrap", fontWeight: isActive ? 700 : 400 }}>
                          {internalMode
                            ? fmt(sessionDate || s.periodFrom)
                            : <>{fmt(s.periodFrom)} — {fmt(s.periodTo)}</>}
                        </td>
                        <td>
                          <Badge
                            color={conteoStatusMeta(s.status, internalMode).color}
                            style={{ fontSize: 10 }}
                          >
                            {conteoStatusMeta(s.status, internalMode).label}
                          </Badge>
                          {hasPendingDiff && (
                            <Badge color="danger" style={{ fontSize: 10, marginLeft: 4 }} title="Diferencia sin resolver">
                              Dif. {s.maxAbsDiff}
                            </Badge>
                          )}
                        </td>
                        <td>{(internalMode ? s.createdByName : s.generatedByName) || "—"}</td>
                        <td style={{ whiteSpace: "nowrap", color: "#6b7280" }}>
                          {internalMode
                            ? (s.savedAt ? fmtDt(s.savedAt) : "—")
                            : (s.generatedAt ? fmtDt(s.generatedAt) : "—")}
                        </td>
                        {!internalMode && <td>{s.reviewedByName || "—"}</td>}
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
          {internalMode ? (
            loading ? "Cargando conteo interno..." : "No se pudo cargar el conteo interno."
          ) : locationId ? (
            <>Selecciona el rango de fechas y presiona <strong>Abrir conteo</strong> para crear uno nuevo, o carga uno existente de arriba.</>
          ) : (
            <>Selecciona un <strong>kiosko</strong> arriba para ver y gestionar los conteos físicos.</>
          )}
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
            alignItems: "flex-start",
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", alignItems: "center", flex: "1 1 280px" }}>
              <Badge
                color={statusMeta.color}
                style={{ fontSize: 11, padding: "4px 8px" }}
              >
                {statusMeta.label}
              </Badge>
              {internalMode ? (
                <span style={{ fontSize: 12, color: "#374151" }}>
                  Fecha <strong>{report.periodFrom ? fmt(report.periodFrom) : "—"}</strong>
                </span>
              ) : (
                <>
                  <span style={{ fontSize: 12, color: "#374151" }}>
                    <strong>{report.periodFrom ? fmt(report.periodFrom) : "—"}</strong>
                    {" — "}
                    <strong>{report.periodTo ? fmt(report.periodTo) : "—"}</strong>
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
                </>
              )}
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                {internalMode ? "Encargada" : "Generado por"}{" "}
                <strong style={{ color: "#111" }}>{report.generatedByName || "—"}</strong>
                {report.generatedAt && <> el {fmtDt(report.generatedAt)}</>}
              </span>
            </div>
            {!internalMode && <ConteoColorLegend />}
          </div>

          {!internalMode && isDraft && !isSubcountView && (
            <Alert color="light" className="border mb-3 py-2" style={{ fontSize: 12 }}>
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 10 }}>
                <strong style={{ color: "#374151" }}>Sesión en vivo</strong>
                {liveParticipants.length > 0 ? (
                  liveParticipants.map((p) => (
                    <Badge
                      key={p.userId}
                      color={p.self ? "primary" : "secondary"}
                      style={{ fontSize: 11 }}
                    >
                      {p.self ? "Tú" : (p.userName || "Usuario")}
                    </Badge>
                  ))
                ) : (
                  <span style={{ color: "#6b7280" }}>Conectando…</span>
                )}
                <span style={{ color: "#9ca3af" }}>|</span>
                {autoSaveStatus === "saving" && (
                  <span style={{ color: "#6b7280" }}>
                    <Spinner size="sm" className="mr-1" /> Auto-guardando…
                  </span>
                )}
                {autoSaveStatus === "saved" && lastAutoSaveAt && (
                  <span style={{ color: "#15803d" }}>
                    Auto-guardado {formatDateTimeGt(lastAutoSaveAt)}
                  </span>
                )}
                {autoSaveStatus === "error" && (
                  <span style={{ color: "#b91c1c" }}>Error en auto-guardado — usa Guardar conteo</span>
                )}
                {autoSaveStatus === "idle" && (
                  <span style={{ color: "#6b7280" }}>Auto-guardado cada 45 s</span>
                )}
              </div>
              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 11 }}>
                Dos personas pueden contar el mismo borrador: los cambios se sincronizan cada 30 s.
                No editen la misma celda a la vez; divide vitrinas o categorías si puedes.
              </div>
            </Alert>
          )}

          {remoteSyncNotice && (
            <Alert color="info" className="py-2 mb-3" style={{ fontSize: 12 }}>
              {remoteSyncNotice}
            </Alert>
          )}

          {!internalMode && filteredCategories.length > 0 && (
            <DifferenceSummary totals={filteredTotalGeneral} breakdown={diffBreakdown} />
          )}

          {!internalMode && showDiffBanner && (
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
                {!internalMode && (
                  <>
                    <span style={{ width: 1, background: "#d1d5db", margin: "0 4px" }} />
                    <FormGroup check inline className="mb-0 ml-1">
                      <Label check style={{ fontSize: 12, userSelect: "none", cursor: "pointer" }}>
                        <Input
                          type="checkbox"
                          checked={hardwareSplitEnabled}
                          onChange={(e) => setHardwareSplitEnabled(e.target.checked)}
                          style={{ marginTop: 2 }}
                        />
                        {" "}Desglose herraje N/V
                      </Label>
                    </FormGroup>
                  </>
                )}
              </div>
            </Col>
          </Row>

          {/* ── Subconteo / inventario a fecha ── */}
          {!internalMode && !isSubcountView && report && (
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
                    <Button color="success" size="sm" onClick={() => void handleSave()} disabled={saving || finalizing || savingSnapshot}>
                      {saving ? <Spinner size="sm" /> : internalMode ? "💾 Guardar borrador" : "💾 Guardar conteo"}
                    </Button>
                    {internalMode ? (
                      <Button
                        color="primary"
                        size="sm"
                        onClick={() => void handleSaveInternalSnapshot()}
                        disabled={saving || savingSnapshot || isCountLocked}
                      >
                        {savingSnapshot ? <Spinner size="sm" /> : "📌 Guardar snapshot del día"}
                      </Button>
                    ) : (
                    <Button
                      color="warning"
                      size="sm"
                      onClick={() => void handleFinalize()}
                      disabled={saving || finalizing}
                    >
                      {finalizing ? <Spinner size="sm" /> : "✓ Terminar conteo físico"}
                    </Button>
                    )}
                  </>
                )}
                {!internalMode && report.status === "CONTADO" && !isSubcountView && (
                  <Button color="info" size="sm" outline onClick={() => setShowReviewBox((v) => !v)} disabled={saving}>
                    ✔ Marcar como revisado
                  </Button>
                )}
                {!internalMode && report.status === "REVISADO" && !isSubcountView && (
                  <Button color="danger" size="sm" outline onClick={() => void handleClose()} disabled={closing}>
                    {closing ? <Spinner size="sm" /> : "🔒 Cerrar conteo"}
                  </Button>
                )}
                <ButtonGroup size="sm">
                  <Button color="secondary" outline onClick={handleExportExcel}>
                    {internalMode ? "⬇ Excel conteo interno" : isSubcountView ? "⬇ Excel subconteo" : "⬇ Excel"}
                  </Button>
                  {!internalMode && (
                    <Button color="secondary" outline onClick={handleExportPdf}>
                      🖨 PDF / Imprimir
                    </Button>
                  )}
                </ButtonGroup>
                {!internalMode && (
                <Button
                  color="light"
                  size="sm"
                  style={{ border: "1px solid #d1d5db" }}
                  onClick={() => setShowKardex((v) => !v)}
                  title="Mostrar u ocultar las columnas del Kardex del sistema"
                >
                  {showKardex ? "Ocultar Kardex" : "Mostrar Kardex"}
                </Button>
                )}
              </div>
            </Col>
          </Row>

          {internalMode && isDraft && (
            <Row className="mb-3">
              <Col md="6">
                <FormGroup className="mb-0">
                  <Label style={{ fontSize: 12 }}>Notas del snapshot (opcional)</Label>
                  <Input
                    type="textarea"
                    rows={2}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Ej. turno tarde, vitrina E revisada..."
                  />
                </FormGroup>
              </Col>
            </Row>
          )}

          {internalMode && report?.status === "SAVED" && (
            <Alert color="secondary" className="mb-3" style={{ fontSize: 12 }}>
              Snapshot guardado — solo lectura. Abre el borrador de hoy para un nuevo conteo del día.
            </Alert>
          )}

          {!internalMode && report.status === "CONTADO" && (
            <Alert color="info" className="mb-3" style={{ fontSize: 12 }}>
              Conteo físico terminado. Las vitrinas están bloqueadas; un supervisor puede marcarlo como revisado.
            </Alert>
          )}

          {!internalMode && isClosed && (
            <Alert color="secondary" className="mb-3" style={{ fontSize: 12 }}>
              Este conteo está cerrado y es de solo lectura. Puedes exportarlo, pero no editarlo.
            </Alert>
          )}

          {/* ── Panel de revisión ── */}
          {!internalMode && showReviewBox && (
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
              <CountTableColGroup showKardex={tableShowKardex} kardexColumns={kardexColumns} vitrineOnlyView={internalMode} />
              <thead>
                {/* Fila de grupos */}
                <tr style={{ background: "#f3f4f6" }}>
                  <th colSpan={PRODUCT_INFO_COLS} style={thStyle}>Producto</th>
                  {tableShowKardex && (
                    <th colSpan={kardexColumns.length} style={{ ...thStyle, background: "#e0e7ff", textAlign: "center" }}>
                      {isSubcountView ? "Kardex al corte" : "Kardex sistema"}
                    </th>
                  )}
                  <th colSpan={COUNT_LOCATION_KEYS.length} style={{ ...thStyle, background: "#dcfce7", textAlign: "center" }}>
                    Conteo físico por ubicación
                  </th>
                  <th rowSpan={2} style={{ ...thStyle, ...sumColStyle, background: "#fef9c3", textAlign: "center", verticalAlign: "middle" }}>Total</th>
                  {!internalMode && (
                    <>
                      <th rowSpan={2} style={{ ...thStyle, ...sumColStyle, background: "#fee2e2", textAlign: "center", verticalAlign: "middle" }}>Dif.</th>
                      <th rowSpan={2} style={{ ...thStyle, background: "#fffbeb", textAlign: "center", verticalAlign: "middle", minWidth: OBS_COL_MIN_WIDTH }}>Observaciones</th>
                    </>
                  )}
                </tr>
                {/* Fila de columnas */}
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thStyle}>Producto / Código</th>
                  <th style={thStyle}>Color</th>
                  <th style={thStyle}>Talla</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={{ ...thStyle, minWidth: 96 }} title="Herraje nuevo (N) y viejo (V) — sistema y conteo físico">
                    Herraje
                    <div style={{ fontWeight: 400, fontSize: 9, color: "#6b7280" }}>N · V</div>
                  </th>
                  {tableShowKardex && kardexColumns.map((col) => (
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
                      hardwareSplitEnabled={hardwareSplitEnabled && !internalMode}
                    />
                  ))
                )}
              </tbody>
              {filteredTotalGeneral && filteredCategories.length > 0 && (
                <tfoot style={{ position: "sticky", bottom: 0, zIndex: 2 }}>
                  <SummaryRow
                    label={`TOTAL GENERAL (${filteredCategories.flatMap((c) => c.rows).length} productos visibles)`}
                    row={filteredTotalGeneral}
                    showKardex={tableShowKardex}
                    kardexColumns={kardexColumns}
                    bg="#1f2937"
                    textColor="#fff"
                    bold
                    vitrineOnlyView={internalMode}
                  />
                </tfoot>
              )}
            </table>
          </div>

          {/* ── Leyenda ── */}
          <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
            {internalMode ? (
              <>
                <span>Registra cuántas unidades hay en cada vitrina (V1–V7, E, BO).</span>
                <span>Al tocar una vitrina se abre el modal de herraje NUEVO/VIEJO.</span>
                <span>Los cinchos FOSS usan el modal de tallas; otros cinchos pueden contar por talla.</span>
                <span>Exporta a Excel para compartir o archivar el conteo del día.</span>
              </>
            ) : (
              <>
            <span><span style={{ color: "#111827", fontWeight: 700 }}>0</span> Sin diferencia</span>
            <span>
              <span style={{ color: "#16a34a", fontWeight: 700, background: "#f0fdf4", padding: "1px 4px" }}>n</span>{" "}
              Sobrante (físico &gt; sistema, número en verde)
            </span>
            <span>
              <span style={{ color: "#dc2626", fontWeight: 700, background: "#fef2f2", padding: "1px 4px" }}>▼ −n</span>{" "}
              Faltante (físico &lt; sistema)
            </span>
            <span>Fondo solo si |diferencia| ≥ {DIFF_ALERT_THRESHOLD}</span>
            <span>Observaciones: solo en filas con sobrante o faltante</span>
            <span>Haz clic en el nombre de categoría para colapsar/expandir</span>
            {!tableShowKardex && <span>Kardex oculto en pantalla — actívalo con &quot;Mostrar Kardex&quot; (Excel/PDF oficiales lo incluyen)</span>}
            <span>Al tocar una celda de vitrina (V1–V7, E, BO) se abre el modal herraje NUEVO/VIEJO.</span>
            <span>FOSS cinchos: una fila por talla y color — edite E (vitrina) y BO (bodega). Otros cinchos: edite E por talla.</span>
              </>
            )}
          </div>
        </>
      )}

      <HardwareCountModal
        isOpen={hardwareModal != null}
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
