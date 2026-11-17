import React from "react";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import "views/reports/reportsDesign.css";
import "./kardexDesign.css";

const STATUS = {
  PENDING: { label: "Pendiente", color: "#b45309", bg: "#fef3c7" },
  COMPLETED: { label: "Completada", color: "#047857", bg: "#d1fae5" },
  CANCELLED: { label: "Cancelada", color: "#b91c1c", bg: "#fee2e2" },
};

const place = (name, code) => (name ? `${name}${code ? ` (${code})` : ""}` : "—");

function Field({ label, children, wide = false }) {
  return (
    <div style={{ gridColumn: wide ? "1 / -1" : undefined }}>
      <span className="kdx-field-label">{label}</span>
      <div className="kdx-field-value">{children || "—"}</div>
    </div>
  );
}

/** Detalle de una transferencia desde el kardex: de dónde a dónde, qué ítem, cuánto y quién la hizo. */
function KardexTransferModal({ isOpen, loading, transfer, onClose }) {
  const status = STATUS[transfer?.status] || { label: transfer?.status || "—", color: "#4b5563", bg: "#f3f4f6" };
  const isProduct = !!transfer?.productId;
  return (
    <Modal isOpen={isOpen} toggle={onClose} size="lg" centered>
      <ModalHeader toggle={onClose}>
        Transferencia {transfer?.id ? `TRF-${transfer.id}` : ""}
        {transfer && (
          <span className="rpt-badge ml-2" style={{ color: status.color, background: status.bg, fontSize: "0.78rem" }}>
            {status.label}
          </span>
        )}
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="rpt-empty">
            <Spinner /> <div className="mt-2">Cargando transferencia…</div>
          </div>
        ) : transfer ? (
          <div className="kdx-detail-grid">
            <Field label="Sale de">{place(transfer.fromLocationName, transfer.fromLocationCode)}</Field>
            <Field label="Llega a">{place(transfer.toLocationName, transfer.toLocationCode)}</Field>
            <Field label={isProduct ? "Producto" : "Material"} wide>
              {[transfer.productName || transfer.materialName, transfer.productCode || transfer.materialSku]
                .filter(Boolean)
                .join(" · ")}
            </Field>
            <Field label="Cantidad transferida">
              <strong>{Number(transfer.quantity || 0).toLocaleString("es-GT", { maximumFractionDigits: 3 })}</strong>
            </Field>
            <Field label="Fecha de la transferencia">
              {transfer.transferDate ? formatDateTimeGt(transfer.transferDate) : ""}
            </Field>
            {transfer.reason && (
              <Field label="Motivo" wide>
                {transfer.reason}
              </Field>
            )}
            <Field label="Creada por">
              {[transfer.createdByName, transfer.createdAt ? formatDateTimeGt(transfer.createdAt) : ""]
                .filter(Boolean)
                .join(" · ")}
            </Field>
            {transfer.updatedByName && transfer.updatedByName !== transfer.createdByName && (
              <Field label="Actualizada por">
                {[transfer.updatedByName, transfer.updatedAt ? formatDateTimeGt(transfer.updatedAt) : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </Field>
            )}
          </div>
        ) : (
          <Alert color="warning" className="mb-0">
            No se pudieron cargar los detalles de la transferencia.
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default KardexTransferModal;
