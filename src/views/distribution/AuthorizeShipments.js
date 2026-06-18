import React, { useCallback, useEffect, useState } from "react";
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
import { useAuth } from "contexts/AuthContext";
import {
  approveInternalShipmentRequest,
  listExistingEnviShipments,
  listInternalShipmentRequests,
  rejectInternalShipmentRequest,
} from "services/internalShipmentRequestService";
import { printInternalEnviShipment } from "utils/enviInternalPrintHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  formatInternalRequestTypeLabel,
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
  const [filters, setFilters] = useState({ status: "", requestType: "" });
  const [actionId, setActionId] = useState(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

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

  const handleApprove = async (request) => {
    if (!canApprove || !request?.id) return;
    const ok = window.confirm(
      `¿Autorizar la solicitud #${request.id} de ${request.recipientName}? Se generará el ENVI y se descontará inventario.`
    );
    if (!ok) return;
    try {
      setActionId(request.id);
      setError("");
      const updated = await approveInternalShipmentRequest(request.id);
      showSuccess(`Solicitud aprobada. ENVI: ${updated?.shipmentNumber || "—"}`);
      await Promise.all([loadRequests(), loadExistingEnvi()]);
    } catch (err) {
      showError(err.message || "No se pudo aprobar la solicitud.");
    } finally {
      setActionId(null);
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
            <Col md="8">
              <CardTitle tag="h4" className="mb-0">
                {isAccountingView ? "Autorizar envíos internos (ENVI)" : "Solicitudes de envío interno"}
              </CardTitle>
              <p className="text-muted mb-0 small mt-1">
                {isAccountingView
                  ? "Distribución crea solicitudes; Contabilidad autoriza o deniega. Al aprobar se genera el número ENVI."
                  : "Consulte el estado de sus solicitudes pendientes de autorización por Contabilidad."}
              </p>
            </Col>
            <Col md="4" className="text-right">
              {canCreate && (
                <Button color="primary" className="btn-round" onClick={() => setCreateOpen(true)}>
                  <i className="nc-icon nc-simple-add" /> Nueva solicitud
                </Button>
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
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <Button color="info" onClick={handleApplyFilters} disabled={loadingRequests}>
                    Filtrar
                  </Button>
                </Col>
              </Row>

              {loadingRequests ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : requests.length === 0 ? (
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
                      <th>Fecha</th>
                      <th>Colaborador</th>
                      <th>Tipo</th>
                      <th>Líneas</th>
                      <th>Estado</th>
                      {isAccountingView && <th>ENVI</th>}
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((req) => (
                      <tr key={req.id}>
                        <td>{req.id}</td>
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
                        {isAccountingView && <td>{req.shipmentNumber || "—"}</td>}
                        <td className="text-right text-nowrap">
                          {req.status === "PENDIENTE" && canApprove && (
                            <>
                              <Button
                                color="success"
                                size="sm"
                                className="btn-round mr-1"
                                disabled={actionId === req.id}
                                onClick={() => handleApprove(req)}
                              >
                                {actionId === req.id ? <Spinner size="sm" /> : "Autorizar"}
                              </Button>
                              <Button
                                color="danger"
                                size="sm"
                                outline
                                className="btn-round mr-1"
                                disabled={actionId === req.id}
                                onClick={() => openRejectModal(req.id)}
                              >
                                Denegar
                              </Button>
                            </>
                          )}
                          {isAccountingView && req.status === "APROBADA" && req.productShipmentId && (
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
                          <td className="text-right">
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
