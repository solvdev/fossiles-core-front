import { escapeHtml } from "utils/shipmentPrintDocumentHtml";

function buildSingleSlipHtml(slipNumber) {
  const blankRows = Array.from({ length: 5 }, (_, i) => `
    <tr>
      <td style="text-align:center;height:24px;">${i + 1}</td>
      <td></td>
      <td></td>
      <td></td>
      <td style="text-align:center;"></td>
      <td style="text-align:center;"></td>
      <td></td>
    </tr>
  `).join("");

  return `
    <div class="slip-card">
      <div class="slip-header">
        <div class="header-brand">
          <div class="brand-title">FOSSILES</div>
          <div class="brand-sub">CONTROL DE DISTRIBUCIÓN INTERNA</div>
        </div>
        <div class="header-center">
          <div class="doc-title">BOLETA DE SOLICITUD DE ENVÍO INTERNO</div>
          <div class="doc-sub">Documento físico de solicitud previa a autorización</div>
        </div>
        <div class="header-correlative">
          <div class="corr-label">BOLETA NO.</div>
          <div class="corr-value">${escapeHtml(slipNumber)}</div>
        </div>
      </div>

      <div class="slip-body">
        <div class="form-row">
          <div class="form-field flex-2">
            <span class="field-label">Fecha:</span>
            <span class="field-line"></span>
          </div>
          <div class="form-field flex-3">
            <span class="field-label">Tipo:</span>
            <span class="checkbox-box">[ &nbsp; ] PLANILLA (50%)</span>
            <span class="checkbox-box">[ &nbsp; ] DEFECTOS</span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field flex-3">
            <span class="field-label">Colaborador / Destino:</span>
            <span class="field-line"></span>
          </div>
          <div class="form-field flex-1">
            <span class="field-label">DPI:</span>
            <span class="field-line"></span>
          </div>
          <div class="form-field flex-1">
            <span class="field-label">Tel:</span>
            <span class="field-line"></span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field flex-1">
            <span class="field-label">Observaciones / Motivo:</span>
            <span class="field-line"></span>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th style="width:100px;">Código</th>
              <th>Producto / Descripción</th>
              <th style="width:110px;">Color</th>
              <th style="width:60px;">Talla</th>
              <th style="width:70px;">Cantidad</th>
              <th style="width:150px;">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            ${blankRows}
          </tbody>
        </table>

        <div class="signatures-row">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-title">Solicitado por (Colaborador)</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-title">Ingresado en Sistema (Distribución)</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-title">Autorizado (Contabilidad)</div>
          </div>
        </div>

        <div class="slip-footer-note">
          Nota: Con este número correlativo se ingresa la solicitud al sistema. Contabilidad autoriza antes de generar la orden de producción y el envío ENVI.
        </div>
      </div>
    </div>
  `;
}

export function buildSlipsBookletPrintHtml(slipNumbers = []) {
  const slips = Array.isArray(slipNumbers) ? slipNumbers : [];

  // Agrupamos de 2 en 2 por página carta
  const pages = [];
  for (let i = 0; i < slips.length; i += 2) {
    const pair = slips.slice(i, i + 2);
    const slipHtmls = pair.map((num) => buildSingleSlipHtml(num)).join('<div class="cut-divider"><span>✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ✂</span></div>');
    pages.push(`<div class="print-page">${slipHtmls}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Talonario de Boletas de Solicitud</title>
  <style>
    @page {
      size: letter portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 11px;
      color: #111;
      background: #fff;
    }
    .print-page {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 250mm;
      padding-bottom: 5mm;
    }
    .print-page:last-child {
      page-break-after: auto;
    }
    .cut-divider {
      text-align: center;
      color: #777;
      font-size: 10px;
      margin: 6px 0;
      letter-spacing: 2px;
    }
    .slip-card {
      border: 1.5px solid #222;
      border-radius: 4px;
      padding: 10px 14px;
      background: #fff;
      page-break-inside: avoid;
    }
    .slip-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1.5px solid #333;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .brand-title {
      font-size: 16px;
      font-weight: 900;
      letter-spacing: 1.5px;
      color: #000;
    }
    .brand-sub {
      font-size: 8px;
      font-weight: bold;
      color: #555;
      text-transform: uppercase;
    }
    .header-center {
      text-align: center;
      flex: 1;
      padding: 0 10px;
    }
    .doc-title {
      font-size: 13px;
      font-weight: bold;
      letter-spacing: 0.5px;
      color: #111;
    }
    .doc-sub {
      font-size: 9px;
      color: #666;
    }
    .header-correlative {
      border: 2px solid #000;
      border-radius: 4px;
      padding: 4px 10px;
      text-align: center;
      background: #fafafa;
    }
    .corr-label {
      font-size: 8px;
      font-weight: bold;
      color: #444;
      text-transform: uppercase;
    }
    .corr-value {
      font-size: 14px;
      font-weight: 900;
      color: #b00;
      letter-spacing: 1px;
    }
    .form-row {
      display: flex;
      gap: 12px;
      margin-bottom: 6px;
      align-items: flex-end;
    }
    .form-field {
      display: flex;
      align-items: flex-end;
      gap: 6px;
    }
    .flex-1 { flex: 1; }
    .flex-2 { flex: 2; }
    .flex-3 { flex: 3; }
    .field-label {
      font-weight: bold;
      font-size: 10px;
      white-space: nowrap;
      color: #222;
    }
    .field-line {
      flex: 1;
      border-bottom: 1px solid #555;
      height: 14px;
      display: inline-block;
    }
    .checkbox-box {
      font-size: 10px;
      font-weight: bold;
      margin-right: 12px;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0 6px 0;
    }
    .items-table th, .items-table td {
      border: 1px solid #444;
      padding: 3px 6px;
      font-size: 10px;
    }
    .items-table th {
      background: #f0f0f0;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      font-size: 9px;
    }
    .signatures-row {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-top: 14px;
      padding: 0 10px;
    }
    .sig-box {
      flex: 1;
      text-align: center;
    }
    .sig-line {
      border-bottom: 1px solid #333;
      margin-bottom: 4px;
      height: 18px;
    }
    .sig-title {
      font-size: 9px;
      font-weight: bold;
      color: #444;
    }
    .slip-footer-note {
      font-size: 8px;
      color: #777;
      text-align: center;
      margin-top: 6px;
      font-style: italic;
    }
  </style>
</head>
<body>
  ${pages.join("\n")}
</body>
</html>`;
}

export function openSlipsBookletPrintWindow(slipNumbers = []) {
  const html = buildSlipsBookletPrintHtml(slipNumbers);
  const win = window.open("", "_blank", "width=850,height=750");
  if (!win) {
    throw new Error("El navegador bloqueó la ventana de impresión. Permita ventanas emergentes.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch (_e) {
      // Ignorar si el usuario cancela o cierra
    }
  }, 400);
}
