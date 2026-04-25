import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
  Input,
  Label,
  FormGroup,
  Progress,
  Button,
  Modal,
  ModalBody,
} from "reactstrap";
import { getTasksByDate, getTasks, updateTaskStatus, toggleDieCut } from "services/taskService";
import { showSuccess, showError } from "utils/notificationHelper";
import TaskTicketPrint from "./TaskTicketPrint";
import { taskMaterialsReady } from "utils/materialRequirementHelper";
import { formatDateGt } from "utils/dateTimeHelper";

const MAX_HOURS = 4;

function DailyProductionPlan() {
  const [tasks, setTasks] = useState([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(false);
  const [printTaskId, setPrintTaskId] = useState(null);

  useEffect(() => {
    loadTasks();
  }, [selectedDate]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await getTasksByDate(selectedDate);
      setTasks(data || []);
    } catch (err) {
      showError(err.message || "Error al cargar el plan");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await updateTaskStatus(taskId, newStatus);
      showSuccess("Estado actualizado");
      loadTasks();
    } catch (err) {
      showError(err.message || "Error al actualizar");
    }
  };

  const handleDieCutToggle = async (taskId, currentValue) => {
    try {
      await toggleDieCut(taskId, !currentValue);
      showSuccess(!currentValue ? "Marcado como troquelado ✂️" : "Troquelado desmarcado");
      loadTasks();
    } catch (err) {
      showError(err.message || "Error al actualizar troquelado");
    }
  };

  // Group tasks by desk
  const tasksByDesk = useMemo(() => {
    const map = {};
    tasks.forEach((t) => {
      const desk = t.desk || 0;
      if (!map[desk]) map[desk] = [];
      map[desk].push(t);
    });
    return map;
  }, [tasks]);

  const desks = Object.keys(tasksByDesk).sort((a, b) => parseInt(a) - parseInt(b));

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  const totalQty = tasks.reduce((sum, t) => sum + (t.quantity || 0), 0);
  const totalHours = tasks
    .filter((t) => t.status !== "CANCELLED")
    .reduce((sum, t) => sum + (t.estimatedHours || 0), 0);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return `${days[d.getDay()]} ${formatDateGt(dateStr)}`;
  };

  const getStatusBadge = (status) => {
    const map = {
      PENDING: { color: "warning", text: "Pendiente" },
      IN_PROGRESS: { color: "info", text: "En Proceso" },
      COMPLETED: { color: "success", text: "Completada" },
      CANCELLED: { color: "danger", text: "Cancelada" },
    };
    const info = map[status] || { color: "secondary", text: status };
    return <Badge color={info.color}>{info.text}</Badge>;
  };

  const renderStatusActions = (task) => {
    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      return getStatusBadge(task.status);
    }
    if (task.status === "PENDING") {
      return (
        <div className="d-flex align-items-center" style={{ gap: 4, flexWrap: "wrap" }}>
          <Button
            color="info"
            size="sm"
            style={{ fontSize: "10px", padding: "1px 4px", height: "22px" }}
            disabled={!taskMaterialsReady(task)}
            onClick={() => handleStatusChange(task.id, "IN_PROGRESS")}
            title={!taskMaterialsReady(task) ? "Primero debe tener materiales entregados (si aplica)" : "Iniciar tarea"}
          >
            Iniciar
          </Button>
          <Button
            color="danger"
            outline
            size="sm"
            style={{ fontSize: "10px", padding: "1px 4px", height: "22px" }}
            onClick={() => handleStatusChange(task.id, "CANCELLED")}
            title="Cancelar tarea"
          >
            Cancelar
          </Button>
        </div>
      );
    }
    if (task.status === "IN_PROGRESS") {
      return (
        <div className="d-flex align-items-center" style={{ gap: 4, flexWrap: "wrap" }}>
          <Button
            color="success"
            size="sm"
            style={{ fontSize: "10px", padding: "1px 4px", height: "22px" }}
            onClick={() => handleStatusChange(task.id, "COMPLETED")}
            title="Completar tarea"
          >
            Completar
          </Button>
          <Button
            color="warning"
            outline
            size="sm"
            style={{ fontSize: "10px", padding: "1px 4px", height: "22px" }}
            onClick={() => handleStatusChange(task.id, "PENDING")}
            title="Pausar y volver a pendiente"
          >
            Pausar
          </Button>
        </div>
      );
    }
    return getStatusBadge(task.status);
  };

  return (
    <div className="content">
      {/* Header */}
      <Row className="mb-3">
        <Col md="6">
          <Card>
            <CardBody>
              <Row className="align-items-center">
                <Col md="6">
                  <FormGroup className="mb-0">
                    <Label><strong>Fecha de Producción</strong></Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="6">
                  <h5 className="mb-0">{formatDate(selectedDate)}</h5>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
        <Col md="6">
          <Card>
            <CardBody>
              <Row>
                <Col xs="3" className="text-center">
                  <small className="text-muted">Tareas</small>
                  <h4 className="mb-0">{totalTasks}</h4>
                </Col>
                <Col xs="3" className="text-center">
                  <small className="text-muted">Completadas</small>
                  <h4 className="mb-0 text-success">{completedTasks}</h4>
                </Col>
                <Col xs="3" className="text-center">
                  <small className="text-muted">Productos</small>
                  <h4 className="mb-0">{totalQty}</h4>
                </Col>
                <Col xs="3" className="text-center">
                  <small className="text-muted">Horas</small>
                  <h4 className="mb-0">{totalHours.toFixed(1)}h</h4>
                </Col>
              </Row>
              {totalTasks > 0 && (
                <Progress
                  multi
                  className="mt-2"
                  style={{ height: "8px" }}
                >
                  <Progress bar color="success" value={(completedTasks / totalTasks) * 100} />
                  <Progress bar color="info" value={(tasks.filter((t) => t.status === "IN_PROGRESS").length / totalTasks) * 100} />
                  <Progress bar color="warning" value={(tasks.filter((t) => t.status === "PENDING").length / totalTasks) * 100} />
                </Progress>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Desks */}
      {loading ? (
        <div className="text-center py-4"><p>Cargando plan...</p></div>
      ) : desks.length === 0 ? (
        <Card>
          <CardBody className="text-center py-4">
            <i className="nc-icon nc-calendar-60" style={{ fontSize: "48px", color: "#ccc" }} />
            <p className="mt-2 text-muted">No hay producción planificada para esta fecha.</p>
          </CardBody>
        </Card>
      ) : (
        <Row>
          {desks.map((desk) => {
            const deskTasks = tasksByDesk[desk];
            const deskHours = deskTasks
              .filter((t) => t.status !== "CANCELLED")
              .reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
            const capacityPct = Math.min((deskHours / MAX_HOURS) * 100, 100);
            const deskCompleted = deskTasks.filter((t) => t.status === "COMPLETED").length;

            return (
              <Col key={desk} md="6" lg="4" className="mb-3">
                <Card style={{
                  border: "2px solid " + (
                    deskCompleted === deskTasks.length ? "#28a745" :
                    capacityPct >= 90 ? "#dc3545" :
                    capacityPct >= 60 ? "#ffc107" : "#dee2e6"
                  )
                }}>
                  <CardHeader style={{ backgroundColor: "#f8f9fa", padding: "8px 12px" }}>
                    <div className="d-flex justify-content-between align-items-center">
                      <strong>Mesa {desk}</strong>
                      <div>
                        <Badge color={
                          capacityPct >= 90 ? "danger" :
                          capacityPct >= 60 ? "warning" : "success"
                        }>
                          {deskHours.toFixed(1)}h / {MAX_HOURS}h
                        </Badge>
                      </div>
                    </div>
                    <Progress
                      value={capacityPct}
                      color={
                        deskCompleted === deskTasks.length ? "success" :
                        capacityPct >= 90 ? "danger" :
                        capacityPct >= 60 ? "warning" : "info"
                      }
                      style={{ height: "4px", marginTop: "4px" }}
                    />
                  </CardHeader>
                  <CardBody className="p-2">
                    <Table responsive size="sm" className="mb-0">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>✂️</th>
                          <th>Cant.</th>
                          <th>Tiempo</th>
                          <th>Hora</th>
                          <th>Estado</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {deskTasks.map((task) => (
                          <tr key={task.id} style={{
                            backgroundColor:
                              task.status === "COMPLETED" ? "#f0fff0" :
                              task.status === "IN_PROGRESS" ? "#f0f8ff" : "transparent"
                          }}>
                            <td>
                              {task.items && task.items.length > 0 ? (
                                task.items.map((item, i) => (
                                  <small key={i} className="d-block">
                                    <strong>{item.productCode}</strong>
                                    {item.colorName && <span className="text-muted"> ({item.colorName})</span>}
                                    {task.items.length > 1 && <span className="text-muted"> ×{item.quantity}</span>}
                                  </small>
                                ))
                              ) : (
                                <small>
                                  <strong>{task.productCode}</strong>
                                  {task.productName && <><br />{task.productName}</>}
                                </small>
                              )}
                            </td>
                            <td className="text-center">
                              <span
                                style={{ cursor: "pointer", fontSize: "14px" }}
                                title={task.dieCutReady ? "Troquelado ✔" : "Sin troquelar — clic para marcar"}
                                onClick={() => handleDieCutToggle(task.id, task.dieCutReady)}
                              >
                                {task.dieCutReady ? "✂️" : "⬜"}
                              </span>
                            </td>
                            <td><strong>{task.quantity}</strong></td>
                            <td>{Math.round((task.estimatedHours || 0) * 60)}min</td>
                            <td><small>{task.startTime || "-"}</small></td>
                            <td>{renderStatusActions(task)}</td>
                            <td>
                              <Button
                                color="link"
                                size="sm"
                                className="p-0"
                                title="Imprimir boleta"
                                onClick={() => setPrintTaskId(task.id)}
                                style={{ fontSize: "14px", lineHeight: 1 }}
                              >
                                <i className="nc-icon nc-single-copy-04" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </CardBody>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Print Ticket Modal */}
      <Modal isOpen={!!printTaskId} toggle={() => setPrintTaskId(null)} size="lg">
        <ModalBody className="p-0">
          {printTaskId && (
            <TaskTicketPrint
              taskId={printTaskId}
              onClose={() => setPrintTaskId(null)}
            />
          )}
        </ModalBody>
      </Modal>
    </div>
  );
}

export default DailyProductionPlan;
