import React, { useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "reactstrap";
import {
  buildKioskCashCloseReportBodyHtml,
  downloadKioskCashClosePdf,
  exportKioskCashCloseToExcel,
  getKioskCashCloseReportStyles,
} from "utils/kioskCashCloseReport";
import { showError, showSuccess } from "utils/notificationHelper";

function PosCashCloseReportModal({ isOpen, toggle, report, loading }) {
  const [exporting, setExporting] = useState(null);

  const handleExcel = () => {
    if (!report) return;
    try {
      setExporting("excel");
      exportKioskCashCloseToExcel(report);
      showSuccess("Excel descargado.");
    } catch (err) {
      showError(err.message || "No se pudo exportar a Excel.");
    } finally {
      setExporting(null);
    }
  };

  const handlePdf = async () => {
    if (!report) return;
    try {
      setExporting("pdf");
      await downloadKioskCashClosePdf(report);
      showSuccess("PDF descargado.");
    } catch (err) {
      showError(err.message || "No se pudo descargar el PDF.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg" className="kiosk-pos-cash-close-report-modal">
      <ModalHeader toggle={toggle}>Detalle de cierre de caja</ModalHeader>
      <ModalBody style={{ maxHeight: "70vh", overflow: "auto" }}>
        {loading || !report ? (
          <div className="text-center py-5">
            <Spinner color="primary" />
          </div>
        ) : (
          <>
            <style>{getKioskCashCloseReportStyles()}</style>
            <div
              dangerouslySetInnerHTML={{ __html: buildKioskCashCloseReportBodyHtml(report) }}
            />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={Boolean(exporting)}>
          Cerrar
        </Button>
        <Button
          color="success"
          outline
          onClick={handleExcel}
          disabled={!report || Boolean(exporting)}
        >
          {exporting === "excel" ? <Spinner size="sm" /> : "Excel"}
        </Button>
        <Button
          color="primary"
          onClick={handlePdf}
          disabled={!report || Boolean(exporting)}
        >
          {exporting === "pdf" ? <Spinner size="sm" /> : "Descargar PDF"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosCashCloseReportModal;
