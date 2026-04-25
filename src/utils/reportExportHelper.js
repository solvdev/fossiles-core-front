import { formatNowGt } from "./dateTimeHelper";

export const exportRowsToCsv = (filename, headers, rows) => {
  const escapeCsv = (value) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const headerLine = headers.map((h) => escapeCsv(h.label)).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsv(typeof h.value === "function" ? h.value(row) : row[h.value])).join(",")
  );

  const csv = [headerLine, ...dataLines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportRowsToPdf = (title, headers, rows) => {
  const safeTitle = String(title || "Reporte");
  const now = formatNowGt();

  const toCell = (value) => String(value ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const headerHtml = headers.map((h) => `<th>${toCell(h.label)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = headers
        .map((h) => {
          const raw = typeof h.value === "function" ? h.value(row) : row[h.value];
          return `<td>${toCell(raw)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${toCell(safeTitle)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 16px; color: #111; }
          h1 { font-size: 18px; margin: 0 0 6px; }
          .meta { font-size: 12px; color: #555; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
          th { background: #f3f4f6; font-weight: 700; }
          @media print { body { margin: 8mm; } }
        </style>
      </head>
      <body>
        <h1>${toCell(safeTitle)}</h1>
        <div class="meta">Generado: ${toCell(now)} · Registros: ${rows.length}</div>
        <table>
          <thead><tr>${headerHtml}</tr></thead>
          <tbody>${bodyHtml || `<tr><td colspan="${headers.length}">Sin datos</td></tr>`}</tbody>
        </table>
        <script>
          window.onload = function () {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  win.document.close();
};
