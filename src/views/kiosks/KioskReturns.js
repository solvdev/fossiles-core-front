import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
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
  TabContent,
  TabPane,
  Table,
} from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import { getKioskPosContext } from "services/kioskPosService";
import {
  authorizeKioskExchange,
  listKioskExchanges,
  listPendingAuthorizations,
  listPendingReintegros,
  rejectKioskExchange,
  reintegrateKioskReturn,
} from "services/kioskExchangeService";
import { getKioscoMovimientos } from "services/kioscoInventoryService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  formatKioscoMovementReference,
  formatKioscoMovementRoute,
  getKioscoMovementSignedQuantity,
} from "utils/kioskMovementHelper";
import {
  buildKioskExchangeSlipPrintHtml,
  buildKioskReturnSlipPrintHtml,
  openExchangeSlipPrintWindow,
} from "utils/kioskExchangeSlipPrint";
import { formatCurrency, formatQty } from "./pos/posUtils";
import "./KioskSales.css";
import PosAdminKioskPicker from "./pos/PosAdminKioskPicker";
import ExchangeSlipWizard from "./returns/ExchangeSlipWizard";
import SimpleReturnWizard from "./returns/SimpleReturnWizard";

const statusBadge = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "COMPLETED") return "success";
  if (normalized === "PENDING_AUTHORIZATION") return "warning";
  if (normalized === "PENDING_REINTEGRO") return "info";
  if (normalized === "REINTEGRATED") return "success";
  if (normalized === "REJECTED") return "danger";
  return "secondary";
};

const statusLabel = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PENDING_AUTHORIZATION") return "Pendiente autorización";
  if (normalized === "PENDING_REINTEGRO") return "Pendiente reintegro";
  if (normalized === "REINTEGRATED") return "Reintegrado a bodega";
  if (normalized === "COMPLETED") return "Completado";
  if (normalized === "REJECTED") return "Rechazado";
  return status || "—";
};

function KioskReturns() {
  const { hasAnyRole } = useAuth();
  const [activeTab, setActiveTab] = useState("EXCHANGES");
  const [selectedKiosk, setSelectedKiosk] = useState("");
  const [posContext, setPosContext] = useState(null);
  const [exchanges, setExchanges] = useState([]);
  const [returns, setReturns] = useState([]);
  const [depositReturns, setDepositReturns] = useState([]);
  const [pendingAuthorizations, setPendingAuthorizations] = useState([]);
  const [pendingReintegros, setPendingReintegros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [exchangeWizardOpen, setExchangeWizardOpen] = useState(false);
  const [returnWizardOpen, setReturnWizardOpen] = useState(false);

  const isAdmin = Boolean(posContext?.admin);
  /** Solo admin/supervisión gestiona devoluciones; encargadas de kiosko solo cambios. */
  const canManageReturns = isAdmin;
  /** Autorizar cambios: solo admin/logística (acceso global); encargadas no. */
  const canAuthorizeExchanges =
    isAdmin
    || hasAnyRole(["ADMIN", "ADMINISTRADOR", "LOGISTICA", "LOGISTICO", "LOGIST"]);
  const canApproveExchanges = canAuthorizeExchanges;
  const adminKiosks = useMemo(
    () => (Array.isArray(posContext?.kiosks) ? posContext.kiosks : []),
    [posContext]
  );

  const selectedKioskCode = useMemo(() => {
    if (isAdmin) {
      const match = adminKiosks.find((k) => String(k.kioskId) === String(selectedKiosk));
      return match?.kioskCode || posContext?.kioskCode || "";
    }
    return posContext?.kioskCode || "";
  }, [isAdmin, adminKiosks, selectedKiosk, posContext]);

  const selectedKioskName = useMemo(() => {
    if (isAdmin) {
      const match = adminKiosks.find((k) => String(k.kioskId) === String(selectedKiosk));
      return match?.kioskName || posContext?.kioskName || "";
    }
    return posContext?.kioskName || "";
  }, [isAdmin, adminKiosks, selectedKiosk, posContext]);

  const selectedKioskLabel = useMemo(() => {
    if (!selectedKioskName && !selectedKioskCode) return "Kiosko";
    if (selectedKioskCode && selectedKioskName) return `${selectedKioskCode} · ${selectedKioskName}`;
    return selectedKioskName || selectedKioskCode;
  }, [selectedKioskCode, selectedKioskName]);

  const loadDepositReturns = async (kioskId) => {
    if (!kioskId) return [];
    const movements = await getKioscoMovimientos(Number(kioskId)).catch(() => []);
    return (Array.isArray(movements) ? movements : [])
      .filter((movement) => String(movement.movementType || "").toUpperCase() === "DEVOLUCION_DEPOSITO")
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  };

  const loadData = async (
    kioskId = selectedKiosk,
    manageReturns = canManageReturns,
    authorizeExchanges = canAuthorizeExchanges
  ) => {
    if (!kioskId) {
      setExchanges([]);
      setReturns([]);
      setDepositReturns([]);
      setPendingAuthorizations([]);
      setPendingReintegros([]);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const kioskLocationId = Number(kioskId);
      const [exchangeRows, authorizationRows, reintegroRows, depositRows] = await Promise.all([
        listKioskExchanges(kioskLocationId),
        authorizeExchanges ? listPendingAuthorizations(kioskLocationId) : Promise.resolve([]),
        manageReturns ? listPendingReintegros(kioskLocationId) : Promise.resolve([]),
        manageReturns ? loadDepositReturns(kioskId) : Promise.resolve([]),
      ]);
      const allRows = Array.isArray(exchangeRows) ? exchangeRows : [];
      setExchanges(allRows.filter((row) => String(row.slipType || "EXCHANGE").toUpperCase() === "EXCHANGE"));
      setReturns(
        manageReturns
          ? allRows.filter((row) => String(row.slipType || "").toUpperCase() === "RETURN")
          : []
      );
      setDepositReturns(manageReturns && Array.isArray(depositRows) ? depositRows : []);
      setPendingAuthorizations(Array.isArray(authorizationRows) ? authorizationRows : []);
      setPendingReintegros(manageReturns && Array.isArray(reintegroRows) ? reintegroRows : []);
    } catch (err) {
      setError(err.message || "Error al cargar devoluciones y boletas.");
    } finally {
      setLoading(false);
    }
  };

  const loadContext = async (kioskIdOverride) => {
    try {
      setLoading(true);
      setError("");
      const ctx = await getKioskPosContext(kioskIdOverride || selectedKiosk || undefined, {});
      setPosContext(ctx || null);
      const resolvedId = ctx?.kioskId ? String(ctx.kioskId) : kioskIdOverride ? String(kioskIdOverride) : "";
      if (resolvedId) {
        setSelectedKiosk(resolvedId);
        const adminAccess = Boolean(ctx?.admin);
        const authorizeAccess =
          adminAccess
          || hasAnyRole(["ADMIN", "ADMINISTRADOR", "LOGISTICA", "LOGISTICO", "LOGIST"]);
        await loadData(resolvedId, adminAccess, authorizeAccess);
      }
    } catch (err) {
      setError(err.message || "Error al cargar el kiosko.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContext();
  }, []);

  useEffect(() => {
    if (!canAuthorizeExchanges && activeTab === "AUTHORIZATIONS") {
      setActiveTab("EXCHANGES");
    }
    if (
      !canManageReturns
      && (activeTab === "DEPOSIT_RETURNS" || activeTab === "RETURNS" || activeTab === "REINTEGROS")
    ) {
      setActiveTab("EXCHANGES");
    }
  }, [canAuthorizeExchanges, canManageReturns, activeTab]);

  const handleKioskChange = async (nextKioskId) => {
    setSelectedKiosk(String(nextKioskId));
    await loadContext(nextKioskId);
  };

  const handleReintegrate = async (slip) => {
    try {
      setActionId(slip.id);
      await reintegrateKioskReturn(slip.id, selectedKiosk || slip.kioskLocationId);
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo reintegrar la devolución.");
    } finally {
      setActionId(null);
    }
  };

  const handleAuthorize = async (slip) => {
    try {
      setActionId(slip.id);
      await authorizeKioskExchange(slip.id, selectedKiosk || slip.kioskLocationId);
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo autorizar el cambio.");
    } finally {
      setActionId(null);
    }
  };

  const openRejectModal = (slip) => {
    setRejectTarget(slip);
    setRejectReason("");
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) {
      setError("Indica el motivo del rechazo.");
      return;
    }
    try {
      setActionId(rejectTarget.id);
      await rejectKioskExchange(rejectTarget.id, selectedKiosk || rejectTarget.kioskLocationId, rejectReason.trim());
      setRejectModalOpen(false);
      setRejectTarget(null);
      await loadData();
    } catch (err) {
      setError(err.message || "No se pudo rechazar el cambio.");
    } finally {
      setActionId(null);
    }
  };

  const handlePrintExchange = (slip) => {
    openExchangeSlipPrintWindow(buildKioskExchangeSlipPrintHtml(slip));
  };

  const handlePrintReturn = (slip) => {
    openExchangeSlipPrintWindow(buildKioskReturnSlipPrintHtml(slip));
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="6">
                  <CardTitle tag="h4">Devoluciones y Cambios</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="primary"
                    className="btn-round mr-2"
                    onClick={() => setExchangeWizardOpen(true)}
                    disabled={!selectedKiosk}
                  >
                    <i className="nc-icon nc-simple-add" /> Boleta de cambio
                  </Button>
                  {canManageReturns && (
                    <Button
                      color="info"
                      className="btn-round"
                      onClick={() => setReturnWizardOpen(true)}
                      disabled={!selectedKiosk}
                    >
                      <i className="nc-icon nc-simple-add" /> Devolución
                    </Button>
                  )}
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <p className="text-muted">
                {canManageReturns
                  ? "Boletas de cambio: devuelve un producto a precio vendido y factura el nuevo a precio catálogo. Devoluciones a bodega registran la salida del inventario kiosko hacia bodega (sin venta POS). Devoluciones de cliente quedan ligadas a la venta original."
                  : "Boletas de cambio: devuelve un producto a precio vendido y factura el nuevo a precio catálogo. Las devoluciones a bodega las gestiona supervisión."}
              </p>
              <Row className="mb-3 align-items-end">
                <Col md="5">
                  <label>Kiosko</label>
                  {isAdmin && adminKiosks.length > 0 ? (
                    <PosAdminKioskPicker
                      kiosks={adminKiosks}
                      selectedKioskId={selectedKiosk}
                      selectedLabel={selectedKioskLabel}
                      onSelect={(id) => void handleKioskChange(id)}
                    />
                  ) : (
                    <div>
                      <Badge color="primary" pill className="mr-2">
                        {selectedKioskCode || "—"}
                      </Badge>
                      <span>{selectedKioskName || "Tu kiosko asignado"}</span>
                    </div>
                  )}
                </Col>
              </Row>

              <Nav tabs className="mb-3">
                <NavItem>
                  <NavLink
                    className={activeTab === "EXCHANGES" ? "active" : ""}
                    onClick={() => setActiveTab("EXCHANGES")}
                    style={{ cursor: "pointer" }}
                  >
                    Boletas de cambio
                  </NavLink>
                </NavItem>
                {canManageReturns && (
                  <>
                    <NavItem>
                      <NavLink
                        className={activeTab === "DEPOSIT_RETURNS" ? "active" : ""}
                        onClick={() => setActiveTab("DEPOSIT_RETURNS")}
                        style={{ cursor: "pointer" }}
                      >
                        Devoluciones a bodega
                        {depositReturns.length > 0 ? ` (${depositReturns.length})` : ""}
                      </NavLink>
                    </NavItem>
                    <NavItem>
                      <NavLink
                        className={activeTab === "RETURNS" ? "active" : ""}
                        onClick={() => setActiveTab("RETURNS")}
                        style={{ cursor: "pointer" }}
                      >
                        Devoluciones de cliente
                      </NavLink>
                    </NavItem>
                    <NavItem>
                      <NavLink
                        className={activeTab === "REINTEGROS" ? "active" : ""}
                        onClick={() => setActiveTab("REINTEGROS")}
                        style={{ cursor: "pointer" }}
                      >
                        Pendientes reintegro
                        {pendingReintegros.length > 0 ? ` (${pendingReintegros.length})` : ""}
                      </NavLink>
                    </NavItem>
                  </>
                )}
                {canAuthorizeExchanges && (
                  <NavItem>
                    <NavLink
                      className={activeTab === "AUTHORIZATIONS" ? "active" : ""}
                      onClick={() => setActiveTab("AUTHORIZATIONS")}
                      style={{ cursor: "pointer" }}
                    >
                      Autorizaciones pendientes
                      {pendingAuthorizations.length > 0 ? ` (${pendingAuthorizations.length})` : ""}
                    </NavLink>
                  </NavItem>
                )}
              </Nav>

              <TabContent activeTab={activeTab}>
                <TabPane tabId="EXCHANGES">
                  {loading ? (
                    <p>Cargando...</p>
                  ) : exchanges.length === 0 ? (
                    <p>No hay boletas de cambio registradas.</p>
                  ) : (
                    <Table responsive>
                      <thead className="text-primary">
                        <tr>
                          <th>No.</th>
                          <th>Kiosko</th>
                          <th>Venta orig.</th>
                          <th>Devuelto</th>
                          <th>Nuevo</th>
                          <th>Diferencia</th>
                          <th>Estado</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exchanges.map((row) => (
                          <tr key={row.id}>
                            <td>{row.slipNumber}</td>
                            <td>{row.kioskName}</td>
                            <td>{row.originalSaleNumber}</td>
                            <td>{row.returnedProductName}</td>
                            <td>{row.givenProductName}</td>
                            <td>{formatCurrency(row.differenceAmount)}</td>
                            <td><Badge color={statusBadge(row.status)}>{statusLabel(row.status)}</Badge></td>
                            <td className="text-right">
                              <Button color="default" size="sm" onClick={() => handlePrintExchange(row)}>
                                Imprimir
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </TabPane>

                <TabPane tabId="DEPOSIT_RETURNS">
                  {loading ? (
                    <p>Cargando...</p>
                  ) : depositReturns.length === 0 ? (
                    <p>
                      No hay devoluciones a bodega registradas
                      {selectedKiosk ? " para este kiosko" : ""}.
                      {" "}Regístralas con el botón <strong>Devolución</strong> → tipo &quot;Devolución a bodega&quot;.
                    </p>
                  ) : (
                    <Table responsive>
                      <thead className="text-primary">
                        <tr>
                          <th>Fecha</th>
                          {!selectedKiosk && <th>Kiosko</th>}
                          <th>Producto</th>
                          <th>Color</th>
                          <th>Cant.</th>
                          <th>Destino</th>
                          <th>Boleta física</th>
                          <th>Motivo</th>
                          <th>Usuario</th>
                        </tr>
                      </thead>
                      <tbody>
                        {depositReturns.map((row) => (
                          <tr key={row.id}>
                            <td>{row.createdAt ? formatDateTimeGt(row.createdAt) : "—"}</td>
                            {!selectedKiosk && <td>{row.locationName || "—"}</td>}
                            <td>
                              {row.productCode ? `${row.productCode} · ` : ""}
                              {row.productName || row.productId || "—"}
                            </td>
                            <td>{row.colorName || "—"}</td>
                            <td>{getKioscoMovementSignedQuantity(row)}</td>
                            <td>{formatKioscoMovementRoute(row)}</td>
                            <td>{formatKioscoMovementReference(row)}</td>
                            <td>{row.reason || "—"}</td>
                            <td>{row.username || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </TabPane>

                <TabPane tabId="RETURNS">
                  {loading ? (
                    <p>Cargando...</p>
                  ) : returns.length === 0 ? (
                    <p>No hay devoluciones de cliente registradas.</p>
                  ) : (
                    <Table responsive>
                      <thead className="text-primary">
                        <tr>
                          <th>No.</th>
                          <th>Kiosko</th>
                          <th>Venta</th>
                          <th>Producto</th>
                          <th>Cant.</th>
                          <th>Motivo</th>
                          <th>Apto</th>
                          <th>Estado</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returns.map((row) => (
                          <tr key={row.id}>
                            <td>{row.slipNumber}</td>
                            <td>{row.kioskName}</td>
                            <td>{row.originalSaleNumber}</td>
                            <td>{row.returnedProductName}</td>
                            <td>{formatQty(row.returnedQuantity)}</td>
                            <td>{row.reason}</td>
                            <td>{row.apto ? "Sí" : "No"}</td>
                            <td><Badge color={statusBadge(row.status)}>{statusLabel(row.status)}</Badge></td>
                            <td className="text-right">
                              <Button color="default" size="sm" className="mr-1" onClick={() => handlePrintReturn(row)}>
                                Imprimir
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </TabPane>

                <TabPane tabId="REINTEGROS">
                  {loading ? (
                    <p>Cargando...</p>
                  ) : pendingReintegros.length === 0 ? (
                    <p>
                      No hay devoluciones pendientes de reintegro a bodega.
                      {" "}Al registrar una devolución de cliente apta, confirma aquí la salida del kiosko para que aparezca en <strong>Sal.</strong> del conteo.
                    </p>
                  ) : (
                    <Table responsive>
                      <thead className="text-primary">
                        <tr>
                          <th>No.</th>
                          <th>Kiosko</th>
                          <th>Producto</th>
                          <th>Cant.</th>
                          <th>Motivo</th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingReintegros.map((row) => (
                          <tr key={row.id}>
                            <td>{row.slipNumber}</td>
                            <td>{row.kioskName}</td>
                            <td>{row.returnedProductName}</td>
                            <td>{formatQty(row.returnedQuantity)}</td>
                            <td>{row.reason || "—"}</td>
                            <td className="text-right">
                              <Button
                                color="success"
                                size="sm"
                                disabled={actionId === row.id}
                                onClick={() => void handleReintegrate(row)}
                              >
                                {actionId === row.id ? "..." : "Reintegrar a bodega"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </TabPane>

                {canAuthorizeExchanges && (
                  <TabPane tabId="AUTHORIZATIONS">
                    {loading ? (
                      <p>Cargando...</p>
                    ) : pendingAuthorizations.length === 0 ? (
                      <p>No hay cambios pendientes de autorización.</p>
                    ) : (
                      <Table responsive>
                        <thead className="text-primary">
                          <tr>
                            <th>Boleta</th>
                            <th>Kiosko</th>
                            <th>Solicitante</th>
                            <th>Devuelto</th>
                            <th>Nuevo</th>
                            <th>Motivo</th>
                            <th className="text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pendingAuthorizations.map((row) => (
                            <tr key={row.id}>
                              <td>{row.slipNumber}</td>
                              <td>{row.kioskName}</td>
                              <td>{row.createdByName || "—"}</td>
                              <td>{row.returnedProductName}</td>
                              <td>{row.givenProductName}</td>
                              <td>{row.reason}</td>
                              <td className="text-right">
                                {canApproveExchanges && (
                                  <>
                                    <Button
                                      color="success"
                                      size="sm"
                                      className="mr-1"
                                      disabled={actionId === row.id}
                                      onClick={() => void handleAuthorize(row)}
                                    >
                                      {actionId === row.id ? "..." : "Autorizar"}
                                    </Button>
                                    <Button
                                      color="danger"
                                      size="sm"
                                      outline
                                      disabled={actionId === row.id}
                                      onClick={() => openRejectModal(row)}
                                    >
                                      Rechazar
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
                )}
              </TabContent>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <ExchangeSlipWizard
        isOpen={exchangeWizardOpen}
        onClose={() => setExchangeWizardOpen(false)}
        kioskLocationId={selectedKiosk ? Number(selectedKiosk) : null}
        kioskCode={selectedKioskCode}
        kioskName={selectedKioskName}
        onCompleted={() => void loadData()}
      />
      <SimpleReturnWizard
        isOpen={canManageReturns && returnWizardOpen}
        onClose={() => setReturnWizardOpen(false)}
        kioskLocationId={selectedKiosk ? Number(selectedKiosk) : null}
        onCompleted={() => void loadData()}
      />

      <Modal isOpen={rejectModalOpen} toggle={() => setRejectModalOpen(false)}>
        <ModalHeader toggle={() => setRejectModalOpen(false)}>Rechazar solicitud de cambio</ModalHeader>
        <ModalBody>
          <Label>Motivo del rechazo</Label>
          <Input
            type="textarea"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Indica por qué se rechaza el cambio"
          />
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setRejectModalOpen(false)}>
            Cancelar
          </Button>
          <Button color="danger" onClick={() => void handleReject()} disabled={actionId != null}>
            Rechazar cambio
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default KioskReturns;
