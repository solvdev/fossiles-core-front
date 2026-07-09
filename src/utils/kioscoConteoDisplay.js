import { getProductAudienceLabel, normalizeAudienceCategory } from "utils/productAudienceHelper";
import {
  isCinchoProductRow,
  isFossCinchoProductRow,
  isPackagingProductCode,
  sortSizeKeys,
} from "utils/productCinchoHelper";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
const PACKAGING_KEY = "PACKAGING";

const rowTotal = (counts) =>
  COUNT_LOCATION_KEYS.reduce((sum, key) => sum + Number((counts || {})[key] || 0), 0);

export const sumDisplayRows = (rows) => {
  const totalCounts = {};
  COUNT_LOCATION_KEYS.forEach((key) => {
    totalCounts[key] = rows.reduce((sum, row) => sum + Number((row.counts || {})[key] || 0), 0);
  });
  const sumField = (field) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
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

const isWalletCategory = (name) => {
  if (!name || name === "Empaques") return false;
  return String(name).toUpperCase().includes("BILLETERA");
};

const collectSizeKeys = (row) => {
  const keys = new Set();
  Object.keys(row?.systemSizes || {}).forEach((size) => keys.add(size));
  Object.keys(row?.physicalSizes || {}).forEach((size) => keys.add(size));
  Object.values(row?.physicalSizesByLocation || {}).forEach((locSizes) => {
    Object.keys(locSizes || {}).forEach((size) => keys.add(size));
  });
  return sortSizeKeys(keys);
};

const resolvePhysicalTotalForSize = (row, size, counts) => {
  if (isFossCinchoProductRow(row) && row.physicalSizesByLocation) {
    const vitrine = Number(row.physicalSizesByLocation.E?.[size] || 0);
    const warehouse = Number(row.physicalSizesByLocation.BO?.[size] || 0);
    if (vitrine + warehouse > 0) return vitrine + warehouse;
  }
  const physical = Number(row.physicalSizes?.[size] || 0);
  if (physical > 0) return physical;
  return rowTotal(counts);
};

const buildCountsForSize = (row, size) => {
  const counts = {};
  if (isFossCinchoProductRow(row) && row.physicalSizesByLocation) {
    counts.E = Number(row.physicalSizesByLocation.E?.[size] || 0);
    counts.BO = Number(row.physicalSizesByLocation.BO?.[size] || 0);
    COUNT_LOCATION_KEYS.forEach((key) => {
      if (!(key in counts)) counts[key] = 0;
    });
    return counts;
  }

  const physical = Number(row.physicalSizes?.[size] || 0);
  if (physical > 0) {
    COUNT_LOCATION_KEYS.forEach((key) => {
      counts[key] = key === "E" ? physical : 0;
    });
    return counts;
  }

  const sizeKeys = collectSizeKeys(row);
  const baseCounts = row.counts || {};
  if (sizeKeys.length === 1) {
    COUNT_LOCATION_KEYS.forEach((key) => {
      counts[key] = Number(baseCounts[key] || 0);
    });
    return counts;
  }

  COUNT_LOCATION_KEYS.forEach((key) => {
    counts[key] = 0;
  });
  return counts;
};

const shouldExpandCinchoRow = (row) => {
  if (row?.sizeLabel) return false;
  if (row?.packaging || isPackagingProductCode(row?.productCode)) return false;
  if (!isCinchoProductRow(row)) return false;
  return collectSizeKeys(row).length > 0;
};

const expandCinchoRowBySizes = (row) => {
  if (!shouldExpandCinchoRow(row)) return [row];

  const sizeKeys = collectSizeKeys(row);
  return sizeKeys.map((size, index) => {
    const sysQty = Number(row.systemSizes?.[size] || 0);
    const counts = buildCountsForSize(row, size);
    const total = resolvePhysicalTotalForSize(row, size, counts);
    const inventarioFinal = sysQty;

    return {
      ...row,
      sizeLabel: size,
      sizesSummary: size,
      physicalSizesSummary: String(total),
      systemSizes: sysQty > 0 ? { [size]: sysQty } : null,
      physicalSizes:
        row.physicalSizes?.[size] != null ? { [size]: Number(row.physicalSizes[size]) } : null,
      physicalSizesByLocation: buildSingleSizeByLocation(row.physicalSizesByLocation, size),
      inventarioInicial: index === 0 ? Number(row.inventarioInicial || 0) : 0,
      comprasAjustes: index === 0 ? Number(row.comprasAjustes || 0) : 0,
      anulacionCompras: index === 0 ? Number(row.anulacionCompras || 0) : 0,
      entradas: index === 0 ? Number(row.entradas || 0) : 0,
      ventas: index === 0 ? Number(row.ventas || 0) : 0,
      anulacionVenta: index === 0 ? Number(row.anulacionVenta || 0) : 0,
      salida: index === 0 ? Number(row.salida || 0) : 0,
      inventarioFinal,
      counts,
      total,
      diferencia: inventarioFinal - total,
    };
  });
};

const buildSingleSizeByLocation = (byLocation, size) => {
  if (!byLocation) return null;
  const result = {};
  ["E", "BO"].forEach((loc) => {
    const qty = Number(byLocation?.[loc]?.[size] || 0);
    if (qty > 0) result[loc] = { [size]: qty };
  });
  return Object.keys(result).length ? result : null;
};

const resolveSourceCategory = (row, parentCategory) => ({
  ...row,
  sourceCategoryId: row.productCategoryId ?? parentCategory?.categoryId ?? null,
  sourceCategoryName:
    row.productCategoryName
    || parentCategory?.categoryName
    || "Sin categoría",
});

const resolveDisplayCategoryKey = (row) => {
  if (row.packaging || isPackagingProductCode(row.productCode)) {
    return PACKAGING_KEY;
  }
  const categoryName = row.sourceCategoryName || "";
  if (isWalletCategory(categoryName)) {
    const audience = normalizeAudienceCategory(row.audienceCategory);
    const categoryId = row.sourceCategoryId ?? "0";
    return `WALLET:${categoryId}:${audience}`;
  }
  const categoryId = row.sourceCategoryId ?? "NONE";
  return `CAT:${categoryId}`;
};

const resolveDisplayCategoryName = (key, row) => {
  if (PACKAGING_KEY === key) return "Empaques";
  if (key.startsWith("WALLET:")) {
    const audience = key.split(":")[2];
    const baseName = String(row.sourceCategoryName || "Billeteras").split(" — ")[0];
    return `${baseName} — ${getProductAudienceLabel(audience)}`;
  }
  return row.sourceCategoryName || "Sin categoría";
};

const resolveDisplayCategoryId = (key, row) => {
  if (PACKAGING_KEY === key || key === "CAT:NONE") return null;
  if (key.startsWith("WALLET:")) return row.sourceCategoryId ?? null;
  return row.sourceCategoryId ?? null;
};

/**
 * Reagrupa el reporte de conteo físico: Empaques aparte, billeteras por público,
 * cinchos con una fila por talla y color.
 */
export function buildConteoDisplayReport(report) {
  if (!report?.categories?.length) return report;

  const flatRows = report.categories.flatMap((category) =>
    (category.rows || []).map((row) => resolveSourceCategory(row, category))
  );

  const expandedRows = flatRows.flatMap((row) => expandCinchoRowBySizes(row));

  const rowsByKey = new Map();
  const namesByKey = new Map();

  expandedRows.forEach((row) => {
    const key = resolveDisplayCategoryKey(row);
    namesByKey.set(key, resolveDisplayCategoryName(key, row));
    if (!rowsByKey.has(key)) rowsByKey.set(key, []);
    rowsByKey.get(key).push(row);
  });

  const orderedKeys = [...rowsByKey.keys()].sort((left, right) =>
    namesByKey.get(left).localeCompare(namesByKey.get(right), "es", { sensitivity: "base" })
  );

  const categories = orderedKeys.map((key) => {
    const rows = rowsByKey.get(key);
    return {
      categoryId: resolveDisplayCategoryId(key, rows[0]),
      categoryName: namesByKey.get(key),
      rows,
      subtotal: sumDisplayRows(rows),
    };
  });

  const allRows = categories.flatMap((category) => category.rows);

  return {
    ...report,
    categories,
    totalGeneral: allRows.length ? sumDisplayRows(allRows) : report.totalGeneral,
  };
}
