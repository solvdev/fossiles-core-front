import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Badge,
  Button,
  Input,
  InputGroup,
  InputGroupText,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Alert,
} from "reactstrap";
import { getConnectedUsers, getUserRecentActions } from "services/userService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import BroadcastAnnouncementModal from "components/SystemAnnouncement/BroadcastAnnouncementModal";

function ConnectedUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterState, setFilterState] = useState("ALL"); // ALL, ONLINE, OFFLINE
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(new Date());
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);

  // Modal de 10 últimas acciones
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [recentActions, setRecentActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [actionsError, setActionsError] = useState("");

  const loadData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      setError("");
      const data = await getConnectedUsers(5);
      setUsers(Array.isArray(data) ? data : []);
      setLastRefreshedAt(new Date());
    } catch (err) {
      if (!isSilent) {
        setError(err.message || "Error al cargar la actividad de usuarios");
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Intervalo de autorefresco cada 20 segundos
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadData(true);
    }, 20000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const handleOpenActionsModal = async (user) => {
    setSelectedUser(user);
    setModalOpen(true);
    setRecentActions([]);
    setActionsError("");
    setLoadingActions(true);
    try {
      const actions = await getUserRecentActions(user.id);
      setRecentActions(Array.isArray(actions) ? actions : []);
    } catch (err) {
      setActionsError(err.message || "Error al obtener las acciones del usuario");
    } finally {
      setLoadingActions(false);
    }
  };

  const handleRefreshActions = async () => {
    if (!selectedUser) return;
    setLoadingActions(true);
    setActionsError("");
    try {
      const actions = await getUserRecentActions(selectedUser.id);
      setRecentActions(Array.isArray(actions) ? actions : []);
    } catch (err) {
      setActionsError(err.message || "Error al actualizar las acciones");
    } finally {
      setLoadingActions(false);
    }
  };

  // Filtrado y estadísticas
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        (u.firstName && u.firstName.toLowerCase().includes(q)) ||
        (u.lastName && u.lastName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.departmentName && u.departmentName.toLowerCase().includes(q)) ||
        (u.roles && Array.from(u.roles).some((r) => r.toLowerCase().includes(q)));

      if (!matchSearch) return false;

      if (filterState === "ONLINE") return Boolean(u.isOnline);
      if (filterState === "OFFLINE") return !u.isOnline;
      return true;
    });
  }, [users, searchTerm, filterState]);

  const onlineCount = useMemo(() => users.filter((u) => u.isOnline).length, [users]);
  const offlineCount = useMemo(() => users.filter((u) => !u.isOnline).length, [users]);

  // Helpers de visualización
  const getInitials = (user) => {
    if (!user) return "?";
    const f = (user.firstName || "").trim().charAt(0);
    const l = (user.lastName || "").trim().charAt(0);
    if (f && l) return (f + l).toUpperCase();
    if (user.username) return user.username.substring(0, 2).toUpperCase();
    return "U";
  };

  const getActionColor = (actionType) => {
    switch (actionType) {
      case "VENTA_POS":
        return "success";
      case "CAMBIOS":
        return "warning";
      case "FACTURACION_FEL":
        return "info";
      case "INVENTARIO":
        return "primary";
      case "DISTRIBUCION":
        return "secondary";
      case "PRODUCCION":
        return "primary";
      case "SEGURIDAD":
        return "danger";
      case "SESION":
        return "dark";
      default:
        return "default";
    }
  };

  const getRelativeTimeText = (minutesSince) => {
    if (minutesSince === null || minutesSince === undefined) return "Sin actividad registrada";
    if (minutesSince <= 0) return "Activo ahora";
    if (minutesSince === 1) return "Hace 1 minuto";
    if (minutesSince < 60) return `Hace ${minutesSince} minutos`;
    const hours = Math.floor(minutesSince / 60);
    if (hours === 1) return "Hace 1 hora";
    if (hours < 24) return `Hace ${hours} horas`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Hace 1 día";
    return `Hace ${days} días`;
  };

  return (
    <div className="content">
      <style>{`
        .user-card-hover {
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          cursor: pointer;
          border-radius: 12px;
          border: 1px solid #e3e6ec;
          position: relative;
          overflow: hidden;
        }
        .user-card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
          border-color: #51cbce;
        }
        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
        }
        .status-dot-online {
          background-color: #2ed573;
          box-shadow: 0 0 0 3px rgba(46, 213, 115, 0.25);
          animation: pulse-green 2s infinite;
        }
        .status-dot-offline {
          background-color: #a4b0be;
        }
        @keyframes pulse-green {
          0% { box-shadow: 0 0 0 0 rgba(46, 213, 115, 0.5); }
          70% { box-shadow: 0 0 0 6px rgba(46, 213, 115, 0); }
          100% { box-shadow: 0 0 0 0 rgba(46, 213, 115, 0); }
        }
        .avatar-circle {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: #eef2f7;
          color: #2c3e50;
          font-weight: 700;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }
        .avatar-circle-img {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }
        .timeline-action-card {
          border-left: 4px solid #51cbce;
          background: #f8fafc;
          border-radius: 6px;
          padding: 10px 14px;
          margin-bottom: 12px;
          transition: background 0.15s ease;
        }
        .timeline-action-card:hover {
          background: #f1f5f9;
        }
      `}</style>

      {/* ENCABEZADO Y RESUMEN */}
      <Row>
        <Col md="12">
          <Card className="card-plain mb-3">
            <CardBody className="p-0">
              <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center">
                <div>
                  <h3 className="mb-1" style={{ fontWeight: 700 }}>
                    <i className="nc-icon nc-sound-wave mr-2 text-primary" /> Monitoreo de Usuarios en Tiempo Real
                  </h3>
                  <p className="text-muted mb-0">
                    Visualiza los usuarios activos en el sistema y consulta sus últimas 10 operaciones en tiempo real.
                  </p>
                </div>
                <div className="mt-3 mt-md-0 d-flex align-items-center flex-wrap gap-2">
                  <div className="mr-3 text-muted text-right d-none d-sm-block">
                    <small>Última actualización:</small>
                    <br />
                    <strong>{formatDateTimeGt(lastRefreshedAt)}</strong>
                  </div>
                  <Button
                    color={autoRefresh ? "success" : "secondary"}
                    size="sm"
                    outline={!autoRefresh}
                    onClick={() => setAutoRefresh((v) => !v)}
                    className="mr-2 btn-round"
                    title={autoRefresh ? "Actualización automática cada 20s (Activa)" : "Actualización automática desactivada"}
                  >
                    <i className={`fa fa-refresh mr-1 ${autoRefresh ? "fa-spin" : ""}`} />
                    {autoRefresh ? "Auto (20s)" : "Pausado"}
                  </Button>
                  <Button
                    color="danger"
                    size="sm"
                    className="btn-round mr-2"
                    onClick={() => setBroadcastModalOpen(true)}
                  >
                    <i className="nc-icon nc-bell-55 mr-1" />
                    Aviso de Reinicio
                  </Button>
                  <Button
                    color="primary"
                    size="sm"
                    className="btn-round"
                    onClick={() => loadData(false)}
                    disabled={loading}
                  >
                    {loading ? <Spinner size="sm" className="mr-1" /> : <i className="fa fa-refresh mr-1" />}
                    Actualizar
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* TARJETAS DE CONTADORES */}
      <Row className="mb-3">
        <Col lg="4" md="6" sm="12">
          <Card
            className={`card-stats mb-3 ${filterState === "ALL" ? "border-primary" : ""}`}
            style={{ cursor: "pointer", borderRadius: 10 }}
            onClick={() => setFilterState("ALL")}
          >
            <CardBody>
              <Row>
                <Col md="4" xs="4">
                  <div className="icon-big text-center icon-warning">
                    <i className="nc-icon nc-single-02 text-primary" />
                  </div>
                </Col>
                <Col md="8" xs="8">
                  <div className="numbers">
                    <p className="card-category">Total Usuarios</p>
                    <CardTitle tag="p">{users.length}</CardTitle>
                  </div>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>

        <Col lg="4" md="6" sm="12">
          <Card
            className={`card-stats mb-3 ${filterState === "ONLINE" ? "border-success" : ""}`}
            style={{ cursor: "pointer", borderRadius: 10, border: filterState === "ONLINE" ? "2px solid #2ed573" : undefined }}
            onClick={() => setFilterState("ONLINE")}
          >
            <CardBody>
              <Row>
                <Col md="4" xs="4">
                  <div className="icon-big text-center icon-warning">
                    <i className="nc-icon nc-bulb-63 text-success" />
                  </div>
                </Col>
                <Col md="8" xs="8">
                  <div className="numbers">
                    <p className="card-category">Conectados Ahora</p>
                    <CardTitle tag="p" className="text-success">
                      <span className="status-dot status-dot-online" />
                      {onlineCount}
                    </CardTitle>
                  </div>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>

        <Col lg="4" md="6" sm="12">
          <Card
            className={`card-stats mb-3 ${filterState === "OFFLINE" ? "border-secondary" : ""}`}
            style={{ cursor: "pointer", borderRadius: 10 }}
            onClick={() => setFilterState("OFFLINE")}
          >
            <CardBody>
              <Row>
                <Col md="4" xs="4">
                  <div className="icon-big text-center icon-warning">
                    <i className="nc-icon nc-time-alarm text-muted" />
                  </div>
                </Col>
                <Col md="8" xs="8">
                  <div className="numbers">
                    <p className="card-category">Desconectados</p>
                    <CardTitle tag="p" className="text-muted">
                      {offlineCount}
                    </CardTitle>
                  </div>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* BARRA DE FILTROS */}
      <Row className="mb-3">
        <Col md="8">
          <InputGroup>
            <InputGroupText>
              <i className="nc-icon nc-zoom-split" />
            </InputGroupText>
            <Input
              placeholder="Buscar por nombre, usuario, rol o departamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <Button color="link" className="p-2" onClick={() => setSearchTerm("")}>
                <i className="nc-icon nc-simple-remove" />
              </Button>
            )}
          </InputGroup>
        </Col>
        <Col md="4" className="text-md-right mt-2 mt-md-0">
          <div className="btn-group btn-group-toggle" data-toggle="buttons">
            <Button
              color="primary"
              size="sm"
              outline={filterState !== "ALL"}
              onClick={() => setFilterState("ALL")}
            >
              Todos ({users.length})
            </Button>
            <Button
              color="success"
              size="sm"
              outline={filterState !== "ONLINE"}
              onClick={() => setFilterState("ONLINE")}
            >
              En línea ({onlineCount})
            </Button>
            <Button
              color="secondary"
              size="sm"
              outline={filterState !== "OFFLINE"}
              onClick={() => setFilterState("OFFLINE")}
            >
              Inactivos ({offlineCount})
            </Button>
          </div>
        </Col>
      </Row>

      {error && (
        <Alert color="danger" className="mb-3">
          <i className="nc-icon nc-bell-55 mr-2" />
          {error}
        </Alert>
      )}

      {/* GRID DE TARJETAS DE USUARIO */}
      {loading && users.length === 0 ? (
        <div className="text-center py-5">
          <Spinner color="primary" style={{ width: "3rem", height: "3rem" }} />
          <p className="mt-2 text-muted">Cargando estado de usuarios...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <Card className="p-5 text-center bg-light">
          <div className="py-4">
            <i className="nc-icon nc-single-02 text-muted" style={{ fontSize: 48 }} />
            <h5 className="mt-3 text-muted">No se encontraron usuarios</h5>
            <p className="text-muted">Prueba cambiando los filtros o el término de búsqueda.</p>
          </div>
        </Card>
      ) : (
        <Row>
          {filteredUsers.map((user) => {
            const isOnline = Boolean(user.isOnline);
            const relativeTime = getRelativeTimeText(user.minutesSinceLastActivity);
            const lastAction = user.lastAction;

            return (
              <Col key={user.id} lg="4" md="6" sm="12" className="mb-4">
                <Card
                  className="user-card-hover h-100"
                  onClick={() => handleOpenActionsModal(user)}
                  title="Haz clic para ver las últimas 10 acciones"
                >
                  <CardBody className="p-3 d-flex flex-column justify-content-between">
                    <div>
                      {/* Cabecera de la tarjeta */}
                      <div className="d-flex align-items-center mb-2">
                        <div className="position-relative mr-3">
                          {user.profileImageUrl ? (
                            <img
                              src={user.profileImageUrl}
                              alt={user.username}
                              className="avatar-circle-img"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="avatar-circle">{getInitials(user)}</div>
                          )}
                          <span
                            className={`status-dot position-absolute ${
                              isOnline ? "status-dot-online" : "status-dot-offline"
                            }`}
                            style={{ bottom: 0, right: 0, border: "2px solid #fff" }}
                          />
                        </div>

                        <div className="flex-grow-1 text-truncate">
                          <h5 className="mb-0 text-truncate" style={{ fontSize: "16px", fontWeight: 700 }}>
                            {user.firstName || user.lastName
                              ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
                              : user.username}
                          </h5>
                          <small className="text-muted">@{user.username}</small>
                          {user.departmentName && (
                            <div>
                              <small className="text-primary font-weight-bold">
                                <i className="nc-icon nc-bank mr-1" />
                                {user.departmentName}
                              </small>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Roles */}
                      <div className="mb-2">
                        {user.roles && user.roles.length > 0 ? (
                          Array.from(user.roles).map((role) => (
                            <Badge key={role} color="info" pill className="mr-1 mb-1" style={{ fontSize: "10px" }}>
                              {role}
                            </Badge>
                          ))
                        ) : (
                          <Badge color="secondary" pill className="mr-1" style={{ fontSize: "10px" }}>
                            Sin rol
                          </Badge>
                        )}
                      </div>

                      {/* Estado de actividad */}
                      <div className="mb-2 p-2 rounded" style={{ background: isOnline ? "#eafaf1" : "#f1f2f6" }}>
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="font-weight-bold" style={{ fontSize: "12px", color: isOnline ? "#27ae60" : "#747d8c" }}>
                            <span className={`status-dot ${isOnline ? "status-dot-online" : "status-dot-offline"}`} />
                            {isOnline ? "En línea" : "Desconectado"}
                          </span>
                          <span className="text-muted" style={{ fontSize: "11px" }}>
                            {relativeTime}
                          </span>
                        </div>
                      </div>

                      {/* Vista previa de la última acción */}
                      {lastAction ? (
                        <div className="p-2 rounded bg-white border" style={{ fontSize: "12px" }}>
                          <div className="d-flex align-items-center justify-content-between mb-1">
                            <Badge color={getActionColor(lastAction.actionType)} style={{ fontSize: "9px" }}>
                              {lastAction.actionType || "ACCION"}
                            </Badge>
                            <small className="text-muted">{formatDateTimeGt(lastAction.createdAt)}</small>
                          </div>
                          <div className="text-truncate text-dark font-weight-500" title={lastAction.description}>
                            {lastAction.description}
                          </div>
                        </div>
                      ) : (
                        <div className="p-2 rounded bg-white border text-muted text-center" style={{ fontSize: "11px" }}>
                          Sin registro de acciones recientes
                        </div>
                      )}
                    </div>

                    {/* Footer de la tarjeta */}
                    <div className="mt-3 pt-2 border-top d-flex justify-content-between align-items-center text-primary" style={{ fontSize: "12px" }}>
                      <span className="font-weight-bold">
                        <i className="nc-icon nc-bullet-list-67 mr-1" /> Ver 10 últimas acciones
                      </span>
                      <i className="nc-icon nc-minimal-right" />
                    </div>
                  </CardBody>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      {/* MODAL DE 10 ÚLTIMAS ACCIONES */}
      <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)} size="lg">
        <ModalHeader toggle={() => setModalOpen(false)}>
          {selectedUser && (
            <div className="d-flex align-items-center">
              <div className="avatar-circle mr-3" style={{ width: 42, height: 42, fontSize: 16 }}>
                {getInitials(selectedUser)}
              </div>
              <div>
                <h5 className="mb-0" style={{ fontWeight: 700 }}>
                  {selectedUser.firstName || selectedUser.lastName
                    ? `${selectedUser.firstName || ""} ${selectedUser.lastName || ""}`.trim()
                    : selectedUser.username}
                </h5>
                <small className="text-muted">
                  @{selectedUser.username} · {selectedUser.email}
                </small>
              </div>
            </div>
          )}
        </ModalHeader>

        <ModalBody style={{ maxHeight: "65vh", overflowY: "auto" }}>
          {selectedUser && (
            <div className="mb-3 d-flex justify-content-between align-items-center bg-light p-2 rounded">
              <div>
                <span className={`status-dot ${selectedUser.isOnline ? "status-dot-online" : "status-dot-offline"}`} />
                <strong className={selectedUser.isOnline ? "text-success" : "text-muted"}>
                  {selectedUser.isOnline ? "En línea ahora" : "Desconectado"}
                </strong>
                <span className="text-muted ml-2">
                  ({getRelativeTimeText(selectedUser.minutesSinceLastActivity)})
                </span>
              </div>
              <Button
                color="primary"
                size="sm"
                outline
                onClick={handleRefreshActions}
                disabled={loadingActions}
              >
                {loadingActions ? <Spinner size="sm" className="mr-1" /> : <i className="fa fa-refresh mr-1" />}
                Actualizar lista
              </Button>
            </div>
          )}

          {actionsError && (
            <Alert color="danger">
              <i className="nc-icon nc-bell-55 mr-2" />
              {actionsError}
            </Alert>
          )}

          {loadingActions ? (
            <div className="text-center py-4">
              <Spinner color="primary" />
              <p className="mt-2 text-muted">Cargando las últimas 10 acciones...</p>
            </div>
          ) : recentActions.length === 0 ? (
            <div className="text-center py-4 text-muted">
              <i className="nc-icon nc-paper" style={{ fontSize: 40 }} />
              <p className="mt-2 mb-0">No hay acciones registradas aún para este usuario.</p>
            </div>
          ) : (
            <div>
              <h6 className="text-muted mb-3 font-weight-bold">
                <i className="nc-icon nc-time-alarm mr-1" /> Últimas {recentActions.length} acciones registradas:
              </h6>
              {recentActions.map((action, idx) => (
                <div key={action.id || idx} className="timeline-action-card">
                  <div className="d-flex justify-content-between align-items-start mb-1 flex-wrap">
                    <div>
                      <Badge color={getActionColor(action.actionType)} className="mr-2">
                        {action.actionType}
                      </Badge>
                      {action.httpMethod && (
                        <Badge color="dark" outline className="mr-2" style={{ fontSize: "10px" }}>
                          {action.httpMethod}
                        </Badge>
                      )}
                      <strong className="text-dark" style={{ fontSize: "14px" }}>
                        {action.description}
                      </strong>
                    </div>
                    <div className="text-right">
                      <small className="text-muted font-weight-bold">
                        {formatDateTimeGt(action.createdAt)}
                      </small>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap text-muted" style={{ fontSize: "11px" }}>
                    <div>
                      {action.requestPath && (
                        <span className="mr-3" title="Ruta del servicio">
                          <i className="nc-icon nc-compass-05 mr-1" />
                          <code>{action.requestPath}</code>
                        </span>
                      )}
                    </div>
                    <div>
                      {action.ipAddress && (
                        <span className="mr-2" title="Dirección IP">
                          <i className="nc-icon nc-world-2 mr-1" />
                          {action.ipAddress}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button color="secondary" onClick={() => setModalOpen(false)}>
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>

      {/* MODAL DE EMISIÓN DE ALERTA DE REINICIO */}
      <BroadcastAnnouncementModal
        isOpen={broadcastModalOpen}
        toggle={() => setBroadcastModalOpen(!broadcastModalOpen)}
      />
    </div>
  );
}

export default ConnectedUsers;
