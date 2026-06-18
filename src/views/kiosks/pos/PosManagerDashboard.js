import React, { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Col, Row, Spinner, Table } from "reactstrap";
import { getKioskManagerDashboard, getMyKioskSales } from "services/kioskPosService";
import { showError } from "utils/notificationHelper";
import { formatCurrency, formatQty, isSalePendingDeposit } from "./posUtils";

const formatGrowth = (value) => {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(1)}%`;
};

const safeNumber = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
};

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const resolveSaleDay = (sale) => {
  if (sale?.saleDate) return String(sale.saleDate).slice(0, 10);
  if (sale?.soldAt) return String(sale.soldAt).slice(0, 10);
  return "";
};

const aggregateDailyRows = (sales) => {
  const grouped = new Map();
  (sales || []).forEach((sale) => {
    const dayKey = resolveSaleDay(sale);
    if (!dayKey) return;

    if (!grouped.has(dayKey)) {
      grouped.set(dayKey, {
        day: dayKey,
        salesCount: 0,
        totalItems: 0,
        totalAmount: 0,
        cashAmount: 0,
        cardAmount: 0,
        pendingDeposits: 0,
        voidCount: 0,
        testCount: 0,
      });
    }
    const row = grouped.get(dayKey);

    const status = String(sale.status || "").toUpperCase();
    if (status === "VOID") {
      row.voidCount += 1;
      return;
    }
    if (sale.testSale === true) {
      row.testCount += 1;
      return;
    }
    if (status !== "COMPLETED") return;

    row.salesCount += 1;
    row.totalItems += safeNumber(sale.totalItems);
    row.totalAmount += safeNumber(sale.totalAmount);

    const paymentMethod = String(sale.paymentMethod || "").toUpperCase();
    if (paymentMethod === "EFECTIVO") {
      row.cashAmount += safeNumber(sale.totalAmount);
    } else if (paymentMethod === "TARJETA" || paymentMethod === "TRANSFERENCIA") {
      row.cardAmount += safeNumber(sale.totalAmount);
    } else if (paymentMethod === "MIXTO") {
      row.cashAmount += safeNumber(sale.cashAmount);
      row.cardAmount += safeNumber(sale.cardAmount);
    }

    if (isSalePendingDeposit(sale)) {
      row.pendingDeposits += 1;
    }
  });

  return Array.from(grouped.values()).sort((a, b) => String(b.day).localeCompare(String(a.day)));
};

function KpiCard({ title, subtitle, metric, growthPercent, showGrowth }) {
  const amount = Number(metric?.amount || 0);
  const count = Number(metric?.count || 0);
  const growth = Number(growthPercent || 0);
  const growthUp = growth > 0;
  const growthDown = growth < 0;
  const growthClass = growthUp ? "up" : growthDown ? "down" : "neutral";

  return (
    <div className="kiosk-pos-kpi-card">
      <div className="kiosk-pos-kpi-title">{title}</div>
      {subtitle ? <div className="kiosk-pos-kpi-subtitle">{subtitle}</div> : null}
      <div className="kiosk-pos-kpi-value">{formatCurrency(amount)}</div>
      <div className="kiosk-pos-kpi-count">
        {count} {count === 1 ? "venta" : "ventas"}
      </div>
      {showGrowth ? (
        <div className={`kiosk-pos-kpi-growth ${growthClass}`}>
          {growthUp ? "▲" : growthDown ? "▼" : "—"} {formatGrowth(growthPercent)} vs mismo día año anterior
        </div>
      ) : null}
    </div>
  );
}

function PosManagerDashboard({ kioskLocationId, kioskName, active }) {
  const [dashboard, setDashboard] = useState(null);
  const [dailyRows, setDailyRows] = useState([]);
  const [periodLabel, setPeriodLabel] = useState({ startDate: "", endDate: "" });
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    if (!kioskLocationId) {
      setDashboard(null);
      setDailyRows([]);
      return;
    }
    try {
      setLoading(true);
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const startDate = toIsoDate(monthStart);
      const endDate = toIsoDate(now);
      const [data, sales] = await Promise.all([
        getKioskManagerDashboard(kioskLocationId),
        getMyKioskSales(startDate, endDate, kioskLocationId),
      ]);
      setDashboard(data || null);
      setDailyRows(aggregateDailyRows(sales));
      setPeriodLabel({ startDate, endDate });
    } catch (err) {
      setDashboard(null);
      setDailyRows([]);
      showError(err.message || "No se pudo cargar el resumen del kiosko.");
    } finally {
      setLoading(false);
    }
  }, [kioskLocationId]);

  useEffect(() => {
    if (active !== false) {
      loadDashboard();
    }
  }, [loadDashboard, active]);

  if (loading && !dashboard) {
    return (
      <div className="text-center py-4">
        <Spinner size="sm" /> Cargando resumen...
      </div>
    );
  }

  return (
    <div className="kiosk-pos-dashboard">
      <div className="kiosk-pos-dashboard-header">
        <h5 className="mb-0">Resumen de ventas{kioskName ? ` — ${kioskName}` : ""}</h5>
        {loading ? <Spinner size="sm" /> : null}
      </div>
      <Row className="kiosk-pos-dashboard-grid">
        <Col md="6" xl="3" className="mb-3 mb-xl-0">
          <KpiCard
            title="Hoy"
            metric={dashboard?.today}
            growthPercent={dashboard?.growthVsLastYearPercent}
            showGrowth
          />
        </Col>
        <Col md="6" xl="3" className="mb-3 mb-xl-0">
          <KpiCard
            title="Mismo día año anterior"
            metric={dashboard?.todayLastYear}
          />
        </Col>
        <Col md="6" xl="3" className="mb-3 mb-xl-0">
          <KpiCard
            title="Mes anterior"
            subtitle="Total del mes calendario previo"
            metric={dashboard?.lastMonth}
          />
        </Col>
        <Col md="6" xl="3" className="mb-3 mb-xl-0">
          <KpiCard
            title="Mes en curso"
            subtitle="Acumulado MTD"
            metric={dashboard?.monthToDate}
          />
        </Col>
      </Row>
      <Card className="kiosk-pos-dashboard-table-card mt-3">
        <CardBody>
          <div className="d-flex flex-wrap align-items-center justify-content-between mb-2">
            <h6 className="mb-1">Ventas por día</h6>
            <small className="text-muted">
              Rango: {periodLabel.startDate || "—"} a {periodLabel.endDate || "—"}
            </small>
          </div>
          <Table responsive size="sm" className="kiosk-pos-daily-sales-table mb-0">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="text-right">Ventas</th>
                <th className="text-right">Unidades</th>
                <th className="text-right">Total</th>
                <th className="text-right">Efectivo</th>
                <th className="text-right">Tarjeta</th>
                <th className="text-right">Depósitos pendientes</th>
                <th className="text-right">Anuladas</th>
                <th className="text-right">Prueba</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((row) => (
                <tr key={`day-${row.day}`}>
                  <td>{row.day}</td>
                  <td className="text-right">{row.salesCount}</td>
                  <td className="text-right">{formatQty(row.totalItems)}</td>
                  <td className="text-right">{formatCurrency(row.totalAmount)}</td>
                  <td className="text-right">{formatCurrency(row.cashAmount)}</td>
                  <td className="text-right">{formatCurrency(row.cardAmount)}</td>
                  <td className="text-right">{row.pendingDeposits}</td>
                  <td className="text-right">{row.voidCount}</td>
                  <td className="text-right">{row.testCount}</td>
                </tr>
              ))}
              {dailyRows.length === 0 && (
                <tr>
                  <td colSpan="9" className="text-center text-muted">
                    No hay ventas en el rango actual.
                  </td>
                </tr>
              )}
            </tbody>
            {dailyRows.length > 0 && (
              <tfoot>
                <tr>
                  <th>Total</th>
                  <th className="text-right">
                    {dailyRows.reduce((sum, row) => sum + row.salesCount, 0)}
                  </th>
                  <th className="text-right">
                    {formatQty(dailyRows.reduce((sum, row) => sum + row.totalItems, 0))}
                  </th>
                  <th className="text-right">
                    {formatCurrency(dailyRows.reduce((sum, row) => sum + row.totalAmount, 0))}
                  </th>
                  <th className="text-right">
                    {formatCurrency(dailyRows.reduce((sum, row) => sum + row.cashAmount, 0))}
                  </th>
                  <th className="text-right">
                    {formatCurrency(dailyRows.reduce((sum, row) => sum + row.cardAmount, 0))}
                  </th>
                  <th className="text-right">
                    {dailyRows.reduce((sum, row) => sum + row.pendingDeposits, 0)}
                  </th>
                  <th className="text-right">
                    {dailyRows.reduce((sum, row) => sum + row.voidCount, 0)}
                  </th>
                  <th className="text-right">
                    {dailyRows.reduce((sum, row) => sum + row.testCount, 0)}
                  </th>
                </tr>
              </tfoot>
            )}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default PosManagerDashboard;
