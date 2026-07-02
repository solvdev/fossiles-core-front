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
  Nav,
  NavItem,
  NavLink,
  Row,
  TabContent,
  TabPane,
  Table,
} from "reactstrap";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getLocations } from "services/locationService";
import {
  listKioskExchanges,
  listPendingReintegros,
  reintegrateKioskReturn,
} from "services/kioskExchangeService";
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
  if (normalized === "PENDING_REINTEGRO") return "warning";
  if (normalized === "REINTEGRATED") return "info";
  return "secondary";
};

function KioskReturns() {
  const [activeTab, setActiveTab] = useState("EXCHANGES");
  const [selectedKiosk, setSelectedKiosk] = useState("");
  const [locations, setLocations] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [returns, setReturns] = useState([]);
  const [pendingReintegros, setPendingReintegros] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState("");
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

  const loadData = async (kioskId = selectedKiosk) => {
    try {
      setLoading(true);
      setError("");
      const kioskLocationId = kioskId || undefined;
      const [exchangeRows, pendingRows] = await Promise.all([
        listKioskExchanges(kioskLocationId),
        listPendingReintegros(kioskLocationId),
      ]);
      const allRows = Array.isArray(exchangeRows) ? exchangeRows : [];
      setExchanges(allRows.filter((row) => String(row.slipType || "EXCHANGE").toUpperCase() === "EXCHANGE"));
      setReturns(allRows.filter((row) => String(row.slipType || "").toUpperCase() === "RETURN"));
      setPendingReintegros(Array.isArray(pendingRows) ? pendingRows : []);
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
    void loadData();
  }, [selectedKiosk]);

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
                  <CardTitle tag="h4">Devoluciones / Reintegros</CardTitle>
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
                Devoluciones aptas quedan pendientes de reintegro a Bodega PT.
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
                    className={activeTab === "RETURNS" ? "active" : ""}
                    onClick={() => setActiveTab("RETURNS")}
                    style={{ cursor: "pointer" }}
                  >
                    Devoluciones
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={activeTab === "REINTEGROS" ? "active" : ""}
                    onClick={() => setActiveTab("REINTEGROS")}
                    style={{ cursor: "pointer" }}
                  >
                    Reintegros pendientes
                  </NavLink>
                </NavItem>
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
                            <td><Badge color={statusBadge(row.status)}>{row.status}</Badge></td>
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

                <TabPane tabId="RETURNS">
                  {loading ? (
                    <p>Cargando...</p>
                  ) : returns.length === 0 ? (
                    <p>No hay devoluciones registradas.</p>
                  ) : (
                    <Table responsive>
                      <thead className="text-primary">
                        <tr>
                          <th>No.</th>
                          <th>Kiosko</th>
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
                            <td>{row.returnedProductName}</td>
                            <td>{formatQty(row.returnedQuantity)}</td>
                            <td>{row.reason}</td>
                            <td>{row.apto ? "Sí" : "No"}</td>
                            <td><Badge color={statusBadge(row.status)}>{row.status}</Badge></td>
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
                    <p>No hay devoluciones pendientes de reintegro.</p>
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
                            <td>{row.reason}</td>
                            <td className="text-right">
                              <Button
                                color="success"
                                size="sm"
                                className="btn-round"
                                disabled={actionId === row.id}
                                onClick={() => void handleReintegrate(row)}
                              >
                                <i className="nc-icon nc-check-2" />{" "}
                                {actionId === row.id ? "Reintegrando..." : "Reintegrar"}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </TabPane>
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
    </div>
  );
}

export default KioskReturns;
