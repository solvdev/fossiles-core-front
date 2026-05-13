/** HTML fragments for printing production orders (cincho grid vs color matrix). */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseNumericSize(key) {
  const n = Number.parseInt(String(key).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Niño/niña vs dama/caballero según plan; fuera de rango va a "otras". */
function sizeBand(n) {
  if (n >= 16 && n <= 26) return "youth";
  if (n >= 28) return "adult";
  return "other";
}

function collectCinchoSizesUnion(items) {
  const set = new Set();
  (items || []).forEach((item) => {
    const sizes = item?.sizes && typeof item.sizes === "object" ? item.sizes : null;
    if (!sizes) return;
    Object.entries(sizes).forEach(([k, qty]) => {
      if (Number(qty || 0) <= 0) return;
      const n = parseNumericSize(k);
      if (n != null) set.add(n);
    });
  });
  return Array.from(set).sort((a, b) => a - b);
}

function partitionSizes(sizes) {
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

function rowTotalFromSizes(item, columnSizes) {
  const sizes = item?.sizes && typeof item.sizes === "object" ? item.sizes : {};
  let sum = 0;
  columnSizes.forEach((n) => {
    const q = sizes[String(n)] ?? sizes[n];
    sum += Number(q || 0);
  });
  return sum;
}

/** Orden estable para impresión: mismo código junto (el API suele devolver ítems por orden de alta, no por código). */
function sortCinchoItemsForPrint(items) {
  return [...items].sort((a, b) => {
    const ca = String(a?.productCode || "").trim();
    const cb = String(b?.productCode || "").trim();
    const codeCmp = ca.localeCompare(cb, "es", { numeric: true, sensitivity: "base" });
    if (codeCmp !== 0) return codeCmp;
    const cola = String(a?.colorName || "").trim();
    const colb = String(b?.colorName || "").trim();
    const colorCmp = cola.localeCompare(colb, "es", { sensitivity: "base" });
    if (colorCmp !== 0) return colorCmp;
    return Number(a?.productId || 0) - Number(b?.productId || 0);
  });
}

/**
 * Tabla cinchos: solo tallas presentes en la orden; grupos NIÑO/NIÑA y DAMA/CABALLERO según datos.
 */
export function buildCinchoDetailTableHtml(order) {
  const items = sortCinchoItemsForPrint(Array.isArray(order?.items) ? order.items : []);
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
      const obs = String(item.observations || "").trim();
      const rt = rowTotalFromSizes(item, sizeCols);
      sizeCols.forEach((n, i) => {
        const sizes = item?.sizes && typeof item.sizes === "object" ? item.sizes : {};
        const raw = sizes[String(n)] ?? sizes[n];
        const q = Number(raw || 0);
        if (q > 0) sizeTotals[i] += q;
      });
      const cells = sizeCols
        .map((n) => {
          const sizes = item?.sizes && typeof item.sizes === "object" ? item.sizes : {};
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

function groupKeyForNormalItem(item, orderType) {
  const code = String(item?.productCode || item?.productId || "").trim();
  if (orderType === "MARCAS") {
    return `${code}|||${String(item?.brandName || "").trim()}`;
  }
  return code;
}

function itemLineQty(item) {
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
        observations: [],
      });
    }
    const g = groups.get(key);
    const cname = String(item?.colorName || "").trim() || "-";
    const qty = itemLineQty(item);
    g.colorQty[cname] = (g.colorQty[cname] || 0) + qty;
    const obs = String(item?.observations || "").trim();
    if (obs) g.observations.push(obs);
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
      const obsJoined = Array.from(new Set(g.observations)).join("; ");
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

/** Barra de orientación + script (no imprimible). */
export function getPrintOrientationToolbarHtml() {
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
        try {
          var pref = localStorage.getItem(KEY);
          setOrientation(pref === "landscape");
        } catch (e) {
          injectPageStyle(false);
        }
      })();
    </script>`;
}
