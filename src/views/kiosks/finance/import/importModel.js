/**
 * Modelo puro del asistente de importación (sin React): validación de archivos, agregación de
 * columnas por nombre normalizado, resolución de incidencias y armado del payload de commit.
 */
import { normalizeAlias, parseMoneyInput } from "utils/financeInput";

export const MAX_FILES = 12;
// Multipart de Spring por defecto: 1 MB por archivo y 10 MB por request (los Excel reales pesan ~100 KB)
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
export const MAX_CELL_AMOUNT = 999999.99;

export const IGNORE = "IGNORE";

/** Reglas de selección: .xlsx, <= 1 MB c/u, <= 10 MB en total, máximo 12 archivos, sin repetidos (nombre+tamaño). */
export const validateSelection = (existing, incoming) => {
  const accepted = [...existing];
  const errors = [];
  Array.from(incoming).forEach((file) => {
    if (!/\.xlsx$/i.test(file.name)) {
      errors.push(`"${file.name}": sólo se aceptan archivos .xlsx.`);
    } else if (file.size > MAX_FILE_BYTES) {
      errors.push(`"${file.name}": supera el máximo de ${formatBytes(MAX_FILE_BYTES)} por archivo.`);
    } else if (file.size === 0) {
      errors.push(`"${file.name}": el archivo está vacío.`);
    } else if (accepted.some((f) => f.name === file.name && f.size === file.size)) {
      errors.push(`"${file.name}": ya está en la lista.`);
    } else if (accepted.reduce((sum, f) => sum + f.size, 0) + file.size > MAX_REQUEST_BYTES) {
      errors.push(`"${file.name}": el total de archivos supera ${formatBytes(MAX_REQUEST_BYTES)}.`);
    } else if (accepted.length >= MAX_FILES) {
      errors.push(`"${file.name}": máximo ${MAX_FILES} archivos por importación.`);
    } else {
      accepted.push(file);
    }
  });
  return { accepted, errors };
};

export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const columnKey = (col) => col.normalized || normalizeAlias(col.excelName);

const STATUS_RANK = { MATCHED: 0, AMBIGUOUS: 1, UNMATCHED: 2 };

/**
 * Agrupa las columnas de todos los archivos por nombre normalizado ("aggregated by excelName").
 * Devuelve [{ key, excelNames, appearances:[{fileIdx, year, month}], matchStatus, matchedSiteId, matchedSiteName }].
 */
export const aggregateColumns = (files) => {
  const map = new Map();
  files.forEach((file, fileIdx) => {
    (file.columns || []).forEach((col) => {
      const key = columnKey(col);
      if (!map.has(key)) {
        map.set(key, {
          key,
          excelNames: [],
          appearances: [],
          matchStatus: "MATCHED",
          matchedSiteId: null,
          matchedSiteName: null,
        });
      }
      const entry = map.get(key);
      if (!entry.excelNames.includes(col.excelName)) entry.excelNames.push(col.excelName);
      entry.appearances.push({ fileIdx, year: file.year, month: file.month });
      const status = col.matchStatus || "UNMATCHED";
      if ((STATUS_RANK[status] ?? 2) > (STATUS_RANK[entry.matchStatus] ?? 0)) entry.matchStatus = status;
      if (col.matchedSiteId && !entry.matchedSiteId) {
        entry.matchedSiteId = col.matchedSiteId;
        entry.matchedSiteName = col.matchedSiteName || null;
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => {
    const rank = (STATUS_RANK[b.matchStatus] ?? 2) - (STATUS_RANK[a.matchStatus] ?? 2);
    return rank || a.key.localeCompare(b.key);
  });
};

/** Mapeo inicial: columnas ya emparejadas conservan su sitio; el resto queda pendiente. */
export const initialSiteMap = (aggregated) => {
  const map = {};
  aggregated.forEach((col) => {
    if (col.matchStatus === "MATCHED" && col.matchedSiteId) map[col.key] = { siteId: col.matchedSiteId };
  });
  return map;
};

export const isMappingResolved = (entry) =>
  !!entry && (!!entry.siteId || (!!entry.create && !!String(entry.create.name || "").trim()));

export const pendingMappingCount = (aggregated, siteMap) =>
  aggregated.filter((col) => !isMappingResolved(siteMap[col.key])).length;

/** Conflictos: dos columnas de un mismo archivo apuntando al mismo sitio o nombre nuevo. */
export const mappingProblems = (files, siteMap) => {
  const problems = [];
  files.forEach((file) => {
    const seen = new Map();
    (file.columns || []).forEach((col) => {
      const entry = siteMap[columnKey(col)];
      if (!isMappingResolved(entry)) return;
      const target = entry.siteId ? `site:${entry.siteId}` : `new:${normalizeAlias(entry.create.name)}`;
      if (seen.has(target)) {
        problems.push(`${file.fileName}: "${seen.get(target)}" y "${col.excelName}" apuntan al mismo sitio.`);
      } else {
        seen.set(target, col.excelName);
      }
    });
  });
  return problems;
};

const cellIssueIds = (file) => {
  const blocked = file.data && file.data.blockedCells;
  return Array.isArray(blocked) ? new Set(blocked.map((b) => b.issueId)) : null;
};

/** Sólo las celdas bloqueadas (texto no numérico / negativo) admiten valor o "ignorar". */
export const isIssueResolvable = (file, issue) => {
  const ids = cellIssueIds(file);
  if (ids) return ids.has(issue.id);
  return issue.code === "NON_NUMERIC_CELL" || issue.code === "NEGATIVE_VALUE";
};

/** Resolución numérica válida para una celda (0..999,999.99). */
export const parseResolutionValue = (text) => {
  const parsed = parseMoneyInput(text);
  if (!parsed.valid || parsed.value === null) return { valid: false, value: null };
  if (parsed.value > MAX_CELL_AMOUNT) return { valid: false, value: null };
  return parsed;
};

/**
 * ¿Está resuelta la incidencia? BLOCKING de columna sin mapeo se resuelve en el paso 2;
 * las de celda con una resolución (valor o IGNORE). Otras BLOCKING no se pueden resolver aquí.
 */
export const isIssueResolved = (file, issue, resolutions, siteMap) => {
  if (issue.severity !== "BLOCKING") return true;
  if (issue.code === "UNMATCHED_COLUMN") {
    const key = normalizeAlias(issue.excelName);
    const col = (file.columns || []).find((c) => columnKey(c) === key);
    return isMappingResolved(siteMap[col ? columnKey(col) : key]);
  }
  if (isIssueResolvable(file, issue)) {
    return Object.prototype.hasOwnProperty.call(resolutions || {}, issue.id);
  }
  return false;
};

export const SEVERITIES = ["BLOCKING", "WARNING", "INFO"];

/** Cuenta incidencias por severidad; BLOCKING cuenta sólo las no resueltas. */
export const countIssues = (files, resolutionsByFile, siteMap) => {
  const counts = { BLOCKING: 0, WARNING: 0, INFO: 0, resolved: 0 };
  files.forEach((file, i) => {
    (file.issues || []).forEach((issue) => {
      if (issue.severity === "BLOCKING") {
        if (isIssueResolved(file, issue, resolutionsByFile[i], siteMap)) counts.resolved += 1;
        else counts.BLOCKING += 1;
      } else if (counts[issue.severity] !== undefined) {
        counts[issue.severity] += 1;
      }
    });
  });
  return counts;
};

/** FILE_ERROR: archivo ilegible (p. ej. ~$ de bloqueo de Excel); no se puede importar, sólo quitar. */
export const hasFileError = (file) => (file.issues || []).some((issue) => issue.code === "FILE_ERROR");

/** Archivos que realmente se enviarán: los ya importados sólo si se marcó reemplazar; nunca los ilegibles. */
export const filesToCommit = (files, replaceByFile) =>
  files
    .map((file, i) => ({ file, i }))
    .filter(({ file, i }) => !hasFileError(file) && (!file.alreadyImported || replaceByFile[i]));

/** Dos archivos del mismo año-mes en un mismo commit son rechazados por el servidor. */
export const duplicateMonths = (files, replaceByFile) => {
  const groups = new Map();
  filesToCommit(files, replaceByFile).forEach(({ file }) => {
    if (!file.year || !file.month) return;
    const key = `${file.year}-${String(file.month).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, { key, year: file.year, month: file.month, names: [] });
    groups.get(key).names.push(file.fileName);
  });
  return Array.from(groups.values()).filter((g) => g.names.length > 1);
};

export const buildSiteMapping = (file, siteMap) => {
  const mapping = {};
  (file.columns || []).forEach((col) => {
    const entry = siteMap[columnKey(col)];
    if (!isMappingResolved(entry)) return;
    if (entry.create) {
      mapping[col.excelName] = { create: { name: entry.create.name.trim() } };
    } else if (entry.siteId && entry.siteId !== col.matchedSiteId) {
      mapping[col.excelName] = { siteId: entry.siteId };
    }
  });
  return mapping;
};

export const buildCommitPayload = ({ files, siteMap, resolutionsByFile, replaceByFile, replaceExisting }) => ({
  replaceExisting: !!replaceExisting,
  files: filesToCommit(files, replaceByFile).map(({ file, i }) => {
    const ids = cellIssueIds(file);
    const resolutions = {};
    Object.entries(resolutionsByFile[i] || {}).forEach(([id, value]) => {
      if (!ids || ids.has(id)) resolutions[id] = value;
    });
    return {
      fileName: file.fileName,
      sha256: file.sha256,
      year: file.year,
      month: file.month,
      siteMapping: buildSiteMapping(file, siteMap),
      resolutions,
      data: file.data,
    };
  }),
});

const countNonNull = (obj) => Object.values(obj || {}).filter((v) => v !== null && v !== undefined).length;

/** Resumen para el paso "Confirmar". */
export const summarizeImport = ({ files, siteMap, resolutionsByFile, replaceByFile }) => {
  const selected = filesToCommit(files, replaceByFile);
  const months = new Set();
  let salesRows = 0;
  let configRows = 0;
  let costRows = 0;
  let replaced = 0;
  let fixedCells = 0;
  let ignoredCells = 0;
  const created = new Set();

  selected.forEach(({ file, i }) => {
    months.add(`${file.year}-${String(file.month).padStart(2, "0")}`);
    const res = resolutionsByFile[i] || {};
    const ignored = Object.values(res).filter((v) => v === IGNORE).length;
    const fixed = Object.values(res).filter((v) => v !== IGNORE).length;
    ignoredCells += ignored;
    fixedCells += fixed;
    salesRows += Math.max(0, ((file.stats && file.stats.salesCells) || 0) - ignored);
    const data = file.data || {};
    const cols = new Set([...Object.keys(data.goals || {}), ...Object.keys(data.rates || {})]);
    configRows += cols.size;
    Object.values(data.costs || {}).forEach((c) => {
      costRows += countNonNull(c);
    });
    if (file.alreadyImported) replaced += 1;
    (file.columns || []).forEach((col) => {
      const entry = siteMap[columnKey(col)];
      if (entry && entry.create) created.add(normalizeAlias(entry.create.name));
    });
  });

  return {
    files: selected.length,
    skipped: files.length - selected.length,
    months: Array.from(months).sort(),
    salesRows,
    configRows,
    costRows,
    replaced,
    fixedCells,
    ignoredCells,
    createdSites: created.size,
  };
};

/** Diferencia ventas recalculadas vs total de la hoja. */
export const totalsDiff = (stats) => {
  if (!stats || stats.salesTotal === null || stats.salesTotal === undefined) return null;
  if (stats.sheetTotal === null || stats.sheetTotal === undefined) return null;
  return Number((stats.salesTotal - stats.sheetTotal).toFixed(2));
};

/** Nombres de sitios nuevos que ya existen (o se repiten entre sí): hay que elegir el existente. */
export const createNameConflicts = (siteMap, existingNames) => {
  const existing = new Set(existingNames.map((n) => normalizeAlias(n)));
  const seen = new Set();
  const conflicts = [];
  Object.values(siteMap).forEach((entry) => {
    if (!entry || !entry.create) return;
    const norm = normalizeAlias(entry.create.name);
    if (!norm) return;
    if (existing.has(norm) || seen.has(norm)) conflicts.push(entry.create.name.trim());
    seen.add(norm);
  });
  return conflicts;
};
