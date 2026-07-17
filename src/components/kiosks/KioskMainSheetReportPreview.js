import React, { useEffect, useMemo, useState } from "react";
import { Button, FormGroup, Input, Label, Spinner } from "reactstrap";
import {
  formatMainSheetCountLabel,
  formatMainSheetDailyDate,
  formatMainSheetShortDate,
  groupDailySalesByMonth,
} from "utils/kioskMainSheetReportExport";
import {
  buildMainSheetCertificationHeader,
  MAIN_SHEET_REVIEWERS,
  resolveMainSheetInventoryRange,
  resolveMainSheetSalesCertRange,
  toInputDate,
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
  const [inventoryFrom, setInventoryFrom] = useState("");
  const [inventoryTo, setInventoryTo] = useState("");
  const [salesFrom, setSalesFrom] = useState("");
  const [salesTo, setSalesTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [certError, setCertError] = useState("");

  useEffect(() => {
    if (!report) return;
    const inventory = resolveMainSheetInventoryRange(report);
    const sales = resolveMainSheetSalesCertRange(report);
    setCertifiedBy(report.mainSheetCertifiedBy || "");
    setReviewedBy(report.mainSheetReviewedBy || "");
    setInventoryFrom(toInputDate(inventory.from));
    setInventoryTo(toInputDate(inventory.to));
    setSalesFrom(toInputDate(sales.from));
    setSalesTo(toInputDate(sales.to));
    setCertError("");
  }, [
    report?.physicalCountId,
    report?.mainSheetCertifiedBy,
    report?.mainSheetReviewedBy,
    report?.mainSheetInventoryFrom,
    report?.mainSheetInventoryTo,
    report?.mainSheetSalesFrom,
    report?.mainSheetSalesTo,
    report?.periodFrom,
    report?.periodTo,
  ]);

  const certHeader = useMemo(() => buildMainSheetCertificationHeader(report), [report]);
  const isCertified = Boolean(report?.mainSheetCertifiedBy && report?.mainSheetReviewedBy);

  const handleCertify = async () => {
    if (!report?.physicalCountId) return;
    if (!certifiedBy || !reviewedBy) {
      setCertError("Selecciona ambos revisores de la lista.");
      return;
    }
    if (!inventoryFrom || !inventoryTo || !salesFrom || !salesTo) {
      setCertError("Completa todas las fechas (desde y hasta).");
      return;
    }
    if (inventoryFrom > inventoryTo || salesFrom > salesTo) {
      setCertError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    setSaving(true);
    setCertError("");
    try {
      const updated = await certifyKioskMainSheetReport(report.physicalCountId, {
        certifiedBy,
        reviewedBy,
        inventoryFrom,
        inventoryTo,
        salesFrom,
        salesTo,
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
      <div className="kiosk-main-sheet-top">
        {physicalCountSession && (
          <div className="kiosk-main-sheet-top-left small text-muted">
            <strong>Corte #{report.physicalCountId}</strong>
            {" · "}
            {formatMainSheetCountLabel(physicalCountSession)}
            {" · "}
            Período {formatDateGt(report.periodFrom)} — {formatDateGt(report.periodTo)}
          </div>
        )}

        <div className="kiosk-main-sheet-cert-header">
          <div className="kiosk-main-sheet-cert-header-row">
            <span>REVISADO Y CERTIFICADO POR:</span>
            <strong>{certHeader.certifiedBy}</strong>
          </div>
          <div className="kiosk-main-sheet-cert-header-row">
            <span>INVENTARIO DIGITAL:</span>
            <strong>{certHeader.inventoryRange}</strong>
          </div>
          <div className="kiosk-main-sheet-cert-header-row">
            <span>REVISADO POR:</span>
            <strong>{certHeader.reviewedBy}</strong>
          </div>
          <div className="kiosk-main-sheet-cert-header-row">
            <span>VENTAS DEL:</span>
            <strong>{certHeader.salesRange}</strong>
          </div>
        </div>
      </div>

      {showCertificationForm && (
        <div className="kiosk-main-sheet-cert-form">
          <div className="row">
            <div className="col-md-3">
              <FormGroup className="mb-2">
                <Label for="mainSheetCertifiedBy" className="small mb-1">Revisado y certificado por</Label>
                <Input
                  id="mainSheetCertifiedBy"
                  type="select"
                  bsSize="sm"
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
            <div className="col-md-3">
              <FormGroup className="mb-2">
                <Label for="mainSheetReviewedBy" className="small mb-1">Revisado por</Label>
                <Input
                  id="mainSheetReviewedBy"
                  type="select"
                  bsSize="sm"
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
            <div className="col-md-3">
              <FormGroup className="mb-2">
                <Label className="small mb-1">Inventario digital</Label>
                <div className="d-flex align-items-center">
                  <Input
                    type="date"
                    bsSize="sm"
                    value={inventoryFrom}
                    onChange={(e) => setInventoryFrom(e.target.value)}
                    disabled={saving}
                  />
                  <span className="mx-1 small">al</span>
                  <Input
                    type="date"
                    bsSize="sm"
                    value={inventoryTo}
                    onChange={(e) => setInventoryTo(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </FormGroup>
            </div>
            <div className="col-md-3">
              <FormGroup className="mb-2">
                <Label className="small mb-1">Ventas del</Label>
                <div className="d-flex align-items-center">
                  <Input
                    type="date"
                    bsSize="sm"
                    value={salesFrom}
                    onChange={(e) => setSalesFrom(e.target.value)}
                    disabled={saving}
                  />
                  <span className="mx-1 small">al</span>
                  <Input
                    type="date"
                    bsSize="sm"
                    value={salesTo}
                    onChange={(e) => setSalesTo(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </FormGroup>
            </div>
          </div>
          <div className="d-flex align-items-center justify-content-end flex-wrap">
            {certError && <div className="text-danger small mr-3 mb-2 mb-md-0">{certError}</div>}
            <Button
              color="primary"
              size="sm"
              onClick={handleCertify}
              disabled={saving || !report.physicalCountId}
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
    </div>
  );
}

export default KioskMainSheetReportPreview;
