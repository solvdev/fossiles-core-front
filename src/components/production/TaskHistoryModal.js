import React, { useEffect, useState } from "react";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { getTaskHistory } from "services/taskService";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const LABELS = {
  START: "Iniciada",
  PAUSE: "Pausada",
  RESUME: "Reanudada",
  COMPLETE: "Completada",
  AWAITING_WAREHOUSE: "Terminada en mesa (espera bodega)",
  CANCEL: "Cancelada",
  RESET: "Devuelta a pendiente",
  ITEMS_ADDED: "Productos agregados",
  DELAY_MARKED: "Atraso marcado (sin comisión)",
  DELAY_FORGIVEN: "Atraso perdonado",
};

/** Historial de una tarea: qué le pasó, cuándo, quién y por qué. Solo lectura. */
export default function TaskHistoryModal({ task, onClose }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!task) return undefined;
    let cancelled = false;
    setEvents(null);
    setError("");
    getTaskHistory(task.id)
      .then((rows) => { if (!cancelled) setEvents(rows || []); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [task]);

  return (
    <Modal isOpen={!!task} toggle={onClose} size="lg" centered>
      <ModalHeader toggle={onClose}>Historial de {task ? task.code : ""}</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        {!events && !error && <div className="text-center py-3"><Spinner /></div>}
        {events && events.length === 0 && <p className="text-muted mb-0">Esta tarea todavía no tiene movimientos.</p>}
        {events && events.length > 0 && (
          <Table size="sm" responsive className="mb-0">
            <thead>
              <tr><th>Cuándo</th><th>Qué pasó</th><th>Motivo / detalle</th><th>Usuario</th></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTimeGt(e.createdAt)}</td>
                  <td><strong>{LABELS[e.eventType] || e.eventType}</strong></td>
                  <td>{[e.reason, e.detail].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{e.createdBy ? `#${e.createdBy}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={onClose}>Cerrar</Button>
      </ModalFooter>
    </Modal>
  );
}
