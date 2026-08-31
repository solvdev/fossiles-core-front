import { escapeHtml } from "utils/shipmentPrintDocumentHtml";
import fossilesLogoMark from "assets/img/fossiles-logo-mark.png";

function buildSingleSlipHtml(slipNumber) {
  const singleProductRow = `
    <tr>
      <td style="width:100px;"></td>
      <td></td>
      <td style="width:110px;"></td>
      <td style="width:60px;"></td>
      <td style="width:70px;text-align:center;"></td>
      <td style="width:150px;"></td>
    </tr>
  `;

  return `
    <div class="slip-card">
      <div class="slip-header">
        <div class="header-brand">
          <img src="${fossilesLogoMark}" alt="Fossiles" class="brand-logo" />
          <div class="brand-text">
            <div class="brand-title">FOSSILES</div>
            <div class="brand-sub">CONTROL DE DISTRIBUCIÓN INTERNA</div>
          </div>
        </div>
        <div class="header-center">
          <div class="doc-title">BOLETA DE SOLICITUD DE PRODUCTO</div>
          <div class="doc-sub">Documento físico de solicitud previa a autorización</div>
        </div>
        <div class="header-correlative">
          <div class="corr-label">BOLETA NO.</div>
          <div class="corr-value">${escapeHtml(slipNumber)}</div>
        </div>
      </div>

      <div class="slip-body">
        <div class="form-row">
          <div class="form-field flex-1">
            <span class="field-label">Fecha:</span>
            <span class="field-line"></span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field flex-1">
            <span class="field-label">Colaborador / Destino:</span>
            <span class="field-line"></span>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field flex-1">
            <span class="field-label">Observaciones / Motivo:</span>
            <span class="field-line"></span>
          </div>
        </div>

        <div class="items-table-wrap">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width:100px;">Código</th>
                <th>Producto / Descripción</th>
                <th style="width:110px;">Color</th>
                <th style="width:60px;">Talla</th>
                <th style="width:70px;">Cantidad</th>
                <th style="width:150px;">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${singleProductRow}
            </tbody>
          </table>
        </div>

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

  // Cada boleta ocupa exactamente media hoja carta (215.9mm x 139.7mm); 2 boletas por página carta completa.
  const pages = [];
  for (let i = 0; i < slips.length; i += 2) {
    const pair = slips.slice(i, i + 2);
    const halves = pair
      .map(
        (num, idx) => `
      <div class="slip-half ${idx === 0 ? "top" : "bottom"}">
        ${buildSingleSlipHtml(num)}
      </div>
    `
      )
      .join("");
    pages.push(`<div class="print-page">${halves}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Talonario de Boletas de Solicitud</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0;
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
    /* Página carta completa (215.9mm x 279.4mm) con 2 boletas de media hoja cada una */
    .print-page {
      width: 215.9mm;
      height: 279.4mm;
      display: flex;
      flex-direction: column;
      page-break-after: always;
      overflow: hidden;
    }
    .print-page:last-child {
      page-break-after: auto;
    }
    /* Cada boleta: exactamente media hoja carta (215.9mm x 139.7mm) */
    .slip-half {
      width: 100%;
      height: 139.7mm;
      box-sizing: border-box;
      padding: 8mm 10mm;
      position: relative;
      display: flex;
    }
    .slip-half.bottom {
      border-top: 1px dashed #888;
    }
    .slip-half.bottom::before {
      content: "✂ CORTE AQUÍ ✂";
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%);
      background: #fff;
      padding: 0 8px;
      font-size: 9px;
      letter-spacing: 2px;
      color: #888;
    }
    .slip-card {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
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
    .header-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-logo {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      object-fit: contain;
    }
    .slip-body {
      flex: 1;
      display: flex;
      flex-direction: column;
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
    .items-table-wrap {
      flex: 1;
      display: flex;
      margin: 8px 0 6px 0;
      min-height: 0;
    }
    .items-table {
      width: 100%;
      height: 100%;
      border-collapse: collapse;
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
    .items-table td {
      vertical-align: top;
    }
    .signatures-row {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      margin-top: auto;
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
