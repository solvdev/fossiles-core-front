import { fmtMoney, fmtPct } from "utils/financeFormat";
import { fmtAxisMoney } from "./financeReportHelpers";

/**
 * Tokens de los gráficos. Año actual = primario del tema (relleno sólido, línea continua,
 * marcador circular); año base = gris (relleno rayado 45°, línea discontinua, marcador cuadrado),
 * de modo que la distinción no dependa sólo del color.
 */
export const CHART_COLORS = {
  current: "#51cbce",
  currentInk: "#2c9fa2",
  base: "#8a8f94",
  baseInk: "#6c7176",
  grid: "#e9e8e4",
  tick: "#66615b",
  surface: "#ffffff",
};

/** Patrón de rayas a 45° (textura del año base) para rellenos de barras y leyenda. */
export const hatchPattern = (color = CHART_COLORS.base, bg = "#eceff1") => {
  if (typeof document === "undefined") return bg;
  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return bg;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-1, size + 1);
  ctx.lineTo(size + 1, -1);
  ctx.moveTo(-1, 1);
  ctx.lineTo(1, -1);
  ctx.moveTo(size - 1, size + 1);
  ctx.lineTo(size + 1, size - 1);
  ctx.stroke();
  return ctx.createPattern(canvas, "repeat") || bg;
};

/** Opciones comunes: rejilla hairline, sin borde de eje, tooltip compartido por mes. */
export const baseChartOptions = ({ yFormat = "money", tooltipExtra } = {}) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  animation: { duration: 250 },
  layout: { padding: { top: 4, right: 8 } },
  plugins: {
    legend: {
      position: "top",
      align: "start",
      labels: { boxWidth: 14, boxHeight: 14, color: "#252422", padding: 14, font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: "#252422",
      padding: 10,
      titleFont: { size: 12 },
      bodyFont: { size: 12, weight: "600" },
      callbacks: {
        label: (ctx) => {
          const v = ctx.parsed.y;
          const txt = yFormat === "pct" ? fmtPct(v) : fmtMoney(v);
          return ` ${ctx.dataset.label}: ${v === null || v === undefined ? "sin dato" : txt}`;
        },
        ...(tooltipExtra ? { afterBody: tooltipExtra } : {}),
      },
    },
  },
  scales: {
    y: {
      beginAtZero: yFormat !== "pct",
      grid: { color: CHART_COLORS.grid, drawBorder: false },
      ticks: {
        color: CHART_COLORS.tick,
        maxTicksLimit: 6,
        callback: (v) => (yFormat === "pct" ? fmtPct(v, 0) : `Q ${fmtAxisMoney(v)}`),
      },
    },
    x: {
      grid: { display: false, drawBorder: false },
      ticks: { color: CHART_COLORS.tick },
    },
  },
});
