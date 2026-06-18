/** HTML fragments for printing production orders (cincho grid vs color matrix). */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Quita sufijo "(N)" previo para no duplicar al reagrupar. */
export function normalizeObservationText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s*\(\d+\)\s*$/u, "")
    .trim();
}

/** Acumula observación ponderada por unidades (tallas o cantidad de línea). */
export function addObservationCount(parts, observation, quantity = 1) {
  const text = normalizeObservationText(observation);
  if (!text) return;
  const n = Math.max(1, Number(quantity) || 0);
  parts.push({ text, count: n });
}

/** Agrupa textos de observación y formatea "texto (N); ..." (N = unidades con esa observación). */
export function formatObservationsWithCounts(parts) {
  const order = [];
  const counts = new Map();
  (parts || []).forEach((part) => {
    let text;
    let weight = 1;
    if (part != null && typeof part === "object") {
      text = normalizeObservationText(part.text ?? part.observation ?? "");
      weight = Math.max(0, Number(part.count ?? part.qty ?? 1));
    } else {
      text = normalizeObservationText(part);
      weight = 1;
    }
    if (!text || weight <= 0) return;
    if (!counts.has(text)) {
      order.push(text);
      counts.set(text, 0);
    }
    counts.set(text, counts.get(text) + weight);
  });
  if (!order.length) return "";
  return order
    .map((text) => {
      const n = counts.get(text) || 0;
      return `${text} (${n})`;
    })
    .join("; ");
}

/** Comentarios por color: "Rojo: Urgente (2); Logo | Azul: Revisar talla". */
export function formatObservationsByColor(observationsByColor, colorOrder = []) {
  const byColor = observationsByColor || {};
  const seen = new Set();
  const colors = [];
  (colorOrder || []).forEach((c) => {
    const key = String(c || "").trim() || "-";
    if (!byColor[key]?.length || seen.has(key)) return;
    seen.add(key);
    colors.push(key);
  });
  Object.keys(byColor)
    .filter((c) => byColor[c]?.length && !seen.has(c))
    .sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }))
    .forEach((c) => {
      seen.add(c);
      colors.push(c);
    });
  if (!colors.length) return "";
  return colors
    .map((color) => {
      const block = formatObservationsWithCounts(byColor[color]);
      return block ? `${color}: ${block}` : "";
    })
    .filter(Boolean)
    .join(" | ");
}

function parseNumericSize(key) {
  const n = Number.parseInt(String(key).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Unifica guiones Unicode y espacios para que "L-28" y "L‐28" agrupen igual. */
function normalizeProductCodeKey(code) {
  return String(code || "")
    .normalize("NFKC")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Niño/niña vs dama/caballero según plan; fuera de rango va a "otras". */
function sizeBand(n) {
  if (n >= 16 && n <= 26) return "youth";
  if (n >= 28) return "adult";
  return "other";
}

export function collectCinchoSizesUnion(items) {
  const set = new Set();
  (items || []).forEach((item) => {
    const sizes = coerceSizesMap(item?.sizes);
    Object.entries(sizes).forEach(([k, qty]) => {
      if (Number(qty || 0) <= 0) return;
      const n = parseNumericSize(k);
      if (n != null) set.add(n);
    });
  });
  return Array.from(set).sort((a, b) => a - b);
}

export function partitionSizes(sizes) {
  const youth = [];
  const adult = [];
  const other = [];
  sizes.forEach((n) => {
    const b = sizeBand(n);
    if (b === "youth") youth.push(n);
    else if (b === "adult") adult.push(n);
    else other.push(n);
  });
  return { youth, adult, other };
}

export function rowTotalFromSizes(item, columnSizes) {
  const sizes = coerceSizesMap(item?.sizes);
  let sum = 0;
  columnSizes.forEach((n) => {
    const q = sizes[String(n)] ?? sizes[n];
    sum += Number(q || 0);
  });
  return sum;
}

/** Unifica nombre de color para agrupar (misma fila si el nombre es el mismo salvo mayúsculas/espacios). */
function normalizeColorKey(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es");
}

/** Clave de agrupación: mismo código + mismo color (por id si viene, si no por nombre normalizado). */
function cinchoLineGroupKey(item) {
  const codeKey = normalizeProductCodeKey(item?.productCode) || "-";
  const cid = item?.colorId;
  if (cid != null && cid !== "") {
    const n = Number(cid);
    if (Number.isFinite(n)) return `${codeKey}|||id:${n}`;
    const s = String(cid).trim();
    if (s) return `${codeKey}|||id:${s}`;
  }
  const colorPart = String(item?.colorName || "").trim();
  return `${codeKey}|||name:${normalizeColorKey(colorPart)}`;
}

/**
 * Una fila por (código + color): suma tallas solo dentro de esa pareja.
 * Líneas duplicadas del mismo código y color (p. ej. API/BD) siguen consolidándose en una sola fila.
 */
export function mergeCinchoItemsByProductCodeAndColor(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    const key = cinchoLineGroupKey(item);
    const sizes = coerceSizesMap(item?.sizes);
    const displayCode = String(item?.productCode || "").trim() || "-";
    const colorPart = String(item?.colorName || "").trim();

    if (!map.has(key)) {
      map.set(key, {
        productCode: displayCode,
        colorName: colorPart || "-",
        sizes: {},
        observationParts: [],
      });
    }
    const g = map.get(key);
    if (displayCode !== "-" && g.productCode === "-") g.productCode = displayCode;
    if (colorPart && (g.colorName === "-" || !String(g.colorName || "").trim())) g.colorName = colorPart;

    Object.entries(sizes).forEach(([k, qty]) => {
      const n = parseNumericSize(k);
      if (n == null) return;
      const add = Number(qty || 0);
      if (add <= 0) return;
      const sk = String(n);
      g.sizes[sk] = (g.sizes[sk] || 0) + add;
    });
    const obs = String(item?.observations || "").trim();
    if (obs) {
      const lineQty = Object.values(sizes).reduce((s, q) => s + Number(q || 0), 0);
      addObservationCount(g.observationParts, obs, lineQty || 1);
    }
  });

  return Array.from(map.values())
    .map((g) => ({
      productCode: g.productCode,
      colorName: String(g.colorName || "").trim() || "-",
      sizes: g.sizes,
      observations: formatObservationsWithCounts(g.observationParts),
    }))
    .filter((g) => Object.keys(g.sizes).length > 0 || g.observations)
    .sort((a, b) => {
      const ca = normalizeProductCodeKey(a.productCode) || a.productCode;
      const cb = normalizeProductCodeKey(b.productCode) || b.productCode;
      const c0 = ca.localeCompare(cb, "es", { numeric: true, sensitivity: "base" });
      if (c0 !== 0) return c0;
      return String(a.colorName || "").localeCompare(String(b.colorName || ""), "es", { sensitivity: "base" });
    });
}

export function coerceSizesMap(sizes) {
  if (sizes == null) return {};
  if (typeof sizes === "string") {
    try {
      const p = JSON.parse(sizes);
      return p && typeof p === "object" && !Array.isArray(p) ? p : {};
    } catch {
      return {};
    }
  }
  if (typeof sizes === "object" && !Array.isArray(sizes)) return sizes;
  return {};
}

/**
 * Tabla cinchos: solo tallas presentes en la orden; grupos NIÑO/NIÑA y DAMA/CABALLERO según datos.
 */
export function buildCinchoDetailTableHtml(order) {
  const raw = Array.isArray(order?.items) ? order.items : [];
  const items = mergeCinchoItemsByProductCodeAndColor(raw);
  const columnSizes = collectCinchoSizesUnion(items);
  const { youth, adult, other } = partitionSizes(columnSizes);

  const hasYouth = youth.length > 0;
  const hasAdult = adult.length > 0;
  const hasOther = other.length > 0;
  const sizeCols = [...youth, ...adult, ...other];
  const nSize = sizeCols.length;

  if (items.length === 0 || nSize === 0) {
    return `
      <table class="lines lines-cincho">
        <thead>
          <tr><th colspan="5">Detalle</th></tr>
        </thead>
        <tbody>
          <tr><td colspan="5">Sin líneas con tallas en esta orden.</td></tr>
        </tbody>
      </table>`;
  }

  const headerRow1 = [];
  headerRow1.push(`<th rowspan="2" class="col-code">CÓDIGO</th>`);
  if (hasYouth) {
    headerRow1.push(`<th colspan="${youth.length}" class="group-h">NIÑO / NIÑA</th>`);
  }
  if (hasAdult) {
    headerRow1.push(`<th colspan="${adult.length}" class="group-h">DAMA / CABALLERO</th>`);
  }
  if (hasOther) {
    headerRow1.push(`<th colspan="${other.length}" class="group-h">OTRA(S)</th>`);
  }
  headerRow1.push(`<th rowspan="2" class="col-total-h">TOTAL</th>`);
  headerRow1.push(`<th rowspan="2" class="col-color-h">COLOR</th>`);
  headerRow1.push(`<th rowspan="2" class="col-comments-h">COMENTARIOS</th>`);

  const headerRow2 = sizeCols.map((n) => `<th class="size-col">${escapeHtml(String(n))}</th>`).join("");

  const sizeTotals = sizeCols.map(() => 0);
  const bodyRows = items
    .map((item) => {
      const code = item.productCode || "-";
      const color = item.colorName || "-";
      const obs = String(item.observations ?? "").trim();
      const rt = rowTotalFromSizes(item, sizeCols);
      sizeCols.forEach((n, i) => {
        const sizes = coerceSizesMap(item?.sizes);
        const raw = sizes[String(n)] ?? sizes[n];
        const q = Number(raw || 0);
        if (q > 0) sizeTotals[i] += q;
      });
      const cells = sizeCols
        .map((n) => {
          const sizes = coerceSizesMap(item?.sizes);
          const raw = sizes[String(n)] ?? sizes[n];
          const q = Number(raw || 0);
          const show = q > 0 ? String(q) : "";
          return `<td class="numeric size-cell">${escapeHtml(show)}</td>`;
        })
        .join("");
      return `
        <tr>
          <td class="col-code">${escapeHtml(code)}</td>
          ${cells}
          <td class="numeric col-total">${escapeHtml(rt)}</td>
          <td class="col-color">${escapeHtml(color)}</td>
          <td class="col-comments">${escapeHtml(obs)}</td>
        </tr>`;
    })
    .join("");

  const grandTotal = sizeTotals.reduce((a, b) => a + b, 0);
  const footCells = sizeTotals.map((t) => `<td class="numeric"><strong>${escapeHtml(t)}</strong></td>`).join("");

  return `
    <table class="lines lines-cincho">
      <thead>
        <tr>${headerRow1.join("")}</tr>
        <tr>${headerRow2}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td><strong>TOTAL</strong></td>
          ${footCells}
          <td class="numeric"><strong>${escapeHtml(grandTotal)}</strong></td>
          <td></td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

export function groupKeyForNormalItem(item, orderType) {
  const code = String(item?.productCode || item?.productId || "").trim();
  if (orderType === "MARCAS") {
    return `${code}|||${String(item?.brandName || "").trim()}`;
  }
  return code;
}

export function itemLineQty(item) {
  const sizes = item?.sizes && typeof item.sizes === "object" ? item.sizes : null;
  if (sizes && Object.keys(sizes).length > 0) {
    return Object.values(sizes).reduce((s, q) => s + Number(q || 0), 0);
  }
  return Number(item?.quantity || 0);
}

/**
 * Matriz producto × color (union de colores en la orden).
 */
export function buildNormalColorMatrixTableHtml(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const orderType = order?.orderType;
  const showBrand = orderType === "MARCAS";

  if (items.length === 0) {
    return `
      <table class="lines lines-color-matrix">
        <thead><tr><th>Detalle</th></tr></thead>
        <tbody><tr><td>Sin líneas en esta orden.</td></tr></tbody>
      </table>`;
  }

  const colorSet = new Set();
  items.forEach((item) => {
    const name = String(item?.colorName || "").trim();
    colorSet.add(name || "-");
  });
  const colorColumns = Array.from(colorSet).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const groups = new Map();
  items.forEach((item) => {
    const key = groupKeyForNormalItem(item, orderType);
    if (!groups.has(key)) {
      groups.set(key, {
        productCode: item.productCode || "-",
        productName: item.productName || "-",
        brandName: item.brandName || "-",
        colorQty: {},
        observationsByColor: {},
      });
    }
    const g = groups.get(key);
    const cname = String(item?.colorName || "").trim() || "-";
    const qty = itemLineQty(item);
    g.colorQty[cname] = (g.colorQty[cname] || 0) + qty;
    const obs = String(item?.observations || "").trim();
    if (obs) {
      if (!g.observationsByColor[cname]) g.observationsByColor[cname] = [];
      addObservationCount(g.observationsByColor[cname], obs, qty);
    }
  });

  const headerCols = [
    "<th>CÓDIGO</th>",
    "<th>PRODUCTO</th>",
    ...(showBrand ? ["<th>MARCA</th>"] : []),
    ...colorColumns.map((c) => `<th>${escapeHtml(c)}</th>`),
    "<th>TOTAL</th>",
    "<th>COMENTARIOS</th>",
  ].join("");

  let footTotals = colorColumns.map(() => 0);
  const rows = Array.from(groups.values())
    .map((g) => {
      let rowTotal = 0;
      const colorCells = colorColumns.map((col, idx) => {
        const v = g.colorQty[col] || 0;
        rowTotal += v;
        footTotals[idx] += v;
        const show = v > 0 ? String(v) : "";
        return `<td class="numeric">${escapeHtml(show)}</td>`;
      });
      const obsJoined = formatObservationsByColor(g.observationsByColor, colorColumns);
      return `
        <tr>
          <td>${escapeHtml(g.productCode)}</td>
          <td>${escapeHtml(g.productName)}</td>
          ${showBrand ? `<td>${escapeHtml(g.brandName)}</td>` : ""}
          ${colorCells.join("")}
          <td class="numeric">${escapeHtml(rowTotal)}</td>
          <td class="col-comments">${escapeHtml(obsJoined)}</td>
        </tr>`;
    })
    .join("");

  const matrixGrand = footTotals.reduce((a, b) => a + b, 0);
  const footColorCells = footTotals.map((t) => `<td class="numeric"><strong>${escapeHtml(t)}</strong></td>`).join("");
  const leadCols = 2 + (showBrand ? 1 : 0);

  return `
    <table class="lines lines-color-matrix">
      <thead><tr>${headerCols}</tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="${leadCols}"><strong>TOTAL</strong></td>
          ${footColorCells}
          <td class="numeric"><strong>${escapeHtml(matrixGrand)}</strong></td>
          <td></td>
        </tr>
      </tfoot>
    </table>`;
}

/** Barra de orientación + script (no imprimible). initialLandscape = elección del modal. */
export function getPrintOrientationToolbarHtml(initialLandscape = false) {
  const init = initialLandscape ? "true" : "false";
  return `
    <div class="no-print print-toolbar">
      <span class="print-toolbar-label">Orientación:</span>
      <button type="button" class="print-toolbar-btn" id="op-print-portrait">Vertical</button>
      <button type="button" class="print-toolbar-btn" id="op-print-landscape">Horizontal</button>
      <button type="button" class="print-toolbar-btn print-toolbar-primary" id="op-print-go">Imprimir</button>
    </div>
    <script>
      (function () {
        var KEY = "op-print-orientation";
        var INITIAL = ${init};
        function injectPageStyle(landscape) {
          var el = document.getElementById("print-page-size");
          if (!el) {
            el = document.createElement("style");
            el.id = "print-page-size";
            document.head.appendChild(el);
          }
          el.textContent = landscape
            ? "@page { size: letter landscape; margin: 9mm; }"
            : "@page { size: letter portrait; margin: 9mm; }";
          document.body.classList.toggle("layout-landscape", !!landscape);
          var p = document.getElementById("op-print-portrait");
          var l = document.getElementById("op-print-landscape");
          if (p) p.classList.toggle("print-toolbar-active", !landscape);
          if (l) l.classList.toggle("print-toolbar-active", !!landscape);
        }
        function setOrientation(landscape) {
          injectPageStyle(landscape);
          try {
            localStorage.setItem(KEY, landscape ? "landscape" : "portrait");
          } catch (e) {}
        }
        var p = document.getElementById("op-print-portrait");
        var l = document.getElementById("op-print-landscape");
        var g = document.getElementById("op-print-go");
        if (p) p.onclick = function () { setOrientation(false); };
        if (l) l.onclick = function () { setOrientation(true); };
        if (g) g.onclick = function () { window.print(); };
        setOrientation(INITIAL);
      })();
    </script>`;
}
