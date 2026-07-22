import { getProductAudienceLabel, normalizeAudienceCategory } from "utils/productAudienceHelper";
import {
  isCinchoProductRow,
  isFossCinchoProductRow,
  isPackagingProductCode,
  normalizeCinchoType,
  normalizeHardwareCondition,
  sortSizeKeys,
} from "utils/productCinchoHelper";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
const PACKAGING_KEY = "PACKAGING";

export const sumSizeMap = (sizes) =>
  Object.values(sizes || {}).reduce((sum, value) => sum + Number(value || 0), 0);

export const sumFossPhysicalByLocation = (byLocation) => {
  if (!byLocation) return 0;
  return ["E", "BO"].reduce((sum, loc) => sum + sumSizeMap(byLocation[loc]), 0);
};

/** Total físico contado: prioriza tallas FOSS/cincho; si no, suma ubicaciones V1…BO. */
export const resolveLivePhysicalTotal = (row, counts, physicalSizes, physicalSizesByLocation) => {
  if (isFossCinchoProductRow(row)) {
    const fossTotal = sumFossPhysicalByLocation(physicalSizesByLocation);
    if (fossTotal > 0) return fossTotal;
  }
  if (isCinchoProductRow(row) && physicalSizes) {
    const sizeTotal = sumSizeMap(physicalSizes);
    if (sizeTotal > 0) return sizeTotal;
  }
  return COUNT_LOCATION_KEYS.reduce((sum, key) => sum + Number((counts || {})[key] || 0), 0);
};

export const computeDiferenciaConteo = (total, inventarioFinal, salidaDevolucion = 0) => {
  const raw = Number(total || 0) - Number(inventarioFinal || 0);
  if (raw <= 0) return raw;
  return Math.max(0, raw - Math.max(0, Number(salidaDevolucion || 0)));
};

/** Empaques SUM-: no aplican ajuste por devolución a bodega en la columna Dif. */
export const resolveSalidaDevolucionForDiff = (row) => {
  if (row?.packaging || isPackagingProductCode(row?.productCode)) return 0;
  return Number(row?.salidaDevolucion || 0);
};

export const computeConteoRowDiferencia = (total, row) =>
  computeDiferenciaConteo(total, row?.inventarioFinal, resolveSalidaDevolucionForDiff(row));

/** Sobrante: solo el número (verde en UI). Faltante: conserva el signo −. */
export const formatConteoDiffDisplay = (diferencia) => String(Number(diferencia || 0));

/** Indicador visual: solo faltante lleva ▼; sobrante va sin prefijo. */
export const formatConteoDiffArrow = (diferencia) => {
  const n = Number(diferencia || 0);
  if (n < 0) return "▼";
  return null;
};

export const resolveLiveRowDiff = (row, counts, physicalSizes, physicalSizesByLocation) =>
  computeConteoRowDiferencia(
    resolveLivePhysicalTotal(row, counts, physicalSizes, physicalSizesByLocation),
    row
  );

const normalizeDisplayRowTotals = (row) => {
  const total = resolveLivePhysicalTotal(
    row,
    row.counts,
    row.physicalSizes,
    row.physicalSizesByLocation
  );
  const inventarioFinal = Number(row.inventarioFinal || 0);
  return {
    ...row,
    total,
    diferencia: computeConteoRowDiferencia(total, row),
  };
};

/** Etiqueta de subtotal: "Subtotal — EMPAQUES" (nombre de categoría en mayúsculas). */
export function formatConteoSubtotalLabel(categoryName) {
  const part = String(categoryName || "").trim().toUpperCase();
  return part ? `Subtotal — ${part}` : "Subtotal";
}

/** Colapsa espacios múltiples y recorta extremos. */
export const normalizeConteoLabelSpaces = (text) =>
  String(text ?? "").replace(/\s+/g, " ").trim();

/** Inicial(es) de color: NEGRO → N, negro/cafe → NC. */
export function formatConteoColorInitials(colorName) {
  const raw = String(colorName || "").trim();
  if (!raw || raw === "—") return "";
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1) {
    return parts
      .map((part) => part.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/, "").charAt(0))
      .filter(Boolean)
      .join("")
      .toUpperCase();
  }
  const first = raw.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/, "").charAt(0);
  return first ? first.toUpperCase() : "";
}

const isWalletCategory = (name) => {
  if (!name || name === "Empaques") return false;
  return String(name).toUpperCase().includes("BILLETERA");
};

const isConteoWalletRow = (row) =>
  isWalletCategory(row?.sourceCategoryName) || isWalletCategory(row?.productCategoryName);

/**
 * Etiqueta compacta para Excel/PDF de conteo físico.
 * Billeteras: nombre + código + color + NV (herraje nuevo).
 * Demás productos: nombre + color + T{talla} (cinchos) + NV (herraje nuevo).
 */
export function formatConteoExportProductLabel(row) {
  const parts = [normalizeConteoLabelSpaces(row?.productName)];
  const isWallet = isConteoWalletRow(row);

  if (isWallet) {
    const code = normalizeConteoLabelSpaces(row?.productCode);
    if (code) parts.push(code);
  }

  const colorInit = formatConteoColorInitials(row?.colorName);
  if (colorInit) parts.push(colorInit);

  if (!isWallet) {
    const size = String(row?.sizeLabel || "").trim();
    if (size && (isCinchoProductRow(row) || isFossCinchoProductRow(row))) {
      parts.push(`T${size}`);
    }
  }

  if (normalizeHardwareCondition(row?.hardwareCondition) === "NUEVO") {
    parts.push("NV");
  }

  return normalizeConteoLabelSpaces(parts.filter(Boolean).join(" "));
}

const rowTotal = (counts) =>
  COUNT_LOCATION_KEYS.reduce((sum, key) => sum + Number((counts || {})[key] || 0), 0);

export const sumDisplayRows = (rows) => {
  const totalCounts = {};
  COUNT_LOCATION_KEYS.forEach((key) => {
    totalCounts[key] = rows.reduce((sum, row) => sum + Number((row.counts || {})[key] || 0), 0);
  });
  const sumField = (field) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
  const total = rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const inventarioFinal = sumField("inventarioFinal");
  // Sumar diffs de fila: computeDiferenciaConteo no es lineal al agregar salidaDevolucion.
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
    diferencia: rows.reduce((sum, row) => sum + Number(row.diferencia || 0), 0),
  };
};

const collectSizeKeys = (row) => {
  const keys = new Set();
  Object.keys(row?.systemSizes || {}).forEach((size) => keys.add(size));
  Object.keys(row?.physicalSizes || {}).forEach((size) => keys.add(size));
  Object.values(row?.physicalSizesByLocation || {}).forEach((locSizes) => {
    Object.keys(locSizes || {}).forEach((size) => keys.add(size));
  });
  // Tallas con kardex/envío aunque stock actual sea 0 (clave presente con qty 0).
  if (row?.sizeLabel) keys.add(String(row.sizeLabel));
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
  return sizeKeys.map((size) => {
    const sysQty = Number(row.systemSizes?.[size] || 0);
    const counts = buildCountsForSize(row, size);
    const total = resolvePhysicalTotalForSize(row, size, counts);
    const inventarioFinal = sysQty;
    // Fallback solo si el backend no envió sizeLabel. Preferir API expandida.
    const netHint =
      Number(row.comprasAjustes || 0)
      - Number(row.anulacionCompras || 0)
      + Number(row.entradas || 0)
      - Number(row.ventas || 0)
      + Number(row.anulacionVenta || 0)
      - Number(row.salida || 0);
    const onlyOneSize = sizeKeys.length === 1;
    const entradas = onlyOneSize ? Number(row.entradas || 0) : 0;
    const ventas = onlyOneSize ? Number(row.ventas || 0) : 0;
    const comprasAjustes = onlyOneSize ? Number(row.comprasAjustes || 0) : 0;
    const anulacionCompras = onlyOneSize ? Number(row.anulacionCompras || 0) : 0;
    const anulacionVenta = onlyOneSize ? Number(row.anulacionVenta || 0) : 0;
    const salida = onlyOneSize ? Number(row.salida || 0) : 0;
    const salidaDevolucion = onlyOneSize ? Number(row.salidaDevolucion || 0) : 0;
    const sizeNet = onlyOneSize ? netHint : 0;
    const inventarioInicial = Math.max(0, inventarioFinal - sizeNet);

    return {
      ...row,
      sizeLabel: size,
      sizesSummary: size,
      physicalSizesSummary: String(total),
      systemSizes: { [size]: sysQty },
      physicalSizes:
        row.physicalSizes?.[size] != null ? { [size]: Number(row.physicalSizes[size]) } : null,
      physicalSizesByLocation: buildSingleSizeByLocation(row.physicalSizesByLocation, size),
      inventarioInicial,
      comprasAjustes,
      anulacionCompras,
      entradas,
      ventas,
      anulacionVenta,
      salida,
      salidaDevolucion,
      inventarioFinal,
      counts,
      total,
      diferencia: computeConteoRowDiferencia(total, row),
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
  if (isCinchoProductRow(row)) {
    const categoryId = row.sourceCategoryId ?? "NONE";
    if (row.cinchoForKids) {
      return `BELT:${categoryId}:KIDS:KIDS`;
    }
    const classification = normalizeCinchoType(row.cinchoType) || "UNCLASSIFIED";
    const audience = normalizeAudienceCategory(row.audienceCategory);
    return `BELT:${categoryId}:${classification}:${audience}`;
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
  if (key.startsWith("BELT:")) {
    const [, , classification, audience] = key.split(":");
    const labels = {
      CASUAL: "Casual",
      REVERSIBLE: "Reversible",
      KIDS: "Niño",
      UNCLASSIFIED: "Sin clasificar",
    };
    const baseName = String(row.sourceCategoryName || "Cinchos").split(" — ")[0];
    if (classification === "KIDS") {
      return `${baseName} — Niño`;
    }
    return `${baseName} — ${getProductAudienceLabel(audience)} — ${labels[classification] || "Sin clasificar"}`;
  }
  if (key.startsWith("WALLET:")) {
    const audience = key.split(":")[2];
    const baseName = String(row.sourceCategoryName || "Billeteras").split(" — ")[0];
    return `${baseName} — ${getProductAudienceLabel(audience)}`;
  }
  return row.sourceCategoryName || "Sin categoría";
};

const resolveDisplayCategoryId = (key, row) => {
  if (PACKAGING_KEY === key || key === "CAT:NONE") return null;
  if (key.startsWith("WALLET:") || key.startsWith("BELT:")) {
    return row.sourceCategoryId ?? null;
  }
  return row.sourceCategoryId ?? null;
};

/**
 * Reagrupa el reporte de conteo físico: empaques aparte, billeteras por público
 * y cinchos por Dama/Caballero/Unisex y Casual/Reversible; Niño queda aparte.
 * Conserva las filas por talla y color.
 * Si el backend ya envió filas con sizeLabel, no se re-expanden (evita perder Ent. por talla
 * y filas con Fin=0 que sí tuvieron movimiento/envío).
 */
export function buildConteoDisplayReport(report) {
  if (!report?.categories?.length) return report;

  const isSubcount = report.reportType === "SUBCONTEO" || Boolean(report.asOfDate);

  const flatRows = report.categories.flatMap((category) =>
    (category.rows || []).map((row) => resolveSourceCategory(row, category))
  );

  const alreadyExpandedBySize = flatRows.some((row) => Boolean(row?.sizeLabel));
  const expandedRows = (isSubcount || alreadyExpandedBySize
    ? flatRows
    : flatRows.flatMap((row) => expandCinchoRowBySizes(row))
  ).map(normalizeDisplayRowTotals);

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
