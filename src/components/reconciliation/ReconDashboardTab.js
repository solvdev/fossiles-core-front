import React, { useEffect, useState } from "react";
import { Alert, Card, CardBody, CardHeader, CardTitle, Col, Row, Spinner, Table } from "reactstrap";
import { getDashboard } from "services/reconciliationService";
import {
  CARRIER_LABELS, METHOD_LABELS, PROBLEM_LABELS, formatQ, labelOf,
} from "utils/reconciliationHelper";

const Kpi = ({ label, value, hint, onClick }) => (
  <button type="button" className="recon-kpi" onClick={onClick}>
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    <div className="hint">{hint}</div>
  </button>
);

const Buckets = ({ title, buckets, labels }) => (
  <Card>
    <CardHeader><CardTitle tag="h6" className="mb-0">{title}</CardTitle></CardHeader>
    <CardBody>
      {buckets.length === 0 ? <p className="text-muted mb-0">Sin datos en este filtro.</p> : buckets.map((b) => {
        const w = (n) => `${b.cases ? (n / b.cases) * 100 : 0}%`;
        return (
          <div key={b.key} className="mb-2">
            <div className="d-flex justify-content-between small">
              <span>{labelOf(labels, b.key)}</span><span className="text-muted">{b.cases} casos · {formatQ(b.expected)}</span>
            </div>
            <div className="recon-bar" role="img" aria-label={`${labelOf(labels, b.key)}: ${b.reconciled} conciliados, ${b.pending} pendientes, ${b.withDifferences} con diferencias, ${b.incomplete} incompletos`}>
              <i className="ok" style={{ width: w(b.reconciled) }} /><i className="pending" style={{ width: w(b.pending) }} />
              <i className="bad" style={{ width: w(b.withDifferences) }} /><i className="info" style={{ width: w(b.incomplete) }} />
            </div>
          </div>
        );
      })}
    </CardBody>
  </Card>
);

/** Indicadores reales del filtro actual; cada tarjeta lleva a la bandeja ya filtrada. */
const ReconDashboardTab = ({ filters, version, onGoInbox, onGoTab }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getDashboard(filters)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filters, version]);

  if (loading && !data) return <div className="text-center p-4"><Spinner /></div>;
  if (error) return <Alert color="danger">{error}</Alert>;
  if (!data) return null;
  const total = Object.values(data.byStatus).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="recon-empty">
        <h5>Todavía no hay casos en este filtro</h5>
        <p>Empiece generando los casos del período (menú Herramientas), después importe los fondos de la liquidación y revise en la bandeja.</p>
      </div>
    );
  }
  const problems = Object.entries(data.byProblem).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <Row className="mb-3">
        <Col md={3} sm={6} className="mb-2"><Kpi label="Pendientes de revisión" value={data.pending} hint="Con advertencias, sin diferencia de monto" onClick={() => onGoInbox({ status: "PENDIENTE_REVISION" })} /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Conciliadas" value={data.reconciled} hint="Automáticas, manuales y con ajuste" onClick={() => onGoInbox({ status: "CONCILIADO_AUTO,CONCILIADO_MANUAL,CONCILIADO_CON_AJUSTE" })} /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Con diferencias" value={data.withDifferences} hint="Monto, duplicado o ajuste por autorizar" onClick={() => onGoInbox({ status: "CON_DIFERENCIAS,REQUIERE_AUTORIZACION,POSIBLE_DUPLICADO" })} /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Información incompleta" value={data.incomplete} hint="Falta guía, referencia o fondo" onClick={() => onGoInbox({ status: "INFORMACION_INCOMPLETA" })} /></Col>
      </Row>
      <Row className="mb-3">
        <Col md={3} sm={6} className="mb-2"><Kpi label="Monto esperado" value={formatQ(data.expected)} hint="Cobrado al cliente (productos + envío)" /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Monto recibido" value={formatQ(data.received)} hint="Fondos aplicados" /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Diferencias pendientes" value={formatQ(data.pendingDifferences)} hint="|recibido − cobrado| sin resolver" onClick={() => onGoInbox({ status: "CON_DIFERENCIAS,REQUIERE_AUTORIZACION" })} /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Por recibir" value={formatQ(data.awaitingFunds)} hint="Ventas sin fondo aplicado todavía" onClick={() => onGoInbox({ status: "INFORMACION_INCOMPLETA" })} /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Comisiones por validar" value={data.commissionsToValidate} hint="Conciliadas sin comisión congelada" onClick={() => onGoTab("commissions")} /></Col>
        <Col md={3} sm={6} className="mb-2"><Kpi label="Fondos sin aplicar" value={data.unappliedReceipts} hint="Fondos recibidos sin venta asociada" onClick={() => onGoTab("differences")} /></Col>
      </Row>
      <Row>
        <Col md={4} className="mb-3"><Buckets title="Por método de pago" buckets={data.byMethod} labels={METHOD_LABELS} /></Col>
        <Col md={4} className="mb-3"><Buckets title="Por transportista" buckets={data.byCarrier} labels={CARRIER_LABELS} /></Col>
        <Col md={4} className="mb-3">
          <Card>
            <CardHeader><CardTitle tag="h6" className="mb-0">Problemas abiertos por tipo</CardTitle></CardHeader>
            <CardBody>
              {problems.length === 0 ? <p className="text-muted mb-0">Sin diferencias abiertas.</p> : (
                <Table size="sm" className="mb-0"><tbody>
                  {problems.map(([k, n]) => (
                    <tr key={k}><td>{PROBLEM_LABELS[k] || k}</td><td className="text-right"><a href="#differences" onClick={(e) => { e.preventDefault(); onGoTab("differences", k); }}>{n}</a></td></tr>
                  ))}
                </tbody></Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      <div className="recon-legend">
        <span><b style={{ background: "#18a05c" }} />Conciliado</span><span><b style={{ background: "#e0a419" }} />Pendiente</span>
        <span><b style={{ background: "#c2410c" }} />Con diferencias</span><span><b style={{ background: "#1e7fa0" }} />Información incompleta</span>
      </div>
    </>
  );
};

export default ReconDashboardTab;
