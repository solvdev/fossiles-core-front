import React, { useState } from "react";
import { Button, Card, CardBody } from "reactstrap";
import { downloadTaxInvoiceCertifiedXml, openFelInvoiceReport } from "services/taxInvoiceService";
import { showError } from "utils/notificationHelper";
import { formatCurrency, getSaleInternalNumber } from "./posUtils";

function PosSuccessScreen({ sale, onNewSale }) {
  const [downloadingXml, setDownloadingXml] = useState(false);

  if (!sale) return null;

  const invoice = sale.invoice || null;
  const felStatus = invoice?.status || sale.felStatus;
  const felUuid = invoice?.felUuid || sale.felUuid;
  const felSerie = invoice?.felSerie || sale.felSerie;
  const felNumero = invoice?.felNumero || sale.felNumero;
  const internalNumber = getSaleInternalNumber(sale);
  const felError = invoice?.felError || sale.felError;
  const canDownloadXml = felStatus === "CERTIFIED" && invoice?.hasCertifiedXml && invoice?.id;
  const canDownloadFelReport = felStatus === "CERTIFIED" && felUuid;

  const handleDownloadFelReport = () => {
    try {
      openFelInvoiceReport(felUuid);
    } catch (err) {
      showError(err.message || "No se pudo abrir la factura FEL.");
    }
  };

  const handleDownloadXml = async () => {
    if (!invoice?.id) return;
    try {
      setDownloadingXml(true);
      await downloadTaxInvoiceCertifiedXml(invoice.id);
    } catch (err) {
      showError(err.message || "No se pudo descargar el XML certificado.");
    } finally {
      setDownloadingXml(false);
    }
  };

  return (
    <Card className="kiosk-pos-block kiosk-pos-success">
      <CardBody className="text-center py-5">
        <h3 className="text-success mb-3">Venta registrada</h3>
        {internalNumber ? (
          <>
            <p className="text-muted small mb-1">No. control interno (FEL)</p>
            <p className="kiosk-pos-success-number mb-2">
              <strong>{internalNumber}</strong>
            </p>
          </>
        ) : null}
        <p className="text-muted small mb-1">Venta POS</p>
        <p className="mb-2">{sale.saleNumber}</p>
        <p className="mb-1">
          Total cobrado: <strong>{formatCurrency(sale.totalAmount)}</strong>
        </p>
        {(sale.customerTaxId || sale.customerName) && (
          <p className="mb-1 text-muted">
            Factura: <strong>{sale.customerTaxId || "CF"}</strong>
            {sale.customerName ? ` — ${sale.customerName}` : ""}
          </p>
        )}
        {sale.changeAmount != null && Number(sale.changeAmount) > 0 && (
          <p className="mb-1">
            Cambio: <strong>{formatCurrency(sale.changeAmount)}</strong>
          </p>
        )}
        {(felStatus === "CERTIFIED" || felUuid) && (
          <div className="mb-3 p-3 bg-light rounded text-left">
            <div className="text-success font-weight-bold mb-2">Factura electrónica (FEL)</div>
            {String(felSerie || "").toUpperCase().includes("PRUEBAS") && (
              <p className="text-warning small mb-2">
                Ambiente de <strong>pruebas</strong> INFILE — documento sin validez fiscal.
              </p>
            )}
            {felUuid && (
              <p className="mb-1 small">
                <strong>Autorización:</strong> {felUuid}
              </p>
            )}
            {sale.email && (
              <p className="mb-1 small text-muted">
                Factura enviada a: <strong>{sale.email}</strong>
              </p>
            )}
            {(felSerie || felNumero) && (
              <p className="mb-2 small">
                <strong>Serie / Número SAT:</strong> {felSerie || "—"} / {felNumero || "—"}
              </p>
            )}
            {internalNumber && (
              <p className="mb-2 small">
                <strong>No. control:</strong> {internalNumber}
              </p>
            )}
            {(canDownloadFelReport || canDownloadXml) && (
              <div className="d-flex flex-wrap" style={{ gap: "0.5rem" }}>
                {canDownloadFelReport && (
                  <Button color="primary" size="sm" outline onClick={handleDownloadFelReport}>
                    Descargar factura
                  </Button>
                )}
                {canDownloadXml && (
                  <Button color="success" size="sm" onClick={handleDownloadXml} disabled={downloadingXml}>
                    {downloadingXml ? "Descargando..." : "Descargar XML certificado"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {felStatus === "FAILED" && felError && (
          <p className="text-danger small mb-3">FEL: {felError}</p>
        )}
        <p className="text-muted mb-4">Inventario rebajado en el kiosko.</p>
        <Button color="primary" className="kiosk-pos-btn-main" onClick={onNewSale}>
          Nueva venta
        </Button>
      </CardBody>
    </Card>
  );
}

export default PosSuccessScreen;
