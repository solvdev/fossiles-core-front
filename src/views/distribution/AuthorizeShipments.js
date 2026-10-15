import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavLink,
  Row,
  Spinner,
  TabContent,
  TabPane,
  Table,
} from "reactstrap";
import classnames from "classnames";
import CreateStandaloneInternalShipmentModal from "components/distribution/CreateStandaloneInternalShipmentModal";
import InternalShipmentRequestDetailModal from "components/distribution/InternalShipmentRequestDetailModal";
import PrintSlipBookletModal from "components/distribution/PrintSlipBookletModal";
import {
  RequestActionButtons,
  StockIndicator,
} from "components/distribution/InternalRequestStock";
import { useAuth } from "contexts/AuthContext";
import {
  approveInternalShipmentRequest,
  authorizeOpiProduction,
  generateOpiForInternalShipment,
  generateOpiForInternalShipmentRequest,
  listExistingEnviShipments,
  listInternalShipmentRequests,
  rejectInternalShipmentRequest,
} from "services/internalShipmentRequestService";
import { printInternalEnviShipment } from "utils/enviInternalPrintHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  canGenerateOpiForApprovedEnvi,
  canGenerateOpiForExistingEnvi,
  formatInternalRequestTypeLabel,
  formatQty,
  needsOpiProductionAuthorization,
  resolveInternalEnviCollaborator,
  resolveInternalEnviTypeLabel,
} from "utils/standaloneInternalShipmentHelper";
import { showError, showSuccess } from "utils/notificationHelper";

const STATUS_LABELS = {
  PENDIENTE: "Pendiente",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  CANCELADA: "Cancelada",
};

const STATUS_COLORS = {
  PENDIENTE: "warning",
  APROBADA: "success",
  RECHAZADA: "danger",
  CANCELADA: "secondary",
};

const STOCK_FILTERS = [
  { key: "DISPONIBLE", label: "Con stock", color: "#1f7a46", bg: "#e6f6ec" },
  { key: "SIN_STOCK", label: "Sin stock", color: "#b42323", bg: "#fdeaea" },
  { key: "EN_PRODUCCION", label: "En producción", color: "#9a6200", bg: "#fff4dc" },
];

const STOCK_ROW_ACCENT = {
  DISPONIBLE: "#2e9e5b",
  SIN_STOCK: "#d64545",
  EN_PRODUCCION: "#e0a100",
};

function AuthorizeShipments() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("DISTRIBUCION.AUTORIZAR_ENVIOS.CREAR");
  const canApprove = hasPermission("CONTABILIDAD.ENVIOS.APROBAR");
  const isAccountingView =
    canApprove || hasPermission("CONTABILIDAD.ENVIOS.VER");

  const [activeTab, setActiveTab] = useState("requests");
  const [existingEnvi, setExistingEnvi] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loadingEnvi, setLoadingEnvi] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [printSlipOpen, setPrintSlipOpen] = useState(false);
  const [filters, setFilters] = useState({ status: "", requestType: "" });
  const [actionId, setActionId] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [detailRequestId, setDetailRequestId] = useState(null);
  const [stockFilter, setStockFilter] = useState("");

  const loadExistingEnvi = useCallback(async () => {
    if (!isAccountingView) return;
    try {
      setLoadingEnvi(true);
      setError("");
      const data = await listExistingEnviShipments();
      setExistingEnvi(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los ENVI existentes.");
      setExistingEnvi([]);
    } finally {
      setLoadingEnvi(false);
    }
  }, [isAccountingView]);

  const loadRequests = useCallback(async (nextFilters = filters) => {
    try {
      setLoadingRequests(true);
      setError("");
      const effectiveFilters = isAccountingView
        ? nextFilters
        : { ...nextFilters, status: "PENDIENTE" };
      const data = await listInternalShipmentRequests(effectiveFilters);
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las solicitudes.");
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, [filters, isAccountingView]);

  useEffect(() => {
    loadExistingEnvi();
    loadRequests();
  }, [loadExistingEnvi, loadRequests]);

  const requestByShipmentId = useMemo(() => {
    const map = new Map();
    requests.forEach((request) => {
      if (request?.productShipmentId != null) {
        map.set(Number(request.productShipmentId), request);
      }
    });
    return map;
  }, [requests]);

  const stockCounts = useMemo(() => {
    const counts = { DISPONIBLE: 0, SIN_STOCK: 0, EN_PRODUCCION: 0 };
    requests.forEach((req) => {
      if (req.status === "PENDIENTE" && counts[req.stockStatus] != null) {
        counts[req.stockStatus] += 1;
      }
    });
    return counts;
  }, [requests]);

  const visibleRequests = useMemo(
    () => (stockFilter ? requests.filter((req) => req.stockStatus === stockFilter) : requests),
    [requests, stockFilter]
  );

  const approveRequest = async (request) => {
    if (!canApprove || !request?.id) return;
    try {
      setActionId(request.id);
      setError("");
      const updated = await approveInternalShipmentRequest(request.id);
      showSuccess(`Envío autorizado. ENVI: ${updated?.shipmentNumber || "—"}`);
      await Promise.all([loadRequests(), loadExistingEnvi()]);
      setDetailRequestId(null);
    } catch (err) {
      showError(err.message || "No se pudo autorizar el envío.");
      // El stock pudo cambiar entre que se cargó la lista y el clic: refrescamos indicadores.
      await loadRequests();
      throw err;
    } finally {
      setActionId(null);
    }
  };

  const authorizeProduction = async (request) => {
    if (!canApprove || !request?.id) return;
    try {
      setActionId(request.id);
      setError("");
      const hadOpi = Boolean(request.productionOrderId);
      const updated = await authorizeOpiProduction(request.id);
      const opiCode = updated?.productionOrderCode || request.productionOrderCode || "OPI";
      showSuccess(
        hadOpi
          ? `Producción autorizada para ${opiCode}.`
          : `Producción autorizada. Se generó ${opiCode} por el faltante.`
      );
      await loadRequests();
      setDetailRequestId(null);
    } catch (err) {
      showError(err.message || "No se pudo autorizar la producción OPI.");
      await loadRequests();
      throw err;
    } finally {
      setActionId(null);
    }
  };

  /** Devuelve true si la producción quedó autorizada (false si se canceló o falló). */
  const handleAuthorizeProduction = async (request) => {
    if (!canApprove || !request?.id) return false;
    const message = request.productionOrderCode
      ? `¿Autorizar la producción de ${request.productionOrderCode} para la solicitud #${request.id}?`
      : `Sin stock suficiente para la solicitud #${request.id} de ${request.recipientName} `
        + `(faltan ${formatQty(request.stockShortageTotal)} unidades). `
        + "¿Autorizar la producción del faltante? Se generará una OPI.";
    if (!window.confirm(message)) return false;
    try {
      await authorizeProduction(request);
      return true;
    } catch {
      return false; // El error ya se notificó en authorizeProduction.
    }
  };

  const generateOpi = async (request) => {
    if (!canApprove || !request?.id) return;
    try {
      setActionId(request.id);
      setError("");
      const updated = await generateOpiForInternalShipmentRequest(request.id);
      showSuccess(
        `Se generó ${updated?.productionOrderCode || "la OPI"}. Autorice su producción.`
      );
      await Promise.all([loadRequests(), loadExistingEnvi()]);
    } catch (err) {
      showError(err.message || "No se pudo generar la OPI.");
    } finally {
      setActionId(null);
    }
  };

  const handleGenerateOpi = async (request) => {
    if (!canApprove) {
      showError("Solo Contabilidad puede generar la OPI.");
      return;
    }
    if (!request?.id) return;
    const ok = window.confirm(
      `¿Generar OPI para reponer lo despachado en la solicitud #${request.id}?`
    );
    if (!ok) return;
    await generateOpi(request);
  };

  const handleGenerateOpiFromShipment = async (shipment) => {
    if (!canApprove) {
      showError("Solo Contabilidad puede generar la OPI.");
      return;
    }
    if (!shipment?.id) return;
    const ok = window.confirm(
      `¿Generar OPI para reponer lo despachado en ${shipment.shipmentNumber || "este ENVI"}?`
    );
    if (!ok) return;
    const requestId = shipment.internalShipmentRequestId
      || requestByShipmentId.get(Number(shipment.id))?.id;
    if (requestId) {
      await generateOpi({ id: requestId });
      return;
    }
    try {
      setActionId(shipment.id);
      setError("");
      const updated = await generateOpiForInternalShipment(shipment.id);
      showSuccess(
        `Se generó ${updated?.productionOrderCode || "la OPI"}. Autorice su producción.`
      );
      await Promise.all([loadRequests(), loadExistingEnvi()]);
    } catch (err) {
      showError(err.message || "No se pudo generar la OPI.");
    } finally {
      setActionId(null);
    }
  };

  /** Devuelve true si el envío quedó autorizado (false si se canceló o falló). */
  const handleApprove = async (request) => {
    if (!canApprove || !request?.id) return false;
    const ok = window.confirm(
      `¿Autorizar el envío de la solicitud #${request.id} de ${request.recipientName}? `
        + "Se generará el número ENVI y se despachará el producto."
    );
    if (!ok) return false;
    try {
      await approveRequest(request);
      return true;
    } catch {
      return false; // El error ya se notificó en approveRequest.
    }
  };

  const openRejectModal = (requestId) => {
    setRejectTargetId(requestId);
    setRejectReason("");
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!canApprove || !rejectTargetId) return;
    try {
      setActionId(rejectTargetId);
      setError("");
      await rejectInternalShipmentRequest(rejectTargetId, rejectReason);
      showSuccess("Solicitud denegada.");
      setRejectOpen(false);
      await loadRequests();
    } catch (err) {
      showError(err.message || "No se pudo denegar la solicitud.");
    } finally {
      setActionId(null);
    }
  };

  const handlePrintEnvi = async (shipment) => {
    try {
      const opened = await printInternalEnviShipment(shipment);
      if (!opened) {
        showError("Permita ventanas emergentes para imprimir.");
      }
    } catch (err) {
      showError(err.message || "No se pudo imprimir el ENVI.");
    }
  };

  const handleApplyFilters = () => {
    loadRequests(filters);
  };

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <Row className="align-items-center">
            <Col md="7">
              <CardTitle tag="h4" className="mb-0">
                {isAccountingView ? "Autorizar envíos internos (ENVI)" : "Solicitudes de envío interno"}
              </CardTitle>
              <p className="text-muted mb-0 small mt-1">
                {isAccountingView
                  ? "Distribución crea solicitudes. Con stock se autoriza el envío (ENVI); sin stock se autoriza la producción del faltante y se espera su ingreso a Bodega PT."
                  : "Consulte el estado de sus solicitudes pendientes de autorización por Contabilidad."}
              </p>
            </Col>
            <Col md="5" className="text-right">
              {canCreate && (
                <>
                  <Button
                    color="secondary"
                    outline
                    className="btn-round mr-2"
                    onClick={() => setPrintSlipOpen(true)}
                  >
                    <i className="nc-icon nc-paper" /> Imprimir talonario
                  </Button>
                  <Button color="primary" className="btn-round" onClick={() => setCreateOpen(true)}>
                    <i className="nc-icon nc-simple-add" /> Nueva solicitud
                  </Button>
                </>
              )}
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          <Nav tabs className="mb-3">
            <NavItem>
              <NavLink
                className={classnames({ active: activeTab === "requests" })}
                onClick={() => setActiveTab("requests")}
                style={{ cursor: "pointer" }}
              >
                Solicitudes de envío interno
              </NavLink>
            </NavItem>
            {isAccountingView && (
              <NavItem>
                <NavLink
                  className={classnames({ active: activeTab === "existing" })}
                  onClick={() => setActiveTab("existing")}
                  style={{ cursor: "pointer" }}
                >
                  ENVI existentes
                </NavLink>
              </NavItem>
            )}
          </Nav>

          <TabContent activeTab={activeTab}>
            <TabPane tabId="requests">
              {!isAccountingView && (
                <Alert color="info" className="py-2">
                  Solo se muestran solicitudes <strong>pendientes</strong> de autorización. Contabilidad aprueba o deniega desde su módulo.
                </Alert>
              )}
              <Row form className="mb-3">
                {isAccountingView && (
                  <Col md="3">
                    <FormGroup>
                      <Label>Estado</Label>
                      <Input
                        type="select"
                        value={filters.status}
                        onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                      >
                        <option value="">Todos</option>
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="APROBADA">Aprobada</option>
                        <option value="RECHAZADA">Rechazada</option>
                      </Input>
                    </FormGroup>
                  </Col>
                )}
                <Col md="3">
                  <FormGroup>
                    <Label>Tipo</Label>
                    <Input
                      type="select"
                      value={filters.requestType}
                      onChange={(e) => setFilters((prev) => ({ ...prev, requestType: e.target.value }))}
                    >
                      <option value="">Todos</option>
                      <option value="PLANILLA">Planilla</option>
                      <option value="DEFECTOS">Defectos</option>
                      <option value="OPI">Producción OPI</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <Button color="info" onClick={handleApplyFilters} disabled={loadingRequests}>
                    Filtrar
                  </Button>
                </Col>
              </Row>

              {canApprove && STOCK_FILTERS.some((f) => stockCounts[f.key] > 0) && (
                <div className="d-flex flex-wrap align-items-center mb-3" style={{ gap: 8 }}>
                  <span className="small text-muted mr-1">Pendientes por stock:</span>
                  {STOCK_FILTERS.map((f) => {
                    const active = stockFilter === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setStockFilter(active ? "" : f.key)}
                        style={{
                          border: `1px solid ${active ? f.color : "#dcdfe4"}`,
                          background: active ? f.bg : "#fff",
                          color: f.color,
                          borderRadius: 999,
                          padding: "3px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {f.label} · {stockCounts[f.key]}
                      </button>
                    );
                  })}
                  {stockFilter && (
                    <Button color="link" size="sm" className="p-0" onClick={() => setStockFilter("")}>
                      Quitar filtro
                    </Button>
                  )}
                </div>
              )}

              {loadingRequests ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : visibleRequests.length === 0 ? (
                <div className="text-center text-muted p-4">
                  {isAccountingView
                    ? "No hay solicitudes con estos filtros."
                    : "No hay solicitudes pendientes de autorización."}
                </div>
              ) : (
                <Table responsive hover>
                  <thead className="text-primary">
                    <tr>
                      <th>#</th>
                      <th>Boleta (BLS)</th>
                      <th>Fecha</th>
                      <th>Colaborador</th>
                      <th>Tipo</th>
                      <th>Líneas</th>
                      <th>Estado</th>
                      <th>Stock / Producción</th>
                      {isAccountingView && <th>ENVI</th>}
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRequests.map((req) => (
                      <tr
                        key={req.id}
                        style={{
                          cursor: "pointer",
                          boxShadow: req.status === "PENDIENTE" && STOCK_ROW_ACCENT[req.stockStatus]
                            ? `inset 3px 0 0 ${STOCK_ROW_ACCENT[req.stockStatus]}`
                            : undefined,
                        }}
                        onClick={() => setDetailRequestId(req.id)}
                      >
                        <td>{req.id}</td>
                        <td>{req.slipNumber ? <Badge color="primary">{req.slipNumber}</Badge> : "—"}</td>
                        <td>{req.requestedAt ? formatDateTimeGt(req.requestedAt) : "—"}</td>
                        <td>{req.recipientName || "—"}</td>
                        <td>{formatInternalRequestTypeLabel(req)}</td>
                        <td>{(req.lines || []).length}</td>
                        <td>
                          <Badge color={STATUS_COLORS[req.status] || "secondary"}>
                            {STATUS_LABELS[req.status] || req.status}
                          </Badge>
                          {req.rejectionReason && (
                            <div className="small text-danger mt-1" title={req.rejectionReason}>
                              {req.rejectionReason.length > 50
                                ? `${req.rejectionReason.slice(0, 50)}…`
                                : req.rejectionReason}
                            </div>
                          )}
                        </td>
                        <td><StockIndicator request={req} /></td>
                        {isAccountingView && <td>{req.shipmentNumber || "—"}</td>}
                        <td className="text-right text-nowrap" onClick={(e) => e.stopPropagation()}>
                          <Button
                            color="link"
                            size="sm"
                            className="p-0 mr-2"
                            onClick={() => setDetailRequestId(req.id)}
                          >
                            Ver detalle
                          </Button>
                          {req.status === "PENDIENTE" && canApprove && (
                            <RequestActionButtons
                              request={req}
                              busy={actionId === req.id}
                              onAuthorizeShipment={handleApprove}
                              onAuthorizeProduction={handleAuthorizeProduction}
                              onReject={openRejectModal}
                            />
                          )}
                          {isAccountingView && req.status === "APROBADA" && req.productShipmentId && (
                            <>
                              {canApprove && needsOpiProductionAuthorization(req) && (
                                <Button
                                  color="primary"
                                  size="sm"
                                  className="btn-round mr-1"
                                  disabled={actionId === req.id}
                                  onClick={() => handleAuthorizeProduction(req)}
                                >
                                  {actionId === req.id ? <Spinner size="sm" /> : "Autorizar prod."}
                                </Button>
                              )}
                              {canGenerateOpiForApprovedEnvi(
                                req,
                                existingEnvi.find((s) => Number(s.id) === Number(req.productShipmentId))
                              ) && (
                                <Button
                                  color="warning"
                                  size="sm"
                                  className="btn-round mr-1"
                                  disabled={actionId === req.id}
                                  onClick={() => handleGenerateOpi(req)}
                                >
                                  {actionId === req.id ? <Spinner size="sm" /> : "Generar OPI"}
                                </Button>
                              )}
                              <Button
                                color="info"
                                size="sm"
                                className="btn-round"
                                onClick={() => {
                                  const shipmentForPrint = existingEnvi.find(
                                    (s) => Number(s.id) === Number(req.productShipmentId)
                                  );
                                  if (shipmentForPrint) {
                                    handlePrintEnvi(shipmentForPrint);
                                  } else {
                                    showError("Recargue la pestaña ENVI existentes para imprimir este documento.");
                                  }
                                }}
                              >
                                Imprimir
                              </Button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </TabPane>

            {isAccountingView && (
            <TabPane tabId="existing">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <small className="text-muted">
                  {loadingEnvi ? "Cargando…" : `${existingEnvi.length} envío(s) ENVI interno(s)`}
                </small>
                <Button color="secondary" size="sm" outline onClick={loadExistingEnvi} disabled={loadingEnvi}>
                  Actualizar
                </Button>
              </div>
              {loadingEnvi ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : existingEnvi.length === 0 ? (
                <div className="text-center text-muted p-4">No hay envíos ENVI registrados.</div>
              ) : (
                <Table responsive hover>
                  <thead className="text-primary">
                    <tr>
                      <th>ENVI</th>
                      <th>Fecha</th>
                      <th>Colaborador</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingEnvi.map((shipment) => (
                        <tr key={shipment.id}>
                          <td>{shipment.shipmentNumber || shipment.id}</td>
                          <td>
                            {shipment.sentAt
                              ? formatDateTimeGt(shipment.sentAt)
                              : shipment.createdAt
                                ? formatDateTimeGt(shipment.createdAt)
                                : "—"}
                          </td>
                          <td>{resolveInternalEnviCollaborator(shipment)}</td>
                          <td>{resolveInternalEnviTypeLabel(shipment)}</td>
                          <td>
                            <Badge color={shipment.status === "SENT" ? "success" : "secondary"}>
                              {shipment.status || "—"}
                            </Badge>
                          </td>
                          <td className="text-right text-nowrap">
                            {canGenerateOpiForExistingEnvi(
                              shipment,
                              requestByShipmentId.get(Number(shipment.id))
                            ) && (
                              <Button
                                color="warning"
                                size="sm"
                                className="btn-round mr-1"
                                disabled={
                                  actionId === shipment.id
                                  || actionId === shipment.internalShipmentRequestId
                                  || actionId === requestByShipmentId.get(Number(shipment.id))?.id
                                }
                                onClick={() => handleGenerateOpiFromShipment(shipment)}
                              >
                                {actionId === shipment.id
                                  || actionId === shipment.internalShipmentRequestId
                                  || actionId === requestByShipmentId.get(Number(shipment.id))?.id
                                  ? <Spinner size="sm" />
                                  : "Generar OPI"}
                              </Button>
                            )}
                            <Button
                              color="info"
                              size="sm"
                              className="btn-round"
                              onClick={() => handlePrintEnvi(shipment)}
                            >
                              Imprimir
                            </Button>
                          </td>
                        </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </TabPane>
            )}
          </TabContent>
        </CardBody>
      </Card>

      <CreateStandaloneInternalShipmentModal
        isOpen={createOpen}
        toggle={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          loadRequests();
        }}
      />

      <PrintSlipBookletModal
        isOpen={printSlipOpen}
        toggle={() => setPrintSlipOpen(false)}
        onPrinted={() => {
          loadRequests();
        }}
      />

      <InternalShipmentRequestDetailModal
        isOpen={detailRequestId != null}
        requestId={detailRequestId}
        onClose={() => setDetailRequestId(null)}
        canApprove={canApprove}
        onApprove={handleApprove}
        onAuthorizeProduction={handleAuthorizeProduction}
        onReject={(id) => {
          setDetailRequestId(null);
          openRejectModal(id);
        }}
        actionId={actionId}
      />

      <Modal isOpen={rejectOpen} toggle={() => setRejectOpen(false)}>
        <ModalHeader toggle={() => setRejectOpen(false)}>Denegar solicitud</ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>Motivo *</Label>
            <Input
              type="textarea"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Indique el motivo de la denegación"
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setRejectOpen(false)} disabled={actionId != null}>
            Cancelar
          </Button>
          <Button color="danger" onClick={handleReject} disabled={!rejectReason.trim() || actionId != null}>
            {actionId != null ? <Spinner size="sm" /> : "Denegar"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default AuthorizeShipments;
