import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Row, Spinner } from "reactstrap";
import { getProductionOrders } from "services/productionOrderService";
import { getTasks } from "services/taskService";
import { taskSkipsMaterials } from "utils/materialRequirementHelper";
import { formatDateGt, formatDateDdMmYyGt } from "utils/dateTimeHelper";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";

const ORIGIN_LABELS = {
  VENTA_EN_LINEA: "Venta en Linea",
  DISTRIBUTION: "Distribucion",
};

const PHASES = [
  { key: "LEATHER", title: "Cuero", color: "#6d4c41" },
  { key: "DIE_CUT", title: "Troquel", color: "#4e342e" },
  { key: "MATERIALS", title: "Materiales", color: "#f9a825" },
  { key: "TABLE", title: "Mesas", color: "#ef6c00" },
  { key: "PRODUCTION", title: "Produccion", color: "#0288d1" },
  { key: "PRODUCED", title: "Producidas", color: "#2e7d32" },
];

const workflowOrder = [
  "PENDING_LEATHER",
  "PENDING_DIE_CUT",
  "PENDING_MATERIAL_DELIVERY",
  "PENDING_TABLE_ENTRY",
  "READY_TO_START",
  "IN_PRODUCTION",
  "COMPLETED",
];

const getOrderOrigin = (order) => {
  if (order.orderType === "VENTA_EN_LINEA") return "VENTA_EN_LINEA";
  if (order.orderType === "DISTRIBUTION" || order.distributionId) return "DISTRIBUTION";
  return "OTHER";
};

const resolvePhase = (order, tasks) => {
  if (order.status === "COMPLETED") return "PRODUCED";
  if (order.status === "IN_QA") return "PRODUCTION";

  const activeTasks = (tasks || []).filter((t) => t.status !== "CANCELLED");
  if (!activeTasks.length) return "LEATHER";
  const hasRequiredMaterials = activeTasks.some((task) => !taskSkipsMaterials(task));

  const sorted = [...activeTasks].sort((a, b) => {
    const ia = workflowOrder.indexOf(a.workflowStatus || "");
    const ib = workflowOrder.indexOf(b.workflowStatus || "");
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  const ws = sorted[0].workflowStatus;

  if (ws === "PENDING_LEATHER") return "LEATHER";
  if (ws === "PENDING_DIE_CUT") return "DIE_CUT";
  if (ws === "PENDING_TABLE_ENTRY") return "TABLE";
  if (ws === "PENDING_MATERIAL_DELIVERY") return hasRequiredMaterials ? "MATERIALS" : "TABLE";
  if (ws === "READY_TO_START" || ws === "IN_PRODUCTION") return "PRODUCTION";
  if (ws === "COMPLETED") return "PRODUCED";
  return "PRODUCTION";
};

const summarizeTasks = (tasks) => {
  const total = tasks.length;
  if (!total) return { total: 0, completed: 0 };
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  return { total, completed };
};

const formatDate = (dateValue) => {
  if (!dateValue) return "Sin fecha";
  try {
    return formatDateGt(dateValue);
  } catch (error) {
    return String(dateValue);
  }
};

const getStatusStyle = (status) => {
  if (status === "COMPLETED") return { bg: "#e8f5e9", color: "#2e7d32" };
  if (status === "IN_PROGRESS") return { bg: "#e3f2fd", color: "#1565c0" };
  if (status === "IN_QA") return { bg: "#e3f2fd", color: "#1565c0" };
  return { bg: "#eceff1", color: "#455a64" };
};

function ProductionPhaseTrays() {
  const [orders, setOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [includeProduced, setIncludeProduced] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [showOrderOptions, setShowOrderOptions] = useState(false);
  const selectorRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [poData, taskData] = await Promise.all([getProductionOrders(), getTasks()]);
      setOrders(poData || []);
      setTasks(taskData || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar el tracker de fases");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!selectorRef.current?.contains(event.target)) {
        setShowOrderOptions(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const trackedOrders = useMemo(() => {
    const tasksByOrder = {};
    (tasks || []).forEach((task) => {
      if (!task.productionOrderId) return;
      if (!tasksByOrder[task.productionOrderId]) tasksByOrder[task.productionOrderId] = [];
      tasksByOrder[task.productionOrderId].push(task);
    });

    return (orders || [])
      .filter((order) => {
        const origin = getOrderOrigin(order);
        if (origin === "OTHER") return false;
        if (!includeProduced && order.status === "COMPLETED") return false;
        return order.status !== "CANCELLED";
      })
      .map((order) => {
        const orderTasks = tasksByOrder[order.id] || [];
        const origin = getOrderOrigin(order);
        return {
          ...order,
          origin,
          originLabel: ORIGIN_LABELS[origin] || order.orderType,
          phase: resolvePhase(order, orderTasks),
          taskSummary: summarizeTasks(orderTasks),
          orderTasks,
        };
      })
      .sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      });
  }, [orders, tasks, includeProduced]);

  useEffect(() => {
    if (!trackedOrders.length) {
      setSelectedOrderId(null);
      return;
    }
    const stillExists = trackedOrders.some((order) => order.id === selectedOrderId);
    if (!stillExists) {
      const firstOrder = trackedOrders[0];
      setSelectedOrderId(firstOrder.id);
      setOrderSearch(formatProductionOrderCodeDate(firstOrder) || firstOrder.code || "");
    }
  }, [trackedOrders, selectedOrderId]);

  const filteredOptions = useMemo(() => {
    const search = (orderSearch || "").toLowerCase().trim();
    if (!search) return trackedOrders.slice(0, 30);

    return trackedOrders
      .filter((order) => {
        const haystack = `${order.code || ""} ${formatDateDdMmYyGt(order.startDate || order.createdAt)} ${order.customerName || ""} ${order.originLabel || ""}`.toLowerCase();
        return haystack.includes(search);
      })
      .slice(0, 30);
  }, [trackedOrders, orderSearch]);

  const selectedOrder = useMemo(
    () => trackedOrders.find((order) => order.id === selectedOrderId) || null,
    [trackedOrders, selectedOrderId]
  );

  const phaseIndex = PHASES.findIndex((phase) => phase.key === selectedOrder?.phase);
  const normalizedPhaseIndex = phaseIndex < 0 ? 0 : phaseIndex;
  const progressPercent = Math.round((normalizedPhaseIndex / (PHASES.length - 1)) * 100);
  const currentPhase = PHASES[normalizedPhaseIndex];

  const totalsByOrigin = useMemo(() => {
    return {
      online: trackedOrders.filter((order) => order.origin === "VENTA_EN_LINEA").length,
      distribution: trackedOrders.filter((order) => order.origin === "DISTRIBUTION").length,
      total: trackedOrders.length,
    };
  }, [trackedOrders]);

  const handleSelectOrder = (order) => {
    setSelectedOrderId(order.id);
    setOrderSearch(formatProductionOrderCodeDate(order) || order.code || "");
    setShowOrderOptions(false);
  };

  const getStepStyles = (idx, phase) => {
    const isCompleted = idx < phaseIndex;
    const isCurrent = idx === phaseIndex;
    return {
      circle: {
        width: 42,
        height: 42,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 14,
        color: isCompleted || isCurrent ? "#fff" : "#7f8c8d",
        backgroundColor: isCompleted || isCurrent ? phase.color : "#f7f9fb",
        border: `2px solid ${isCompleted || isCurrent ? phase.color : "#dfe3e8"}`,
        boxShadow: isCurrent ? `0 0 0 5px ${phase.color}22` : "0 1px 3px rgba(0,0,0,0.08)",
        margin: "0 auto",
        transition: "all 0.2s ease",
      },
      title: {
        marginTop: 10,
        fontSize: 13,
        fontWeight: isCurrent ? 700 : 600,
        color: isCurrent ? "#1f2d3d" : "#5f6b7a",
      },
      connector: {
        flex: 1,
        height: 6,
        borderRadius: 999,
        background: idx < phaseIndex
          ? `linear-gradient(90deg, ${phase.color}, ${phase.color}cc)`
          : "#e9ecef",
        margin: "0 12px",
      },
    };
  };

  return (
    <div className="content">
      <Row className="mb-3">
        <Col md="8">
          <CardTitle tag="h3" className="mb-1">Tracker por Fase - Orden de Produccion</CardTitle>
          <p className="text-muted mb-0">
            Busca una orden y revisa su avance por fases en un tracker horizontal.
          </p>
        </Col>
        <Col md="4" className="text-right">
          <Button color="primary" size="sm" className="mr-2" onClick={loadData} disabled={loading}>
            {loading ? <Spinner size="sm" /> : <><i className="nc-icon nc-refresh-69 mr-1" />Actualizar</>}
          </Button>
          <Button
            color={includeProduced ? "secondary" : "success"}
            size="sm"
            onClick={() => setIncludeProduced((value) => !value)}
          >
            {includeProduced ? "Ocultar Producidas" : "Mostrar Producidas"}
          </Button>
        </Col>
      </Row>

      {error && <Alert color="danger">{error}</Alert>}

      <Row className="mb-3">
        <Col md="4" className="mb-2 mb-md-0">
          <Card className="mb-0" style={{ border: "1px solid #e3f2fd", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <CardBody className="py-2">
              <small className="text-muted d-block">Ventas en linea</small>
              <strong style={{ color: "#1565c0", fontSize: 20 }}>{totalsByOrigin.online}</strong>
            </CardBody>
          </Card>
        </Col>
        <Col md="4" className="mb-2 mb-md-0">
          <Card className="mb-0" style={{ border: "1px solid #e8f5e9", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <CardBody className="py-2">
              <small className="text-muted d-block">Distribuciones</small>
              <strong style={{ color: "#2e7d32", fontSize: 20 }}>{totalsByOrigin.distribution}</strong>
            </CardBody>
          </Card>
        </Col>
        <Col md="4">
          <Card className="mb-0" style={{ border: "1px solid #f3e5f5", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <CardBody className="py-2">
              <small className="text-muted d-block">Total controladas</small>
              <strong style={{ color: "#6a1b9a", fontSize: 20 }}>{totalsByOrigin.total}</strong>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card className="mb-3" style={{ boxShadow: "0 4px 14px rgba(15, 23, 42, 0.08)", border: "none" }}>
        <CardHeader style={{ background: "linear-gradient(90deg, #f8fafc, #eef4ff)" }}>
          <CardTitle tag="h5" className="mb-0">Seleccionar Orden</CardTitle>
        </CardHeader>
        <CardBody>
          <div ref={selectorRef} style={{ position: "relative" }}>
            <Input
              type="search"
              placeholder="Escribe codigo de OP, cliente u origen..."
              value={orderSearch}
              onFocus={() => setShowOrderOptions(true)}
              onChange={(event) => {
                setOrderSearch(event.target.value);
                setShowOrderOptions(true);
              }}
              style={{ borderRadius: 10, border: "1px solid #d7deea" }}
            />

            {showOrderOptions && (
              <div
                style={{
                  position: "absolute",
                  zIndex: 30,
                  width: "100%",
                  maxHeight: 280,
                  overflowY: "auto",
                  backgroundColor: "#fff",
                  border: "1px solid #dfe3e8",
                  borderRadius: 8,
                  marginTop: 6,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
                }}
              >
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-2 text-muted">No hay ordenes que coincidan.</div>
                ) : (
                  filteredOptions.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      className="btn btn-link w-100 text-left px-3 py-2"
                      style={{
                        textDecoration: "none",
                        color: "#2c3e50",
                        backgroundColor: order.id === selectedOrderId ? "#edf5ff" : "#fff",
                        borderBottom: "1px solid #f1f3f5",
                      }}
                      onClick={() => handleSelectOrder(order)}
                    >
                      <div className="d-flex justify-content-between align-items-center">
                        <strong>{formatProductionOrderCodeDate(order)}</strong>
                        <span
                          style={{
                            fontSize: 11,
                            padding: "3px 8px",
                            borderRadius: 999,
                            backgroundColor: "#f2f4f7",
                            color: "#475467",
                          }}
                        >
                          {PHASES.find((p) => p.key === order.phase)?.title || "N/D"}
                        </span>
                      </div>
                      <small className="d-block text-muted">{order.originLabel} · {order.customerName || "Sin cliente"}</small>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {!selectedOrder ? (
        <Alert color="info">No hay ordenes disponibles para mostrar.</Alert>
      ) : (
        <Card style={{ boxShadow: "0 8px 22px rgba(15, 23, 42, 0.10)", border: "none" }}>
          <CardHeader style={{ background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)", borderBottom: "1px solid #eef2f7" }}>
            <div className="d-flex justify-content-between align-items-center flex-wrap">
              <div>
                <CardTitle tag="h4" className="mb-1" style={{ letterSpacing: 0.3 }}>{formatProductionOrderCodeDate(selectedOrder)}</CardTitle>
                <small className="text-muted">
                  {selectedOrder.originLabel} · {selectedOrder.customerName || "Sin cliente"}
                </small>
                <div className="mt-2">
                  <span
                    style={{
                      backgroundColor: getStatusStyle(selectedOrder.status).bg,
                      color: getStatusStyle(selectedOrder.status).color,
                      padding: "4px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Estado OP: {selectedOrder.status}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <small className="d-block text-muted">
                  Tareas completadas: {selectedOrder.taskSummary.completed}/{selectedOrder.taskSummary.total}
                </small>
                <small className="d-block text-muted">Entrega: {formatDate(selectedOrder.deliveryDate)}</small>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <small className="text-muted">Fase actual: <strong style={{ color: currentPhase?.color }}>{currentPhase?.title || "N/D"}</strong></small>
                <small className="text-muted">Avance: <strong>{progressPercent}%</strong></small>
              </div>
              <div style={{ height: 8, width: "100%", backgroundColor: "#edf1f5", borderRadius: 999 }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${currentPhase?.color || "#0288d1"}, ${(currentPhase?.color || "#0288d1")}cc)`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
            </div>
            <div style={{ overflowX: "auto", paddingBottom: 8 }}>
              <div style={{ minWidth: 900, display: "flex", alignItems: "center" }}>
                {PHASES.map((phase, idx) => {
                  const styles = getStepStyles(idx, phase);
                  const isCurrent = idx === phaseIndex;
                  const isCompleted = idx < phaseIndex;

                  return (
                    <React.Fragment key={phase.key}>
                      <div style={{ width: 116, textAlign: "center" }}>
                        <div style={styles.circle}>{isCompleted ? "✓" : idx + 1}</div>
                        <div style={styles.title}>{phase.title}</div>
                        {isCurrent && (
                          <small
                            style={{
                              color: "#fff",
                              backgroundColor: phase.color,
                              fontWeight: 700,
                              marginTop: 6,
                              padding: "2px 8px",
                              borderRadius: 999,
                              display: "inline-block",
                            }}
                          >
                            Actual
                          </small>
                        )}
                      </div>
                      {idx < PHASES.length - 1 && <div style={styles.connector} />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default ProductionPhaseTrays;

