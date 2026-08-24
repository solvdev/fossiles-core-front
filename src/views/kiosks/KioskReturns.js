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

const formatKioskLabel = (row) => {
  const code = row?.kioskCode || "";
  const name = row?.kioskName || row?.locationName || "";
  if (code && name) return `${code} · ${name}`;
  return name || code || "—";
};

const slipMatchesSearch = (row, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.slipNumber,
    row.kioskCode,
    row.kioskName,
    row.originalSaleNumber,
    row.returnedProductName,
    row.returnedProductCode,
    row.givenProductName,
    row.givenProductCode,
    row.reason,
    row.createdByName,
    row.status,
    statusLabel(row.status),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
};

const depositMatchesSearch = (row, query) => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    row.locationName,
    row.productCode,
    row.productName,
    row.colorName,
    row.reason,
    row.username,
    formatKioscoMovementReference(row),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
};

function KioskReturns() {
  const { hasAnyRole } = useAuth();
  const [activeTab, setActiveTab] = useState("EXCHANGES");
  const [selectedKiosk, setSelectedKiosk] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
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
  /** Admin/logística (y roles con acceso global POS): listado de todos los kioskos. */
  const canViewAllKiosks = isAdmin;
  const adminKiosks = useMemo(
    () => (Array.isArray(posContext?.kiosks) ? posContext.kiosks : []),
    [posContext]
  );

  const selectedKioskCode = useMemo(() => {
    if (canViewAllKiosks) {
      if (!selectedKiosk) return "";
      const match = adminKiosks.find((k) => String(k.kioskId) === String(selectedKiosk));
      return match?.kioskCode || "";
    }
    return posContext?.kioskCode || "";
  }, [canViewAllKiosks, adminKiosks, selectedKiosk, posContext]);

  const selectedKioskName = useMemo(() => {
    if (canViewAllKiosks) {
      if (!selectedKiosk) return "";
      const match = adminKiosks.find((k) => String(k.kioskId) === String(selectedKiosk));
      return match?.kioskName || "";
    }
    return posContext?.kioskName || "";
  }, [canViewAllKiosks, adminKiosks, selectedKiosk, posContext]);

  const selectedKioskLabel = useMemo(() => {
    if (canViewAllKiosks && !selectedKiosk) return "Todos los kioskos";
    if (!selectedKioskName && !selectedKioskCode) return "Kiosko";
    if (selectedKioskCode && selectedKioskName) return `${selectedKioskCode} · ${selectedKioskName}`;
    return selectedKioskName || selectedKioskCode;
  }, [canViewAllKiosks, selectedKiosk, selectedKioskCode, selectedKioskName]);

  const loadDepositReturns = async (kioskId, kioskList = []) => {
    const loadOne = async (id) => {
      const movements = await getKioscoMovimientos(Number(id)).catch(() => []);
      return (Array.isArray(movements) ? movements : [])
        .filter((movement) => String(movement.movementType || "").toUpperCase() === "DEVOLUCION_DEPOSITO");
    };
    if (kioskId) {
      return (await loadOne(kioskId)).sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
    }
    const ids = (kioskList || []).map((k) => k.kioskId).filter(Boolean);
    if (!ids.length) return [];
    const batches = await Promise.all(ids.map((id) => loadOne(id)));
    return batches
      .flat()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  };

  const loadData = async (
    kioskId = selectedKiosk,
    manageReturns = canManageReturns,
    authorizeExchanges = canAuthorizeExchanges,
    viewAll = canViewAllKiosks,
    kioskList = adminKiosks
  ) => {
    if (!kioskId && !viewAll) {
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
      const kioskLocationId = kioskId ? Number(kioskId) : undefined;
      const [exchangeRows, authorizationRows, reintegroRows, depositRows] = await Promise.all([
        listKioskExchanges(kioskLocationId),
        authorizeExchanges ? listPendingAuthorizations(kioskLocationId) : Promise.resolve([]),
        manageReturns ? listPendingReintegros(kioskLocationId) : Promise.resolve([]),
        manageReturns ? loadDepositReturns(kioskId, kioskList) : Promise.resolve([]),
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
      const ctx = await getKioskPosContext(
        kioskIdOverride || (selectedKiosk || undefined),
        {}
      );
      setPosContext(ctx || null);
      const adminAccess = Boolean(ctx?.admin);
      const authorizeAccess =
        adminAccess
        || hasAnyRole(["ADMIN", "ADMINISTRADOR", "LOGISTICA", "LOGISTICO", "LOGIST"]);
      const kioskList = Array.isArray(ctx?.kiosks) ? ctx.kiosks : [];

      if (adminAccess && (kioskIdOverride === "" || kioskIdOverride == null) && !selectedKiosk) {
        setSelectedKiosk("");
        await loadData(null, adminAccess, authorizeAccess, true, kioskList);
        return;
      }

      if (adminAccess && kioskIdOverride === "") {
        setSelectedKiosk("");
        await loadData(null, adminAccess, authorizeAccess, true, kioskList);
        return;
      }

      const resolvedId = kioskIdOverride
        ? String(kioskIdOverride)
        : ctx?.kioskId
          ? String(ctx.kioskId)
          : "";
      if (adminAccess && !kioskIdOverride) {
        // Primera carga admin/logística: listado general, sin forzar un kiosko.
        setSelectedKiosk("");
        await loadData(null, adminAccess, authorizeAccess, true, kioskList);
        return;
      }
      if (resolvedId) {
        setSelectedKiosk(resolvedId);
        await loadData(resolvedId, adminAccess, authorizeAccess, adminAccess, kioskList);
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
    const next = nextKioskId ? String(nextKioskId) : "";
    setSelectedKiosk(next);
    await loadContext(next);
  };

  const openExchangeWizard = () => {
    if (!selectedKiosk) {
      setError("Selecciona un kiosko para registrar la boleta de cambio.");
      return;
    }
    setError("");
    setExchangeWizardOpen(true);
  };

  const openReturnWizard = () => {
    if (!selectedKiosk) {
      setError("Selecciona un kiosko para registrar la devolución.");
      return;
    }
    setError("");
    setReturnWizardOpen(true);
  };

  const filteredExchanges = useMemo(
    () =>
      exchanges.filter(
        (row) =>
          slipMatchesSearch(row, searchQuery)
          && (!statusFilter || String(row.status || "").toUpperCase() === statusFilter)
      ),
    [exchanges, searchQuery, statusFilter]
  );

  const filteredReturns = useMemo(
    () =>
      returns.filter(
        (row) =>
          slipMatchesSearch(row, searchQuery)
          && (!statusFilter || String(row.status || "").toUpperCase() === statusFilter)
      ),
    [returns, searchQuery, statusFilter]
  );

  const filteredDepositReturns = useMemo(
    () => depositReturns.filter((row) => depositMatchesSearch(row, searchQuery)),
    [depositReturns, searchQuery]
  );

  const filteredPendingReintegros = useMemo(
    () => pendingReintegros.filter((row) => slipMatchesSearch(row, searchQuery)),
    [pendingReintegros, searchQuery]
  );

  const filteredPendingAuthorizations = useMemo(
    () => pendingAuthorizations.filter((row) => slipMatchesSearch(row, searchQuery)),
    [pendingAuthorizations, searchQuery]
  );

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
                    onClick={openExchangeWizard}
                    disabled={!selectedKiosk}
                    title={!selectedKiosk && canViewAllKiosks ? "Elige un kiosko en el filtro para registrar" : undefined}
                  >
                    <i className="nc-icon nc-simple-add" /> Boleta de cambio
                  </Button>
                  {canManageReturns && (
                    <Button
                      color="info"
                      className="btn-round"
                      onClick={openReturnWizard}
                      disabled={!selectedKiosk}
                      title={!selectedKiosk && canViewAllKiosks ? "Elige un kiosko en el filtro para registrar" : undefined}
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
                <Col md={canViewAllKiosks ? "4" : "5"}>
                  <Label>Kiosko</Label>
                  {canViewAllKiosks && adminKiosks.length > 0 ? (
                    <PosAdminKioskPicker
                      kiosks={adminKiosks}
                      selectedKioskId={selectedKiosk}
                      selectedLabel={selectedKioskLabel}
                      allowAll
                      allLabel="Todos los kioskos"
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
                {canViewAllKiosks && (
                  <>
                    <Col md="4">
                      <Label>Buscar</Label>
                      <Input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Boleta, venta, producto, kiosko…"
                      />
                    </Col>
                    <Col md="4">
                      <Label>Estado</Label>
                      <Input
                        type="select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="COMPLETED">Completado</option>
                        <option value="PENDING_AUTHORIZATION">Pendiente autorización</option>
                        <option value="PENDING_REINTEGRO">Pendiente reintegro</option>
                        <option value="REINTEGRATED">Reintegrado a bodega</option>
                        <option value="REJECTED">Rechazado</option>
                      </Input>
                    </Col>
                  </>
                )}
              </Row>
              {canViewAllKiosks && !selectedKiosk && (
                <p className="text-muted small mb-3">
                  Viendo el listado de todos los kioskos. Para registrar un cambio o devolución, elige un kiosko en el filtro.
                </p>
              )}

              <Nav tabs className="mb-3">
                <NavItem>
                  <NavLink
                    className={activeTab === "EXCHANGES" ? "active" : ""}
                    onClick={() => setActiveTab("EXCHANGES")}
                    style={{ cursor: "pointer" }}
                  >
                    Boletas de cambio
                    {filteredExchanges.length > 0 ? ` (${filteredExchanges.length})` : ""}
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
                        {filteredDepositReturns.length > 0 ? ` (${filteredDepositReturns.length})` : ""}
                      </NavLink>
                    </NavItem>
                    <NavItem>
                      <NavLink
                        className={activeTab === "RETURNS" ? "active" : ""}
                        onClick={() => setActiveTab("RETURNS")}
                        style={{ cursor: "pointer" }}
                      >
                        Devoluciones de cliente
                        {filteredReturns.length > 0 ? ` (${filteredReturns.length})` : ""}
                      </NavLink>
                    </NavItem>
                    <NavItem>
                      <NavLink
                        className={activeTab === "REINTEGROS" ? "active" : ""}
                        onClick={() => setActiveTab("REINTEGROS")}
                        style={{ cursor: "pointer" }}
                      >
                        Pendientes reintegro
                        {filteredPendingReintegros.length > 0 ? ` (${filteredPendingReintegros.length})` : ""}
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
                      {filteredPendingAuthorizations.length > 0 ? ` (${filteredPendingAuthorizations.length})` : ""}
                    </NavLink>
                  </NavItem>
                )}
              </Nav>

              <TabContent activeTab={activeTab}>
                <TabPane tabId="EXCHANGES">
                  {loading ? (
                    <p>Cargando...</p>
                  ) : filteredExchanges.length === 0 ? (
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
                        {filteredExchanges.map((row) => (
                          <tr key={row.id}>
                            <td>{row.slipNumber}</td>
                            <td>{formatKioskLabel(row)}</td>
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
                  ) : filteredDepositReturns.length === 0 ? (
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
                          <th>Kiosko</th>
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
                        {filteredDepositReturns.map((row) => (
                          <tr key={row.id}>
                            <td>{row.createdAt ? formatDateTimeGt(row.createdAt) : "—"}</td>
                            <td>{row.locationName || "—"}</td>
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
                  ) : filteredReturns.length === 0 ? (
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
                        {filteredReturns.map((row) => (
                          <tr key={row.id}>
                            <td>{row.slipNumber}</td>
                            <td>{formatKioskLabel(row)}</td>
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
                  ) : filteredPendingReintegros.length === 0 ? (
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
                        {filteredPendingReintegros.map((row) => (
                          <tr key={row.id}>
                            <td>{row.slipNumber}</td>
                            <td>{formatKioskLabel(row)}</td>
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
                    ) : filteredPendingAuthorizations.length === 0 ? (
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
                          {filteredPendingAuthorizations.map((row) => (
                            <tr key={row.id}>
                              <td>{row.slipNumber}</td>
                              <td>{formatKioskLabel(row)}</td>
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
