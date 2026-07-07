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
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getLocations } from "services/locationService";
import {
  authorizeKioskExchange,
  listKioskExchanges,
  listPendingAuthorizations,
  rejectKioskExchange,
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
import ExchangeSlipWizard from "./returns/ExchangeSlipWizard";
import SimpleReturnWizard from "./returns/SimpleReturnWizard";

const isKioskLocation = (location) => {
  const text = `${location?.categoria || ""} ${location?.name || ""} ${location?.code || ""}`.toUpperCase();
  return text.includes("KIOS") || String(location?.code || "").toUpperCase().startsWith("K");
};

const statusBadge = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "COMPLETED") return "success";
  if (normalized === "PENDING_AUTHORIZATION") return "warning";
  if (normalized === "REJECTED") return "danger";
  return "secondary";
};

const statusLabel = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "PENDING_AUTHORIZATION") return "Pendiente autorización";
  if (normalized === "COMPLETED") return "Completado";
  if (normalized === "REJECTED") return "Rechazado";
  return status || "—";
};

function KioskReturns() {
  const { hasPermission } = useAuth();
  const canAuthorizeExchanges =
    hasPermission("KIOSCOS.CAMBIOS.AUTORIZAR.APROBAR") || hasPermission("KIOSCOS.CAMBIOS.AUTORIZAR.VER");
  const [activeTab, setActiveTab] = useState("EXCHANGES");
  const [selectedKiosk, setSelectedKiosk] = useState("");
  const [locations, setLocations] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [returns, setReturns] = useState([]);
  const [depositReturns, setDepositReturns] = useState([]);
  const [pendingAuthorizations, setPendingAuthorizations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState("");
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [exchangeWizardOpen, setExchangeWizardOpen] = useState(false);
  const [returnWizardOpen, setReturnWizardOpen] = useState(false);

  const kioskOptions = useMemo(
    () =>
      locations.map((location) => ({
        value: String(location.id),
        label: `${location.name}${location.categoria ? ` (${location.categoria})` : ""}`,
      })),
    [locations]
  );

  const loadLocations = async () => {
    const data = await getLocations();
    const kiosks = (data || []).filter(isKioskLocation);
    setLocations(kiosks);
    if (!selectedKiosk && kiosks.length === 1) {
      setSelectedKiosk(String(kiosks[0].id));
    }
  };

  const loadDepositReturns = async (kioskId, kioskList) => {
    const kioskIds = kioskId
      ? [Number(kioskId)]
      : (kioskList || []).map((location) => location.id).filter(Boolean);
    if (kioskIds.length === 0) {
      return [];
    }
    const movementGroups = await Promise.all(
      kioskIds.map((id) => getKioscoMovimientos(id).catch(() => []))
    );
    return movementGroups
      .flat()
      .filter((movement) => String(movement.movementType || "").toUpperCase() === "DEVOLUCION_DEPOSITO")
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  };

  const loadData = async (kioskId = selectedKiosk, kioskList = locations) => {
    try {
      setLoading(true);
      setError("");
      const kioskLocationId = kioskId || undefined;
      const [exchangeRows, authorizationRows, depositRows] = await Promise.all([
        listKioskExchanges(kioskLocationId),
        canAuthorizeExchanges ? listPendingAuthorizations(kioskLocationId) : Promise.resolve([]),
        loadDepositReturns(kioskId, kioskList),
      ]);
      const allRows = Array.isArray(exchangeRows) ? exchangeRows : [];
      setExchanges(allRows.filter((row) => String(row.slipType || "EXCHANGE").toUpperCase() === "EXCHANGE"));
      setReturns(allRows.filter((row) => String(row.slipType || "").toUpperCase() === "RETURN"));
      setDepositReturns(Array.isArray(depositRows) ? depositRows : []);
      setPendingAuthorizations(Array.isArray(authorizationRows) ? authorizationRows : []);
    } catch (err) {
      setError(err.message || "Error al cargar devoluciones y boletas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLocations().catch((err) => setError(err.message || "Error al cargar kioskos"));
  }, []);

  useEffect(() => {
    void loadData(selectedKiosk, locations);
  }, [selectedKiosk, locations]);

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
                  <Button
                    color="info"
                    className="btn-round"
                    onClick={() => setReturnWizardOpen(true)}
                    disabled={!selectedKiosk}
                  >
                    <i className="nc-icon nc-simple-add" /> Devolución
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <p className="text-muted">
                Boletas de cambio: devuelve un producto a precio vendido y factura el nuevo a precio catálogo.
                Devoluciones a bodega registran la salida del inventario kiosko hacia bodega (sin venta POS).
                Devoluciones de cliente quedan ligadas a la venta original.
              </p>
              <Row className="mb-3">
                <Col md="4">
                  <label>Kiosko</label>
                  <FilterableSelect
                    value={selectedKiosk}
                    onChange={(value) => setSelectedKiosk(value)}
                    options={kioskOptions}
                    placeholder="Buscar kiosko…"
                    emptyLabel="Todos los kioskos"
                    disabled={loading}
                  />
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
                                {hasPermission("KIOSCOS.CAMBIOS.AUTORIZAR.APROBAR") && (
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
        onCompleted={() => void loadData()}
      />
      <SimpleReturnWizard
        isOpen={returnWizardOpen}
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
