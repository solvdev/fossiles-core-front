import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Label, Row, Spinner, Table } from "reactstrap";
import KioskMainSheetReportPreview from "components/kiosks/KioskMainSheetReportPreview";
import "../KioskSales.css";
import { getGeneralKioskBankDeposits, getGeneralKioskDisbursements, getGeneralKioskVouchers, getKioskMainSheetReport, getKioskSaleById } from "services/kioskPosService";
import { getKioscoConteoHistorial } from "services/kioscoInventoryService";
import {
  formatDateGt,
  formatDateTimeGt,
  getMonthStartYmdGuatemala,
  getTodayYmdGuatemala,
  getWeekStartYmdGuatemala,
  getYesterdayYmdGuatemala,
} from "utils/dateTimeHelper";
import {
  buildKioskReportSummary,
  exportKioskSalesToExcel,
  exportKioskSalesToPdf,
  formatSaleItemsSummary,
} from "utils/kioskPosReportExport";
import {
  exportKioskDisbursementsToExcel,
  exportKioskDisbursementsToPdf,
  formatDisbursementDateTime,
} from "utils/kioskDisbursementReportExport";
import {
  exportKioskBankDepositsToExcel,
  exportKioskBankDepositsToPdf,
  formatBankDepositDateTime,
} from "utils/kioskBankDepositReportExport";
import {
  exportKioskVouchersToExcel,
  exportKioskVouchersToPdf,
  formatVoucherDateTime,
} from "utils/kioskVoucherReportExport";
import {
  exportKioskMainSheetToExcel,
  exportKioskMainSheetToPdf,
  formatMainSheetCountLabel,
} from "utils/kioskMainSheetReportExport";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import PosSaleDetailModal from "./PosSaleDetailModal";
import PosVoidSaleModal from "./PosVoidSaleModal";
import { formatCurrency, formatQty, getSaleInternalNumber, isSalePendingDeposit } from "./posUtils";

const REPORT_TYPES = {
  SALES: "SALES",
  DISBURSEMENTS: "DISBURSEMENTS",
  BANK_DEPOSITS: "BANK_DEPOSITS",
  VOUCHERS: "VOUCHERS",
  MAIN_SHEET: "MAIN_SHEET",
};

const sortDisbursementRows = (rows) =>
  [...(rows || [])].sort((a, b) => {
    const ta = new Date(a?.createdAt || 0).getTime() || 0;
    const tb = new Date(b?.createdAt || 0).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });

const sortBankDepositRows = (rows) =>
  [...(rows || [])].sort((a, b) => {
    const ta = new Date(a?.recordedAt || 0).getTime() || 0;
    const tb = new Date(b?.recordedAt || 0).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });

const sortVoucherRows = (rows) =>
  [...(rows || [])].sort((a, b) => {
    const ta = new Date(a?.soldAt || 0).getTime() || 0;
    const tb = new Date(b?.soldAt || 0).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });

const reportTypeTitle = (type) => {
  if (type === REPORT_TYPES.DISBURSEMENTS) return "Reporte de desembolsos";
  if (type === REPORT_TYPES.BANK_DEPOSITS) return "Reporte de movimientos bancarios";
  if (type === REPORT_TYPES.VOUCHERS) return "Reporte de voucher";
  if (type === REPORT_TYPES.MAIN_SHEET) return "Hoja principal";
  return "Reportes de ventas";
};

const formatPeriodLabel = (startDate, endDate) => {
  const from = startDate || "";
  const to = endDate || from;
  if (!from) return "Selecciona fechas y aplica el filtro";
  if (from === to) return `Día ${formatDateGt(from)}`;
  return `${formatDateGt(from)} — ${formatDateGt(to)}`;
};

const canVoidSaleRow = (sale, cashSession) => {
  if (!cashSession || String(cashSession.status || "").toUpperCase() !== "OPEN" || !sale) return false;
  if (String(sale.status || "").toUpperCase() === "VOID") return false;
  if (String(sale.status || "").toUpperCase() !== "COMPLETED") return false;
  if (sale.cashSessionId != null && Number(sale.cashSessionId) !== Number(cashSession.id)) return false;
  return true;
};

function PosReportsTab({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApplyFilters,
  sales,
  kioskLocationId,
  kioskName,
  kioskCode,
  generatedByName,
  cashSession,
  onSaleUpdated,
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saleDetail, setSaleDetail] = useState(null);
  const [voidTargetSale, setVoidTargetSale] = useState(null);
  const [depositFilter, setDepositFilter] = useState("ALL");
  const [dateFilterMode, setDateFilterMode] = useState("single");
  const [exportMode, setExportMode] = useState("consolidated"); // consolidated | byDay
  const [reportType, setReportType] = useState(REPORT_TYPES.SALES);
  const [disbursements, setDisbursements] = useState([]);
  const [disbursementsLoading, setDisbursementsLoading] = useState(false);
  const [bankDepositReport, setBankDepositReport] = useState(null);
  const [bankDepositsLoading, setBankDepositsLoading] = useState(false);
  const [voucherReport, setVoucherReport] = useState(null);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [physicalCountSessions, setPhysicalCountSessions] = useState([]);
  const [physicalCountsLoading, setPhysicalCountsLoading] = useState(false);
  const [selectedPhysicalCountId, setSelectedPhysicalCountId] = useState("");
  const [mainSheetReport, setMainSheetReport] = useState(null);
  const [mainSheetLoading, setMainSheetLoading] = useState(false);

  const isSales = reportType === REPORT_TYPES.SALES;
  const isDisbursements = reportType === REPORT_TYPES.DISBURSEMENTS;
  const isBankDeposits = reportType === REPORT_TYPES.BANK_DEPOSITS;
  const isVouchers = reportType === REPORT_TYPES.VOUCHERS;
  const isMainSheet = reportType === REPORT_TYPES.MAIN_SHEET;

  const sortedDisbursements = useMemo(
    () => sortDisbursementRows(disbursements),
    [disbursements]
  );

  const disbursementsTotal = useMemo(
    () => sortedDisbursements.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [sortedDisbursements]
  );

  const bankDepositRows = useMemo(
    () => sortBankDepositRows(bankDepositReport?.rows),
    [bankDepositReport]
  );

  const bankDepositsTotal = useMemo(
    () => bankDepositRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [bankDepositRows]
  );

  const voucherRows = useMemo(
    () => sortVoucherRows(voucherReport?.rows),
    [voucherReport]
  );

  const vouchersTotal = useMemo(
    () => voucherRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [voucherRows]
  );

  const alternateReportLoading =
    (isDisbursements && disbursementsLoading)
    || (isBankDeposits && bankDepositsLoading)
    || (isVouchers && vouchersLoading)
    || (isMainSheet && (mainSheetLoading || physicalCountsLoading));

  const selectedPhysicalCountSession = useMemo(
    () => physicalCountSessions.find((item) => String(item.id) === String(selectedPhysicalCountId)) || null,
    [physicalCountSessions, selectedPhysicalCountId]
  );

  const filteredSales = (sales || []).filter((sale) => {
    if (depositFilter !== "PENDING") return true;
    return isSalePendingDeposit(sale);
  });

  const displaySummary = useMemo(
    () => buildKioskReportSummary(filteredSales),
    [filteredSales]
  );

  const periodLabel = formatPeriodLabel(startDate, endDate);

  const loadPhysicalCountSessions = useCallback(async () => {
    if (!kioskLocationId) {
      setPhysicalCountSessions([]);
      setSelectedPhysicalCountId("");
      return;
    }
    try {
      setPhysicalCountsLoading(true);
      const sessions = await getKioscoConteoHistorial(Number(kioskLocationId));
      const list = Array.isArray(sessions) ? sessions : [];
      setPhysicalCountSessions(list);
      if (list.length) {
        setSelectedPhysicalCountId(String(list[0].id));
      } else {
        setSelectedPhysicalCountId("");
        setMainSheetReport(null);
      }
    } catch (err) {
      setPhysicalCountSessions([]);
      setSelectedPhysicalCountId("");
      showError(err.message || "No se pudieron cargar los cortes de conteo físico.");
    } finally {
      setPhysicalCountsLoading(false);
    }
  }, [kioskLocationId]);

  useEffect(() => {
    if (isMainSheet) {
      loadPhysicalCountSessions();
    }
  }, [isMainSheet, loadPhysicalCountSessions]);

  const loadMainSheet = useCallback(async (countId = selectedPhysicalCountId) => {
    if (!countId) {
      setMainSheetReport(null);
      return;
    }
    try {
      setMainSheetLoading(true);
      const report = await getKioskMainSheetReport(Number(countId));
      setMainSheetReport(report || null);
    } catch (err) {
      setMainSheetReport(null);
      showError(err.message || "No se pudo cargar la hoja principal.");
    } finally {
      setMainSheetLoading(false);
    }
  }, [selectedPhysicalCountId]);

  const loadDisbursements = useCallback(
    async (from = startDate, to = endDate) => {
      const effectiveFrom = from || to;
      const effectiveTo = to || from;
      if (!effectiveFrom || !kioskLocationId) {
        setDisbursements([]);
        return;
      }
      try {
        setDisbursementsLoading(true);
        const rows = await getGeneralKioskDisbursements(
          effectiveFrom,
          effectiveTo,
          Number(kioskLocationId)
        );
        setDisbursements(Array.isArray(rows) ? rows : []);
      } catch (err) {
        setDisbursements([]);
        showError(err.message || "No se pudieron cargar los desembolsos.");
      } finally {
        setDisbursementsLoading(false);
      }
    },
    [startDate, endDate, kioskLocationId]
  );

  const loadBankDeposits = useCallback(
    async (from = startDate, to = endDate) => {
      const effectiveFrom = from || to;
      const effectiveTo = to || from;
      if (!effectiveFrom || !kioskLocationId) {
        setBankDepositReport(null);
        return;
      }
      try {
        setBankDepositsLoading(true);
        const report = await getGeneralKioskBankDeposits(
          effectiveFrom,
          effectiveTo,
          Number(kioskLocationId)
        );
        setBankDepositReport(report || null);
      } catch (err) {
        setBankDepositReport(null);
        showError(err.message || "No se pudieron cargar los depósitos bancarios.");
      } finally {
        setBankDepositsLoading(false);
      }
    },
    [startDate, endDate, kioskLocationId]
  );

  const loadVouchers = useCallback(
    async (from = startDate, to = endDate) => {
      const effectiveFrom = from || to;
      const effectiveTo = to || from;
      if (!effectiveFrom || !kioskLocationId) {
        setVoucherReport(null);
        return;
      }
      try {
        setVouchersLoading(true);
        const report = await getGeneralKioskVouchers(
          effectiveFrom,
          effectiveTo,
          Number(kioskLocationId)
        );
        setVoucherReport(report || null);
      } catch (err) {
        setVoucherReport(null);
        showError(err.message || "No se pudieron cargar los vouchers de tarjeta.");
      } finally {
        setVouchersLoading(false);
      }
    },
    [startDate, endDate, kioskLocationId]
  );

  const applyFilters = useCallback(
    async (from = startDate, to = endDate) => {
      if (isMainSheet) {
        await loadMainSheet();
        return;
      }
      if (isDisbursements) {
        await loadDisbursements(from, to);
        return;
      }
      if (isBankDeposits) {
        await loadBankDeposits(from, to);
        return;
      }
      if (isVouchers) {
        await loadVouchers(from, to);
        return;
      }
      if (onApplyFilters) {
        await onApplyFilters(from, to);
      }
    },
    [isMainSheet, isDisbursements, isBankDeposits, isVouchers, loadMainSheet, loadDisbursements, loadBankDeposits, loadVouchers, onApplyFilters, startDate, endDate]
  );

  const handleReportTypeChange = (value) => {
    setReportType(value);
    if (value === REPORT_TYPES.MAIN_SHEET) {
      loadPhysicalCountSessions();
      return;
    }
    if (value === REPORT_TYPES.DISBURSEMENTS && startDate) {
      loadDisbursements(startDate, endDate || startDate);
    }
    if (value === REPORT_TYPES.BANK_DEPOSITS && startDate) {
      loadBankDeposits(startDate, endDate || startDate);
    }
    if (value === REPORT_TYPES.VOUCHERS && startDate) {
      loadVouchers(startDate, endDate || startDate);
    }
  };

  const applyQuickRange = (from, to, mode = "range") => {
    setDateFilterMode(mode);
    onStartDateChange(from);
    onEndDateChange(to);
    applyFilters(from, to);
  };

  const handleStartDateChange = (value) => {
    onStartDateChange(value);
    if (dateFilterMode === "single") {
      onEndDateChange(value);
    }
  };

  const handleDateFilterModeChange = (mode) => {
    setDateFilterMode(mode);
    if (mode === "single" && startDate) {
      onEndDateChange(startDate);
    }
  };

  const resolveExportMode = () => {
    // Si hay más de un día en el rango, respetar consolidado / por día.
    if (startDate && endDate && startDate !== endDate) {
      return exportMode;
    }
    return "single";
  };

  const handleExportExcel = () => {
    if (isMainSheet) {
      if (!mainSheetReport) {
        showWarning("Genera la vista previa antes de exportar.");
        return;
      }
      try {
        exportKioskMainSheetToExcel({ report: mainSheetReport });
        showSuccess("Excel de hoja principal descargado correctamente.");
      } catch (err) {
        showError(err.message || "No se pudo generar el Excel.");
      }
      return;
    }
    if (!startDate && !endDate) {
      showWarning("Selecciona al menos una fecha antes de exportar.");
      return;
    }
    if (isDisbursements) {
      if (!sortedDisbursements.length) {
        showWarning("No hay desembolsos para exportar con el filtro actual.");
        return;
      }
      try {
        exportKioskDisbursementsToExcel({
          rows: sortedDisbursements,
          startDate,
          endDate,
          generatedByName,
        });
        showSuccess("Excel de desembolsos descargado correctamente.");
      } catch (err) {
        showError(err.message || "No se pudo generar el Excel.");
      }
      return;
    }
    if (isBankDeposits) {
      if (!bankDepositRows.length) {
        showWarning("No hay depósitos bancarios para exportar con el filtro actual.");
        return;
      }
      try {
        exportKioskBankDepositsToExcel({
          report: bankDepositReport,
          rows: bankDepositRows,
          startDate,
          endDate,
          generatedByName,
        });
        showSuccess("Excel de movimientos bancarios descargado correctamente.");
      } catch (err) {
        showError(err.message || "No se pudo generar el Excel.");
      }
      return;
    }
    if (isVouchers) {
      if (!voucherRows.length) {
        showWarning("No hay vouchers de tarjeta para exportar con el filtro actual.");
        return;
      }
      try {
        exportKioskVouchersToExcel({
          report: voucherReport,
          rows: voucherRows,
          startDate,
          endDate,
          generatedByName,
        });
        showSuccess("Excel de voucher descargado correctamente.");
      } catch (err) {
        showError(err.message || "No se pudo generar el Excel.");
      }
      return;
    }
    if (!filteredSales.length) {
      showWarning("No hay ventas para exportar con el filtro actual.");
      return;
    }
    try {
      const mode = resolveExportMode();
      exportKioskSalesToExcel({
        sales: filteredSales,
        startDate,
        endDate,
        kioskName,
        kioskCode,
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
    }
  };

  const handleExportPdf = () => {
    if (isMainSheet) {
      if (!mainSheetReport) {
        showWarning("Genera la vista previa antes de exportar.");
        return;
      }
      const opened = exportKioskMainSheetToPdf({ report: mainSheetReport });
      if (opened === false) {
        showWarning("Permite ventanas emergentes para descargar el PDF.");
        return;
      }
      showSuccess("PDF de hoja principal listo para imprimir o guardar.");
      return;
    }
    if (!startDate && !endDate) {
      showWarning("Selecciona al menos una fecha antes de exportar.");
      return;
    }
    if (isDisbursements) {
      if (!sortedDisbursements.length) {
        showWarning("No hay desembolsos para exportar con el filtro actual.");
        return;
      }
      const opened = exportKioskDisbursementsToPdf({
        rows: sortedDisbursements,
        startDate,
        endDate,
        generatedByName,
      });
      if (opened === false) {
        showWarning("Permite ventanas emergentes para descargar el PDF.");
        return;
      }
      showSuccess("PDF de desembolsos listo para imprimir o guardar.");
      return;
    }
    if (isBankDeposits) {
      if (!bankDepositRows.length) {
        showWarning("No hay depósitos bancarios para exportar con el filtro actual.");
        return;
      }
      const opened = exportKioskBankDepositsToPdf({
        report: bankDepositReport,
        rows: bankDepositRows,
        startDate,
        endDate,
        generatedByName,
      });
      if (opened === false) {
        showWarning("Permite ventanas emergentes para descargar el PDF.");
        return;
      }
      showSuccess("PDF de movimientos bancarios listo para imprimir o guardar.");
      return;
    }
    if (isVouchers) {
      if (!voucherRows.length) {
        showWarning("No hay vouchers de tarjeta para exportar con el filtro actual.");
        return;
      }
      const opened = exportKioskVouchersToPdf({
        report: voucherReport,
        rows: voucherRows,
        startDate,
        endDate,
        generatedByName,
      });
      if (opened === false) {
        showWarning("Permite ventanas emergentes para descargar el PDF.");
        return;
      }
      showSuccess("PDF de voucher listo para imprimir o guardar.");
      return;
    }
    if (!filteredSales.length) {
      showWarning("No hay ventas para exportar con el filtro actual.");
      return;
    }
    const mode = resolveExportMode();
    const opened = exportKioskSalesToPdf({
      sales: filteredSales,
      startDate,
      endDate,
      kioskName,
      generatedByName,
      mode,
    });
    if (opened === false) {
      showWarning("Permite ventanas emergentes para descargar el PDF.");
      return;
    }
    showSuccess("PDF listo para imprimir o guardar.");
  };

  const openSaleDetail = async (sale) => {
    if (!sale?.id) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setSaleDetail(sale);
    try {
      const detail = await getKioskSaleById(
        sale.id,
        kioskLocationId ? Number(kioskLocationId) : undefined
      );
      setSaleDetail(detail);
    } catch (err) {
      showError(
        err.message ||
          "No se pudo cargar el detalle completo, pero puedes registrar boleta con la información actual."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeSaleDetail = () => {
    setDetailOpen(false);
    setSaleDetail(null);
  };

  return (
    <>
      <Card className="kiosk-pos-block">
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between">
          <CardTitle tag="h5" className="mb-0">
            {reportTypeTitle(reportType)}
          </CardTitle>
          <div className="kiosk-pos-report-export-actions mt-2 mt-md-0 d-flex flex-wrap align-items-center">
            {isSales && startDate && endDate && startDate !== endDate && (
              <Input
                type="select"
                bsSize="sm"
                className="mr-2 mb-0"
                style={{ width: "auto", minWidth: 180 }}
                value={exportMode}
                onChange={(e) => setExportMode(e.target.value)}
              >
                <option value="consolidated">Consolidado (FECHA al inicio de cada día)</option>
                <option value="byDay">Separado por día (una hoja c/u)</option>
              </Input>
            )}
            <Button color="default" size="sm" className="mr-2" onClick={handleExportExcel}>
              <i className="nc-icon nc-paper" /> Excel
            </Button>
            <Button color="default" size="sm" onClick={handleExportPdf}>
              <i className="nc-icon nc-single-copy-04" /> PDF
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <Row className="align-items-end">
            <Col md="2">
              <Label className="kiosk-pos-label">Tipo de reporte</Label>
              <Input
                className="kiosk-pos-input-lg"
                type="select"
                value={reportType}
                onChange={(e) => handleReportTypeChange(e.target.value)}
              >
                <option value={REPORT_TYPES.SALES}>Ventas</option>
                <option value={REPORT_TYPES.DISBURSEMENTS}>Desembolsos</option>
                <option value={REPORT_TYPES.BANK_DEPOSITS}>Depósitos bancarios</option>
                <option value={REPORT_TYPES.VOUCHERS}>Voucher (tarjeta)</option>
                <option value={REPORT_TYPES.MAIN_SHEET}>Hoja principal</option>
              </Input>
            </Col>
            {isMainSheet ? (
              <>
                <Col md="5">
                  <Label className="kiosk-pos-label">Corte de conteo físico</Label>
                  <Input
                    className="kiosk-pos-input-lg"
                    type="select"
                    value={selectedPhysicalCountId}
                    onChange={(e) => {
                      setSelectedPhysicalCountId(e.target.value);
                      setMainSheetReport(null);
                    }}
                    disabled={physicalCountsLoading || !physicalCountSessions.length}
                  >
                    {!physicalCountSessions.length && (
                      <option value="">Sin cortes registrados</option>
                    )}
                    {physicalCountSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {formatMainSheetCountLabel(session)}
                      </option>
                    ))}
                  </Input>
                </Col>
                <Col md="2" className="d-flex align-items-end mt-2 mt-md-0">
                  <Button
                    color="primary"
                    className="kiosk-pos-btn-lg"
                    onClick={() => loadMainSheet()}
                    disabled={alternateReportLoading || !selectedPhysicalCountId}
                  >
                    {mainSheetLoading ? (
                      <>
                        <Spinner size="sm" className="mr-1" /> Cargando…
                      </>
                    ) : (
                      "Vista previa"
                    )}
                  </Button>
                </Col>
              </>
            ) : (
              <>
            <Col md="2">
              <Label className="kiosk-pos-label">Tipo de filtro</Label>
              <Input
                className="kiosk-pos-input-lg"
                type="select"
                value={dateFilterMode}
                onChange={(e) => handleDateFilterModeChange(e.target.value)}
              >
                <option value="single">Día exacto</option>
                <option value="range">Rango de fechas</option>
              </Input>
            </Col>
            <Col md="3">
              <Label className="kiosk-pos-label">{dateFilterMode === "single" ? "Día" : "Desde"}</Label>
              <Input
                className="kiosk-pos-input-lg"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
              />
            </Col>
            {dateFilterMode === "range" && (
              <Col md="3">
                <Label className="kiosk-pos-label">Hasta</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                />
              </Col>
            )}
            <Col md="2" className="d-flex align-items-end mt-2 mt-md-0">
              <Button
                color="primary"
                className="kiosk-pos-btn-lg"
                onClick={() => applyFilters()}
                disabled={alternateReportLoading}
              >
                {alternateReportLoading ? (
                  <>
                    <Spinner size="sm" className="mr-1" /> Cargando…
                  </>
                ) : (
                  "Aplicar filtro"
                )}
              </Button>
            </Col>
            {isSales && (
            <Col md="2">
              <Label className="kiosk-pos-label">Boleta depósito</Label>
              <Input
                className="kiosk-pos-input-lg"
                type="select"
                value={depositFilter}
                onChange={(e) => setDepositFilter(e.target.value)}
              >
                <option value="ALL">Todas</option>
                <option value="PENDING">Pendientes</option>
              </Input>
            </Col>
            )}
              </>
            )}
          </Row>

          {!isMainSheet && (
          <div className="d-flex flex-wrap mt-2 kiosk-pos-report-quick-filters">
            <Button
              color="default"
              size="sm"
              className="mr-1 mb-1"
              onClick={() => {
                const today = getTodayYmdGuatemala();
                applyQuickRange(today, today, "single");
              }}
            >
              Hoy
            </Button>
            <Button
              color="default"
              size="sm"
              className="mr-1 mb-1"
              onClick={() => {
                const yesterday = getYesterdayYmdGuatemala();
                applyQuickRange(yesterday, yesterday, "single");
              }}
            >
              Ayer
            </Button>
            <Button
              color="default"
              size="sm"
              className="mr-1 mb-1"
              onClick={() => {
                const today = getTodayYmdGuatemala();
                applyQuickRange(getWeekStartYmdGuatemala(), today, "range");
              }}
            >
              Esta semana
            </Button>
            <Button
              color="default"
              size="sm"
              className="mb-1"
              onClick={() => {
                const today = getTodayYmdGuatemala();
                applyQuickRange(getMonthStartYmdGuatemala(), today, "range");
              }}
            >
              Este mes
            </Button>
          </div>
          )}

          <p className="text-muted small mt-2 mb-0">
            {isMainSheet ? (
              <>
                Corte seleccionado:{" "}
                <strong>{selectedPhysicalCountSession ? formatMainSheetCountLabel(selectedPhysicalCountSession) : "—"}</strong>
                {mainSheetReport ? (
                  <>
                    {" · "}
                    Total vendido {formatCurrency(mainSheetReport.totalSold)}
                    {" · "}
                    Diferencia {Math.abs(Number(mainSheetReport.difference || 0)) < 0.005
                      ? "Q -"
                      : formatCurrency(mainSheetReport.difference)}
                  </>
                ) : null}
              </>
            ) : (
              <>
            Período activo: <strong>{periodLabel}</strong>
            {" · "}
            {isDisbursements
              ? `${sortedDisbursements.length} desembolso(s) · total ${formatCurrency(disbursementsTotal)}`
              : isBankDeposits
              ? `${bankDepositRows.length} depósito(s) · total ${formatCurrency(bankDepositsTotal)}`
              : isVouchers
              ? `${voucherRows.length} voucher(s) · total ${formatCurrency(vouchersTotal)}`
              : `${filteredSales.length} venta(s) en pantalla. Excel/PDF usan este período${
                  startDate && endDate && startDate !== endDate
                    ? ` · modo: ${exportMode === "byDay" ? "una hoja por día" : "consolidado con FECHA:"}`
                    : ""
                }.`}
            {(isDisbursements || isBankDeposits || isVouchers) && kioskName ? ` · ${kioskName}` : ""}
              </>
            )}
          </p>

          {isMainSheet && (
            <div className="mt-3">
              {mainSheetLoading ? (
                <div className="text-center text-muted py-4">
                  <Spinner size="sm" className="mr-1" /> Generando hoja principal…
                </div>
              ) : (
                <KioskMainSheetReportPreview
                  report={mainSheetReport}
                  physicalCountSession={selectedPhysicalCountSession}
                  onReportChange={setMainSheetReport}
                />
              )}
            </div>
          )}

          {!isSales && !isMainSheet && (
            <p className="text-muted small mb-0">
              Usa <strong>Día exacto</strong>, <strong>Rango</strong> o los accesos rápidos (Hoy, Ayer, Esta semana, Este mes).
              Los registros se ordenan cronológicamente dentro del período.
            </p>
          )}

          {isBankDeposits && bankDepositReport?.accountNumber && (
            <p className="text-muted small mb-0">
              Cuenta: <strong>{bankDepositReport.accountNumber}</strong>
              {bankDepositReport.accountName ? ` · ${bankDepositReport.accountName}` : ""}
              {bankDepositReport.bankName ? ` · ${bankDepositReport.bankName}` : ""}
            </p>
          )}

          {isVouchers && (voucherReport?.kioskName || kioskName) && (
            <p className="text-muted small mb-0">
              Bodega: <strong>{voucherReport?.kioskName || kioskName}</strong>
            </p>
          )}

          {isSales && (
          <>
          <Row className="mt-3">
            <Col md="12">
              <Card body className="kiosk-pos-report-card">
                <h6 className="mb-2">Resumen del período</h6>
                <div>Ventas: <strong>{displaySummary.salesCount}</strong></div>
                <div>Total unidades: <strong>{formatQty(displaySummary.totalItems)}</strong></div>
                <div>Total monto: <strong>{formatCurrency(displaySummary.totalAmount)}</strong></div>
                <div>Ticket promedio: <strong>{formatCurrency(displaySummary.averageTicket)}</strong></div>
              </Card>
            </Col>
          </Row>

          {cashSession && String(cashSession.status || "").toUpperCase() === "OPEN" && (
            <Row className="mt-2">
              <Col md="12">
                <Card body className="kiosk-pos-report-card border-warning">
                  <h6 className="mb-2">Cuadre de caja (turno abierto)</h6>
                  <div className="small">
                    Fondo {formatCurrency(cashSession.openingAmount ?? 300)} + efectivo ventas ({formatCurrency(cashSession.cashSalesTotal || 0)})
                    − gastos ({formatCurrency(cashSession.cashExpensesTotal || 0)})
                    = <strong>{formatCurrency(cashSession.expectedCash || 0)}</strong> esperado en caja
                  </div>
                  <div className="small text-muted mt-1">
                    Compara el efectivo en ventas de esta tabla con la pestaña Caja. Registra gastos en Caja antes de cerrar.
                  </div>
                </Card>
              </Col>
            </Row>
          )}

          <p className="text-muted small mt-3 mb-2">
            Toca una venta para ver el detalle. Con caja abierta puedes anular ventas del turno desde la columna Acciones.
          </p>

          <Table responsive className="kiosk-pos-sales-table">
            <thead className="text-primary">
              <tr>
                <th>Fecha</th>
                <th>No. Venta</th>
                <th>No. interno</th>
                <th>Cliente</th>
                <th>Productos</th>
                <th>Vendedor</th>
                <th>Pago</th>
                <th>Items</th>
                <th>Total</th>
                <th>Factura</th>
                <th>Boleta depósito</th>
                <th style={{ width: 180 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map((sale) => {
                const felSerie = sale.felSerie || sale.invoice?.felSerie;
                const felNumero = sale.felNumero || sale.invoice?.felNumero;
                const invoiceLabel =
                  felSerie || felNumero ? `${felSerie || ""} ${felNumero || ""}`.trim() : "—";
                const isTestSale =
                  sale.testSale || String(felSerie || "").toUpperCase().includes("PRUEBAS");
                const isVoid = String(sale.status || "").toUpperCase() === "VOID";
                const pendingDeposit = isSalePendingDeposit(sale);
                const showVoidButton = canVoidSaleRow(sale, cashSession);
                const depositLabel = pendingDeposit
                  ? "Pendiente"
                  : sale.depositSlipNumber || "—";

                return (
                  <tr
                    key={sale.id}
                    className={`kiosk-pos-sales-row${isVoid ? " kiosk-pos-sales-row-void" : ""}${
                      pendingDeposit ? " kiosk-pos-sales-row-pending-deposit" : ""
                    }`}
                    onClick={() => openSaleDetail(sale)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openSaleDetail(sale);
                      }
                    }}
                  >
                    <td>{formatDateTimeGt(sale.soldAt || sale.saleDate)}</td>
                    <td>
                      {sale.saleNumber}
                      {isVoid && (
                        <span className="badge badge-danger ml-1">Anulada</span>
                      )}
                      {!isVoid && isTestSale && (
                        <span className="badge badge-warning ml-1" title="No cuenta en ventas de producción">
                          Prueba
                        </span>
                      )}
                    </td>
                    <td>{getSaleInternalNumber(sale) || "—"}</td>
                    <td>{sale.customerName || sale.customerTaxId || "CF"}</td>
                    <td className="kiosk-pos-sales-products-cell">
                      {formatSaleItemsSummary(sale) || (
                        <span className="text-muted">Sin detalle</span>
                      )}
                    </td>
                    <td>{sale.soldByName || sale.soldByUsername || "—"}</td>
                    <td>
                      {sale.paymentMethod || "-"}
                      {(sale.cardAuthNumber || sale.cardLast4) && (
                        <>
                          <br />
                          <span className="text-muted small">
                            {sale.cardAuthNumber ? `Aut. ${sale.cardAuthNumber}` : ""}
                            {sale.cardAuthNumber && sale.cardLast4 ? " · " : ""}
                            {sale.cardLast4 ? `**** ${sale.cardLast4}` : ""}
                          </span>
                        </>
                      )}
                    </td>
                    <td>{formatQty(sale.totalItems)}</td>
                    <td>{formatCurrency(sale.totalAmount)}</td>
                    <td>{invoiceLabel}</td>
                    <td>
                      {pendingDeposit ? (
                        <span className="badge badge-warning">Pendiente</span>
                      ) : (
                        depositLabel
                      )}
                    </td>
                    <td className="kiosk-pos-sales-actions-cell" onClick={(e) => e.stopPropagation()}>
                      {pendingDeposit && !isVoid && (
                        <Button
                          color="warning"
                          size="sm"
                          outline
                          className="mr-1"
                          onClick={() => openSaleDetail(sale)}
                        >
                          Boleta
                        </Button>
                      )}
                      {showVoidButton ? (
                        <Button
                          color="danger"
                          size="sm"
                          outline
                          className="kiosk-pos-sales-void-btn"
                          onClick={() => setVoidTargetSale(sale)}
                        >
                          Anular
                        </Button>
                      ) : !pendingDeposit ? (
                        <span className="text-muted small">—</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan="12" className="text-center text-muted">
                    No hay ventas para el filtro seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          </>
          )}

          {isDisbursements && (
          <Table responsive className="kiosk-pos-sales-table mt-3">
            <thead className="text-primary">
              <tr>
                <th>#</th>
                <th>Bodega</th>
                <th>Usuario</th>
                <th>Descripción</th>
                <th>Fecha/Hora</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {disbursementsLoading && (
                <tr>
                  <td colSpan="6" className="text-center text-muted">
                    <Spinner size="sm" className="mr-1" /> Cargando desembolsos…
                  </td>
                </tr>
              )}
              {!disbursementsLoading &&
                sortedDisbursements.map((row, index) => (
                  <tr key={`disbursement-${row.id}`}>
                    <td>{index + 1}</td>
                    <td>{row.kioskName || kioskName || "—"}</td>
                    <td>{row.createdByName || "—"}</td>
                    <td>{row.description || "—"}</td>
                    <td>{formatDisbursementDateTime(row.createdAt)}</td>
                    <td>{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
              {!disbursementsLoading && sortedDisbursements.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center text-muted">
                    No hay desembolsos para el filtro seleccionado.
                  </td>
                </tr>
              )}
              {!disbursementsLoading && sortedDisbursements.length > 0 && (
                <tr>
                  <td colSpan="5" className="text-right font-weight-bold">
                    Total
                  </td>
                  <td className="font-weight-bold">{formatCurrency(disbursementsTotal)}</td>
                </tr>
              )}
            </tbody>
          </Table>
          )}

          {isBankDeposits && (
          <Table responsive className="kiosk-pos-sales-table mt-3">
            <thead className="text-primary">
              <tr>
                <th>Cuenta</th>
                <th>Banco</th>
                <th>No. Documento</th>
                <th>Monto</th>
                <th>Usuario</th>
                <th>Descripción</th>
                <th>Fecha</th>
                <th>Bodega</th>
              </tr>
            </thead>
            <tbody>
              {bankDepositsLoading && (
                <tr>
                  <td colSpan="8" className="text-center text-muted">
                    <Spinner size="sm" className="mr-1" /> Cargando depósitos…
                  </td>
                </tr>
              )}
              {!bankDepositsLoading &&
                bankDepositRows.map((row) => (
                  <tr key={`bank-deposit-${row.id}`}>
                    <td>{row.accountNumber || bankDepositReport?.accountNumber || "—"}</td>
                    <td>{row.bankName || bankDepositReport?.bankName || "—"}</td>
                    <td>{row.documentNumber || "—"}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{row.userName || "—"}</td>
                    <td>{row.description || "—"}</td>
                    <td>{formatBankDepositDateTime(row.recordedAt)}</td>
                    <td>{row.kioskName || kioskName || "—"}</td>
                  </tr>
                ))}
              {!bankDepositsLoading && bankDepositRows.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center text-muted">
                    No hay depósitos registrados para el filtro seleccionado.
                  </td>
                </tr>
              )}
              {!bankDepositsLoading && bankDepositRows.length > 0 && (
                <tr>
                  <td colSpan="3" className="font-weight-bold">
                    Total
                  </td>
                  <td className="font-weight-bold">{formatCurrency(bankDepositsTotal)}</td>
                  <td colSpan="4" />
                </tr>
              )}
            </tbody>
          </Table>
          )}

          {isVouchers && (
          <Table responsive className="kiosk-pos-sales-table mt-3">
            <thead className="text-primary">
              <tr>
                <th>No. Factura</th>
                <th>Tarjeta</th>
                <th>Monto</th>
                <th>Descripcion</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {vouchersLoading && (
                <tr>
                  <td colSpan="5" className="text-center text-muted">
                    <Spinner size="sm" className="mr-1" /> Cargando vouchers…
                  </td>
                </tr>
              )}
              {!vouchersLoading &&
                voucherRows.map((row) => (
                  <tr key={`voucher-${row.id}`}>
                    <td>{row.invoiceNumber || "—"}</td>
                    <td>{row.cardBrand || "VISA"}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{row.description || "—"}</td>
                    <td>{formatVoucherDateTime(row.soldAt)}</td>
                  </tr>
                ))}
              {!vouchersLoading && voucherRows.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center text-muted">
                    No hay ventas con tarjeta para el filtro seleccionado.
                  </td>
                </tr>
              )}
              {!vouchersLoading && voucherRows.length > 0 && (
                <tr>
                  <td colSpan="2" className="font-weight-bold">
                    Total
                  </td>
                  <td className="font-weight-bold">{formatCurrency(vouchersTotal)}</td>
                  <td colSpan="2" />
                </tr>
              )}
            </tbody>
          </Table>
          )}
        </CardBody>
      </Card>

      <PosVoidSaleModal
        isOpen={Boolean(voidTargetSale)}
        onClose={() => setVoidTargetSale(null)}
        sale={voidTargetSale}
        kioskLocationId={kioskLocationId}
        onSuccess={(updated) => {
          if (onSaleUpdated) onSaleUpdated(updated);
          if (saleDetail?.id === updated?.id) setSaleDetail(updated);
        }}
      />

      <PosSaleDetailModal
        isOpen={detailOpen}
        onClose={closeSaleDetail}
        sale={saleDetail}
        loading={detailLoading}
        cashSession={cashSession}
        cashSessionOpen={Boolean(cashSession && String(cashSession.status || "").toUpperCase() === "OPEN")}
        kioskLocationId={kioskLocationId}
        onSaleUpdated={(updated) => {
          setSaleDetail(updated);
          if (onSaleUpdated) onSaleUpdated(updated);
        }}
      />
    </>
  );
}

export default PosReportsTab;
