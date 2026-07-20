import {
  computeDiferenciaConteo,
  resolveLivePhysicalTotal,
  sumDisplayRows,
} from "utils/kioscoConteoDisplay";
import {
  isFossCinchoProductRow,
  persistKey,
  rowKey,
} from "utils/productCinchoHelper";

export function collectDirtyPersistKeys(
  editedCounts,
  editedSizeCounts,
  editedSizeCountsByLocation,
  editedHardwareLocationCounts,
  editedObservations,
  allReportRows
) {
  const dirtyPersistKeys = new Set();
  const markDirty = (key) => {
    const match = allReportRows.find((r) => rowKey(r) === key);
    if (match) dirtyPersistKeys.add(persistKey(match));
  };
  Object.keys(editedCounts || {}).forEach(markDirty);
  Object.keys(editedSizeCounts || {}).forEach(markDirty);
  Object.keys(editedSizeCountsByLocation || {}).forEach(markDirty);
  Object.keys(editedHardwareLocationCounts || {}).forEach(markDirty);
  Object.keys(editedObservations || {}).forEach(markDirty);
  return dirtyPersistKeys;
}

function mergeRowFromSyncItem(row, item) {
  let counts = row.counts;
  let physicalSizes = row.physicalSizes;
  let physicalSizesByLocation = row.physicalSizesByLocation;
  let hardwareLocationCounts = row.hardwareLocationCounts;
  let observation = row.observation;

  if (row.sizeLabel) {
    if (item.physicalSizes && item.physicalSizes[row.sizeLabel] != null) {
      counts = { ...(row.counts || {}), E: Number(item.physicalSizes[row.sizeLabel] || 0) };
    }
    if (item.physicalSizesByLocation && isFossCinchoProductRow(row)) {
      const eQty = item.physicalSizesByLocation.E?.[row.sizeLabel] ?? 0;
      const boQty = item.physicalSizesByLocation.BO?.[row.sizeLabel] ?? 0;
      counts = { ...(row.counts || {}), E: eQty, BO: boQty };
    }
    if (item.sizeObservations && Object.prototype.hasOwnProperty.call(item.sizeObservations, row.sizeLabel)) {
      observation = item.sizeObservations[row.sizeLabel] || null;
    }
  } else {
    if (item.counts) counts = { ...item.counts };
    if (item.physicalSizes) physicalSizes = { ...item.physicalSizes };
    if (item.physicalSizesByLocation) {
      physicalSizesByLocation = item.physicalSizesByLocation;
    }
    if (item.hardwareLocationCounts) {
      hardwareLocationCounts = item.hardwareLocationCounts;
    }
    if (item.observation != null) observation = item.observation;
  }

  const merged = {
    ...row,
    counts,
    physicalSizes,
    physicalSizesByLocation,
    hardwareLocationCounts,
    observation,
  };
  const total = resolveLivePhysicalTotal(
    merged,
    counts,
    physicalSizes,
    physicalSizesByLocation
  );
  return {
    ...merged,
    total,
    diferencia: computeDiferenciaConteo(total, merged.inventarioFinal, merged.salidaDevolucion),
  };
}

/** Aplica cambios remotos sin pisar filas con edición local pendiente. */
export function applySyncItemsToReport(report, items, dirtyPersistKeys) {
  if (!report?.categories?.length || !items?.length) {
    return { report, mergedCount: 0, mergedBy: null };
  }

  const itemByPk = new Map(
    items.map((item) => [`${item.productId}-${item.colorId || ""}`, item])
  );
  let mergedCount = 0;
  let mergedBy = null;

  const categories = report.categories.map((category) => ({
    ...category,
    rows: category.rows.map((row) => {
      const pk = persistKey(row);
      if (dirtyPersistKeys.has(pk)) return row;
      const item = itemByPk.get(pk);
      if (!item) return row;
      mergedCount += 1;
      if (!mergedBy && item.updatedByName) {
        mergedBy = item.updatedByName;
      }
      return mergeRowFromSyncItem(row, item);
    }),
  }));

  const categoriesWithTotals = categories.map((category) => ({
    ...category,
    subtotal: sumDisplayRows(category.rows),
  }));
  const allRows = categoriesWithTotals.flatMap((c) => c.rows);

  return {
    report: {
      ...report,
      categories: categoriesWithTotals,
      totalGeneral: allRows.length ? sumDisplayRows(allRows) : report.totalGeneral,
    },
    mergedCount,
    mergedBy,
  };
}

export const LIVE_SESSION_INTERVAL_MS = 30000;
export const AUTO_SAVE_INTERVAL_MS = 45000;

/** Formato ISO local para el parámetro since del backend (sin zona horaria). */
export function formatSyncSince(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
