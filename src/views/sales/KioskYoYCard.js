import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardBody, Col, Row } from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import { getKioskCompare } from "services/kioskFinancialsService";
import { fmtMoney } from "utils/financeFormat";
import { DeltaChip } from "views/kiosks/finance/reports/common";
import useAsyncData from "views/kiosks/finance/reports/useAsyncData";
import "views/kiosks/finance/KioskFinance.css";

const FINANCE_VIEW_PERMISSION = "KIOSCOS.FINANZAS.VER";

/**
 * Widget compacto 'Kioscos vs año anterior' para el dashboard de ventas.
 * Falla en silencio: sin permiso, sin datos o con error de red no renderiza nada
 * (no altera el layout existente).
 */
export default function KioskYoYCard({ startDate, endDate }) {
  const navigate = useNavigate();
  const { hasPermission, initialized } = useAuth();
  const allowed = initialized && hasPermission(FINANCE_VIEW_PERMISSION);

  const year = Number(String(startDate || "").slice(0, 4));
  const fromMonth = Number(String(startDate || "").slice(5, 7));
  const endYear = Number(String(endDate || "").slice(0, 4));
  const endMonth = Number(String(endDate || "").slice(5, 7));
  const valid = Number.isFinite(year) && year > 2000 && fromMonth >= 1 && fromMonth <= 12;
  const toMonth = endYear === year && endMonth >= fromMonth ? endMonth : endYear > year ? 12 : fromMonth;

  const { data, error } = useAsyncData(
    () => getKioskCompare({ year, baseYear: year - 1, fromMonth, toMonth, mode: "SAME_PERIOD" }),
    [year, fromMonth, toMonth],
    { enabled: allowed && valid }
  );

  const totals = data?.totals;
  if (!allowed || !valid || error || !totals) return null;

  const hasBase = typeof totals.baseSales === "number" && totals.baseSales > 0;
  return (
    <Row className="mt-2 kfin">
      <Col md="4">
        <Card className="h-100">
          <CardBody>
            <div className="d-flex justify-content-between align-items-start">
              <h6 className="mb-2">Kioscos vs año anterior</h6>
              <small className="text-muted">mismo periodo</small>
            </div>
            <h3>{fmtMoney(totals.sales)}</h3>
            {hasBase ? (
              <>
                <DeltaChip delta={totals.deltaPct} suffix={`vs ${year - 1}`} />
                <div className="mt-2 text-muted">
                  <small>
                    {year - 1}: {fmtMoney(totals.baseSales)}
                  </small>
                </div>
              </>
            ) : (
              <DeltaChip delta={null} />
            )}
            <div className="mt-1">
              <Button color="link" className="p-0 align-baseline" onClick={() => navigate("/admin/kiosk-financials")}>
                Ver finanzas por kiosco
              </Button>
            </div>
          </CardBody>
        </Card>
      </Col>
    </Row>
  );
}
