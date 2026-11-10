import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Spinner, Table } from "reactstrap";
import {
  calculateCommissions, closeCommissionMonth, createSeller, getCommissions, getMissingSellers,
} from "services/reconciliationService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatQ, monthOf, monthRange } from "utils/reconciliationHelper";

/**
 * Comisión del vendedor: 2% del neto sin envío. Se calcula sobre lo ya conciliado, se registra en el sistema y se
 * congela cuando todo el mes está revisado. No cambia lo que se espera recibir de ninguna venta.
 */
const ReconCommissionsTab = ({ filters, version, perms, onGoInbox, onChanged }) => {
  const [month, setMonth] = useState(monthOf(filters.to) || monthOf(new Date().toISOString()));
  const [summary, setSummary] = useState(null);
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [s, m] = await Promise.all([getCommissions(month), getMissingSellers()]);
      setSummary(s);
      setMissing(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load, version]);

  const act = async (fn, okText) => {
    setBusy(true);
    try {
      const r = await fn();
      showSuccess(okText);
      if (r && r.sellers) setSummary(r);
      await load();
      onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="text-muted">Regla: 2% sobre el monto sin envío. Una devolución no paga comisión. Un cambio paga solo por la diferencia contra la venta anterior. No hay fecha de pago fija: se cierra cuando el mes está revisado.</p>
      <div className="d-flex flex-wrap align-items-end mb-3" style={{ gap: 12 }}>
        <div><label htmlFor="c-month" className="small text-muted mb-0 d-block">Mes</label><Input id="c-month" type="month" bsSize="sm" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <Button size="sm" outline disabled={!perms.commissions || busy || !month} onClick={() => act(() => calculateCommissions(month), "Comisiones calculadas con lo conciliado")}>Calcular</Button>
        <Button size="sm" color="primary" disabled={!perms.commissions || busy || !summary || !summary.canClose} onClick={() => act(() => closeCommissionMonth(month), "Comisiones del mes cerradas y congeladas")}>Cerrar comisiones del mes</Button>
        {summary && summary.closed && <Badge color="success">Mes cerrado</Badge>}
      </div>
      {error && <Alert color="danger">{error}</Alert>}
      {missing.length > 0 && (
        <Alert color="warning">
          Hay vendedores en las ventas que no están en el catálogo. Sin catálogo no se asigna su comisión y no se puede cerrar el mes:
          {missing.map((n) => (
            <Button key={n} size="sm" outline className="ml-2" disabled={!perms.commissions || busy} onClick={() => act(() => createSeller(n), `Vendedor «${n}» agregado al catálogo`)}>Agregar «{n}»</Button>
          ))}
        </Alert>
      )}
      {loading && !summary && <div className="text-center p-3"><Spinner size="sm" /></div>}
      {summary && (
        <>
          <Alert color={summary.pendingCases > 0 ? "info" : "success"} className="py-2">
            {summary.pendingCases > 0
              ? <>Faltan <strong>{summary.pendingCases}</strong> casos por conciliar o excluir antes de cerrar el mes. <Button size="sm" color="link" onClick={() => onGoInbox({ ...monthRange(month), status: "PENDIENTE_REVISION,CON_DIFERENCIAS,INFORMACION_INCOMPLETA,POSIBLE_DUPLICADO,REQUIERE_AUTORIZACION" })}>Ver pendientes</Button></>
              : "Todos los casos del mes están conciliados o excluidos."}
            {summary.casesWithoutSeller > 0 && <> {summary.casesWithoutSeller} caso(s) con vendedor fuera del catálogo.</>}
          </Alert>
          {summary.sellers.length === 0 ? (
            <div className="recon-empty"><h5>Sin comisiones calculadas</h5><p>Solo se calcula la comisión de ventas ya conciliadas. Concilie casos del mes y pulse «Calcular».</p></div>
          ) : (
            <Table size="sm" className="recon-table">
              <thead><tr><th>Vendedor</th><th className="num">Ventas</th><th className="num">Base (sin envío)</th><th className="num">Tasa</th><th className="num">Comisión</th><th className="num">Anuladas por devolución</th></tr></thead>
              <tbody>
                {summary.sellers.map((s) => (
                  <tr key={s.sellerId}><td><strong>{s.seller}</strong></td><td className="num">{s.cases}</td><td className="num">{formatQ(s.base)}</td><td className="num">{(Number(s.rate) * 100).toFixed(0)}%</td><td className="num"><strong>{formatQ(s.commission)}</strong></td><td className="num">{s.annulled}</td></tr>
                ))}
                <tr><td colSpan={4}><strong>Total</strong></td><td className="num"><strong>{formatQ(summary.totalCommission)}</strong></td><td /></tr>
              </tbody>
            </Table>
          )}
        </>
      )}
    </>
  );
};

export default ReconCommissionsTab;
