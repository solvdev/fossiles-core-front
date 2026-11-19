import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import Select from "react-select";
import { Bar } from "react-chartjs-2";
import { getKioskSalesByCategory } from "services/kioskSalesByCategoryService";
import { getLocations } from "services/locationService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";
import { formatCurrency, POS_MODE_ENTRECUEROS } from "views/kiosks/pos/posUtils";
import * as XLSX from "xlsx";
import "./reportsDesign.css";
import "./KioskSalesByCategoryReport.css";

const FILTER_MONTH = "month";
const FILTER_RANGE = "range";
const UNCATEGORIZED = "Sin categoría";
const NONE_SUBGROUP_KEY = "__NONE__";

const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const SUBGROUP_ORDER = [
  "DAMA",
  "DAMA_CASUAL",
  "DAMA_FORMAL",
  "CABALLERO",
  "CABALLERO_CASUAL",
  "CABALLERO_FORMAL",
  "NINO",
  "SIN_CLASIFICAR",
];

const SUBGROUP_COLORS = {
  DAMA: "#0b6e71",
  DAMA_CASUAL: "#2a9d8f",
  DAMA_FORMAL: "#1d3557",
  CABALLERO: "#1f2937",
  CABALLERO_CASUAL: "#4b5563",
  CABALLERO_FORMAL: "#111827",
  NINO: "#c77d0a",
  SIN_CLASIFICAR: "#9ca3af",
  [NONE_SUBGROUP_KEY]: "#51cbce",
};

const FALLBACK_COLORS = ["#51cbce", "#fbc658", "#ef8157", "#6bd098", "#9c27b0", "#344675"];

const SIN_CLASIFICAR_CODE = "SIN_CLASIFICAR";
const CATEGORY_BAR_COLOR = "#0b6e71";
const SIN_CLASIFICAR_HINT =
  "Productos de esta categoría a los que aún les falta el público (dama / caballero) o el tipo de cincho (casual / reversible) en el catálogo.";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderRadius: 8,
    borderColor: state.isFocused ? "#0b6e71" : "#d9e1e8",
    boxShadow: "none",
    "&:hover": { borderColor: "#0b6e71" },
  }),
  menu: (base) => ({ ...base, zIndex: 5 }),
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const sumField = (rows, field) => (rows || []).reduce((acc, row) => acc + toNumber(row?.[field]), 0);

/** Días del mes (mes 1..12) con aritmética de calendario, sin Date local ni toISOString. */
export const daysInCalendarMonth = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (m === 2) {
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return leap ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 0;
};

/** YYYY-MM → { from, to } inclusive del mes, solo con partes del string. */
export const monthToInclusiveRange = (yearMonth) => {
  const text = String(yearMonth || "").trim();
  const year = text.slice(0, 4);
  const month = text.slice(5, 7);
  const last = daysInCalendarMonth(year, month);
  if (!last || year.length !== 4 || month.length !== 2) return { from: "", to: "" };
  const dd = String(last).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${dd}` };
};

export const categoryLabel = (row) => {
  const name = row?.categoryName;
  if (name != null && String(name).trim() !== "") return String(name);
  return UNCATEGORIZED;
};

export const subgroupLabelOf = (row) => {
  const label = row?.subgroupLabel;
  if (label != null && String(label).trim() !== "") return String(label);
  const code = row?.subgroupCode;
  if (code != null && String(code).trim() !== "") return String(code);
  return "";
};

export const hasSubgroup = (row) => Boolean(subgroupLabelOf(row));

/** Parte (0–100) que ocupa un monto dentro del total; null si el total no es positivo. */
export const shareOfTotal = (value, total) => {
  const t = toNumber(total);
  if (t <= 0) return null;
  return (toNumber(value) / t) * 100;
};

export const formatShare = (share) => {
  if (share == null) return "—";
  const rounded = Math.round(share * 10) / 10;
  return `${String(rounded).replace(/\.0$/, "")}%`;
};

const subgroupColor = (code, fallbackIndex = 0) =>
  SUBGROUP_COLORS[code] || FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];

function ShareCell({ value, total, color }) {
  const share = shareOfTotal(value, total);
  const width = share == null ? 0 : Math.min(100, Math.max(share > 0 ? 2 : 0, share));
  return (
    <td className="rpt-num ksc-share">
      <span className="ksc-share-text">{formatShare(share)}</span>
      <span className="ksc-share-bar" aria-hidden="true">
        <span style={{ width: `${width}%`, background: color }} />
      </span>
    </td>
  );
}

const categoryKey = (row) => (row?.categoryId == null ? "null" : String(row.categoryId));

const subgroupKey = (row) => {
  const code = row?.subgroupCode;
  if (code != null && String(code).trim() !== "") return String(code).trim();
  return NONE_SUBGROUP_KEY;
};

const sortSubgroupKeys = (keys) => {
  const rank = (key) => {
    if (key === NONE_SUBGROUP_KEY) return SUBGROUP_ORDER.length + 1;
    const i = SUBGROUP_ORDER.indexOf(key);
    return i === -1 ? SUBGROUP_ORDER.length : i;
  };
  return [...keys].sort((a, b) => {
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
};

/** Agrupa filas planas por categoryId. split = la categoría trae al menos un subgrupo. */
export const groupRowsByCategory = (rows) => {
  const order = [];
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = categoryKey(row);
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(row);
  });
  return order.map((key) => {
    const items = map.get(key);
    return {
      key,
      categoryId: items[0]?.categoryId ?? null,
      label: categoryLabel(items[0]),
      split: items.some(hasSubgroup),
      rows: items,
      units: sumField(items, "units"),
      totalAmount: sumField(items, "totalAmount"),
      totalAmountNoIva: sumField(items, "totalAmountNoIva"),
    };
  });
};

export const buildCategoryChartData = (groups) => {
  if (!groups.length) return null;
  const labels = groups.map((group) => group.label);
  const hasAnySubgroup = groups.some((group) => group.split);

  if (!hasAnySubgroup) {
    return {
      data: {
        labels,
        datasets: [
          {
            label: "Total con IVA",
            data: groups.map((group) => group.totalAmount),
            backgroundColor: "#0b6e71",
            maxBarThickness: 48,
          },
        ],
      },
      stacked: false,
    };
  }

  const seen = new Map();
  groups.forEach((group) => {
    group.rows.forEach((row) => {
      const key = subgroupKey(row);
      if (!seen.has(key)) seen.set(key, subgroupLabelOf(row) || "Sin subgrupo");
    });
  });
  const keys = sortSubgroupKeys([...seen.keys()]);
  return {
    data: {
      labels,
      datasets: keys.map((key, index) => ({
        label: seen.get(key),
        data: groups.map((group) =>
          group.rows
            .filter((row) => subgroupKey(row) === key)
            .reduce((acc, row) => acc + toNumber(row.totalAmount), 0)
        ),
        backgroundColor: SUBGROUP_COLORS[key] || FALLBACK_COLORS[index % FALLBACK_COLORS.length],
        stack: "sales",
        maxBarThickness: 48,
      })),
    },
    stacked: true,
  };
};

/** NUMERIC(12,3): hasta 3 decimales, sin ceros a la derecha; conserva negativos. */
export const formatUnits = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(3)));
};

const formatMonthEs = (yearMonth) => {
  const text = String(yearMonth || "").trim();
  const year = text.slice(0, 4);
  const month = Number(text.slice(5, 7));
  const name = MONTH_NAMES_ES[month - 1];
  if (!name || year.length !== 4) return text || "—";
  return `${name} ${year}`;
};

const isKioskLocation = (location) => {
  const text = `${location?.categoria || ""} ${location?.name || ""} ${location?.code || ""}`.toUpperCase();
  return text.includes("KIOS") || String(location?.code || "").toUpperCase().startsWith("K");
};

const isEntrecuerosLocation = (location) =>
  String(location?.name ?? "").toLowerCase().includes("entrecuer") ||
  String(location?.posMode ?? location?.pos_mode ?? "").trim().toUpperCase() === POS_MODE_ENTRECUEROS;

const currentMonthValue = () => getTodayYmdGuatemala().slice(0, 7);

const chartOptions = (stacked) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: stacked,
      position: "top",
      align: "start",
      labels: { boxWidth: 12, boxHeight: 12, font: { size: 11 }, color: "#4a4642" },
    },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
      },
    },
  },
  scales: {
    x: {
      stacked,
      grid: { display: false, drawBorder: false },
      ticks: { color: "#66615b", maxRotation: 45, minRotation: 0, autoSkip: true },
    },
    y: {
      stacked,
      beginAtZero: true,
      grid: { color: "#eee", drawBorder: false },
      ticks: {
        color: "#66615b",
        callback: (value) => formatCurrency(value),
      },
    },
  },
});

function CategorySalesChart({ groups }) {
  const chart = useMemo(() => buildCategoryChartData(groups), [groups]);
  const options = useMemo(() => (chart ? chartOptions(chart.stacked) : null), [chart]);
  if (!chart) return null;
  return (
    <div className="rpt-chart-wrap mb-3">
      <h6 className="rpt-section-title">Ventas por categoría</h6>
      <div
        className="rpt-chart"
        data-testid="kiosk-sales-by-category-chart"
        role="img"
        aria-label="Barras de total con IVA por categoría, apiladas por subgrupo cuando hay subgrupos"
      >
        <Bar data={chart.data} options={options} />
      </div>
    </div>
  );
}

function KioskSalesByCategoryReport() {
  const defaultMonth = currentMonthValue();
  const defaultRange = monthToInclusiveRange(defaultMonth);
  const [filterMode, setFilterMode] = useState(FILTER_MONTH);
  const [monthValue, setMonthValue] = useState(defaultMonth);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [kiosks, setKiosks] = useState([]);
  const [selectedKiosks, setSelectedKiosks] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Misma fuente que rotación / existencias: GET /locations, filtrado a kioscos (no hay endpoint dedicado).
        const locations = await getLocations();
        if (cancelled) return;
        setKiosks(
          (locations || [])
            .filter((location) => isKioskLocation(location) && !location.posTestMode && !isEntrecuerosLocation(location))
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"))
        );
      } catch (err) {
        if (!cancelled) showError(err.message || "No se pudieron cargar los kioscos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kioskOptions = useMemo(
    () => kiosks.map((k) => ({ value: k.id, label: k.code ? `${k.name} (${k.code})` : k.name })),
    [kiosks]
  );

  const resolveRange = () =>
    filterMode === FILTER_MONTH ? monthToInclusiveRange(monthValue) : { from: fromDate, to: toDate };

  const loadReport = async () => {
    const { from, to } = resolveRange();
    setLoading(true);
    setError("");
    try {
      const params = { from, to };
      if (selectedKiosks.length) {
        params.kioskIds = selectedKiosks.map((opt) => opt.value).join(",");
      }
      const data = await getKioskSalesByCategory(params);
      setReport(data);
    } catch (err) {
      setReport(null);
      const msg = err.message || "No se pudo generar el reporte de ventas de kioscos";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    const month = currentMonthValue();
    const range = monthToInclusiveRange(month);
    setFilterMode(FILTER_MONTH);
    setMonthValue(month);
    setFromDate(range.from);
    setToDate(range.to);
    setSelectedKiosks([]);
  };

  const exportExcel = () => {
    if (!report) return;
    const rows = [
      ["Categoría", "Subgrupo", "Unidades", "Total (con IVA) Q", "Total sin IVA Q"],
      ...(report.rows || []).map((row) => [
        categoryLabel(row),
        subgroupLabelOf(row),
        formatUnits(row.units),
        row.totalAmount,
        row.totalAmountNoIva,
      ]),
      [
        "Total general",
        "",
        formatUnits(report.totals?.units),
        report.totals?.totalAmount,
        report.totals?.totalAmountNoIva,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas de kioscos");
    const { from, to } = report.from && report.to ? { from: report.from, to: report.to } : resolveRange();
    XLSX.writeFile(wb, `ventas_kioscos_${from || "desde"}_${to || "hasta"}.xlsx`);
  };

  const rows = report?.rows || [];
  const totals = report?.totals;
  const groups = useMemo(() => groupRowsByCategory(rows), [rows]);
  const grandTotal = totals?.totalAmount;
  const averagePrice = toNumber(totals?.units) > 0 ? toNumber(totals?.totalAmount) / toNumber(totals?.units) : 0;
  const hasUnclassified = rows.some((row) => row?.subgroupCode === SIN_CLASIFICAR_CODE);
  const hasUncategorized = rows.some((row) => row?.categoryId == null);

  const filterSummary = useMemo(() => {
    const period =
      filterMode === FILTER_MONTH
        ? `Mes: ${formatMonthEs(monthValue)}`
        : `Rango: ${fromDate || "—"} a ${toDate || "—"}`;
    const kiosksText = selectedKiosks.length
      ? `Kioscos: ${selectedKiosks.map((kiosk) => kiosk.label).join(", ")}`
      : "Kioscos: todos";
    return `${period} · ${kiosksText}`;
  }, [filterMode, monthValue, fromDate, toDate, selectedKiosks]);

  return (
    <div className="content rpt-page">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex flex-wrap justify-content-between align-items-start" style={{ gap: 12 }}>
                <div>
                  <CardTitle tag="h4">Ventas de kioscos por categoría</CardTitle>
                  <p className="rpt-subtitle">
                    Ventas netas por categoría y subgrupo (pueden ser negativas). El total general es el que envía el
                    servidor, no una suma de la tabla.
                  </p>
                </div>
                <div className="rpt-controls">
                  <Button color="success" size="sm" onClick={exportExcel} disabled={loading || !report}>
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <div className="rpt-toolbar">
                <div>
                  <span className="rpt-label d-block">Periodo</span>
                  <div className="rpt-segment" role="group" aria-label="Tipo de filtro">
                    <button
                      type="button"
                      className={filterMode === FILTER_MONTH ? "is-active" : ""}
                      aria-pressed={filterMode === FILTER_MONTH}
                      onClick={() => setFilterMode(FILTER_MONTH)}
                    >
                      Mes
                    </button>
                    <button
                      type="button"
                      className={filterMode === FILTER_RANGE ? "is-active" : ""}
                      aria-pressed={filterMode === FILTER_RANGE}
                      onClick={() => {
                        const range = monthToInclusiveRange(monthValue);
                        if (range.from && range.to) {
                          setFromDate(range.from);
                          setToDate(range.to);
                        }
                        setFilterMode(FILTER_RANGE);
                      }}
                    >
                      Rango de fechas
                    </button>
                  </div>
                </div>
                {filterMode === FILTER_MONTH ? (
                  <div>
                    <Label for="kiosk-sales-month" className="rpt-label d-block">
                      Mes
                    </Label>
                    <Input
                      id="kiosk-sales-month"
                      type="month"
                      value={monthValue}
                      onChange={(e) => setMonthValue(e.target.value)}
                      style={{ minWidth: 180 }}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <Label for="kiosk-sales-from" className="rpt-label d-block">
                        Desde
                      </Label>
                      <Input
                        id="kiosk-sales-from"
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label for="kiosk-sales-to" className="rpt-label d-block">
                        Hasta
                      </Label>
                      <Input
                        id="kiosk-sales-to"
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div style={{ minWidth: 260, flex: "1 1 260px", maxWidth: 480 }}>
                  <Label for="kiosk-sales-kiosks" className="rpt-label d-block">
                    Kioscos
                  </Label>
                  <Select
                    inputId="kiosk-sales-kiosks"
                    isMulti
                    isClearable
                    placeholder="Todos los kioscos"
                    noOptionsMessage={() => "Sin kioscos"}
                    options={kioskOptions}
                    value={selectedKiosks}
                    onChange={(value) => setSelectedKiosks(value || [])}
                    styles={selectStyles}
                  />
                </div>
                <div className="d-flex align-items-end" style={{ gap: 12 }}>
                  <Button color="primary" onClick={loadReport} disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner size="sm" className="mr-1" /> Consultando
                      </>
                    ) : (
                      "Consultar"
                    )}
                  </Button>
                  <Button color="link" className="rpt-clear" onClick={clearFilters} disabled={loading}>
                    Limpiar filtros
                  </Button>
                </div>
              </div>

              <p className="rpt-filter-summary" aria-live="polite">
                {filterSummary}
              </p>

              {error && <Alert color="danger">{error}</Alert>}

              {!report && !error && !loading && (
                <p className="text-muted mb-0">Elige el periodo y pulsa Consultar.</p>
              )}

              {loading && !report && (
                <div className="rpt-empty">
                  <Spinner /> <div className="mt-2">Consultando reporte…</div>
                </div>
              )}

              {report && (
                <div style={loading ? { opacity: 0.55 } : undefined}>
                  <div className="rpt-tiles rpt-tiles--4">
                    <div className="rpt-tile is-static" style={{ borderLeftColor: "#0b6e71" }}>
                      <span className="rpt-tile-label" style={{ color: "#0b6e71" }}>
                        Total con IVA
                      </span>
                      <span className="rpt-tile-value">{formatCurrency(totals?.totalAmount)}</span>
                    </div>
                    <div className="rpt-tile is-static" style={{ borderLeftColor: "#1f2937" }}>
                      <span className="rpt-tile-label" style={{ color: "#1f2937" }}>
                        Total sin IVA
                      </span>
                      <span className="rpt-tile-value">{formatCurrency(totals?.totalAmountNoIva)}</span>
                    </div>
                    <div className="rpt-tile is-static" style={{ borderLeftColor: "#c77d0a" }}>
                      <span className="rpt-tile-label" style={{ color: "#c77d0a" }}>
                        Unidades
                      </span>
                      <span className="rpt-tile-value">{formatUnits(totals?.units)}</span>
                    </div>
                    <div className="rpt-tile is-static" style={{ borderLeftColor: "#4f6bd8" }}>
                      <span className="rpt-tile-label" style={{ color: "#4f6bd8" }}>
                        Precio promedio
                      </span>
                      <span className="rpt-tile-value">{formatCurrency(averagePrice)}</span>
                      <span className="rpt-tile-hint">por unidad, con IVA · {groups.length} categorías</span>
                    </div>
                  </div>

                  {rows.length > 0 && <CategorySalesChart groups={groups} />}

                  <div className="rpt-table-wrap">
                    <Table className="rpt-table rpt-table--compact rpt-table--sales" hover={false} responsive>
                      <thead>
                        <tr>
                          <th>Categoría</th>
                          <th className="rpt-num">Unidades</th>
                          <th className="rpt-num">Total (con IVA) Q</th>
                          <th className="rpt-num">Total sin IVA Q</th>
                          <th className="rpt-num ksc-share-col">% del total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!rows.length ? (
                          <tr>
                            <td colSpan="5" className="text-center text-muted">
                              No hay datos para mostrar
                            </td>
                          </tr>
                        ) : (
                          groups.flatMap((group) => {
                            if (!group.split) {
                              return group.rows.map((row, index) => (
                                <tr key={`${group.key}-${index}`} data-row-type="category">
                                  <td className="rpt-name">
                                    <span
                                      className="ksc-swatch"
                                      style={{ background: CATEGORY_BAR_COLOR }}
                                      aria-hidden="true"
                                    />
                                    {categoryLabel(row)}
                                  </td>
                                  <td className="rpt-num">{formatUnits(row.units)}</td>
                                  <td className="rpt-num">{formatCurrency(row.totalAmount)}</td>
                                  <td className="rpt-num">{formatCurrency(row.totalAmountNoIva)}</td>
                                  <ShareCell value={row.totalAmount} total={grandTotal} color={CATEGORY_BAR_COLOR} />
                                </tr>
                              ));
                            }
                            return [
                              <tr
                                key={`${group.key}-subtotal`}
                                className="rpt-row-subtotal"
                                data-row-type="category-subtotal"
                              >
                                <td className="rpt-name">{group.label}</td>
                                <td className="rpt-num">{formatUnits(group.units)}</td>
                                <td className="rpt-num">{formatCurrency(group.totalAmount)}</td>
                                <td className="rpt-num">{formatCurrency(group.totalAmountNoIva)}</td>
                                <ShareCell value={group.totalAmount} total={grandTotal} color="#1f2937" />
                              </tr>,
                              ...group.rows.map((row, index) => (
                                <tr
                                  key={`${group.key}-${row.subgroupCode || index}`}
                                  className="rpt-row-subgroup"
                                  data-row-type="subgroup"
                                  data-subgroup-code={row.subgroupCode || ""}
                                >
                                  <td title={row.subgroupCode === SIN_CLASIFICAR_CODE ? SIN_CLASIFICAR_HINT : undefined}>
                                    <span
                                      className="ksc-swatch"
                                      style={{ background: subgroupColor(subgroupKey(row), index) }}
                                      aria-hidden="true"
                                    />
                                    {subgroupLabelOf(row) || "Sin subgrupo"}
                                  </td>
                                  <td className="rpt-num">{formatUnits(row.units)}</td>
                                  <td className="rpt-num">{formatCurrency(row.totalAmount)}</td>
                                  <td className="rpt-num">{formatCurrency(row.totalAmountNoIva)}</td>
                                  <ShareCell
                                    value={row.totalAmount}
                                    total={grandTotal}
                                    color={subgroupColor(subgroupKey(row), index)}
                                  />
                                </tr>
                              )),
                            ];
                          })
                        )}
                      </tbody>
                      {totals && (
                        <tfoot>
                          <tr>
                            <td>Total general</td>
                            <td className="rpt-num">{formatUnits(totals.units)}</td>
                            <td className="rpt-num">{formatCurrency(totals.totalAmount)}</td>
                            <td className="rpt-num">{formatCurrency(totals.totalAmountNoIva)}</td>
                            <td className="rpt-num ksc-share">{rows.length ? "100%" : "—"}</td>
                          </tr>
                        </tfoot>
                      )}
                    </Table>
                  </div>

                  {(hasUnclassified || hasUncategorized) && (
                    <div className="ksc-notes" role="note">
                      {hasUnclassified && (
                        <p>
                          <span
                            className="ksc-swatch"
                            style={{ background: SUBGROUP_COLORS.SIN_CLASIFICAR }}
                            aria-hidden="true"
                          />
                          <strong>Sin clasificar:</strong> {SIN_CLASIFICAR_HINT} Complétalo en Productos y el reporte
                          los separa solo.
                        </p>
                      )}
                      {hasUncategorized && (
                        <p>
                          <strong>Sin categoría:</strong> productos que no tienen categoría asignada en el catálogo.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskSalesByCategoryReport;
