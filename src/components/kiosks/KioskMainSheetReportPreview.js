import React from "react";
import {
  formatMainSheetCountLabel,
  formatMainSheetDailyDate,
  formatMainSheetShortDate,
  groupDailySalesByMonth,
} from "utils/kioskMainSheetReportExport";
import { formatDateGt } from "utils/dateTimeHelper";

const formatMoney = (value) => {
  const n = Number(value || 0);
  return `Q ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDifference = (value) => {
  const n = Number(value || 0);
  if (Math.abs(n) < 0.005) return "Q -";
  return formatMoney(n);
};

const kioskTitle = (report) => {
  const name = String(report?.kioskName || report?.kioskCode || "KIOSKO").trim().toUpperCase();
  return `REPORTE DE VENTAS KIOSCO ${name}`;
};

function KioskMainSheetReportPreview({ report, physicalCountSession }) {
  if (!report) {
    return (
      <div className="text-muted text-center py-4">
        Selecciona un corte de conteo físico y genera la vista previa.
      </div>
    );
  }

  const monthGroups = groupDailySalesByMonth(report.dailySales);

  return (
    <div className="kiosk-main-sheet-preview">
      {physicalCountSession && (
        <div className="small text-muted mb-3">
          <strong>Corte #{report.physicalCountId}</strong>
          {" · "}
          {formatMainSheetCountLabel(physicalCountSession)}
          {" · "}
          Período {formatDateGt(report.periodFrom)} — {formatDateGt(report.periodTo)}
        </div>
      )}

      <div className="kiosk-main-sheet-layout">
        <div className="kiosk-main-sheet-left">
          <table className="table table-sm table-bordered mb-0">
            <thead>
              <tr>
                <th>Etiquetas de fila</th>
                <th className="text-right">Suma de Total Facturado</th>
              </tr>
            </thead>
            <tbody>
              {monthGroups.map((group) => (
                <React.Fragment key={group.key || group.label}>
                  <tr className="table-active font-weight-bold">
                    <td>{group.label}</td>
                    <td className="text-right">{formatMoney(group.monthTotal)}</td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.saleDate}>
                      <td>{formatMainSheetDailyDate(row.saleDate)}</td>
                      <td className="text-right">{formatMoney(row.amount)}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {!monthGroups.length && (
                <tr>
                  <td colSpan="2" className="text-center text-muted">
                    Sin ventas en el período del corte
                  </td>
                </tr>
              )}
              <tr className="kiosk-main-sheet-total-row">
                <td className="font-weight-bold">Total general</td>
                <td className="text-right font-weight-bold">{formatMoney(report.totalSold)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="kiosk-main-sheet-right">
          <div className="kiosk-main-sheet-title">{kioskTitle(report)}</div>

          <div className="kiosk-main-sheet-summary-row plain">
            <span>ENCARGADA</span>
            <strong>{report.encargadaName || "—"}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row plain">
            <span>FECHA INICIAL</span>
            <strong>{formatMainSheetShortDate(report.periodFrom)}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row plain">
            <span>FECHA FINAL</span>
            <strong>{formatMainSheetShortDate(report.periodTo)}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row plain">
            <span>FACTURAS DE LA</span>
            <strong>{report.invoiceFrom || "—"}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row plain">
            <span>A LA</span>
            <strong>{report.invoiceTo || "—"}</strong>
          </div>

          <div className="kiosk-main-sheet-summary-row highlight">
            <span>TOTAL VENDIDO</span>
            <strong>{formatMoney(report.totalSold)}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row highlight">
            <span>TARJETAS</span>
            <strong>{formatMoney(report.cardsTotal)}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row highlight">
            <span>DEPOSITOS</span>
            <strong>{formatMoney(report.depositsTotal)}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row highlight">
            <span>GASTOS</span>
            <strong>{formatMoney(report.expensesTotal)}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row highlight">
            <span>TOTAL</span>
            <strong>{formatMoney(report.reconciledTotal)}</strong>
          </div>
          <div className="kiosk-main-sheet-summary-row highlight">
            <span>DIFERENCIA</span>
            <strong>{formatDifference(report.difference)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KioskMainSheetReportPreview;
