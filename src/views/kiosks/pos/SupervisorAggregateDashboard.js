import React, { useCallback, useEffect, useState } from "react";
import { Card, CardBody, Progress, Spinner, Table } from "reactstrap";
import { getSupervisorAggregateDashboard } from "services/kioskGoalService";
import { showError } from "utils/notificationHelper";
import { formatCurrency } from "./posUtils";

const COMMISSION_TIER_LABELS = {
  NONE: "Sin comisión aún (mín. 70%)",
  TIER1: "70–89%: 2% de lo vendido",
  TIER2: "90–99%: Q100 + 2% de lo vendido",
  TIER3: "≥100%: Q200 + 2% de lo vendido",
};

function SupervisorAggregateDashboard({ active }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSupervisorAggregateDashboard();
      setDashboard(data || null);
    } catch (err) {
      setDashboard(null);
      showError(err.message || "No se pudo cargar el resumen de supervisión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active !== false) {
      loadDashboard();
    }
  }, [loadDashboard, active]);

  if (loading && !dashboard) {
    return (
      <div className="text-center py-4">
        <Spinner size="sm" /> Cargando resumen de supervisión...
      </div>
    );
  }

  const percent = Number(dashboard?.percentAchieved || 0);
  const progressValue = Math.max(0, Math.min(100, percent));
  const progressColor = percent >= 100 ? "success" : percent >= 90 ? "info" : percent >= 70 ? "warning" : "secondary";
  const hasAggregateGoal = dashboard?.aggregateGoalAmount != null;
  const tierLabel = COMMISSION_TIER_LABELS[dashboard?.commissionTier] || COMMISSION_TIER_LABELS.NONE;

  return (
    <div className="kiosk-pos-dashboard">
      <div className="kiosk-pos-dashboard-header">
        <h5 className="mb-0">Mi supervisión — kioskos asignados</h5>
        {loading ? <Spinner size="sm" /> : null}
      </div>

      <Card className="mt-3">
        <CardBody>
          <h6 className="mb-2">Total agregado del mes</h6>
          {!hasAggregateGoal ? (
            <div className="text-muted">
              Ninguno de tus kioskos asignados tiene meta configurada para este mes.
            </div>
          ) : (
            <>
              <div className="h4 mb-0">
                {formatCurrency(dashboard?.aggregateSoldAmount)} de {formatCurrency(dashboard?.aggregateGoalAmount)}{" "}
                ({percent.toFixed(1)}%)
              </div>
              <Progress value={progressValue} color={progressColor} className="my-2" style={{ height: "10px" }} />
              <div>
                <strong>{tierLabel}</strong>
                {Number(dashboard?.commissionAmount || 0) > 0 && (
                  <div>Comisión del mes: {formatCurrency(dashboard?.commissionAmount)}</div>
                )}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card className="mt-3">
        <CardBody>
          <h6 className="mb-2">Desglose por kiosko</h6>
          <Table responsive size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Kiosko</th>
                <th className="text-right">Meta</th>
                <th className="text-right">Vendido</th>
                <th className="text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard?.kiosks || []).map((kiosk) => (
                <tr key={kiosk.kioskLocationId}>
                  <td>{kiosk.kioskName}</td>
                  <td className="text-right">
                    {kiosk.hasGoalConfigured ? formatCurrency(kiosk.goalAmount) : "Sin meta"}
                  </td>
                  <td className="text-right">{formatCurrency(kiosk.soldAmount)}</td>
                  <td className="text-right">
                    {kiosk.hasGoalConfigured ? `${Number(kiosk.percentAchieved || 0).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              {(dashboard?.kiosks || []).length === 0 && (
                <tr>
                  <td colSpan="4" className="text-center text-muted">
                    No tienes kioskos asignados. Pide a administración que te asigne kioskos en
                    "Supervisoras y kioskos".
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default SupervisorAggregateDashboard;
