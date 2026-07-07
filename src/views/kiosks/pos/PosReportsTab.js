import React, { useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Label, Row, Table } from "reactstrap";
import { getKioskSaleById } from "services/kioskPosService";
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
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import PosSaleDetailModal from "./PosSaleDetailModal";
import PosVoidSaleModal from "./PosVoidSaleModal";
import { formatCurrency, formatQty, getSaleInternalNumber, isSalePendingDeposit } from "./posUtils";

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
  cashSession,
  onSaleUpdated,
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saleDetail, setSaleDetail] = useState(null);
  const [voidTargetSale, setVoidTargetSale] = useState(null);
  const [depositFilter, setDepositFilter] = useState("ALL");
  const [dateFilterMode, setDateFilterMode] = useState("single");

  const filteredSales = (sales || []).filter((sale) => {
    if (depositFilter !== "PENDING") return true;
    return isSalePendingDeposit(sale);
  });

  const displaySummary = useMemo(
    () => buildKioskReportSummary(filteredSales),
    [filteredSales]
  );

  const periodLabel = formatPeriodLabel(startDate, endDate);

  const applyQuickRange = (from, to, mode = "range") => {
    setDateFilterMode(mode);
    onStartDateChange(from);
    onEndDateChange(to);
    if (onApplyFilters) {
      onApplyFilters(from, to);
    }
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

  const handleExportExcel = () => {
    if (!startDate && !endDate) {
      showWarning("Selecciona al menos una fecha antes de exportar.");
      return;
    }
    if (!filteredSales.length) {
      showWarning("No hay ventas para exportar con el filtro actual.");
      return;
    }
    try {
      exportKioskSalesToExcel({
        sales: filteredSales,
        startDate,
        endDate,
        kioskName,
        kioskCode,
        depositFilter,
      });
      showSuccess("Excel descargado correctamente.");
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  const handleExportPdf = () => {
    if (!startDate && !endDate) {
      showWarning("Selecciona al menos una fecha antes de exportar.");
      return;
    }
    if (!filteredSales.length) {
      showWarning("No hay ventas para exportar con el filtro actual.");
      return;
    }
    const opened = exportKioskSalesToPdf({
      sales: filteredSales,
      startDate,
      endDate,
      kioskName,
      depositFilter,
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
            Reportes de ventas
          </CardTitle>
          <div className="kiosk-pos-report-export-actions mt-2 mt-md-0">
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
                onClick={() => onApplyFilters()}
              >
                Aplicar filtro
              </Button>
            </Col>
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
          </Row>

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

          <p className="text-muted small mt-2 mb-0">
            Período activo: <strong>{periodLabel}</strong>
            {" · "}
            {filteredSales.length} venta(s) en pantalla. Excel y PDF exportan solo este período (y filtro de boleta si aplica).
          </p>

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
                    Fondo Q300 + efectivo ventas ({formatCurrency(cashSession.cashSalesTotal || 0)})
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
