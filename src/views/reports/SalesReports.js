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
import KioskMainSheetReportPreview from "components/kiosks/KioskMainSheetReportPreview";
import {
  getGeneralKioskBankDeposits,
  getGeneralKioskDisbursements,
  getGeneralKioskVouchers,
  getGeneralKioskReport,
  getGeneralKioskSalesDetail,
  getKioskMainSheetReport,
} from "services/kioskPosService";
import { getKioscoConteoHistorial } from "services/kioscoInventoryService";
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
  buildKioskReportSummary,
  exportKioskSalesToExcel,
  exportKioskSalesToPdf,
  formatSaleItemsSummary,
} from "utils/kioskPosReportExport";
import {
  exportKioskMainSheetToExcel,
  exportKioskMainSheetToPdf,
  formatMainSheetCountLabel,
} from "utils/kioskMainSheetReportExport";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import { formatCurrency, formatQty, getSaleInternalNumber, getSaleCardAmount } from "views/kiosks/pos/posUtils";
import "../kiosks/KioskSales.css";
import SalesReportsCashClosuresPanel from "./SalesReportsCashClosuresPanel";

const REPORT_TYPES = {
  GENERAL: "GENERAL",
  CASH: "CASH",
  CARD: "CARD",
  DISBURSEMENTS: "DISBURSEMENTS",
  BANK_DEPOSITS: "BANK_DEPOSITS",
  VOUCHERS: "VOUCHERS",
  MAIN_SHEET: "MAIN_SHEET",
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
    hint: "Tarjeta 100% y la parte con tarjeta de ventas mixtas (misma lógica que TARJETAS en hoja principal).",
  },
  {
    value: REPORT_TYPES.DISBURSEMENTS,
    label: "Desembolsos",
    hint: "Gastos registrados por el encargado del kiosko desde la caja.",
  },
  {
    value: REPORT_TYPES.BANK_DEPOSITS,
    label: "Depósitos bancarios",
    hint: "Ventas en efectivo con boleta de depósito registrada (movimientos bancarios).",
  },
  {
    value: REPORT_TYPES.VOUCHERS,
    label: "Voucher (tarjeta)",
    hint: "Ventas pagadas con tarjeta: factura, marca, voucher, monto y fecha.",
  },
  {
    value: REPORT_TYPES.MAIN_SHEET,
    label: "Hoja principal",
    hint: "Resumen por corte de conteo físico: ventas diarias, tarjetas, depósitos, gastos y cuadre.",
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
  const [bankDepositReport, setBankDepositReport] = useState(null);
  const [voucherReport, setVoucherReport] = useState(null);
  const [exportMode, setExportMode] = useState("consolidated");
  const [kioskLocations, setKioskLocations] = useState([]);
  const [loadingKiosks, setLoadingKiosks] = useState(false);
  const [physicalCountSessions, setPhysicalCountSessions] = useState([]);
  const [physicalCountsLoading, setPhysicalCountsLoading] = useState(false);
  const [selectedPhysicalCountId, setSelectedPhysicalCountId] = useState("");
  const [mainSheetReport, setMainSheetReport] = useState(null);
  const [mainSheetLoading, setMainSheetLoading] = useState(false);

  const generatedByName = useMemo(() => resolveUserFullName(user), [user]);
  const isDisbursements = reportType === REPORT_TYPES.DISBURSEMENTS;
  const isBankDeposits = reportType === REPORT_TYPES.BANK_DEPOSITS;
  const isVouchers = reportType === REPORT_TYPES.VOUCHERS;
  const isMainSheet = reportType === REPORT_TYPES.MAIN_SHEET;
  const isSalesReport = !isDisbursements && !isBankDeposits && !isVouchers && !isMainSheet;
  const paymentKindParam =
    reportType === REPORT_TYPES.CASH || reportType === REPORT_TYPES.CARD ? reportType : undefined;

  const periodLabel = formatPeriodLabel(startDate, endDate);

  const isCardReport = reportType === REPORT_TYPES.CARD;
  const salesSummary = useMemo(
    () => buildKioskReportSummary(salesDetail, isCardReport ? { amountField: "card" } : {}),
    [salesDetail, isCardReport]
  );

  const disbursementsTotal = useMemo(
    () => (disbursements || []).reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [disbursements]
  );

  const sortedDisbursements = useMemo(() => {
    return [...(disbursements || [])].sort((a, b) => {
      const ta = new Date(a?.createdAt || 0).getTime() || 0;
      const tb = new Date(b?.createdAt || 0).getTime() || 0;
      if (ta !== tb) return ta - tb;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
  }, [disbursements]);

  const bankDepositRows = useMemo(() => {
    return [...(bankDepositReport?.rows || [])].sort((a, b) => {
      const ta = new Date(a?.recordedAt || 0).getTime() || 0;
      const tb = new Date(b?.recordedAt || 0).getTime() || 0;
      if (ta !== tb) return ta - tb;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
  }, [bankDepositReport]);

  const bankDepositsTotal = useMemo(
    () => bankDepositRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [bankDepositRows]
  );

  const voucherRows = useMemo(() => {
    return [...(voucherReport?.rows || [])].sort((a, b) => {
      const ta = new Date(a?.soldAt || 0).getTime() || 0;
      const tb = new Date(b?.soldAt || 0).getTime() || 0;
      if (ta !== tb) return ta - tb;
      return Number(a?.id || 0) - Number(b?.id || 0);
    });
  }, [voucherReport]);

  const vouchersTotal = useMemo(
    () => voucherRows.reduce((sum, row) => sum + Number(row?.amount || 0), 0),
    [voucherRows]
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

  const selectedPhysicalCountSession = useMemo(
    () => physicalCountSessions.find((item) => String(item.id) === String(selectedPhysicalCountId)) || null,
    [physicalCountSessions, selectedPhysicalCountId]
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

  const loadPhysicalCountSessions = useCallback(async () => {
    if (!selectedKioskId) {
      setPhysicalCountSessions([]);
      setSelectedPhysicalCountId("");
      setMainSheetReport(null);
      return;
    }
    try {
      setPhysicalCountsLoading(true);
      const sessions = await getKioscoConteoHistorial(Number(selectedKioskId));
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
      setMainSheetReport(null);
      showError(err.message || "No se pudieron cargar los cortes de conteo físico.");
    } finally {
      setPhysicalCountsLoading(false);
    }
  }, [selectedKioskId]);

  useEffect(() => {
    if (activeTab !== TABS.SALES || !isMainSheet) return;
    loadPhysicalCountSessions();
  }, [activeTab, isMainSheet, loadPhysicalCountSessions]);

  const loadMainSheet = useCallback(async (countId = selectedPhysicalCountId) => {
    if (!countId) {
      setMainSheetReport(null);
      return;
    }
    if (!selectedKioskId) {
      showWarning("Selecciona un kiosko para generar la hoja principal.");
      return;
    }
    try {
      setMainSheetLoading(true);
      setError("");
      const report = await getKioskMainSheetReport(Number(countId));
      setMainSheetReport(report || null);
    } catch (err) {
      setMainSheetReport(null);
      setError(err.message || "No se pudo cargar la hoja principal.");
    } finally {
      setMainSheetLoading(false);
    }
  }, [selectedPhysicalCountId, selectedKioskId]);

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
    setMainSheetReport(null);
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
        setBankDepositReport(null);
        setVoucherReport(null);
        setSalesDetail([]);
        setReport(null);
        return;
      }

      if (reportType === REPORT_TYPES.BANK_DEPOSITS) {
        const reportData = await getGeneralKioskBankDeposits(
          from,
          to,
          selectedKioskId ? Number(selectedKioskId) : undefined
        );
        setBankDepositReport(reportData || null);
        setVoucherReport(null);
        setDisbursements([]);
        setSalesDetail([]);
        setReport(null);
        return;
      }

      if (reportType === REPORT_TYPES.VOUCHERS) {
        const reportData = await getGeneralKioskVouchers(
          from,
          to,
          selectedKioskId ? Number(selectedKioskId) : undefined
        );
        setVoucherReport(reportData || null);
        setBankDepositReport(null);
        setDisbursements([]);
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
      setBankDepositReport(null);
      setVoucherReport(null);
    } catch (err) {
      setError(err.message || "No se pudo generar el reporte.");
      setSalesDetail([]);
      setDisbursements([]);
      setBankDepositReport(null);
      setVoucherReport(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, dateFilterMode, today, reportType, selectedKioskId]);

  useEffect(() => {
    if (activeTab !== TABS.SALES) return;
    if (isMainSheet) return;
    generateSalesReport();
  }, [activeTab, startDate, endDate, dateFilterMode, selectedKioskId, reportType, generateSalesReport, isMainSheet]);

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

  const loadBankDepositsForExport = async () => {
    const from = startDate || today;
    const to = (dateFilterMode === "single" ? from : endDate) || from;
    if (!from) {
      showWarning("Selecciona el día (o rango) a exportar.");
      return null;
    }
    const reportData = await getGeneralKioskBankDeposits(
      from,
      to,
      selectedKioskId ? Number(selectedKioskId) : undefined
    );
    const list = Array.isArray(reportData?.rows) ? reportData.rows : [];
    if (!list.length) {
      showWarning("No hay depósitos bancarios para exportar en el período seleccionado.");
      return null;
    }
    return { report: reportData, rows: list, from, to };
  };

  const loadVouchersForExport = async () => {
    const from = startDate || today;
    const to = (dateFilterMode === "single" ? from : endDate) || from;
    if (!from) {
      showWarning("Selecciona el día (o rango) a exportar.");
      return null;
    }
    const reportData = await getGeneralKioskVouchers(
      from,
      to,
      selectedKioskId ? Number(selectedKioskId) : undefined
    );
    const list = Array.isArray(reportData?.rows) ? reportData.rows : [];
    if (!list.length) {
      showWarning("No hay vouchers de tarjeta para exportar en el período seleccionado.");
      return null;
    }
    return { report: reportData, rows: list, from, to };
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
      if (isMainSheet) {
        if (!mainSheetReport) {
          showWarning("Genera la vista previa antes de exportar.");
          return;
        }
        exportKioskMainSheetToExcel({ report: mainSheetReport });
        showSuccess("Excel de hoja principal descargado correctamente.");
        return;
      }

      if (isDisbursements) {
        const payload = await loadDisbursementsForExport();
        if (!payload) return;
        exportKioskDisbursementsToExcel({
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          generatedByName,
        });
        showSuccess("Excel de desembolsos descargado correctamente.");
        return;
      }

      if (isBankDeposits) {
        const payload = await loadBankDepositsForExport();
        if (!payload) return;
        exportKioskBankDepositsToExcel({
          report: payload.report,
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          generatedByName,
        });
        showSuccess("Excel de movimientos bancarios descargado correctamente.");
        return;
      }

      if (isVouchers) {
        const payload = await loadVouchersForExport();
        if (!payload) return;
        exportKioskVouchersToExcel({
          report: payload.report,
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          generatedByName,
        });
        showSuccess("Excel de voucher descargado correctamente.");
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
      if (isMainSheet) {
        if (!mainSheetReport) {
          showWarning("Genera la vista previa antes de exportar.");
          return;
        }
        const opened = exportKioskMainSheetToPdf({ report: mainSheetReport });
        if (opened === false) {
          showWarning("Permite ventanas emergentes para imprimir o guardar el PDF.");
          return;
        }
        showSuccess("PDF de hoja principal listo para imprimir o guardar.");
        return;
      }

      if (isDisbursements) {
        const payload = await loadDisbursementsForExport();
        if (!payload) return;
        const opened = exportKioskDisbursementsToPdf({
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          generatedByName,
        });
        if (opened === false) {
          showWarning("Permite ventanas emergentes para imprimir o guardar el PDF.");
          return;
        }
        showSuccess("PDF de desembolsos listo para imprimir o guardar.");
        return;
      }

      if (isBankDeposits) {
        const payload = await loadBankDepositsForExport();
        if (!payload) return;
        const opened = exportKioskBankDepositsToPdf({
          report: payload.report,
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          generatedByName,
        });
        if (opened === false) {
          showWarning("Permite ventanas emergentes para imprimir o guardar el PDF.");
          return;
        }
        showSuccess("PDF de movimientos bancarios listo para imprimir o guardar.");
        return;
      }

      if (isVouchers) {
        const payload = await loadVouchersForExport();
        if (!payload) return;
        const opened = exportKioskVouchersToPdf({
          report: payload.report,
          rows: payload.rows,
          startDate: payload.from,
          endDate: payload.to,
          generatedByName,
        });
        if (opened === false) {
          showWarning("Permite ventanas emergentes para imprimir o guardar el PDF.");
          return;
        }
        showSuccess("PDF de voucher listo para imprimir o guardar.");
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
                    {isSalesReport && startDate && effectiveEnd && startDate !== effectiveEnd && (
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
                    Reporte de <strong>desembolsos</strong> de caja chica. Filtra por día exacto, rango
                    o mes (Hoy, Ayer, Esta semana, Este mes).
                  </>
                ) : isBankDeposits ? (
                  <>
                    Reporte de <strong>movimientos bancarios</strong>: ventas en efectivo con boleta
                    de depósito registrada. Mismo formato del reporte histórico (cuenta, banco, documento,
                    monto, usuario, bodega).
                  </>
                ) : isVouchers ? (
                  <>
                    Reporte de <strong>voucher</strong>: ventas con tarjeta (factura, marca,
                    voucher, monto y fecha). Filtra por día, rango o mes con los accesos rápidos.
                  </>
                ) : isMainSheet ? (
                  <>
                    <strong>Hoja principal</strong> por kiosko y corte de conteo físico. El rango de
                    fechas coincide con el corte seleccionado.
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
                {isMainSheet ? (
                  <>
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
                        value={selectedKioskOption?.value ? selectedKioskOption : null}
                        onChange={(selected) => {
                          setSelectedKioskId(selected?.value || "");
                          setMainSheetReport(null);
                        }}
                        noOptionsMessage={() => "No hay kioskos"}
                      />
                    </Col>
                    <Col md="5">
                      <Label>Corte de conteo físico</Label>
                      <Input
                        type="select"
                        value={selectedPhysicalCountId}
                        onChange={(e) => {
                          setSelectedPhysicalCountId(e.target.value);
                          setMainSheetReport(null);
                        }}
                        disabled={physicalCountsLoading || !physicalCountSessions.length || !selectedKioskId}
                      >
                        {!selectedKioskId && <option value="">Selecciona un kiosko</option>}
                        {selectedKioskId && !physicalCountSessions.length && (
                          <option value="">Sin cortes registrados</option>
                        )}
                        {physicalCountSessions.map((session) => (
                          <option key={session.id} value={session.id}>
                            {formatMainSheetCountLabel(session)}
                          </option>
                        ))}
                      </Input>
                    </Col>
                    <Col md="2" className="d-flex align-items-end">
                      <Button
                        color="primary"
                        className="btn-round"
                        onClick={() => loadMainSheet()}
                        disabled={mainSheetLoading || physicalCountsLoading || !selectedPhysicalCountId}
                      >
                        {mainSheetLoading ? (
                          <>
                            <Spinner size="sm" className="mr-1" /> Cargando…
                          </>
                        ) : (
                          <>
                            <i className="nc-icon nc-zoom-split" /> Vista previa
                          </>
                        )}
                      </Button>
                    </Col>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </Row>

              {!isMainSheet && (
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
              )}

              <p className="text-muted small mb-3">
                {isMainSheet ? (
                  <>
                    Corte seleccionado:{" "}
                    <strong>
                      {selectedPhysicalCountSession
                        ? formatMainSheetCountLabel(selectedPhysicalCountSession)
                        : "—"}
                    </strong>
                    {mainSheetReport ? (
                      <>
                        {" · "}
                        Total vendido {formatCurrency(mainSheetReport.totalSold)}
                        {" · "}
                        Diferencia{" "}
                        {Math.abs(Number(mainSheetReport.difference || 0)) < 0.005
                          ? "Q -"
                          : formatCurrency(mainSheetReport.difference)}
                      </>
                    ) : null}
                  </>
                ) : (
                  <>
                Período activo: <strong>{periodLabel}</strong>
                {activeTab === TABS.SALES && isSalesReport && (
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

              {activeTab === TABS.SALES && isMainSheet && (
                <div className="mb-3">
                  {mainSheetLoading ? (
                    <div className="text-center text-muted py-4">
                      <Spinner color="primary" size="sm" className="mr-1" /> Generando hoja principal…
                    </div>
                  ) : (
                    <KioskMainSheetReportPreview
                      report={mainSheetReport}
                      physicalCountSession={selectedPhysicalCountSession}
                    />
                  )}
                </div>
              )}

              {activeTab === TABS.SALES && loading && !isMainSheet && (
                <div className="text-center py-4">
                  <Spinner color="primary" />
                </div>
              )}

              {activeTab === TABS.SALES && !loading && isSalesReport && (
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
                          <td>{formatCurrency(isCardReport ? getSaleCardAmount(sale) : sale.totalAmount)}</td>
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
                        <strong>Total desembolsos:</strong> {sortedDisbursements.length}
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
                        <th>#</th>
                        <th>Bodega</th>
                        <th>Usuario</th>
                        <th>Descripción</th>
                        <th>Fecha/Hora</th>
                        <th>Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedDisbursements.map((row, index) => (
                        <tr key={`disbursement-${row.id}`}>
                          <td>{index + 1}</td>
                          <td>{row.kioskName || "—"}</td>
                          <td>{row.createdByName || "—"}</td>
                          <td>{row.description || "—"}</td>
                          <td>{formatDisbursementDateTime(row.createdAt)}</td>
                          <td>{formatCurrency(row.amount)}</td>
                        </tr>
                      ))}
                      {sortedDisbursements.length === 0 && (
                        <tr>
                          <td colSpan="6" className="text-center text-muted">
                            No hay desembolsos en el período seleccionado
                          </td>
                        </tr>
                      )}
                      {sortedDisbursements.length > 0 && (
                        <tr>
                          <td colSpan="5" className="text-right font-weight-bold">
                            Total
                          </td>
                          <td className="font-weight-bold">{formatCurrency(disbursementsTotal)}</td>
                        </tr>
                      )}
                    </tbody>
                  </Table>
                </>
              )}

              {activeTab === TABS.SALES && !loading && isBankDeposits && (
                <>
                  <Row className="mb-3">
                    <Col md="4">
                      <Card body>
                        <strong>No. cuenta:</strong> {bankDepositReport?.accountNumber || "—"}
                      </Card>
                    </Col>
                    <Col md="4">
                      <Card body>
                        <strong>Depósitos:</strong> {bankDepositRows.length}
                      </Card>
                    </Col>
                    <Col md="4">
                      <Card body>
                        <strong>Monto total:</strong> {formatCurrency(bankDepositsTotal)}
                      </Card>
                    </Col>
                  </Row>
                  {bankDepositReport?.accountName && (
                    <p className="text-muted small">
                      {bankDepositReport.accountName}
                      {bankDepositReport.bankName ? ` · ${bankDepositReport.bankName}` : ""}
                    </p>
                  )}
                  <Table responsive>
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
                      {bankDepositRows.map((row) => (
                        <tr key={`bank-deposit-${row.id}`}>
                          <td>{row.accountNumber || bankDepositReport?.accountNumber || "—"}</td>
                          <td>{row.bankName || bankDepositReport?.bankName || "—"}</td>
                          <td>{row.documentNumber || "—"}</td>
                          <td>{formatCurrency(row.amount)}</td>
                          <td>{row.userName || "—"}</td>
                          <td>{row.description || "—"}</td>
                          <td>{formatBankDepositDateTime(row.recordedAt)}</td>
                          <td>{row.kioskName || "—"}</td>
                        </tr>
                      ))}
                      {bankDepositRows.length === 0 && (
                        <tr>
                          <td colSpan="8" className="text-center text-muted">
                            No hay depósitos bancarios en el período seleccionado
                          </td>
                        </tr>
                      )}
                      {bankDepositRows.length > 0 && (
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
                </>
              )}

              {activeTab === TABS.SALES && !loading && isVouchers && (
                <>
                  <Row className="mb-3">
                    <Col md="4">
                      <Card body>
                        <strong>Bodega:</strong> {voucherReport?.kioskName || "—"}
                      </Card>
                    </Col>
                    <Col md="4">
                      <Card body>
                        <strong>Vouchers:</strong> {voucherRows.length}
                      </Card>
                    </Col>
                    <Col md="4">
                      <Card body>
                        <strong>Monto total:</strong> {formatCurrency(vouchersTotal)}
                      </Card>
                    </Col>
                  </Row>
                  <Table responsive>
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
                      {voucherRows.map((row) => (
                        <tr key={`voucher-${row.id}`}>
                          <td>{row.invoiceNumber || "—"}</td>
                          <td>{row.cardBrand || "VISA"}</td>
                          <td>{formatCurrency(row.amount)}</td>
                          <td>{row.description || "—"}</td>
                          <td>{formatVoucherDateTime(row.soldAt)}</td>
                        </tr>
                      ))}
                      {voucherRows.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center text-muted">
                            No hay ventas con tarjeta en el período seleccionado
                          </td>
                        </tr>
                      )}
                      {voucherRows.length > 0 && (
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
