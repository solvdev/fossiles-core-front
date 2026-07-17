import React, { useEffect, useMemo, useState } from "react";
import { Button, FormGroup, Input, Label, Spinner } from "reactstrap";
import {
  formatMainSheetCountLabel,
  formatMainSheetDailyDate,
  formatMainSheetShortDate,
  groupDailySalesByMonth,
} from "utils/kioskMainSheetReportExport";
import {
  formatMainSheetCertifiedAt,
  formatMainSheetSalesRange,
  MAIN_SHEET_REVIEWERS,
} from "utils/kioskMainSheetReviewers";
import { certifyKioskMainSheetReport } from "services/kioskPosService";
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

function KioskMainSheetReportPreview({ report, physicalCountSession, onReportChange, showCertificationForm = true }) {
  const [certifiedBy, setCertifiedBy] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [certError, setCertError] = useState("");

  useEffect(() => {
    setCertifiedBy(report?.mainSheetCertifiedBy || "");
    setReviewedBy(report?.mainSheetReviewedBy || "");
    setCertError("");
  }, [report?.physicalCountId, report?.mainSheetCertifiedBy, report?.mainSheetReviewedBy]);

  const salesRangeLabel = useMemo(
    () => formatMainSheetSalesRange(report?.periodFrom, report?.periodTo),
    [report?.periodFrom, report?.periodTo]
  );

  const isCertified = Boolean(report?.mainSheetCertifiedBy && report?.mainSheetReviewedBy);

  const handleCertify = async () => {
    if (!report?.physicalCountId) return;
    if (!certifiedBy || !reviewedBy) {
      setCertError("Selecciona ambos revisores de la lista.");
      return;
    }
    setSaving(true);
    setCertError("");
    try {
      const updated = await certifyKioskMainSheetReport(report.physicalCountId, {
        certifiedBy,
        reviewedBy,
      });
      if (onReportChange) onReportChange(updated);
    } catch (err) {
      setCertError(err.message || "No se pudo guardar la certificación.");
    } finally {
      setSaving(false);
    }
  };

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
          <p className="small text-muted mb-2">
            Incluye tarjeta 100% y la parte con tarjeta de ventas mixtas. Debe coincidir con el reporte
            &quot;Ventas por tarjeta&quot; o &quot;Voucher&quot; del mismo kiosko y fechas del corte.
          </p>
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

      <div className="kiosk-main-sheet-certification mt-4">
        <div className="kiosk-main-sheet-certification-grid">
          <div className="kiosk-main-sheet-cert-row">
            <span>REVISADO POR:</span>
            <strong>{report.mainSheetCertifiedBy || "—"}</strong>
          </div>
          <div className="kiosk-main-sheet-cert-row">
            <span>INVENTARIO DIGITAL:</span>
            <strong>{formatMainSheetCertifiedAt(report.mainSheetCertifiedAt)}</strong>
          </div>
          <div className="kiosk-main-sheet-cert-row">
            <span>REVISADO POR:</span>
            <strong>{report.mainSheetReviewedBy || "—"}</strong>
          </div>
          <div className="kiosk-main-sheet-cert-row">
            <span>VENTAS DEL:</span>
            <strong>{salesRangeLabel}</strong>
          </div>
        </div>

        {showCertificationForm && (
          <div className="kiosk-main-sheet-cert-form mt-3">
            <div className="row">
              <div className="col-md-4">
                <FormGroup>
                  <Label for="mainSheetCertifiedBy">Revisado y certificado por</Label>
                  <Input
                    id="mainSheetCertifiedBy"
                    type="select"
                    value={certifiedBy}
                    onChange={(e) => setCertifiedBy(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Seleccionar…</option>
                    {MAIN_SHEET_REVIEWERS.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </Input>
                </FormGroup>
              </div>
              <div className="col-md-4">
                <FormGroup>
                  <Label for="mainSheetReviewedBy">Revisado por</Label>
                  <Input
                    id="mainSheetReviewedBy"
                    type="select"
                    value={reviewedBy}
                    onChange={(e) => setReviewedBy(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Seleccionar…</option>
                    {MAIN_SHEET_REVIEWERS.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </Input>
                </FormGroup>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <Button
                  color="primary"
                  onClick={handleCertify}
                  disabled={saving || !report.physicalCountId}
                  block
                >
                  {saving ? (
                    <>
                      <Spinner size="sm" className="mr-1" /> Guardando…
                    </>
                  ) : (
                    isCertified ? "Actualizar certificación" : "Marcar como revisado y certificado"
                  )}
                </Button>
              </div>
            </div>
            {certError && <div className="text-danger small">{certError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default KioskMainSheetReportPreview;
