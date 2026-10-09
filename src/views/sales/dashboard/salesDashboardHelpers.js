/**
 * Helpers puros (sin React ni DOM) del Dashboard de ventas por fuente.
 * Contrato del backend: dinero en Q, `growthPercent` y `sharePercent` en PORCENTAJE (12.4 = +12.4 %).
 * Los helpers de formato de Finanzas (financeFormat) esperan decimales (0.124): aquí se convierte.
 */
import { MONTHS_ES, fmtMoney, fmtNumber, fmtPct, isNum } from "utils/financeFormat";
import { shiftYmdGuatemala } from "utils/dateTimeHelper";
import {
  fmtRangeLabel,
  heatBucket,
  median,
  previousPeriod,
} from "views/kiosks/finance/reports/financeReportHelpers";

/* ------------------------------------------------------------------ */
/* Fuentes, pestañas y colores                                         */
/* ------------------------------------------------------------------ */

/** Colores aprobados en la maqueta. `ink` = versión más oscura para trazos de línea. */
export const SOURCE_META = {
  KIOSKO: {
    channel: "KIOSKO",
    tab: "kioskos",
    label: "Kioskos",
    color: "#51cbce",
    ink: "#1b8f94",
    fill: "rgba(81, 203, 206, 0.18)",
    totalSalesChannel: "kiosko",
  },
  ONLINE: {
    channel: "ONLINE",
    tab: "online",
    label: "Online",
    color: "#f0a63a",
    ink: "#c77d0a",
    fill: "rgba(240, 166, 58, 0.2)",
    totalSalesChannel: "online",
  },
  VENDOR: {
    channel: "VENDOR",
    tab: "vendedor",
    label: "Vendedor LF",
    color: "#4f5fc7",
    ink: "#4f5fc7",
    fill: "rgba(79, 95, 199, 0.16)",
    totalSalesChannel: "vendedor",
  },
};

export const SOURCE_ORDER = ["KIOSKO", "ONLINE", "VENDOR"];

export const NEUTRAL_INK = "#3b4a5a";

export const TABS = [
  { id: "consolidado", label: "Consolidado", color: null, accent: "#252422" },
  { id: "kioskos", label: "Kioskos", color: SOURCE_META.KIOSKO.color, accent: SOURCE_META.KIOSKO.color },
  { id: "online", label: "Online", color: SOURCE_META.ONLINE.color, accent: SOURCE_META.ONLINE.color },
  { id: "vendedor", label: "Vendedor LF", color: SOURCE_META.VENDOR.color, accent: SOURCE_META.VENDOR.color },
];

export const TAB_IDS = TABS.map((t) => t.id);
export const DEFAULT_TAB = "consolidado";

export const tabById = (id) => TABS.find((t) => t.id === id) || TABS[0];

export const SOURCE_DESCRIPTION = {
  consolidado: "Kioskos, Online y Vendedor LF por separado",
  kioskos: "solo kioskos (histórico + POS)",
  online: "solo ventas online (sin canceladas ni anuladas)",
  vendedor: "solo Vendedor LF (Luis Felipe)",
};

/* ------------------------------------------------------------------ */
/* Porcentajes y formato                                               */
/* ------------------------------------------------------------------ */

/** 12.4 (porcentaje del backend) -> 0.124 (decimal que esperan fmtDeltaPct / DeltaChip). */
export const percentToDecimal = (percent) => {
  // Jackson serializa BigDecimal como número; se tolera también un número en texto ('12.40').
  const n = typeof percent === "string" && percent.trim() !== "" ? Number(percent) : percent;
  return isNum(n) ? n / 100 : null;
};

/** Variación contra el periodo anterior como decimal; null si no hay base comparable. */
export const growthDelta = (kpis) => {
  if (!kpis || !(Number(kpis.previousTotalAmount) > 0)) return null;
  return percentToDecimal(kpis.growthPercent);
};

/** '55.6%' desde sharePercent (55.6). */
export const fmtSharePercent = (percent, digits = 1) => {
  const d = percentToDecimal(percent);
  return d === null ? "—" : fmtPct(d, digits);
};

/** Participación (0..1) de una parte sobre un total; 0 si el total no es positivo. */
export const shareOf = (part, total) => (isNum(part) && isNum(total) && total > 0 ? part / total : 0);

/** Unidades sin decimales (el backend las manda con escala 2: 12.00) y con separador de miles. */
export const fmtQty = (value) => {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return "—";
  return fmtNumber(n, 0);
};

export const fmtCount = (value) => fmtNumber(value ?? 0, 0);

/** Conteo, o '—' si es 0 (p. ej. tickets de un kiosko que solo tiene histórico: no hay tickets que contar). */
export const fmtCountOrDash = (value) => (Number(value) > 0 ? fmtCount(value) : "—");

export const moneyOrDash = (value) => (isNum(value) && value !== 0 ? fmtMoney(value) : "—");

/** Ancho (%) de una barra relativa al máximo; mínimo visible de 2 % si hay valor. */
export const barPct = (value, max) => {
  if (!isNum(value) || !isNum(max) || max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.min(100, (value / max) * 100));
};

/* ------------------------------------------------------------------ */
/* Fechas, atajos y URL                                                */
/* ------------------------------------------------------------------ */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isValidYmd = (value) => {
  const m = YMD_RE.exec(String(value || ""));
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
};

export const monthStartYmd = (ymd) => `${String(ymd).slice(0, 7)}-01`;

const monthEndYmd = (ymd) => {
  const y = Number(String(ymd).slice(0, 4));
  const m = Number(String(ymd).slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(ymd).slice(0, 7)}-${String(last).padStart(2, "0")}`;
};

export const SHORTCUTS = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "month", label: "Mes" },
  { id: "prevMonth", label: "Mes anterior" },
];

/** Rango de un atajo. today = "yyyy-mm-dd" (hora de Guatemala). */
export const shortcutRange = (id, today) => {
  switch (id) {
    case "today":
      return { startDate: today, endDate: today };
    case "7d":
      return { startDate: shiftYmdGuatemala(today, -6), endDate: today };
    case "prevMonth": {
      const lastOfPrev = shiftYmdGuatemala(monthStartYmd(today), -1);
      return { startDate: monthStartYmd(lastOfPrev), endDate: lastOfPrev };
    }
    case "month":
    default:
      return { startDate: monthStartYmd(today), endDate: today };
  }
};

/** Id del atajo que coincide exactamente con el rango (o ""). */
export const activeShortcut = (startDate, endDate, today) => {
  const hit = SHORTCUTS.find((s) => {
    const r = shortcutRange(s.id, today);
    return r.startDate === startDate && r.endDate === endDate;
  });
  return hit ? hit.id : "";
};

/* ------------------------------------------------------------------ */
/* Selectores de mes y año                                             */
/* ------------------------------------------------------------------ */

/** Primer año con ventas de kioscos en Finanzas: el selector de año arranca aquí. */
export const FIRST_SALES_YEAR = 2023;

/** Opción del selector de mes cuando el rango no es un mes calendario completo. */
export const CUSTOM_MONTH_LABEL = "Personalizado";

const YM_RE = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/;
const MM_RE = /^(0[1-9]|1[0-2])$/;

/** 'yyyy-mm' de una fecha 'yyyy-mm-dd' (o del propio 'yyyy-mm'). */
const monthOf = (ymdOrYm) => String(ymdOrYm).slice(0, 7);

/** Suma o resta meses a 'yyyy-mm' ('2026-01' - 1 -> '2025-12'). */
export const shiftMonth = (ym, delta) => {
  const index = Number(String(ym).slice(0, 4)) * 12 + (Number(String(ym).slice(5, 7)) - 1) + Number(delta || 0);
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
};

/**
 * Rango de un mes calendario ('yyyy-mm' o 'yyyy-mm-dd'): del día 1 al último día, salvo el mes en curso, que
 * llega hasta hoy (misma regla que el atajo 'Mes'). null si el valor no es un mes válido.
 */
export const monthRange = (ymOrYmd, todayYmd) => {
  if (!YM_RE.test(String(ymOrYmd))) return null;
  const startDate = monthStartYmd(ymOrYmd);
  return { startDate, endDate: monthOf(ymOrYmd) === monthOf(todayYmd) ? todayYmd : monthEndYmd(startDate) };
};

/**
 * Mes calendario ('yyyy-mm') que coincide exactamente con el rango, o '' si es un rango personalizado.
 * Coincide cuando Desde es el día 1 y Hasta es el último día del mes o, solo en el mes en curso, hoy.
 */
export const detectMonth = (startDate, endDate, todayYmd) => {
  if (!isValidYmd(startDate) || !isValidYmd(endDate) || startDate !== monthStartYmd(startDate)) return "";
  const ym = monthOf(startDate);
  const isCurrent = ym === monthOf(todayYmd);
  return endDate === monthEndYmd(startDate) || (isCurrent && endDate === todayYmd) ? ym : "";
};

/**
 * Valor de los selects 'Mes' y 'Año' para un rango (siempre sale de la URL, nunca de un borrador a medio teclear).
 * month = '01'…'12' cuando el rango es un mes calendario completo (o el mes en curso hasta hoy) y '' cuando es
 * personalizado; year = año de Desde en ambos casos.
 */
export const monthYearOf = (startDate, endDate, todayYmd) => {
  const ym = detectMonth(startDate, endDate, todayYmd);
  const year = isValidYmd(startDate) ? Number(startDate.slice(0, 4)) : Number(String(todayYmd).slice(0, 4));
  return { month: ym ? ym.slice(5, 7) : "", year };
};

/**
 * Opciones del <select> 'Mes' para el año `year`: 'Personalizado' (value '') y Enero…Diciembre (value '01'…'12').
 * 'Personalizado' no se elige a mano: se activa solo y queda deshabilitado mientras el rango es un mes completo
 * (`selectedMonth` distinto de ''). Los meses posteriores al mes en curso vienen deshabilitados: no hay ventas futuras.
 */
export const buildMonthSelectOptions = (year, todayYmd, selectedMonth = "") => [
  { value: "", label: CUSTOM_MONTH_LABEL, disabled: selectedMonth !== "" },
  ...MONTHS_ES.map((label, i) => {
    const mm = String(i + 1).padStart(2, "0");
    return { value: mm, label, disabled: `${year}-${mm}` > monthOf(todayYmd) };
  }),
];

/**
 * Opciones del <select> 'Año': del año de `todayYmd` hacia atrás hasta FIRST_SALES_YEAR, el más reciente primero y
 * sin años futuros. Si `selectedYear` (el año de Desde) cae fuera de esa ventana —enlace viejo o fecha tecleada— se
 * agrega, deshabilitado, para que el selector no muestre otro año.
 */
export const buildYearSelectOptions = (todayYmd, selectedYear = null) => {
  const current = Number(String(todayYmd).slice(0, 4));
  const first = Math.min(FIRST_SALES_YEAR, current);
  const options = [];
  for (let year = current; year >= first; year -= 1) {
    options.push({ value: String(year), label: String(year), disabled: false });
  }
  // Solo un año de 4 dígitos (Number(null) o Number('') serían 0, no un año).
  const selected = /^\d{4}$/.test(String(selectedYear)) ? Number(selectedYear) : null;
  if (selected !== null && (selected > current || selected < first)) {
    options.push({ value: String(selected), label: String(selected), disabled: true });
    options.sort((a, b) => Number(b.value) - Number(a.value));
  }
  return options;
};

/** Rango del mes `ym` acotado al mes en curso (no se eligen meses futuros); null si queda fuera de 2000–2100. */
const clampedMonthRange = (ym, todayYmd) => {
  const target = ym > monthOf(todayYmd) ? monthOf(todayYmd) : ym;
  return isValidYmd(`${target}-01`) ? monthRange(target, todayYmd) : null;
};

/**
 * Rango al elegir un mes en el selector 'Mes' (`month` = '01'…'12'): ese mes completo del año de Desde, o hasta hoy
 * si es el mes en curso (misma regla que el atajo 'Mes'). null si el mes o la fecha no son válidos.
 */
export const rangeForMonthPick = (startDate, todayYmd, month) =>
  MM_RE.test(String(month)) && isValidYmd(startDate)
    ? clampedMonthRange(`${startDate.slice(0, 4)}-${month}`, todayYmd)
    : null;

/**
 * Rango al elegir un año en el selector 'Año' (`year` = 'yyyy'): el mes de Desde en ese año —si el rango es un mes
 * completo es ese mes; si es personalizado, el mes en que empieza— acotado al mes en curso (de diciembre 2025 a
 * 2026 se llega al mes actual, no a un diciembre futuro). null si el año o la fecha no son válidos.
 */
export const rangeForYearPick = (startDate, todayYmd, year) =>
  /^\d{4}$/.test(String(year)) && isValidYmd(startDate)
    ? clampedMonthRange(`${year}-${startDate.slice(5, 7)}`, todayYmd)
    : null;

/**
 * Rango del mes anterior (delta -1) o siguiente (delta +1) al seleccionado. Si el rango es personalizado se
 * parte del mes de Desde. null si no se puede: pasar del mes en curso hacia adelante o salir de 2000–2100.
 */
export const stepMonth = (startDate, endDate, todayYmd, delta) => {
  if (!isValidYmd(startDate)) return null;
  const base = detectMonth(startDate, endDate, todayYmd) || monthOf(startDate);
  const target = shiftMonth(base, delta);
  if ((delta > 0 && target > monthOf(todayYmd)) || !isValidYmd(`${target}-01`)) return null;
  return monthRange(target, todayYmd);
};

/**
 * Aplica el cambio de una fecha al rango. Devuelve null si el valor no es una fecha completa y válida
 * (p. ej. mientras se teclea el año). Si Desde pasa de Hasta (o al revés) se arrastra la otra.
 */
export const applyRangeChange = (range, field, value) => {
  if (!isValidYmd(value)) return null;
  const next = { startDate: range.startDate, endDate: range.endDate, [field]: value };
  if (next.startDate > next.endDate) {
    if (field === "startDate") next.endDate = value;
    else next.startDate = value;
  }
  return next;
};

/**
 * Estado de la URL (?tab=&startDate=&endDate=&siteId=). Acepta URLSearchParams u objeto plano.
 * Valores inválidos caen al predeterminado (mes en curso hasta hoy, pestaña Consolidado, todos los kioskos).
 * `siteId` = id del sitio de Finanzas kioscos (filtro de la pestaña Kioskos). El ?kioskLocationId= de enlaces
 * viejos se ignora: el filtro ya no es por ubicación del POS, y esos enlaces abren con todos los kioskos.
 */
export const parseDashboardParams = (params, today) => {
  const get = (key) => {
    const v = params && typeof params.get === "function" ? params.get(key) : params ? params[key] : null;
    return v === undefined || v === null ? "" : String(v);
  };
  const tabParam = get("tab");
  const tab = TAB_IDS.includes(tabParam) ? tabParam : DEFAULT_TAB;
  let startDate = isValidYmd(get("startDate")) ? get("startDate") : monthStartYmd(today);
  let endDate = isValidYmd(get("endDate")) ? get("endDate") : today;
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
  const site = get("siteId");
  const siteId = /^\d+$/.test(site) ? site : "";
  return { tab, startDate, endDate, siteId };
};

/** '01/09/2026 – 30/09/2026' o 'Septiembre 2026' cuando el rango es un mes calendario completo. */
export const describePeriod = (startDate, endDate) => {
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) return "";
  if (startDate === monthStartYmd(startDate) && endDate === monthEndYmd(startDate)) {
    return `${MONTHS_ES[Number(startDate.slice(5, 7)) - 1]} ${startDate.slice(0, 4)}`;
  }
  return fmtRangeLabel(startDate, endDate);
};

/** Periodo anterior del mismo largo (igual regla que el backend). */
export const previousRange = (startDate, endDate) => {
  const p = previousPeriod(startDate, endDate);
  return { startDate: p.baseFrom, endDate: p.baseTo };
};

/** Enlace a 'Ventas totales' con el canal y el rango activos. */
export const totalSalesLink = (channel, startDate, endDate) => {
  const params = new URLSearchParams();
  if (channel) params.set("channel", channel);
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  return `/admin/total-sales?${params.toString()}`;
};

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

/** Etiquetas de los KPIs por fuente (copy aprobado en la maqueta). */
export const KPI_CONFIG = {
  consolidado: {
    totalLabel: "Ventas totales",
    todayNote: "3 fuentes sumadas",
    countLabel: "Operaciones",
    countNote: "ventas y órdenes del periodo",
    avgLabel: "Ticket promedio",
    avgNote: "total ÷ operaciones",
    // El histórico de Finanzas kioscos no tiene tickets: el backend lo deja fuera del promedio.
    avgNoteHistorical: "total sin histórico ÷ operaciones",
    showUnits: false,
  },
  // Kioskos = Finanzas kioscos (histórico + POS): el total incluye el histórico; tickets, unidades y ticket
  // promedio salen solo del POS.
  KIOSKO: {
    totalLabel: "Ventas de kioskos",
    todayNote: "todos los kioskos",
    todayNoteFiltered: "kiosko seleccionado",
    countLabel: "Tickets (POS)",
    countNote: "ventas completadas",
    avgLabel: "Ticket promedio (POS)",
    avgNote: "venta POS ÷ tickets",
    showUnits: true,
    unitsLabel: "Unidades terminadas (POS)",
  },
  ONLINE: {
    totalLabel: "Ventas online",
    todayNote: "pedidos del día",
    countLabel: "Pedidos",
    countNote: "del periodo",
    avgLabel: "Ticket promedio",
    avgNote: "total ÷ pedidos",
    showUnits: true,
  },
  VENDOR: {
    totalLabel: "Ventas Vendedor LF",
    todayNote: "órdenes iniciadas hoy",
    countLabel: "Órdenes",
    countNote: "del periodo",
    avgLabel: "Promedio por orden",
    avgNote: "total ÷ órdenes",
    showUnits: true,
  },
};

/** true si parte del total viene del histórico de Finanzas kioscos (sin tickets ni desglose). */
export const hasHistoricalAmount = (kpis) => Number(kpis?.historicalAmount) > 0;

/**
 * Tarjetas de KPI desde SourceKpis. `compareNote` = 'vs agosto 2026'.
 * growth: decimal | null (sin base comparable) | undefined (la tarjeta no muestra variación).
 * El promedio muestra '—' si no hay tickets/órdenes (p. ej. un kiosko que solo tiene histórico), no 'Q 0.00'.
 */
export const buildKpiItems = (kpis, config, { compareNote = "vs periodo anterior", filtered = false } = {}) => {
  if (!kpis || !config) return [];
  const items = [
    {
      key: "total",
      label: config.totalLabel,
      value: fmtMoney(kpis.totalAmount),
      growth: growthDelta(kpis),
      note: compareNote,
    },
    {
      key: "today",
      label: "Ventas de hoy",
      value: fmtMoney(kpis.dailyAmount),
      note: filtered && config.todayNoteFiltered ? config.todayNoteFiltered : config.todayNote,
    },
    { key: "count", label: config.countLabel, value: fmtCount(kpis.salesCount), note: config.countNote },
    {
      key: "avg",
      label: config.avgLabel,
      value: Number(kpis.salesCount) > 0 ? fmtMoney(kpis.avgTicket) : "—",
      note: hasHistoricalAmount(kpis) && config.avgNoteHistorical ? config.avgNoteHistorical : config.avgNote,
    },
  ];
  if (config.showUnits) {
    items.push({
      key: "units",
      label: config.unitsLabel || "Unidades terminadas",
      value: fmtQty(kpis.unitsFinished),
      note: "sin empaques",
    });
  }
  return items;
};

/** true si la fuente no tiene ninguna venta en el periodo. */
export const isEmptyKpis = (kpis) => !kpis || (!(Number(kpis.salesCount) > 0) && !(Number(kpis.totalAmount) > 0));

/* ------------------------------------------------------------------ */
/* Composición del dinero                                              */
/* ------------------------------------------------------------------ */

/**
 * Producto / empaque / envío: grises pizarra aprobados. `ink` = color del texto dentro del segmento.
 * 'Histórico (sin desglose)' (solo kioskos: la parte del total que viene de Finanzas kioscos sin tickets) es gris claro
 * con rayado (`pattern: "hatch"`) para que no dependa solo del color. Aparece únicamente si su monto es > 0.
 */
export const COMPOSITION_STYLE = [
  { key: "product", label: "Producto terminado", field: "productAmount", color: "#3b4a5a", ink: "#ffffff" },
  { key: "packaging", label: "Empaque", field: "packagingAmount", color: "#6f7b88", ink: "#ffffff" },
  { key: "shipping", label: "Envío", field: "shippingAmount", color: "#a3acb6", ink: "#252422" },
  {
    key: "historical",
    label: "Histórico (sin desglose)",
    field: "historicalAmount",
    color: "#e4e7eb",
    ink: "#252422",
    pattern: "hatch",
  },
];

/**
 * Segmentos con monto > 0 y su participación (0..1) sobre el total de la composición. Producto + empaque + envío +
 * histórico suman el total del canal; la base es la suma de las partes (no `totalAmount`) para que las
 * participaciones siempre sumen 100 %, aunque el backend no mande alguna parte.
 */
export const buildCompositionSegments = (kpis) => {
  if (!kpis) return [];
  const parts = COMPOSITION_STYLE.map((s) => ({ ...s, amount: Number(kpis[s.field]) || 0 }));
  const sum = parts.reduce((acc, p) => acc + p.amount, 0);
  const total = sum > 0 ? sum : Number(kpis.totalAmount) || 0;
  if (!(total > 0)) return [];
  return parts
    .filter((p) => p.amount > 0)
    .map((p) => ({
      key: p.key,
      label: p.label,
      amount: p.amount,
      share: p.amount / total,
      color: p.color,
      ink: p.ink,
      ...(p.pattern ? { pattern: p.pattern } : {}),
    }));
};

/** Paleta para mezclas por categoría (forma de pago). */
export const MIX_PALETTE = [
  { color: "#1b8f94", ink: "#ffffff" },
  { color: "#3b4a5a", ink: "#ffffff" },
  { color: "#a3acb6", ink: "#252422" },
  { color: "#6f7b88", ink: "#ffffff" },
  { color: "#d5d9de", ink: "#252422" },
];

export const ORDER_TYPE_PALETTE = {
  OPV: { color: "#4f5fc7", ink: "#ffffff" },
  OPC: { color: "#8b96dd", ink: "#1d2566" },
};

/** Agrupa las filas sobrantes en 'Otros' para no pasar de `max` segmentos. Filas ya ordenadas por monto. */
export const groupBreakdownTail = (rows, max = 4) => {
  const list = rows || [];
  if (list.length <= max) return list;
  const head = list.slice(0, max);
  const tail = list.slice(max);
  return [
    ...head,
    {
      key: "__otros",
      label: "Otros",
      count: tail.reduce((a, r) => a + (Number(r.count) || 0), 0),
      amount: tail.reduce((a, r) => a + (Number(r.amount) || 0), 0),
      sharePercent: tail.reduce((a, r) => a + (Number(r.sharePercent) || 0), 0),
    },
  ];
};

/** Filas de breakdown -> segmentos de CompositionBar (share = sharePercent / 100). */
export const segmentsFromBreakdown = (rows, paletteFor) => {
  const grouped = groupBreakdownTail((rows || []).filter((r) => Number(r.amount) > 0), MIX_PALETTE.length - 1);
  return grouped.map((r, i) => {
    const style = (paletteFor && paletteFor(r, i)) || MIX_PALETTE[i % MIX_PALETTE.length];
    return {
      key: String(r.key ?? r.label ?? i),
      label: r.label || "Sin dato",
      amount: Number(r.amount) || 0,
      share: percentToDecimal(r.sharePercent) ?? 0,
      color: style.color,
      ink: style.ink,
    };
  });
};

export const orderTypeStyle = (row) => ORDER_TYPE_PALETTE[String(row?.key || "").toUpperCase()] || null;

/** Texto accesible de una barra de composición. */
export const compositionAriaLabel = (segments) =>
  (segments || []).map((s) => `${s.label} ${fmtPct(s.share, 1)}`).join(", ");

/* ------------------------------------------------------------------ */
/* Estados (pedidos / órdenes)                                         */
/* ------------------------------------------------------------------ */

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** ok | warn | bad | neutral según el texto del estado. */
export const statusTone = (label) => {
  const t = norm(label);
  if (!t || t === "sin dato") return "neutral";
  if (/(devol|cancel|anul|rechaz)/.test(t)) return "bad";
  if (/(entreg|complet|enviad|finaliz|despach|cerrad|factur)/.test(t)) return "ok";
  return "warn";
};

export const STATUS_COLORS = { ok: "#2e8b57", warn: "#b9801b", bad: "#c4472a", neutral: "#6f7b88" };

export const statusColor = (label) => STATUS_COLORS[statusTone(label)];

/* ------------------------------------------------------------------ */
/* Clasificación del kiosko (A, B o C)                                  */
/* ------------------------------------------------------------------ */

/** Rótulo de un kiosco que aún no tiene clasificación. */
export const UNCLASSIFIED_LABEL = "Sin clasificar";

/**
 * 'A' | 'B' | 'C' desde `kiosk_site.sales_category` (se tolera minúscula y espacios); cualquier otro valor, o su
 * ausencia, es null = sin clasificar. La clasificación se asigna a mano en Finanzas kioscos (Costos por kiosco).
 */
export const normalizeCategory = (value) => {
  const code = String(value === null || value === undefined ? "" : value)
    .trim()
    .toUpperCase();
  return code === "A" || code === "B" || code === "C" ? code : null;
};

/** 'Cat. A' (mismo rótulo que Finanzas kioscos) o 'Sin clasificar'. */
export const categoryLabel = (category) => {
  const code = normalizeCategory(category);
  return code ? `Cat. ${code}` : UNCLASSIFIED_LABEL;
};

/* ------------------------------------------------------------------ */
/* Selector de kiosko                                                  */
/* ------------------------------------------------------------------ */

/**
 * Opciones del selector de kiosko desde `kioskOptions` del backend ({ siteId, kioskId, kioskCode, kioskName,
 * category }). El valor es el id del SITIO de Finanzas kioscos (`siteId`): un kiosko histórico no tiene ubicación del
 * POS (`kioskId` null) y aun así se puede elegir. Un kiosko clasificado lleva 'Cat. A' (o B, C) tras el nombre; el
 * orden es por nombre. `name` = nombre sin la clasificación. Si el sitio elegido no viene en la lista se agrega con un
 * nombre genérico.
 */
export const buildKioskOptions = (kioskOptions, selectedSiteId) => {
  const list = (kioskOptions || [])
    .filter((k) => k && k.siteId !== null && k.siteId !== undefined)
    .map((k) => {
      const name = k.kioskName || k.kioskCode || `Kiosko ${k.siteId}`;
      const category = normalizeCategory(k.category);
      return {
        value: String(k.siteId),
        label: category ? `${name} · ${categoryLabel(category)}` : name,
        name,
        category,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  if (selectedSiteId && !list.some((o) => o.value === String(selectedSiteId))) {
    const name = `Kiosko ${selectedSiteId}`;
    list.push({ value: String(selectedSiteId), label: name, name, category: null });
  }
  return [{ value: "", label: "Todos los kioskos", name: "Todos los kioskos", category: null }, ...list];
};

/* ------------------------------------------------------------------ */
/* Series diarias, semanales y tendencia                               */
/* ------------------------------------------------------------------ */

/** DailyPoint[] -> ordenado, sin duplicados y con montos numéricos. */
export const normalizeDaily = (points) => {
  const byDate = new Map();
  (points || []).forEach((p) => {
    if (!p || !isValidYmd(String(p.date || "").slice(0, 10))) return;
    const date = String(p.date).slice(0, 10);
    const prev = byDate.get(date) || { date, amount: 0, count: 0 };
    byDate.set(date, {
      date,
      amount: prev.amount + (Number(p.amount) || 0),
      count: prev.count + (Number(p.count) || 0),
    });
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

/** Serie diaria del consolidado ({date, total, ...}) como DailyPoint[]. */
export const consolidatedDailyAsPoints = (dailySeries) =>
  (dailySeries || []).map((d) => ({ date: d.date, amount: d.total, count: undefined }));

export const fmtDayMonth = (ymd) => (isValidYmd(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "");

export const fmtDmy = (ymd) => (isValidYmd(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "—");

/** Punto con mayor monto (null si no hay ventas). */
export const peakPoint = (points) => {
  let best = null;
  (points || []).forEach((p, index) => {
    const amount = Number(p.amount) || 0;
    if (amount > 0 && (best === null || amount > best.amount)) best = { index, date: p.date, amount };
  });
  return best;
};

/** Dataset de línea con área y el pico resaltado. */
export const buildDailyChartData = (points, { color, fill, label = "Ventas" }) => {
  const list = normalizeDaily(points);
  const peak = peakPoint(list);
  const dense = list.length > 45;
  return {
    labels: list.map((p) => fmtDayMonth(p.date)),
    datasets: [
      {
        label,
        data: list.map((p) => p.amount),
        borderColor: color,
        backgroundColor: fill,
        fill: true,
        borderWidth: 2.5,
        tension: 0.25,
        pointRadius: list.map((_, i) => (peak && i === peak.index ? 5 : dense ? 0 : 2.5)),
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: "#ffffff",
        pointBorderWidth: 1.5,
      },
    ],
    points: list,
    peak,
  };
};

export const buildDailyTableRows = (points) =>
  normalizeDaily(points).map((p) => ({
    label: fmtDmy(p.date),
    amount: fmtMoney(p.amount),
    count: p.count ? fmtCount(p.count) : "—",
  }));

/** Etiquetas de los meses de la tendencia; con año si cruza más de un año. */
export const trendLabels = (trend) => {
  const years = new Set((trend || []).map((t) => t.year));
  return (trend || []).map((t) => (years.size > 1 && t.year ? `${t.label} ${String(t.year).slice(2)}` : t.label));
};

/** Barras apiladas por fuente del consolidado (monthlyTrend con kiosko/online/vendor). */
export const buildStackedTrendData = (monthlyTrend) => ({
  labels: trendLabels(monthlyTrend),
  datasets: [
    ["kiosko", SOURCE_META.KIOSKO],
    ["online", SOURCE_META.ONLINE],
    ["vendor", SOURCE_META.VENDOR],
  ].map(([field, meta]) => ({
    label: meta.label,
    data: (monthlyTrend || []).map((t) => Number(t[field]) || 0),
    backgroundColor: meta.color,
    borderWidth: 0,
    maxBarThickness: 56,
  })),
});

export const buildTrendTableRows = (monthlyTrend) =>
  (monthlyTrend || []).map((t, i) => ({
    label: trendLabels(monthlyTrend)[i],
    kiosko: fmtMoney(t.kiosko),
    online: fmtMoney(t.online),
    vendor: fmtMoney(t.vendor),
    total: fmtMoney(t.total),
  }));

/** Agrupa la serie diaria en semanas de 7 días contadas desde el primer día del rango. */
export const buildWeeklyBars = (dailySeries) => {
  const list = normalizeDaily(dailySeries);
  const weeks = [];
  for (let i = 0; i < list.length; i += 7) {
    const chunk = list.slice(i, i + 7);
    weeks.push({
      label: `Semana ${weeks.length + 1}`,
      from: chunk[0].date,
      to: chunk[chunk.length - 1].date,
      days: chunk.length,
      amount: chunk.reduce((a, p) => a + p.amount, 0),
      count: chunk.reduce((a, p) => a + p.count, 0),
    });
  }
  return weeks;
};

export const buildWeeklyChartData = (weeks, color) => ({
  labels: weeks.map((w) => w.label),
  datasets: [
    {
      label: "Ventas",
      data: weeks.map((w) => w.amount),
      backgroundColor: color,
      borderRadius: 3,
      maxBarThickness: 90,
    },
  ],
});

export const buildWeeklyTableRows = (weeks) =>
  weeks.map((w) => ({
    label: w.label,
    range: `${fmtDayMonth(w.from)} – ${fmtDayMonth(w.to)}`,
    amount: fmtMoney(w.amount),
    count: fmtCount(w.count),
  }));

/* ------------------------------------------------------------------ */
/* Tabla 'Producto terminado por fuente' (Consolidado)                  */
/* ------------------------------------------------------------------ */

/**
 * Filas por fuente + totales. Producto + empaque + envío + histórico = total de cada fila; `hasHistorical` es
 * true si alguna fuente trae histórico (entonces la tabla agrega la columna 'Histórico').
 */
export const buildSourceTable = (sources) => {
  const rows = (sources || []).map((s) => {
    const meta = SOURCE_META[s.channel] || { label: s.label, color: "#6f7b88" };
    const k = s.kpis || {};
    const units = Number(k.unitsFinished) || 0;
    const product = Number(k.productAmount) || 0;
    return {
      channel: s.channel,
      label: s.label || meta.label,
      color: meta.color,
      units,
      productAmount: product,
      avgPrice: units > 0 ? product / units : null,
      packagingAmount: Number(k.packagingAmount) || 0,
      shippingAmount: Number(k.shippingAmount) || 0,
      historicalAmount: Number(k.historicalAmount) || 0,
      totalAmount: Number(k.totalAmount) || 0,
    };
  });
  const sum = (field) => rows.reduce((a, r) => a + r[field], 0);
  return {
    rows,
    hasHistorical: rows.some((r) => r.historicalAmount > 0),
    totals: {
      units: sum("units"),
      productAmount: sum("productAmount"),
      packagingAmount: sum("packagingAmount"),
      shippingAmount: sum("shippingAmount"),
      historicalAmount: sum("historicalAmount"),
      totalAmount: sum("totalAmount"),
    },
  };
};

/* ------------------------------------------------------------------ */
/* Mapa de calor (calendario por mes) y día de la semana               */
/* ------------------------------------------------------------------ */

export const WEEKDAYS = [
  { name: "Lunes", plural: "lunes", short: "lun", letter: "Lun" },
  { name: "Martes", plural: "martes", short: "mar", letter: "Mar" },
  { name: "Miércoles", plural: "miércoles", short: "mié", letter: "Mié" },
  { name: "Jueves", plural: "jueves", short: "jue", letter: "Jue" },
  { name: "Viernes", plural: "viernes", short: "vie", letter: "Vie" },
  { name: "Sábado", plural: "sábados", short: "sáb", letter: "Sáb" },
  { name: "Domingo", plural: "domingos", short: "dom", letter: "Dom" },
];

/** Índice de día de la semana con lunes = 0 ... domingo = 6. */
export const weekdayIndex = (ymd) => {
  const [y, m, d] = String(ymd).split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

/** Etiquetas de la leyenda del mapa de calor (alineadas con HEAT_THRESHOLDS de Finanzas). */
export const HEAT_LABELS = ["< 0.5×", "0.5–0.85×", "0.85–1.15×", "1.15–1.5×", "1.5–2×", "≥ 2×"];

export const fmtTimesMedian = (ratio) => (isNum(ratio) ? `${ratio.toFixed(2)}×` : "—");

/**
 * Un calendario por cada mes que toca el rango (decisión: si el rango abarca varios meses se muestran todos,
 * apilados; cada mes se sombrea contra SU propia mediana). La mediana es la de los días con venta > 0 del mes
 * dentro del rango, igual que en la matriz de Finanzas. Los días sin venta se conservan como 0.00 y no se sombrean.
 * Los días fuera del rango (antes del inicio o después del fin) quedan como celdas vacías.
 */
export const buildMonthCalendars = (dailySeries) => {
  const list = normalizeDaily(dailySeries);
  const groups = new Map();
  list.forEach((p) => {
    const key = p.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });
  return [...groups.entries()].map(([key, points]) => {
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    const med = median(points.map((p) => p.amount).filter((v) => v > 0));
    let bestAmount = 0;
    let bestDate = null;
    points.forEach((p) => {
      if (p.amount > bestAmount) {
        bestAmount = p.amount;
        bestDate = p.date;
      }
    });
    const days = points.map((p) => ({
      date: p.date,
      day: Number(p.date.slice(8, 10)),
      amount: p.amount,
      count: p.count,
      weekday: weekdayIndex(p.date),
      ratio: isNum(med) && med > 0 ? p.amount / med : null,
      bucket: heatBucket(p.amount, med),
      isBest: p.date === bestDate,
    }));
    const cells = [...Array(days[0].weekday).fill(null), ...days];
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return {
      key,
      year,
      month,
      label: `${MONTHS_ES[month - 1]} ${year}`,
      median: med,
      total: points.reduce((a, p) => a + p.amount, 0),
      bestDate,
      days,
      cells,
      weeks,
    };
  });
};

/** Filas de 'Detalle diario': total del día, × mediana (del mes) y acumulado del rango. */
export const buildDetailRows = (calendars) => {
  const multi = (calendars || []).length > 1;
  let acc = 0;
  const rows = [];
  (calendars || []).forEach((cal) => {
    cal.days.forEach((d) => {
      acc += d.amount;
      const wd = WEEKDAYS[d.weekday].short;
      rows.push({
        date: d.date,
        label: multi ? `${d.date.slice(8, 10)}/${d.date.slice(5, 7)} ${wd}` : `${d.day} ${wd}`,
        amount: d.amount,
        ratio: d.ratio,
        bucket: d.bucket,
        isBest: d.isBest,
        cumulative: acc,
      });
    });
  });
  return rows;
};

/** Promedio por día de la semana (los días sin venta cuentan como 0). */
export const aggregateWeekdays = (dailySeries) => {
  const rows = WEEKDAYS.map((w, index) => ({ index, name: w.name, plural: w.plural, short: w.short, total: 0, days: 0 }));
  normalizeDaily(dailySeries).forEach((p) => {
    const r = rows[weekdayIndex(p.date)];
    r.total += p.amount;
    r.days += 1;
  });
  return rows.map((r) => ({ ...r, avg: r.days > 0 ? r.total / r.days : 0 }));
};

const INSIGHT_MIN_DAYS = 14;

/**
 * Frase del mapa de calor: qué dos días de la semana concentran más venta (por promedio) y qué parte de las
 * ventas y de los días representan. null si el rango es muy corto o no hay ventas.
 * Devuelve { lead, rest } para poder resaltar `lead` en negrita.
 */
export const buildWeekdayInsight = (weekdays, noun = "venta") => {
  const withDays = (weekdays || []).filter((w) => w.days > 0);
  const totalSales = withDays.reduce((a, w) => a + w.total, 0);
  const totalDays = withDays.reduce((a, w) => a + w.days, 0);
  if (totalDays < INSIGHT_MIN_DAYS || withDays.length < 3 || !(totalSales > 0)) return null;
  const ranked = [...withDays].sort((a, b) => b.avg - a.avg);
  const top = ranked.slice(0, 2);
  const weakest = ranked[ranked.length - 1];
  const salesShare = top.reduce((a, w) => a + w.total, 0) / totalSales;
  const daysShare = top.reduce((a, w) => a + w.days, 0) / totalDays;
  const names = `${top[0].name} y ${top[1].name.toLowerCase()}`;
  const weakestText = `Los ${weakest.plural} son el día más flojo.`;
  if (salesShare <= daysShare + 0.01) {
    return {
      kind: "even",
      salesShare,
      daysShare,
      lead: "",
      rest: `La ${noun} está repartida de forma pareja entre los días de la semana. ${weakestText}`,
    };
  }
  return {
    kind: "concentrated",
    salesShare,
    daysShare,
    lead: names,
    rest: ` concentran el ${fmtPct(salesShare, 0)} de la ${noun} en el ${fmtPct(daysShare, 0)} de los días. ${weakestText}`,
  };
};

/** Índices de los dos días de la semana con mayor promedio (para resaltar su barra). */
export const topWeekdayIndexes = (weekdays) =>
  [...(weekdays || [])]
    .filter((w) => w.days > 0 && w.avg > 0)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 2)
    .map((w) => w.index);
