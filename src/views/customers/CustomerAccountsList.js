import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Collapse,
  FormGroup,
  Input,
  Label,
  Row,
  Table,
} from "reactstrap";
import {
  CHARGE_STATUS_LABELS,
  formatAccountMoney,
  getCreditBadgeStyle,
  getCustomerAccountPrintReport,
  getCustomerAccountSummary,
  getDueBadgeStyle,
  searchReceivableDocuments,
  splitAccountBalance,
} from "services/customerAccountService";
import {
  buildCustomerAccountReportPrintHtml,
  openBlankPrintWindow,
  writeHtmlToPrintWindow,
} from "utils/customerAccountReportPrintHtml";
import {
  getRegionLabel,
  groupAccountRowsByRoute,
  listLocations,
  listRegions,
  listRoutes,
  parseRouteLocationCode,
} from "utils/deliveryRouteCatalog";
import { showError } from "utils/notificationHelper";
import CustomerAccountEntryModal from "components/customers/CustomerAccountEntryModal";

function BalanceCell({ amount, type }) {
  const value = Number(amount) || 0;
  const style = type === "due" ? getDueBadgeStyle(value) : getCreditBadgeStyle(value);
  return (
    <td className="text-right">
      <span style={style}>{formatAccountMoney(value)}</span>
    </td>
  );
}

function rowDueForKind(row, kindTab) {
  if (kindTab === "OPC") {
    return Number(row.balanceDueOpc) || 0;
  }
  return Number(row.balanceDueOpv) || 0;
}

function PortfolioKindSelector({ kindTab, onSelect, totalsByKind, clientCount }) {
  const options = [
    {
      key: "OPV",
      title: "Cartera OPV",
      subtitle: "Órdenes de producción venta",
      color: "#3498db",
      light: "#ebf5fb",
    },
    {
      key: "OPC",
      title: "Cartera OPC",
      subtitle: "Órdenes cinchos",
      color: "#2c3e50",
      light: "#ecf0f1",
    },
  ];

  return (
    <div
      className="mb-3 p-3 rounded border"
      style={{ background: "linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%)" }}
    >
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-2">
        <div>
          <strong className="text-primary">Cartera activa</strong>
          <div className="text-muted small">Seleccione OPV u OPC — incluye envíos físicos y cargos</div>
        </div>
        <Badge
          pill
          color="warning"
          style={{ fontSize: "0.85rem", padding: "8px 14px", fontWeight: 600 }}
        >
          Viendo: {kindTab}
        </Badge>
      </div>
      <div className="d-flex flex-wrap" style={{ gap: 12 }}>
        {options.map((opt) => {
          const active = kindTab === opt.key;
          const due = totalsByKind[opt.key] || 0;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSelect(opt.key)}
              className="border-0 text-left"
              style={{
                cursor: "pointer",
                flex: "1 1 220px",
                maxWidth: 320,
                borderRadius: 10,
                padding: "14px 16px",
                background: active ? opt.color : opt.light,
                color: active ? "#fff" : "#2c3e50",
                boxShadow: active ? `0 4px 14px ${opt.color}55` : "inset 0 0 0 1px #dee2e6",
                transform: active ? "scale(1.02)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              <div className="d-flex align-items-center justify-content-between mb-1">
                <Badge
                  pill
                  style={{
                    backgroundColor: active ? "rgba(255,255,255,0.25)" : opt.color,
                    color: "#fff",
                    fontSize: "0.75rem",
                    padding: "6px 10px",
                  }}
                >
                  {opt.key}
                </Badge>
                {active && (
                  <Badge
                    pill
                    style={{ backgroundColor: "#fff", color: opt.color, fontSize: "0.7rem" }}
                  >
                    ACTIVA
                  </Badge>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>{opt.title}</div>
              <div
                style={{
                  fontSize: "0.8rem",
                  opacity: active ? 0.9 : 0.75,
                  marginBottom: 8,
                }}
              >
                {opt.subtitle}
              </div>
              <div style={{ fontSize: "0.85rem" }}>
                Por cobrar:{" "}
                <strong style={{ fontSize: "1.05rem" }}>{formatAccountMoney(due)}</strong>
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-muted small mt-2">
        {clientCount} cliente(s) en filtros actuales · Crédito a favor se muestra igual en ambas carteras
      </div>
    </div>
  );
}

function CustomerRow({ row, kindTab }) {
  const due = rowDueForKind(row, kindTab);
  const credit = Number(row.creditBalance ?? splitAccountBalance(row.balance).creditBalance) || 0;
  return (
    <tr>
      <td>
        {row.legacyCode ? <code>{row.legacyCode}</code> : "—"}
      </td>
      <td>{row.customerName || "—"}</td>
      <td>
        <code>{row.routeLocationCode || "—"}</code>
      </td>
      <td>{row.routeLocationLabel || "—"}</td>
      <td>{row.nit || "—"}</td>
      <td>{row.phone || "—"}</td>
      <BalanceCell amount={due} type="due" />
      <BalanceCell amount={credit} type="credit" />
      <td>{row.lastChargeDate || "—"}</td>
      <td>{row.lastPaymentDate || "—"}</td>
      <td>{row.lfOrderCount || 0}</td>
      <td className="text-right">
        <Link
          to={`/admin/customers?edit=${row.customerId}`}
          className="btn btn-warning btn-sm btn-round mr-1"
        >
          {row.routeLocationCode ? "Editar ruta" : "Asignar ruta"}
        </Link>
        <Link to={`/admin/customer-accounts/${row.customerId}`} className="btn btn-info btn-sm btn-round">
          Estado de cuenta
        </Link>
      </td>
    </tr>
  );
}

function orderKindBadgeColor(orderKind) {
  if (orderKind === "OPC") return "dark";
  if (orderKind === "OPV") return "primary";
  return "secondary";
}

function DocumentSearchRow({ row, onCreateCharge }) {
  const statusLabel = CHARGE_STATUS_LABELS[row.chargeStatus] || row.chargeStatus || "—";
  const statusColor =
    row.chargeStatus === "PAID"
      ? "success"
      : row.chargeStatus === "PARTIAL"
        ? "warning"
        : row.chargeStatus === "CHARGED"
          ? "info"
          : row.chargeStatus === "NONE"
            ? "secondary"
            : "light";

  const canCreateCharge = !row.hasCharge && row.customerId && row.productionOrderId;

  return (
    <tr>
      <td>
        <div>{row.customerName || "—"}</div>
        {row.legacyCode && <small className="text-muted"><code>{row.legacyCode}</code></small>}
      </td>
      <td>
        <code>{row.routeLocationCode || "—"}</code>
        {row.routeLocationLabel && (
          <div className="small text-muted">{row.routeLocationLabel}</div>
        )}
      </td>
      <td>
        <Badge color={orderKindBadgeColor(row.orderKind)}>{row.orderKind}</Badge>
        <div className="small mt-1">{row.orderCode || "—"}</div>
        {row.orderType && row.orderType !== row.orderKind && (
          <div className="small text-muted">{row.orderType}</div>
        )}
      </td>
      <td>
        <strong>{row.shipmentNumber || row.vendorShipmentNumber || "—"}</strong>
        {row.partialReleaseLabel && (
          <div className="small text-muted">{row.partialReleaseLabel}</div>
        )}
      </td>
      <td>
        <Badge color={statusColor}>{statusLabel}</Badge>
        {row.hasPayment && row.chargeStatus !== "PAID" && (
          <Badge color="warning" className="ml-1">Abono</Badge>
        )}
      </td>
      <td className="text-right">
        {row.estimatedTotal != null && !row.hasCharge
          ? formatAccountMoney(row.estimatedTotal)
          : row.hasCharge
            ? formatAccountMoney(row.chargedAmount)
            : "—"}
      </td>
      <td className="text-right">
        {row.hasCharge ? (
          <span style={getDueBadgeStyle(row.balanceDue)}>
            {formatAccountMoney(row.balanceDue)}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="text-right">
        {canCreateCharge && (
          <Button
            color="success"
            size="sm"
            className="btn-round mr-1"
            onClick={() => onCreateCharge(row)}
          >
            Generar cargo
          </Button>
        )}
        <Link
          to={`/admin/customer-accounts/${row.customerId}`}
          className="btn btn-info btn-sm btn-round"
        >
          Estado de cuenta
        </Link>
      </td>
    </tr>
  );
}

function CustomerAccountsList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [positiveBalanceOnly, setPositiveBalanceOnly] = useState(false);
  const [filterRegion, setFilterRegion] = useState("");
  const [filterRoute, setFilterRoute] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [kindTab, setKindTab] = useState("OPV");
  const [chargeStatusFilter, setChargeStatusFilter] = useState("");
  const [documentViewFilter, setDocumentViewFilter] = useState("all");
  const [documentRows, setDocumentRows] = useState([]);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [printing, setPrinting] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [allOrderTypes, setAllOrderTypes] = useState(false);
  const [chargeModalOpen, setChargeModalOpen] = useState(false);
  const [chargeModalRow, setChargeModalRow] = useState(null);

  const regions = useMemo(() => listRegions(), []);
  const filterRoutes = useMemo(
    () => (filterRegion ? listRoutes(filterRegion) : []),
    [filterRegion]
  );
  const filterLocations = useMemo(
    () => (filterRoute ? listLocations(Number(filterRoute)) : []),
    [filterRoute]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCustomerAccountSummary({
        search: search.trim(),
        luisFelipeOnly: true,
        positiveBalanceOnly,
        regionCode: filterRegion || undefined,
        routeNumber: filterRoute ? Number(filterRoute) : undefined,
        routeLocationCode: filterLocation || undefined,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Error al cargar cuentas por cobrar");
    } finally {
      setLoading(false);
    }
  }, [search, positiveBalanceOnly, filterRegion, filterRoute, filterLocation]);

  const loadDocumentSearch = useCallback(async () => {
    setDocumentLoading(true);
    try {
      const data = await searchReceivableDocuments({
        search: search.trim(),
        orderKind: allOrderTypes ? undefined : kindTab,
        chargeStatus: chargeStatusFilter || undefined,
        hasCharge: documentViewFilter === "withCharge" ? true : undefined,
        regionCode: filterRegion || undefined,
        routeNumber: filterRoute ? Number(filterRoute) : undefined,
        routeLocationCode: filterLocation || undefined,
        allOrderTypes,
        limit: 500,
      });
      let rows = Array.isArray(data) ? data : [];
      if (documentViewFilter === "withShipment") {
        rows = rows.filter((r) => r.productShipmentId || r.documentLevel === "SHIPMENT");
      }
      setDocumentRows(rows);
    } catch (err) {
      showError(err.message || "Error al buscar documentos");
      setDocumentRows([]);
    } finally {
      setDocumentLoading(false);
    }
  }, [
    search,
    chargeStatusFilter,
    documentViewFilter,
    kindTab,
    filterRegion,
    filterRoute,
    filterLocation,
    allOrderTypes,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDocumentSearch();
  }, [loadDocumentSearch]);

  const filteredRows = useMemo(() => {
    if (!positiveBalanceOnly) return rows;
    return rows.filter((r) => rowDueForKind(r, kindTab) > 0);
  }, [rows, positiveBalanceOnly, kindTab]);

  const portfolioTotalsByKind = useMemo(() => {
    let opv = 0;
    let opc = 0;
    rows.forEach((r) => {
      opv += rowDueForKind(r, "OPV");
      opc += rowDueForKind(r, "OPC");
    });
    return { OPV: opv, OPC: opc };
  }, [rows]);

  const totals = useMemo(() => {
    let totalDue = 0;
    let totalCredit = 0;
    let withDebt = 0;
    filteredRows.forEach((r) => {
      const due = rowDueForKind(r, kindTab);
      const credit = Number(r.creditBalance ?? splitAccountBalance(r.balance).creditBalance) || 0;
      totalDue += due;
      totalCredit += credit;
      if (due > 0) withDebt += 1;
    });
    return { totalDue, totalCredit, withDebt, count: filteredRows.length };
  }, [filteredRows, kindTab]);

  const regionTotals = useMemo(() => {
    const totalsByRegion = {
      CA: { due: 0, credit: 0, count: 0 },
      CB: { due: 0, credit: 0, count: 0 },
      CC: { due: 0, credit: 0, count: 0 },
      NONE: { due: 0, credit: 0, count: 0 },
    };
    filteredRows.forEach((row) => {
      const region = parseRouteLocationCode(row.routeLocationCode)?.regionCode || "NONE";
      const bucket = totalsByRegion[region] || totalsByRegion.NONE;
      bucket.due += rowDueForKind(row, kindTab);
      bucket.credit += Number(row.creditBalance ?? splitAccountBalance(row.balance).creditBalance) || 0;
      bucket.count += 1;
    });
    return totalsByRegion;
  }, [filteredRows, kindTab]);

  const groupedRows = useMemo(() => {
    const groups = groupAccountRowsByRoute(filteredRows);
    return groups.map((group) => {
      let totalDue = 0;
      let totalCredit = 0;
      let withDebt = 0;
      group.rows.forEach((row) => {
        const due = rowDueForKind(row, kindTab);
        const credit = Number(row.creditBalance ?? splitAccountBalance(row.balance).creditBalance) || 0;
        totalDue += due;
        totalCredit += credit;
        if (due > 0) withDebt += 1;
      });
      return { ...group, totalDue, totalCredit, withDebt };
    });
  }, [filteredRows, kindTab]);

  useEffect(() => {
    const initial = {};
    groupedRows.forEach((g) => {
      initial[`${g.regionCode}-${g.routeNumber ?? "none"}`] = true;
    });
    setOpenGroups(initial);
  }, [groupedRows]);

  const toggleGroup = (key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCreateCharge = (row) => {
    setChargeModalRow(row);
    setChargeModalOpen(true);
  };

  const handleChargeSaved = () => {
    setChargeModalOpen(false);
    setChargeModalRow(null);
    loadDocumentSearch();
    load();
  };

  const handlePrintReport = async () => {
    const printWindow = openBlankPrintWindow();
    if (!printWindow) {
      showError("No se pudo abrir la ventana de impresión. Verifique el bloqueador de ventanas.");
      return;
    }
    setPrinting(true);
    try {
      const report = await getCustomerAccountPrintReport({
        search: search.trim(),
        luisFelipeOnly: true,
        positiveBalanceOnly,
        from: reportFrom || undefined,
        to: reportTo || undefined,
        regionCode: filterRegion || undefined,
        routeNumber: filterRoute ? Number(filterRoute) : undefined,
        routeLocationCode: filterLocation || undefined,
      });
      const filters = [
        positiveBalanceOnly ? "Solo clientes con saldo pendiente" : null,
        search.trim() ? `Búsqueda: ${search.trim()}` : null,
        filterRegion ? `Región: ${getRegionLabel(filterRegion)}` : null,
        filterRoute ? `Ruta: ${filterRoute}` : null,
        filterLocation ? `Ubicación: ${filterLocation}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const html = buildCustomerAccountReportPrintHtml(report, filters);
      writeHtmlToPrintWindow(printWindow, html);
    } catch (err) {
      try {
        printWindow.close();
      } catch (_e) {
        /* ignore */
      }
      showError(err.message || "No se pudo generar el reporte");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="7">
                  <CardTitle tag="h4">Cuentas por cobrar — Luis Felipe</CardTitle>
                  <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
                    Cartera OPV u OPC en pestañas separadas, agrupada por región y ruta (R0101…).
                  </p>
                </Col>
                <Col md="5" className="text-right">
                  <Button
                    color="info"
                    size="sm"
                    className="btn-round mr-1"
                    onClick={handlePrintReport}
                    disabled={loading || printing}
                  >
                    <i className="nc-icon nc-paper" /> {printing ? "Generando..." : "Imprimir reporte"}
                  </Button>
                  <Button color="secondary" size="sm" className="btn-round" onClick={load} disabled={loading}>
                    <i className="nc-icon nc-refresh-69" /> Actualizar
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <Row className="mb-3">
                <Col md="4">
                  <FormGroup className="mb-md-0">
                    <Label>Buscar</Label>
                    <Input
                      placeholder="Cliente, clave, NIT, Nº envío, código OP, factura..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <small className="text-muted">
                      {allOrderTypes
                        ? "Busca cualquier OP con cliente asignado (todos los tipos)"
                        : "Busca en clientes y documentos OPV/OPC (envíos, órdenes, facturas)"}
                    </small>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Estado de cobro</Label>
                    <Input
                      type="select"
                      value={chargeStatusFilter}
                      onChange={(e) => setChargeStatusFilter(e.target.value)}
                    >
                      <option value="">Todos</option>
                      <option value="NONE">Sin cargo</option>
                      <option value="CHARGED">Cargado (sin abono)</option>
                      <option value="PARTIAL">Abono parcial</option>
                      <option value="PAID">Pagado</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Región</Label>
                    <Input
                      type="select"
                      value={filterRegion}
                      onChange={(e) => {
                        setFilterRegion(e.target.value);
                        setFilterRoute("");
                        setFilterLocation("");
                      }}
                    >
                      <option value="">Todas</option>
                      {regions.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.code}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Ruta</Label>
                    <Input
                      type="select"
                      value={filterRoute}
                      onChange={(e) => {
                        setFilterRoute(e.target.value);
                        setFilterLocation("");
                      }}
                      disabled={!filterRegion}
                    >
                      <option value="">Todas</option>
                      {filterRoutes.map((r) => (
                        <option key={r.routeNumber} value={r.routeNumber}>
                          Ruta {r.routeNumber}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Ubicación</Label>
                    <Input
                      type="select"
                      value={filterLocation}
                      onChange={(e) => setFilterLocation(e.target.value)}
                      disabled={!filterRoute}
                    >
                      <option value="">Todas</option>
                      {filterLocations.map((loc) => (
                        <option key={loc.code} value={loc.code}>
                          {loc.code}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Ver documentos</Label>
                    <Input
                      type="select"
                      value={documentViewFilter}
                      onChange={(e) => setDocumentViewFilter(e.target.value)}
                    >
                      <option value="all">Todos (OPV/OPC activa)</option>
                      <option value="withCharge">Solo con cargo</option>
                      <option value="withShipment">Solo con envío físico</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <FormGroup check className="mb-md-0">
                    <Label check>
                      <Input
                        type="checkbox"
                        checked={allOrderTypes}
                        onChange={(e) => setAllOrderTypes(e.target.checked)}
                      />
                      <span className="form-check-sign" />
                      Todas las OP (cualquier tipo)
                    </Label>
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <FormGroup check className="mb-md-0">
                    <Label check>
                      <Input
                        type="checkbox"
                        checked={positiveBalanceOnly}
                        onChange={(e) => setPositiveBalanceOnly(e.target.checked)}
                      />
                      <span className="form-check-sign" />
                      Solo saldo pendiente
                    </Label>
                  </FormGroup>
                </Col>
              </Row>

              {!allOrderTypes && (
                <PortfolioKindSelector
                  kindTab={kindTab}
                  onSelect={setKindTab}
                  totalsByKind={portfolioTotalsByKind}
                  clientCount={rows.length}
                />
              )}

              <Card className="mb-3 border-info">
                <CardHeader className="py-2 bg-light">
                  <strong className="text-info">
                    {allOrderTypes
                      ? "Órdenes de producción — todos los tipos"
                      : `Envíos y documentos — cartera ${kindTab}`}
                  </strong>
                  <span className="text-muted small ml-2">
                    {documentLoading
                      ? "Cargando..."
                      : `${documentRows.length} resultado(s)`}
                  </span>
                </CardHeader>
                <CardBody className="p-0">
                  {documentLoading ? (
                    <div className="text-center py-3">Cargando documentos...</div>
                  ) : documentRows.length === 0 ? (
                    <Alert color="info" className="m-3 mb-0">
                      {allOrderTypes
                        ? "No hay órdenes con los filtros actuales. Escriba el código de la OP o quite filtros."
                        : `No hay envíos ni documentos para ${kindTab} con los filtros actuales. Pruebe quitar filtros, activar "Todas las OP" o cambiar cartera (OPV / OPC).`}
                    </Alert>
                  ) : (
                    <div className="table-responsive">
                      <Table hover size="sm" className="mb-0">
                        <thead className="text-primary">
                          <tr>
                            <th>Cliente</th>
                            <th>Ruta</th>
                            <th>Orden</th>
                            <th>Nº envío</th>
                            <th>Estado cobro</th>
                            <th className="text-right">Monto est./cargo</th>
                            <th className="text-right">Saldo</th>
                            <th className="text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {documentRows.map((row) => (
                            <DocumentSearchRow
                              key={`${row.chargeEntryId || "n"}-${row.productionOrderId}-${row.productShipmentId || "order"}-${row.partialReleaseId || "x"}`}
                              row={row}
                              onCreateCharge={handleCreateCharge}
                            />
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </CardBody>
              </Card>

              <Row className="mb-3">
                <Col md="3">
                  <FormGroup className="mb-md-0">
                    <Label>Movimientos desde (impresión)</Label>
                    <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup className="mb-md-0">
                    <Label>Movimientos hasta (impresión)</Label>
                    <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
                  </FormGroup>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="3">
                  <div
                    className="border rounded p-3 text-center"
                    style={{
                      borderColor: kindTab === "OPV" ? "#3498db" : "#dee2e6",
                      borderWidth: kindTab === "OPV" ? 2 : 1,
                      background: kindTab === "OPV" ? "#ebf5fb" : "#fff",
                    }}
                  >
                    <div className="text-muted small">
                      Total OPV{" "}
                      {kindTab === "OPV" && (
                        <Badge pill color="primary" className="ml-1">
                          activa
                        </Badge>
                      )}
                    </div>
                    <strong style={{ color: "#3498db" }}>
                      {formatAccountMoney(portfolioTotalsByKind.OPV)}
                    </strong>
                  </div>
                </Col>
                <Col md="3">
                  <div
                    className="border rounded p-3 text-center"
                    style={{
                      borderColor: kindTab === "OPC" ? "#2c3e50" : "#dee2e6",
                      borderWidth: kindTab === "OPC" ? 2 : 1,
                      background: kindTab === "OPC" ? "#ecf0f1" : "#fff",
                    }}
                  >
                    <div className="text-muted small">
                      Total OPC{" "}
                      {kindTab === "OPC" && (
                        <Badge pill color="dark" className="ml-1">
                          activa
                        </Badge>
                      )}
                    </div>
                    <strong style={{ color: "#2c3e50" }}>
                      {formatAccountMoney(portfolioTotalsByKind.OPC)}
                    </strong>
                  </div>
                </Col>
                <Col md="3">
                  <div className="border rounded p-3 text-center">
                    <div className="text-muted small">Total crédito a favor</div>
                    <strong style={{ color: "#148f77" }}>{formatAccountMoney(totals.totalCredit)}</strong>
                  </div>
                </Col>
                <Col md="2">
                  <div className="border rounded p-3 text-center">
                    <div className="text-muted small">Con deuda ({kindTab})</div>
                    <strong>{totals.withDebt}</strong>
                  </div>
                </Col>
                <Col md="1">
                  <div className="border rounded p-3 text-center">
                    <div className="text-muted small">Clientes</div>
                    <strong>{totals.count}</strong>
                  </div>
                </Col>
              </Row>

              <Row className="mb-3">
                {["CA", "CB", "CC"].map((code) => (
                  <Col md="4" key={code}>
                    <div className="border rounded p-2 text-center bg-light">
                      <div className="small text-muted">{getRegionLabel(code)}</div>
                      <div>
                        Por cobrar ({kindTab}):{" "}
                        <strong style={{ color: "#e67e22" }}>
                          {formatAccountMoney(regionTotals[code]?.due || 0)}
                        </strong>
                      </div>
                      <div className="small">
                        {regionTotals[code]?.count || 0} cliente(s) · Crédito:{" "}
                        {formatAccountMoney(regionTotals[code]?.credit || 0)}
                      </div>
                    </div>
                  </Col>
                ))}
              </Row>

              {loading ? (
                <div className="text-center py-4">Cargando...</div>
              ) : filteredRows.length === 0 ? (
                <Alert color="info">No hay clientes que coincidan con los filtros.</Alert>
              ) : (
                groupedRows.map((group) => {
                  const groupKey = `${group.regionCode}-${group.routeNumber ?? "none"}`;
                  const isOpen = openGroups[groupKey] !== false;
                  const routeTitle =
                    group.regionCode === "NONE"
                      ? "Sin ruta asignada"
                      : `${getRegionLabel(group.regionCode)} · Ruta ${group.routeNumber ?? "—"}`;
                  return (
                    <Card key={groupKey} className="mb-2 border">
                      <CardHeader
                        className="py-2 cursor-pointer"
                        onClick={() => toggleGroup(groupKey)}
                        style={{ cursor: "pointer" }}
                      >
                        <Row className="align-items-center">
                          <Col>
                            <strong>{routeTitle}</strong>
                            <span className="text-muted small ml-2">
                              {group.rows.length} cliente(s) · {kindTab}:{" "}
                              {formatAccountMoney(group.totalDue)} · Crédito:{" "}
                              {formatAccountMoney(group.totalCredit)}
                            </span>
                          </Col>
                          <Col xs="auto">
                            <small>{isOpen ? "▾" : "▸"}</small>
                          </Col>
                        </Row>
                      </CardHeader>
                      <Collapse isOpen={isOpen}>
                        <CardBody className="p-0">
                          <Table responsive hover className="mb-0">
                            <thead className="text-primary">
                              <tr>
                                <th>Clave</th>
                                <th>Cliente</th>
                                <th>Código ruta</th>
                                <th>Ubicación</th>
                                <th>NIT</th>
                                <th>Teléfono</th>
                                <th className="text-right">Saldo por cobrar ({kindTab})</th>
                                <th className="text-right">Crédito a favor</th>
                                <th>Último cargo</th>
                                <th>Último pago</th>
                                <th>Órdenes LF</th>
                                <th className="text-right">Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => (
                                <CustomerRow key={row.customerId} row={row} kindTab={kindTab} />
                              ))}
                            </tbody>
                          </Table>
                        </CardBody>
                      </Collapse>
                    </Card>
                  );
                })
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <CustomerAccountEntryModal
        isOpen={chargeModalOpen}
        toggle={() => {
          setChargeModalOpen(false);
          setChargeModalRow(null);
        }}
        customerId={chargeModalRow?.customerId}
        customerInfo={{
          name: chargeModalRow?.customerName,
          legacyCode: chargeModalRow?.legacyCode,
          nit: chargeModalRow?.nit,
          routeLocationCode: chargeModalRow?.routeLocationCode,
        }}
        defaultConceptCode="1"
        initialDoc={chargeModalRow ? {
          productionOrderId: chargeModalRow.productionOrderId,
          partialReleaseId: chargeModalRow.partialReleaseId,
          productShipmentId: chargeModalRow.productShipmentId,
          vendorShipmentNumber: chargeModalRow.vendorShipmentNumber,
          estimatedTotal: chargeModalRow.estimatedTotal,
          orderCode: chargeModalRow.orderCode,
          orderKind: chargeModalRow.orderKind,
        } : null}
        onSaved={handleChargeSaved}
      />
    </div>
  );
}

export default CustomerAccountsList;
