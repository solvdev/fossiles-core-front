import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
  Table,
} from "reactstrap";
import classnames from "classnames";
import Select from "react-select";
import { useAuth } from "contexts/AuthContext";
import {
  getGeneralKioskDisbursements,
  getGeneralKioskReport,
  getGeneralKioskSalesDetail,
} from "services/kioskPosService";
import { getLocations } from "services/locationService";
import {
  formatDateGt,
  formatDateTimeGt,
  getMonthStartYmdGuatemala,
  getTodayYmdGuatemala,
  getWeekStartYmdGuatemala,
  getYesterdayYmdGuatemala,
} from "utils/dateTimeHelper";
import {
  exportKioskDisbursementsToExcel,
  exportKioskDisbursementsToPdf,
} from "utils/kioskDisbursementReportExport";
import {
  buildKioskReportSummary,
  exportKioskSalesToExcel,
  exportKioskSalesToPdf,
  formatSaleItemsSummary,
} from "utils/kioskPosReportExport";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import { formatCurrency, formatQty, getSaleInternalNumber } from "views/kiosks/pos/posUtils";
import SalesReportsCashClosuresPanel from "./SalesReportsCashClosuresPanel";

const REPORT_TYPES = {
  GENERAL: "GENERAL",
  CASH: "CASH",
  CARD: "CARD",
  DISBURSEMENTS: "DISBURSEMENTS",
};

const REPORT_TYPE_OPTIONS = [
  {
    value: REPORT_TYPES.GENERAL,
    label: "Ventas general (todos los pagos)",
    hint: "Incluye efectivo, tarjeta y mixto.",
  },
  {
    value: REPORT_TYPES.CASH,
    label: "Ventas por efectivo",
    hint: "Solo ventas pagadas 100% en efectivo.",
  },
  {
    value: REPORT_TYPES.CARD,
    label: "Ventas por tarjeta",
    hint: "Solo ventas pagadas 100% con tarjeta.",
  },
  {
    value: REPORT_TYPES.DISBURSEMENTS,
    label: "Desembolsos (caja chica)",
    hint: "Gastos registrados por el encargado del kiosko desde la caja.",
  },
];

const TABS = {
  SALES: "SALES",
  CASH_CLOSURES: "CASH_CLOSURES",
};

const ALL_KIOSKS_OPTION = { value: "", label: "Todos los kioskos" };

const isKioskLocation = (location) => {
  const categoria = String(location?.categoria || "").toUpperCase();
  const name = String(location?.name || "").toUpperCase();
  const code = String(location?.code || "").toUpperCase();
  return categoria.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
};

function resolveUserFullName(user) {
  if (!user) return "";
  const composed = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return composed || user.fullName || user.name || user.username || "";
}

function reportTypeLabel(type) {
  return REPORT_TYPE_OPTIONS.find((opt) => opt.value === type)?.label || "Reporte";
}

const formatPeriodLabel = (startDate, endDate) => {
  const from = startDate || "";
  const to = endDate || from;
  if (!from) return "Selecciona fechas";
  if (from === to) return `Día ${formatDateGt(from)}`;
  return `${formatDateGt(from)} — ${formatDateGt(to)}`;
};

function SalesReports() {
  const { user } = useAuth();
  const today = getTodayYmdGuatemala();
  const [activeTab, setActiveTab] = useState(TABS.SALES);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [dateFilterMode, setDateFilterMode] = useState("single");
  const [selectedKioskId, setSelectedKioskId] = useState("");
  const [reportType, setReportType] = useState(REPORT_TYPES.GENERAL);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingReportType, setPendingReportType] = useState(REPORT_TYPES.GENERAL);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);
  const [salesDetail, setSalesDetail] = useState([]);
  const [disbursements, setDisbursements] = useState([]);
  const [exportMode, setExportMode] = useState("consolidated");
  const [kioskLocations, setKioskLocations] = useState([]);
  const [loadingKiosks, setLoadingKiosks] = useState(false);

  const generatedByName = useMemo(() => resolveUserFullName(user), [user]);
  const isDisbursements = reportType === REPORT_TYPES.DISBURSEMENTS;
  const paymentKindParam =
    reportType === REPORT_TYPES.CASH || reportType === REPORT_TYPES.CARD ? reportType : undefined;

  const periodLabel = formatPeriodLabel(startDate, endDate);

  const salesSummary = useMemo(() => buildKioskReportSummary(salesDetail), [salesDetail]);

  const disbursementsTotal = useMemo(
    () => (disbursements || []).reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [disbursements]
  );

  const kioskSelectOptions = useMemo(() => {
    const options = (kioskLocations || [])
      .map((loc) => ({
        value: String(loc.id),
        label: loc.code ? `${loc.name} (${loc.code})` : loc.name || `Kiosko ${loc.id}`,
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "es"));
    return [ALL_KIOSKS_OPTION, ...options];
  }, [kioskLocations]);

  const selectedKioskOption = useMemo(
    () =>
      kioskSelectOptions.find((opt) => String(opt.value) === String(selectedKioskId || "")) ||
      ALL_KIOSKS_OPTION,
    [kioskSelectOptions, selectedKioskId]
  );

  useEffect(() => {
    let cancelled = false;
    const loadKiosks = async () => {
      try {
        setLoadingKiosks(true);
        const locations = await getLocations();
        if (cancelled) return;
        const kiosks = (locations || []).filter(isKioskLocation);
        setKioskLocations(kiosks);
      } catch (err) {
        if (!cancelled) {
          setKioskLocations([]);
          showError(err.message || "No se pudieron cargar los kioskos.");
        }
      } finally {
        if (!cancelled) setLoadingKiosks(false);
      }
    };
    loadKiosks();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyQuickRange = (from, to, mode = "range") => {
    setDateFilterMode(mode);
    setStartDate(from);
    setEndDate(to);
  };

  const handleStartDateChange = (value) => {
    setStartDate(value);
    if (dateFilterMode === "single") {
      setEndDate(value);
    }
  };

  const handleDateFilterModeChange = (mode) => {
    setDateFilterMode(mode);
    if (mode === "single" && startDate) {
      setEndDate(startDate);
    }
  };

  const openTypeModal = () => {
    setPendingReportType(reportType);
    setModalOpen(true);
  };

  const confirmReportType = () => {
    setReportType(pendingReportType);
    setError("");
    setModalOpen(false);
  };

  const generateSalesReport = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const from = startDate || today;
      const to = (dateFilterMode === "single" ? from : endDate) || from;
      setStartDate(from);
      setEndDate(to);

      if (reportType === REPORT_TYPES.DISBURSEMENTS) {
        const rows = await getGeneralKioskDisbursements(
          from,
          to,
          selectedKioskId ? Number(selectedKioskId) : undefined
        );
        const list = Array.isArray(rows) ? rows : [];
        setDisbursements(list);
        setSalesDetail([]);
        setReport(null);
        return;
      }

      const paymentKind =
        reportType === REPORT_TYPES.CASH || reportType === REPORT_TYPES.CARD
          ? reportType
          : undefined;

      const [summary, sales] = await Promise.all([
        getGeneralKioskReport(from, to, paymentKind),
        getGeneralKioskSalesDetail(
          from,
          to,
          selectedKioskId ? Number(selectedKioskId) : undefined,
          paymentKind
        ),
      ]);

      setReport(summary || null);
      const list = Array.isArray(sales) ? sales : [];
      setSalesDetail(list);
      setDisbursements([]);
    } catch (err) {
      setError(err.message || "No se pudo generar el reporte.");
      setSalesDetail([]);
      setDisbursements([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dateFilterMode, today, reportType, selectedKioskId]);

  useEffect(() => {
    if (activeTab !== TABS.SALES) return;
    generateSalesReport();
  }, [activeTab, startDate, endDate, dateFilterMode, selectedKioskId, reportType, generateSalesReport]);

  const loadSalesForExport = async () => {
    const from = startDate || today;
    const to = (dateFilterMode === "single" ? from : endDate) || from;
    if (!from) {
      showWarning("Selecciona el día (o rango) a exportar.");
      return null;
    }
    const sales = await getGeneralKioskSalesDetail(
      from,
      to,
      selectedKioskId ? Number(selectedKioskId) : undefined,
      paymentKindParam
    );
    const list = Array.isArray(sales) ? sales : [];
    if (!list.length) {
      showWarning("No hay ventas para exportar en el período seleccionado.");
      return null;
    }
    return { sales: list, from, to };
  };

  const loadDisbursementsForExport = async () => {
    const from = startDate || today;
    const to = (dateFilterMode === "single" ? from : endDate) || from;
    if (!from) {
      showWarning("Selecciona el día (o rango) a exportar.");
      return null;
    }
    const rows = await getGeneralKioskDisbursements(
      from,
      to,
      selectedKioskId ? Number(selectedKioskId) : undefined
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      showWarning("No hay desembolsos para exportar en el período seleccionado.");
      return null;
    }
    return { rows: list, from, to };
  };

  const resolveExportKioskName = (salesOrRows) => {
    if (selectedKioskId) {
      const match = kioskLocations.find((k) => String(k.id) === String(selectedKioskId));
      if (match?.name) return match.name;
      if (selectedKioskOption?.label && selectedKioskOption.value) {
        return selectedKioskOption.label;
      }
    }
    const names = [...new Set((salesOrRows || []).map((s) => s.kioskName).filter(Boolean))];
    if (names.length === 1) return names[0];
    if (names.length > 1) return "TODOS LOS KIOSKOS";
    return "KIOSKOS";
  };

  const resolveExportMode = (from, to) => {
    if (from && to && from !== to) return exportMode;
    return "single";
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      if (isDisbursements) {
        const payload = await loadDisbursementsForExport();
        if (!payload) return;
        exportKioskDisbursementsToExcel({
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          kioskName: resolveExportKioskName(payload.rows),
          generatedByName,
        });
        showSuccess("Excel de desembolsos descargado correctamente.");
        return;
      }

      const payload = await loadSalesForExport();
      if (!payload) return;
      const mode = resolveExportMode(payload.from, payload.to);
      exportKioskSalesToExcel({
        sales: payload.sales,
        startDate: payload.from,
        endDate: payload.to,
        kioskName: resolveExportKioskName(payload.sales),
        kioskCode: selectedKioskId ? `K${selectedKioskId}` : "ALL",
        generatedByName,
        mode,
      });
      showSuccess(
        mode === "byDay"
          ? "Excel por día descargado (una hoja por fecha)."
          : "Excel descargado correctamente."
      );
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      if (isDisbursements) {
        const payload = await loadDisbursementsForExport();
        if (!payload) return;
        const opened = exportKioskDisbursementsToPdf({
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          kioskName: resolveExportKioskName(payload.rows),
          generatedByName,
        });
        if (opened === false) {
          showWarning("Permite ventanas emergentes para imprimir o guardar el PDF.");
          return;
        }
        showSuccess("PDF de desembolsos listo para imprimir o guardar.");
        return;
      }

      const payload = await loadSalesForExport();
      if (!payload) return;
      const mode = resolveExportMode(payload.from, payload.to);
      const opened = exportKioskSalesToPdf({
        sales: payload.sales,
        startDate: payload.from,
        endDate: payload.to,
        kioskName: resolveExportKioskName(payload.sales),
        generatedByName,
        mode,
      });
      if (opened === false) {
        showWarning("Permite ventanas emergentes para imprimir o guardar el PDF.");
        return;
      }
      showSuccess("PDF listo para imprimir o guardar.");
    } catch (err) {
      showError(err.message || "No se pudo generar el PDF.");
    } finally {
      setExporting(false);
    }
  };

  const effectiveEnd = dateFilterMode === "single" ? startDate : endDate;

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex flex-wrap align-items-center justify-content-between">
                <div>
                  <CardTitle tag="h4" className="mb-1">
                    Reportes de Ventas
                  </CardTitle>
                  <small className="text-muted">
                    {activeTab === TABS.SALES
                      ? reportTypeLabel(reportType)
                      : "Cierres de caja diarios"}
                  </small>
                </div>
                {activeTab === TABS.SALES && (
                  <div className="mt-2 mt-md-0 d-flex flex-wrap align-items-center">
                    <Button
                      color="secondary"
                      size="sm"
                      className="btn-round mr-2"
                      onClick={openTypeModal}
                      disabled={loading || exporting}
                    >
                      Tipo de reporte
                    </Button>
                    {!isDisbursements && startDate && effectiveEnd && startDate !== effectiveEnd && (
                      <Input
                        type="select"
                        bsSize="sm"
                        className="mr-2 mb-0"
                        style={{ width: "auto", minWidth: 200 }}
                        value={exportMode}
                        onChange={(e) => setExportMode(e.target.value)}
                        disabled={loading || exporting}
                      >
                        <option value="consolidated">
                          Consolidado (FECHA al inicio de cada día)
                        </option>
                        <option value="byDay">Separado por día (una hoja c/u)</option>
                      </Input>
                    )}
                    <Button
                      color="success"
                      size="sm"
                      className="btn-round mr-2"
                      onClick={handleExportExcel}
                      disabled={loading || exporting}
                    >
                      Excel
                    </Button>
                    <Button
                      color="info"
                      size="sm"
                      className="btn-round"
                      onClick={handleExportPdf}
                      disabled={loading || exporting}
                    >
                      PDF / Imprimir
                    </Button>
                  </div>
                )}
              </div>

              <Nav tabs className="mt-3 mb-0">
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === TABS.SALES })}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab(TABS.SALES);
                    }}
                  >
                    Ventas diarias
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === TABS.CASH_CLOSURES })}
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab(TABS.CASH_CLOSURES);
                    }}
                  >
                    Cierres de caja
                  </NavLink>
                </NavItem>
              </Nav>
            </CardHeader>

            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <Alert color="light" className="border">
                {activeTab === TABS.CASH_CLOSURES ? (
                  <>
                    Consulta y descarga los <strong>cierres de caja diarios</strong> de todos los
                    kioskos (mismo detalle que en el POS). Usa Ver / PDF / Excel por cada turno.
                  </>
                ) : isDisbursements ? (
                  <>
                    Reporte de <strong>desembolsos</strong> de caja chica. Filtra por día o rango
                    como en el POS del kiosko.
                  </>
                ) : (
                  <>
                    Mismo formato de <strong>REPORTE DE VENTAS</strong> del POS (factura interna, X
                    en Efectivo/POS). Elige un día o rango, genera y descarga Excel/PDF. Usa{" "}
                    <strong>Tipo de reporte</strong> para filtrar pagos o ver desembolsos.
                  </>
                )}
              </Alert>

              <Row className="mb-2 align-items-end">
                <Col md="2">
                  <Label>Tipo de filtro</Label>
                  <Input
                    type="select"
                    value={dateFilterMode}
                    onChange={(e) => handleDateFilterModeChange(e.target.value)}
                  >
                    <option value="single">Día exacto</option>
                    <option value="range">Rango de fechas</option>
                  </Input>
                </Col>
                <Col md="3">
                  <Label>{dateFilterMode === "single" ? "Día" : "Desde"}</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                  />
                </Col>
                {dateFilterMode === "range" && (
                  <Col md="3">
                    <Label>Hasta</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </Col>
                )}
                <Col md="3">
                  <Label>Kiosko</Label>
                  <Select
                    className="react-select"
                    classNamePrefix="react-select"
                    placeholder={loadingKiosks ? "Cargando kioskos..." : "Buscar kiosko..."}
                    isClearable
                    isSearchable
                    isLoading={loadingKiosks}
                    options={kioskSelectOptions}
                    value={selectedKioskOption}
                    onChange={(selected) => setSelectedKioskId(selected?.value || "")}
                    noOptionsMessage={() => "No hay kioskos"}
                  />
                </Col>
                {activeTab === TABS.SALES && (
                  <Col md="2" className="d-flex align-items-end">
                    <Button
                      color="primary"
                      className="btn-round"
                      onClick={generateSalesReport}
                      disabled={loading}
                    >
                      <i className="nc-icon nc-zoom-split" />{" "}
                      {loading ? "Cargando..." : "Aplicar filtro"}
                    </Button>
                  </Col>
                )}
              </Row>

              <div className="d-flex flex-wrap mb-3">
                <Button
                  color="default"
                  size="sm"
                  className="mr-1 mb-1"
                  onClick={() => {
                    const d = getTodayYmdGuatemala();
                    applyQuickRange(d, d, "single");
                  }}
                >
                  Hoy
                </Button>
                <Button
                  color="default"
                  size="sm"
                  className="mr-1 mb-1"
                  onClick={() => {
                    const d = getYesterdayYmdGuatemala();
                    applyQuickRange(d, d, "single");
                  }}
                >
                  Ayer
                </Button>
                <Button
                  color="default"
                  size="sm"
                  className="mr-1 mb-1"
                  onClick={() => {
                    const d = getTodayYmdGuatemala();
                    applyQuickRange(getWeekStartYmdGuatemala(), d, "range");
                  }}
                >
                  Esta semana
                </Button>
                <Button
                  color="default"
                  size="sm"
                  className="mb-1"
                  onClick={() => {
                    const d = getTodayYmdGuatemala();
                    applyQuickRange(getMonthStartYmdGuatemala(), d, "range");
                  }}
                >
                  Este mes
                </Button>
              </div>

              <p className="text-muted small mb-3">
                Período activo: <strong>{periodLabel}</strong>
                {activeTab === TABS.SALES && !isDisbursements && (
                  <>
                    {" · "}
                    {salesDetail.length} venta(s) en pantalla
                    {startDate && effectiveEnd && startDate !== effectiveEnd
                      ? ` · exportar: ${
                          exportMode === "byDay" ? "una hoja por día" : "consolidado"
                        }`
                      : ""}
                  </>
                )}
              </p>

              {activeTab === TABS.CASH_CLOSURES && (
                <SalesReportsCashClosuresPanel
                  startDate={startDate}
                  endDate={effectiveEnd}
                  kioskLocationId={selectedKioskId}
                />
              )}

              {activeTab === TABS.SALES && loading && (
                <div className="text-center py-4">
                  <Spinner color="primary" />
                </div>
              )}

              {activeTab === TABS.SALES && !loading && !isDisbursements && (
                <>
                  <Row className="mb-3">
                    <Col md="3">
                      <Card body>
                        <strong>Ventas:</strong> {salesSummary.salesCount}
                      </Card>
                    </Col>
                    <Col md="3">
                      <Card body>
                        <strong>Unidades:</strong> {formatQty(salesSummary.totalItems)}
                      </Card>
                    </Col>
                    <Col md="3">
                      <Card body>
                        <strong>Monto:</strong> {formatCurrency(salesSummary.totalAmount)}
                      </Card>
                    </Col>
                    <Col md="3">
                      <Card body>
                        <strong>Ticket prom.:</strong>{" "}
                        {formatCurrency(salesSummary.averageTicket)}
                      </Card>
                    </Col>
                  </Row>

                  {(report?.kiosks || []).length > 1 && !selectedKioskId && (
                    <Table responsive size="sm" className="mb-3">
                      <thead className="text-primary">
                        <tr>
                          <th>Kiosko</th>
                          <th>Ventas</th>
                          <th>Unidades</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(report?.kiosks || []).map((row) => (
                          <tr key={`report-kiosk-${row.kioskId}`}>
                            <td>{row.kioskName}</td>
                            <td>{row.salesCount}</td>
                            <td>{formatQty(row.totalItems)}</td>
                            <td>{formatCurrency(row.totalAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}

                  <h6 className="mb-2">Detalle de ventas (como en el kiosko)</h6>
                  <Table responsive>
                    <thead className="text-primary">
                      <tr>
                        <th>Fecha</th>
                        <th>Kiosko</th>
                        <th>No. Venta</th>
                        <th>No. interno</th>
                        <th>Cliente</th>
                        <th>Productos</th>
                        <th>Vendedor</th>
                        <th>Pago</th>
                        <th>Items</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesDetail.map((sale) => (
                        <tr key={`sale-${sale.id}`}>
                          <td>{formatDateTimeGt(sale.soldAt || sale.saleDate)}</td>
                          <td>{sale.kioskName || "—"}</td>
                          <td>{sale.saleNumber || "—"}</td>
                          <td>{getSaleInternalNumber(sale) || "—"}</td>
                          <td>{sale.customerName || sale.customerTaxId || "—"}</td>
                          <td className="small">{formatSaleItemsSummary(sale) || "—"}</td>
                          <td>{sale.soldByName || sale.soldByUsername || "—"}</td>
                          <td>{sale.paymentMethod || "—"}</td>
                          <td>{formatQty(sale.totalItems)}</td>
                          <td>{formatCurrency(sale.totalAmount)}</td>
                        </tr>
                      ))}
                      {salesDetail.length === 0 && (
                        <tr>
                          <td colSpan="10" className="text-center text-muted">
                            No hay ventas en el período / filtro seleccionado
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </>
              )}

              {activeTab === TABS.SALES && !loading && isDisbursements && (
                <>
                  <Row className="mb-3">
                    <Col md="4">
                      <Card body>
                        <strong>Total desembolsos:</strong> {disbursements.length}
                      </Card>
                    </Col>
                    <Col md="4">
                      <Card body>
                        <strong>Monto total:</strong> {formatCurrency(disbursementsTotal)}
                      </Card>
                    </Col>
                  </Row>
                  <Table responsive>
                    <thead className="text-primary">
                      <tr>
                        <th>Fecha</th>
                        <th>Kiosko</th>
                        <th>Descripción</th>
                        <th>Monto</th>
                        <th>Registrado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {disbursements.map((row) => (
                        <tr key={`disbursement-${row.id}`}>
                          <td>{formatDateTimeGt(row.createdAt)}</td>
                          <td>{row.kioskName}</td>
                          <td>{row.description}</td>
                          <td>{formatCurrency(row.amount)}</td>
                          <td>{row.createdByName || "—"}</td>
                        </tr>
                      ))}
                      {disbursements.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center text-muted">
                            No hay desembolsos en el período seleccionado
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Modal isOpen={modalOpen} toggle={() => setModalOpen(false)}>
        <ModalHeader toggle={() => setModalOpen(false)}>Elegir tipo de reporte</ModalHeader>
        <ModalBody>
          {REPORT_TYPE_OPTIONS.map((opt) => (
            <FormGroup check className="mb-3" key={opt.value}>
              <Label check>
                <Input
                  type="radio"
                  name="reportType"
                  value={opt.value}
                  checked={pendingReportType === opt.value}
                  onChange={() => setPendingReportType(opt.value)}
                />{" "}
                <strong>{opt.label}</strong>
                <div className="text-muted small">{opt.hint}</div>
              </Label>
            </FormGroup>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setModalOpen(false)}>
            Cancelar
          </Button>
          <Button color="primary" onClick={confirmReportType}>
            Usar este tipo
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default SalesReports;
