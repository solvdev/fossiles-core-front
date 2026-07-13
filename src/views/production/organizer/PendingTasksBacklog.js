import React, { useMemo, useState } from "react";
import {
  Card, CardBody, CardHeader, CardTitle, Table, Badge, Button, Spinner,
  Modal, ModalHeader, ModalBody, ModalFooter, FormGroup, Label, Input, Row, Col,
} from "reactstrap";
import { scheduleTask } from "services/taskService";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showSuccess, showError } from "utils/notificationHelper";
import { getTaskBaseHours } from "utils/taskHoursHelper";

function daysLate(scheduledDate) {
  if (!scheduledDate) return null;
  const today = new Date(`${getTodayYmdGuatemala()}T00:00:00`);
  const sched = new Date(`${String(scheduledDate).slice(0, 10)}T00:00:00`);
  const diff = Math.round((today - sched) / 86400000);
  return diff > 0 ? diff : 0;
}

function taskProductsSummary(task) {
  const items = task?.items || [];
  if (items.length === 0) return task?.productName || "—";
  const first = items[0];
  const label = `${first.productCode || ""} ${first.productName || ""}`.trim();
  return items.length > 1 ? `${label} +${items.length - 1} más` : label;
}

function taskColorSummary(task) {
  const items = task?.items || [];
  const fromItems = [...new Set(items.map((i) => i.colorName).filter(Boolean))];
  if (fromItems.length > 0) {
    return fromItems.length > 1
      ? `${fromItems[0]} +${fromItems.length - 1}`
      : fromItems[0];
  }
  return task?.colorName || null;
}

/**
 * Tareas PENDING que quedaron de días anteriores (fecha pasada o sin fecha,
 * con o sin mesa). Permite reprogramarlas a la fecha/mesa que se elija.
 */
export default function PendingTasksBacklog({ backlog, loading, numDesks, onReload, onRescheduled }) {
  const [modal, setModal] = useState({ open: false, task: null, date: getTodayYmdGuatemala(), desk: "" });
  const [saving, setSaving] = useState(false);
  const [orderFilter, setOrderFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");

  const filteredBacklog = useMemo(() => {
    const orderQ = orderFilter.trim().toLowerCase();
    const productQ = productFilter.trim().toLowerCase();
    if (!orderQ && !productQ) return backlog;

    return backlog.filter((t) => {
      const op = String(t.productionOrderCode || "").toLowerCase();
      const productText = [
        t.productCode,
        t.productName,
        ...(t.items || []).map((i) => `${i.productCode || ""} ${i.productName || ""}`),
      ].join(" ").toLowerCase();

      const matchOrder = !orderQ || op.includes(orderQ);
      const matchProduct = !productQ || productText.includes(productQ);
      return matchOrder && matchProduct;
    });
  }, [backlog, orderFilter, productFilter]);

  const openReprogram = (task) => {
    setModal({
      open: true,
      task,
      date: getTodayYmdGuatemala(),
      desk: task?.desk ? String(task.desk) : "",
    });
  };

  const saveReprogram = async () => {
    const { task, date, desk } = modal;
    if (!task?.id) return;
    if (!date) {
      showError("Seleccione la fecha.");
      return;
    }
    setSaving(true);
    try {
      await scheduleTask(task.id, {
        scheduledDate: date,
        desk: desk ? Number(desk) : null,
      });
      showSuccess(`Tarea ${task.code} reprogramada para ${formatDateGt(date)}${desk ? ` en mesa ${desk}` : " (sin mesa)"}.`);
      setModal({ open: false, task: null, date: getTodayYmdGuatemala(), desk: "" });
      if (onRescheduled) await onRescheduled();
    } catch (err) {
      // El backend bloquea asignar mesa si falta troquelado — mostrar el mensaje tal cual.
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="d-flex justify-content-between align-items-center">
        <div>
          <CardTitle tag="h5" className="mb-0">Tareas pendientes de días anteriores</CardTitle>
          <small className="text-muted">
            PENDING con fecha vencida o sin fecha (con o sin mesa). Tómalas y asígnalas cuando quieras.
          </small>
        </div>
        <Button size="sm" color="info" outline onClick={onReload} disabled={loading}>
          {loading ? <Spinner size="sm" /> : "Actualizar"}
        </Button>
      </CardHeader>
      <CardBody>
        {backlog.length === 0 && !loading ? (
          <div className="text-muted text-center py-4">
            No hay tareas atrasadas ni sin fecha. Todo al día. ✔
          </div>
        ) : (
          <>
            <Row className="mb-3">
              <Col md="4" sm="6" className="mb-2 mb-md-0">
                <Input
                  bsSize="sm"
                  placeholder="Filtrar por OP (ej. OPK-10)"
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value)}
                />
              </Col>
              <Col md="4" sm="6" className="mb-2 mb-md-0">
                <Input
                  bsSize="sm"
                  placeholder="Filtrar por producto"
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                />
              </Col>
              <Col md="4" className="d-flex align-items-center justify-content-md-end">
                <small className="text-muted">
                  {filteredBacklog.length} de {backlog.length} tarea{backlog.length === 1 ? "" : "s"}
                </small>
                {(orderFilter || productFilter) && (
                  <Button
                    size="sm"
                    color="link"
                    className="ml-2 p-0"
                    onClick={() => { setOrderFilter(""); setProductFilter(""); }}
                  >
                    Limpiar
                  </Button>
                )}
              </Col>
            </Row>

            {filteredBacklog.length === 0 ? (
              <div className="text-muted text-center py-3">
                Ninguna tarea coincide con el filtro.
              </div>
            ) : (
              <Table size="sm" responsive>
                <thead>
                  <tr>
                    <th>Tarea</th>
                    <th>OP</th>
                    <th>Productos</th>
                    <th>Color</th>
                    <th className="text-center">Uds</th>
                    <th className="text-center">Horas base</th>
                    <th className="text-center">Fecha</th>
                    <th className="text-center">Mesa</th>
                    <th className="text-center">Atraso</th>
                    <th className="text-center">Troquel</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredBacklog.map((t) => {
                    const late = daysLate(t.scheduledDate);
                    const colorLabel = taskColorSummary(t);
                    return (
                      <tr key={t.id}>
                        <td><Badge color="dark">{t.code}</Badge></td>
                        <td>{t.productionOrderCode || "—"}</td>
                        <td>{taskProductsSummary(t)}</td>
                        <td>
                          {colorLabel
                            ? <Badge color="dark" style={{ fontSize: 11 }}>{colorLabel}</Badge>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td className="text-center">{t.quantity ?? "—"}</td>
                        <td className="text-center">{getTaskBaseHours(t).toFixed(2)}</td>
                        <td className="text-center">
                          {t.scheduledDate ? formatDateGt(t.scheduledDate) : <Badge color="secondary">Sin fecha</Badge>}
                        </td>
                        <td className="text-center">
                          {t.desk != null ? `Mesa ${t.desk}` : <Badge color="warning">Sin mesa</Badge>}
                        </td>
                        <td className="text-center">
                          {late == null ? <span className="text-muted">—</span>
                            : late === 0 ? <span className="text-muted">Hoy</span>
                            : <Badge color="danger">{late} día{late === 1 ? "" : "s"}</Badge>}
                        </td>
                        <td className="text-center">
                          {t.dieCutReady
                            ? <Badge color="success">Listo</Badge>
                            : <Badge color="light" className="text-dark">Pendiente</Badge>}
                        </td>
                        <td className="text-right">
                          <Button size="sm" color="primary" outline onClick={() => openReprogram(t)}>
                            Reprogramar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </>
        )}
      </CardBody>

      <Modal isOpen={modal.open} toggle={() => setModal((m) => ({ ...m, open: false }))}>
        <ModalHeader toggle={() => setModal((m) => ({ ...m, open: false }))}>
          Reprogramar {modal.task?.code}
        </ModalHeader>
        <ModalBody>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label><small>Nueva fecha</small></Label>
                <Input
                  type="date"
                  value={modal.date}
                  onChange={(e) => setModal((m) => ({ ...m, date: e.target.value }))}
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label><small>Mesa</small></Label>
                <Input
                  type="select"
                  value={modal.desk}
                  onChange={(e) => setModal((m) => ({ ...m, desk: e.target.value }))}
                >
                  <option value="">Sin mesa (asignar en tablero)</option>
                  {Array.from({ length: numDesks || 12 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>Mesa {d}</option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>
          {!modal.task?.dieCutReady && modal.desk && (
            <div className="text-warning" style={{ fontSize: 12 }}>
              Esta tarea aún no tiene troquelado listo: el sistema puede rechazar la asignación de mesa.
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setModal((m) => ({ ...m, open: false }))} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" onClick={saveReprogram} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </ModalFooter>
      </Modal>
    </Card>
  );
}
