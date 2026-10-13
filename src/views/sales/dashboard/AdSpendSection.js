import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "contexts/AuthContext";
import { bulkSaveAdSpend, getAdSpendReport, saveAdSpend } from "services/onlineAdSpendService";
import { fmtMoney } from "utils/financeFormat";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { BlockSkeleton, KButton, KpiSkeleton } from "views/kiosks/finance/reports/common";
import SalesAsyncBoundary from "./SalesAsyncBoundary";
import AdSpendChart from "./AdSpendChart";
import AdSpendKpis from "./AdSpendKpis";
import AdSpendQuickAdd from "./AdSpendQuickAdd";
import AdSpendTable from "./AdSpendTable";
import useAdSpendDrafts from "./useAdSpendDrafts";
import useSalesQuery from "./useSalesQuery";
import {
  AD_SPEND_EDIT_PERMISSION,
  MAX_REPORT_DAYS,
  countNoSpendDays,
  describeBulkResult,
  longDateEs,
  noSpendWarning,
  normalizeReport,
  rangeDayCount,
} from "./adSpendHelpers";
import { describePeriod } from "./salesDashboardHelpers";

const NO_DAYS = [];

function SectionSkeleton() {
  return (
    <div role="status" aria-label="Cargando publicidad vs ventas">
      <KpiSkeleton count={5} />
      <BlockSkeleton height={280} />
    </div>
  );
}

function Message({ message, onClose }) {
  if (!message) return null;
  return (
    <div
      className={`sdash-ad-msg sdash-ad-msg--${message.kind}`}
      role={message.kind === "danger" ? "alert" : "status"}
    >
      <span>{message.text}</span>
      <button type="button" className="sdash-ad-msg-close" onClick={onClose} aria-label="Cerrar mensaje">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

/**
 * 'Publicidad vs ventas': inversión diaria en publicidad contra la venta total online de cada día.
 * Consulta GET /api/sales/online/ad-spend/report con el rango del dashboard (sin la caché del dashboard) y la vuelve
 * a pedir al pulsar Actualizar o tras guardar. Captura: fila por fila (POST /ad-spend/bulk, solo lo que cambió) o
 * rápida (PUT /ad-spend/{fecha}). Editar requiere el mismo permiso que editar ventas online.
 */
export default function AdSpendSection({ startDate, endDate, refreshToken, onDirtyChange }) {
  const { hasPermission, initialized } = useAuth();
  const canEdit = Boolean(initialized && hasPermission(AD_SPEND_EDIT_PERMISSION));
  const [today] = useState(getTodayYmdGuatemala);
  const dayCount = rangeDayCount(startDate, endDate);
  const tooLong = dayCount > MAX_REPORT_DAYS;

  const query = useSalesQuery(getAdSpendReport, { startDate, endDate, refreshToken, enabled: !tooLong });
  const { reload } = query;
  const report = useMemo(() => normalizeReport(query.data), [query.data]);
  const days = report ? report.days : NO_DAYS;
  const { drafts, byDate, summary, previewTotals, change, discard, drop } = useAdSpendDrafts(days);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [exporting, setExporting] = useState("");
  /** Fechas guardadas que esperan a que termine la recarga para soltar su borrador (evita el parpadeo del valor viejo). */
  const [awaiting, setAwaiting] = useState(null);
  const printRef = useRef(null);

  useEffect(() => {
    if (awaiting && !query.loading) {
      drop(awaiting);
      setAwaiting(null);
    }
  }, [awaiting, query.loading, drop]);

  // Aviso al contenedor (pestañas) y al navegador (cerrar/recargar) mientras haya cambios sin guardar.
  const hasPending = summary.pending > 0;
  useEffect(() => {
    if (!onDirtyChange) return undefined;
    onDirtyChange(hasPending);
    return () => onDirtyChange(false);
  }, [hasPending, onDirtyChange]);
  useEffect(() => {
    if (!hasPending) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasPending]);

  const saveAll = async () => {
    if (saving || !summary.canSave) return;
    const entries = summary.entries;
    setSaving(true);
    setMessage(null);
    try {
      const result = await bulkSaveAdSpend(entries);
      const text = describeBulkResult(result || {});
      showSuccess(text);
      setMessage({ kind: "success", text });
      setAwaiting(entries.map((e) => e.date));
      reload();
    } catch (error) {
      const text = (error && error.message) || "No se pudieron guardar los cambios de inversión.";
      showError(text);
      setMessage({ kind: "danger", text: `${text} No se guardó nada: tus cambios siguen en la tabla.` });
    } finally {
      setSaving(false);
    }
  };

  const quickSave = useCallback(
    async ({ date, amount, notes }) => {
      setMessage(null);
      try {
        await saveAdSpend(date, { amount, notes });
      } catch (error) {
        const text = (error && error.message) || "No se pudo guardar la inversión.";
        showError(text);
        setMessage({ kind: "danger", text });
        throw error;
      }
      const inRange = date >= startDate && date <= endDate;
      const label = longDateEs(date, { withYear: date.slice(0, 4) !== today.slice(0, 4) });
      const text = `Se guardó la inversión de ${fmtMoney(amount)} del ${label}.${
        inRange ? "" : " Esa fecha está fuera del rango que estás viendo, por eso no aparece en la tabla."
      }`;
      showSuccess(text);
      setMessage({ kind: "success", text });
      drop([date]);
      if (inRange && !tooLong) reload();
    },
    [startDate, endDate, today, tooLong, drop, reload]
  );

  const period = describePeriod(startDate, endDate);
  const warning = useMemo(() => noSpendWarning(countNoSpendDays(days, today)), [days, today]);
  const fileBase = `publicidad-vs-ventas-online_${report ? report.startDate : startDate}_${report ? report.endDate : endDate}`;
  const canExport = Boolean(report) && !query.loading && !hasPending && !exporting;

  const exportExcel = async () => {
    if (!canExport) return;
    setExporting("xlsx");
    try {
      const { exportAdSpendExcel } = await import("./adSpendExport");
      const name = exportAdSpendExcel(report);
      showSuccess(`Se descargó ${name}.`);
    } catch (error) {
      showError("No se pudo generar el Excel.");
    } finally {
      setExporting("");
    }
  };

  const exportPdf = async () => {
    if (!canExport || !printRef.current) return;
    setExporting("pdf");
    try {
      const { downloadElementPdf } = await import("utils/kioskFinancialsExport");
      await downloadElementPdf(printRef.current, {
        title: `Publicidad vs ventas online · ${period}`,
        filename: `${fileBase}.pdf`,
      });
    } catch (error) {
      showError("No se pudo generar el PDF.");
    } finally {
      setExporting("");
    }
  };

  const exportHint = hasPending ? "Guarda o descarta los cambios pendientes para exportar." : undefined;

  return (
    <section className="sdash-ad" aria-labelledby="sdash-ad-title">
      <header className="sdash-ad-head">
        <div>
          <h5 id="sdash-ad-title" className="sdash-ad-title">
            Publicidad vs ventas
          </h5>
          <p className="sdash-ad-sub">{period} · venta online de cada día contra lo invertido en publicidad</p>
        </div>
        <div className="kfin-card-actions kfin-noprint">
          <KButton large onClick={exportExcel} disabled={!canExport} title={exportHint}>
            {exporting === "xlsx" ? "Generando…" : "Exportar Excel"}
          </KButton>
          <KButton large onClick={exportPdf} disabled={!canExport} title={exportHint}>
            {exporting === "pdf" ? "Generando…" : "Exportar PDF"}
          </KButton>
        </div>
      </header>

      <div className="sdash-def" role="note">
        <b>Resultado = venta online − inversión en publicidad.</b> No incluye el costo de producción de los productos
        ni otros gastos, así que no es la utilidad del negocio. Se registra un solo monto por día (todas las
        plataformas) y se compara con la venta total online de ese día.
      </div>

      <Message message={message} onClose={() => setMessage(null)} />

      {canEdit ? <AdSpendQuickAdd today={today} byDate={byDate} rangeLoaded={Boolean(report)} onSubmit={quickSave} /> : null}

      {tooLong ? (
        <div className="sdash-ad-msg sdash-ad-msg--info" role="note">
          El reporte de publicidad admite un máximo de {MAX_REPORT_DAYS} días y el rango elegido tiene {dayCount}. Acorta
          el rango para ver y editar la inversión día por día.
        </div>
      ) : (
        <SalesAsyncBoundary
          query={query}
          isEmpty={() => !report || !report.days.length}
          emptyTitle="Sin días en el periodo"
          emptyText="El rango seleccionado no tiene días para comparar."
          skeleton={<SectionSkeleton />}
        >
          {() =>
            report ? (
              <div ref={printRef} className="sdash-ad-body">
                <AdSpendKpis totals={report.totals} />
                {warning ? (
                  <div className="sdash-ad-warning" role="status">
                    <span aria-hidden="true">⚠</span> {warning}
                  </div>
                ) : null}
                <AdSpendChart days={days} totals={report.totals} today={today} periodLabel={period} />
                <AdSpendTable
                  days={days}
                  totals={report.totals}
                  drafts={drafts}
                  summary={summary}
                  previewTotals={previewTotals}
                  canEdit={canEdit}
                  saving={saving}
                  today={today}
                  periodLabel={period}
                  onChange={change}
                  onSave={saveAll}
                  onDiscard={discard}
                />
              </div>
            ) : null
          }
        </SalesAsyncBoundary>
      )}
    </section>
  );
}
