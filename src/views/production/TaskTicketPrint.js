import React, { useState, useEffect, useRef } from "react";
import { Button, Spinner } from "reactstrap";
import { getTaskTicket, getTicketsByProductionOrder } from "services/taskService";
import { showError } from "utils/notificationHelper";
import { formatDateGt, formatDateTimeGt } from "utils/dateTimeHelper";
import { deskDisplayLabel, resolveDeskSupervisorNameForTicket } from "utils/deskSupervisorDisplay";
import {
  addWorkDurationSkippingLunch,
  formatProductionDuration,
} from "utils/productionTimeHelper";

/**
 * Hoja de estilos de la boleta. La usan tanto la vista previa en pantalla como la
 * ventana de impresión, de modo que lo que ve el usuario es lo que sale impreso.
 * Todo cuelga de `.tkt-root` para no afectar al resto de la aplicación.
 */
const TICKET_STYLESHEET = `
  .tkt-root {
    --tkt-ink: #2c2c2c;
    --tkt-muted: #8b8b8b;
    --tkt-line: #e0e0e0;
    --tkt-rule: #333;
    --tkt-soft: #f7f8f9;
    --tkt-accent: #51cbce;
    --tkt-danger: #ef8157;
    color: var(--tkt-ink);
    font-family: "Montserrat", "Helvetica Neue", Arial, sans-serif;
    font-size: 12px;
    line-height: 1.45;
  }

  .tkt-root .ticket {
    background: #fff;
    border: 1px solid var(--tkt-line);
    border-radius: 8px;
    padding: 20px 22px;
    margin-bottom: 18px;
  }
  .tkt-root .ticket:last-child { margin-bottom: 0; }

  .tkt-root .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 2px solid var(--tkt-rule);
    padding-bottom: 10px;
    margin-bottom: 14px;
  }
  .tkt-root .header h1 {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    margin: 0;
    color: var(--tkt-muted);
  }
  .tkt-root .header h2 {
    font-size: 22px;
    font-weight: 700;
    margin: 0;
    letter-spacing: .02em;
  }

  .tkt-root .tkt-kpis {
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }
  .tkt-root .highlight {
    background: var(--tkt-soft);
    border: 1px solid var(--tkt-line);
    border-radius: 6px;
    padding: 8px 12px;
    text-align: center;
    min-width: 0;
  }
  .tkt-root .highlight > div:first-child {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: .09em;
    text-transform: uppercase;
    color: var(--tkt-muted);
    margin-bottom: 2px;
  }
  .tkt-root .highlight .big {
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }
  /* La mesa con nombre de encargado necesita menos cuerpo para no romper la caja. */
  .tkt-root .highlight .big--sm { font-size: 14px; }

  .tkt-root .info-grid,
  .tkt-root .end-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 24px;
    padding-bottom: 12px;
    margin-bottom: 12px;
    border-bottom: 1px dashed var(--tkt-line);
  }
  .tkt-root .end-grid { border-bottom: 0; margin-bottom: 0; }
  .tkt-root .info-item { display: flex; gap: 6px; min-width: 0; }
  .tkt-root .info-label { font-weight: 600; color: var(--tkt-muted); white-space: nowrap; }
  .tkt-root .info-value { overflow-wrap: anywhere; }

  .tkt-root .notes-section {
    background: var(--tkt-soft);
    border-left: 3px solid var(--tkt-accent);
    border-radius: 0 4px 4px 0;
    padding: 8px 12px;
    margin-bottom: 14px;
    font-size: 11px;
  }
  .tkt-root .tkt-notes-label { font-weight: 700; }

  .tkt-root .section-title {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .09em;
    text-transform: uppercase;
    color: var(--tkt-muted);
    border-bottom: 1px solid var(--tkt-rule);
    padding-bottom: 4px;
    margin-bottom: 10px;
  }

  .tkt-root .tkt-table-wrap { overflow-x: auto; margin-bottom: 12px; }
  .tkt-root .tkt-table-title {
    font-weight: 700;
    font-size: 11px;
    margin-bottom: 5px;
  }
  .tkt-root .tkt-row-total td {
    font-weight: 700;
    background: var(--tkt-soft);
    border-top: 1px solid var(--tkt-rule);
  }
  .tkt-root .tkt-grand-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border: 1px solid var(--tkt-rule);
    border-radius: 6px;
    background: var(--tkt-soft);
    padding: 9px 14px;
    margin-bottom: 14px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .tkt-root .tkt-grand-total strong { font-size: 15px; letter-spacing: 0; }
  .tkt-root table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .tkt-root th {
    background: var(--tkt-soft);
    text-align: left;
    font-weight: 700;
    font-size: 9px;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: var(--tkt-muted);
    padding: 6px 8px;
    border-bottom: 1px solid var(--tkt-rule);
    white-space: nowrap;
  }
  .tkt-root td { padding: 6px 8px; border-bottom: 1px solid var(--tkt-line); }
  .tkt-root td.number, .tkt-root th.number { text-align: right; white-space: nowrap; }
  .tkt-root tbody tr:last-child td { border-bottom: 0; }

  .tkt-root .observations-area { margin-top: 4px; }
  .tkt-root .tkt-breakdown { font-size: 11px; color: #5b5b5b; margin-bottom: 6px; }
  .tkt-root .tkt-empty {
    text-align: center;
    color: var(--tkt-muted);
    font-size: 11px;
    padding: 14px 0;
    margin: 0 0 12px;
    border: 1px dashed var(--tkt-line);
    border-radius: 6px;
  }
  .tkt-root .obs-lines { margin-top: 10px; }
  .tkt-root .obs-line {
    border-bottom: 1px solid var(--tkt-line);
    height: 22px;
  }

  .tkt-root .late-badge {
    background: #fdf0ea;
    border: 1px solid var(--tkt-danger);
    color: #a8442a;
    border-radius: 6px;
    padding: 8px 12px;
    margin-top: 12px;
    font-size: 11px;
    font-weight: 600;
    text-align: center;
  }

  .tkt-root .signature-area {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
    margin-top: 34px;
  }
  .tkt-root .signature-line { text-align: center; }
  .tkt-root .signature-line hr {
    border: 0;
    border-top: 1px solid var(--tkt-rule);
    margin: 0 0 5px;
  }
  .tkt-root .signature-line span {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--tkt-muted);
  }

  .tkt-root .footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid var(--tkt-line);
    font-size: 9px;
    color: var(--tkt-muted);
  }

  /* Solo pantalla: en papel el ancho lo fija la hoja, no la ventana del navegador. */
  @media screen and (max-width: 600px) {
    .tkt-root .header { flex-direction: column; align-items: flex-start; gap: 2px; }
    .tkt-root .tkt-kpis,
    .tkt-root .info-grid,
    .tkt-root .end-grid,
    .tkt-root .signature-area { grid-template-columns: minmax(0, 1fr); }
    .tkt-root .signature-area { gap: 22px; }
    .tkt-root .ticket { padding: 14px; }
  }
`;

/**
 * Ajustes exclusivos del documento que se manda a la impresora.
 *
 * Orientación vertical: la boleta es un formulario en columna. El HTML anterior no
 * declaraba ninguna regla @page, así que la orientación quedaba a lo que tuviera
 * puesto el navegador o la impresora. Aquí se fija, pero no el tamaño de papel, para
 * que siga valiendo tanto A4 como Carta.
 *
 * Los bloques de cierre llevan `page-break-inside: avoid`: cuando una boleta con muchos
 * productos necesite una segunda hoja, el corte cae entre filas y no parte firmás ni pie.
 */
const PRINT_ONLY_STYLESHEET = `
  @page { size: portrait; margin: 12mm; }
  body { margin: 0; background: #fff; }
  .tkt-root { font-size: 11px; }
  .tkt-root .ticket {
    border: 1px solid #333;
    border-radius: 0;
    margin-bottom: 0;
    padding: 18px 20px;
    page-break-after: always;
  }
  .tkt-root .ticket:last-child { page-break-after: auto; }

  .tkt-root .header { padding-bottom: 9px; margin-bottom: 13px; }
  .tkt-root .tkt-kpis { gap: 10px; margin-bottom: 13px; }
  .tkt-root .highlight { padding: 8px 10px; }
  .tkt-root .info-grid { gap: 5px 24px; padding-bottom: 11px; margin-bottom: 12px; }
  .tkt-root .notes-section { padding: 8px 11px; margin-bottom: 13px; }
  .tkt-root .section-title { margin-bottom: 9px; }
  .tkt-root .tkt-table-wrap { overflow-x: visible; margin-bottom: 12px; }
  .tkt-root td, .tkt-root th { padding: 5px 7px; }
  .tkt-root .tkt-grand-total { padding: 8px 12px; margin-bottom: 13px; }
  .tkt-root .obs-line { height: 20px; }
  .tkt-root .signature-area { margin-top: 28px; }
  .tkt-root .footer { margin-top: 14px; padding-top: 7px; }

  /* Rejilla completa: la boleta se rellena a mano en la mesa y las divisiones ayudan. */
  .tkt-root table, .tkt-root td, .tkt-root th { border: 1px solid #bdbdbd; }
  .tkt-root th { border-bottom-color: #333; }

  .tkt-root .tkt-kpis,
  .tkt-root .tkt-grand-total,
  .tkt-root .observations-area,
  .tkt-root .end-grid,
  .tkt-root .signature-area,
  .tkt-root .footer { page-break-inside: avoid; }
  .tkt-root tr { page-break-inside: avoid; }
  /* Si la lista de productos se parte, la cabecera se repite en la hoja siguiente. */
  .tkt-root thead { display: table-header-group; }

  .tkt-root .highlight { background: #f2f2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .tkt-root th { background: #f2f2f2 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
`;

function TaskTicketPrint({ taskId, taskIds, productionOrderId, supervisorByDesk, onClose, autoPrintOnLoad }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();
  const autoPrintedRef = useRef(false);
  const taskIdsKey = taskIds?.length ? taskIds.join(",") : "";

  useEffect(() => {
    autoPrintedRef.current = false;
    loadTickets();
  }, [taskId, productionOrderId, taskIdsKey]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setTickets([]);
      if (taskId) {
        const ticket = await getTaskTicket(taskId);
        setTickets([ticket]);
      } else if (taskIds?.length) {
        const results = await Promise.all(
          taskIds.map((id) => getTaskTicket(id).catch(() => null))
        );
        const loaded = results.filter(Boolean);
        setTickets(loaded);
        if (loaded.length < taskIds.length) {
          showError("Algunas boletas no pudieron cargarse.");
        }
      } else if (productionOrderId) {
        const data = await getTicketsByProductionOrder(productionOrderId);
        setTickets(data || []);
      }
    } catch (err) {
      showError(err.message || "Error al cargar boleta");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      showError("El navegador bloqueó la ventana de impresión. Habilite las ventanas emergentes para este sitio.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Boleta de Tarea</title>
          <style>${TICKET_STYLESHEET}${PRINT_ONLY_STYLESHEET}</style>
        </head>
        <body>
          <div class="tkt-root">${printContent.innerHTML}</div>
        </body>
      </html>
    `);
    printWindow.document.close();

    // El diálogo se lanza solo cuando el documento terminó de pintarse; cerrarlo antes
    // deja la vista previa en blanco. El cierre queda atado a onafterprint, y si el
    // navegador no lo emite la ventana permanece abierta en vez de desaparecer.
    const launchPrint = () => {
      printWindow.focus();
      printWindow.print();
    };
    printWindow.onafterprint = () => printWindow.close();

    if (printWindow.document.readyState === "complete") {
      printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(launchPrint));
    } else {
      printWindow.addEventListener("load", launchPrint, { once: true });
    }
  };

  useEffect(() => {
    if (!autoPrintOnLoad || loading || tickets.length === 0 || autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    // Un frame de margen para que printRef ya tenga el contenido montado.
    const raf = requestAnimationFrame(() => handlePrint());
    return () => cancelAnimationFrame(raf);
  }, [autoPrintOnLoad, loading, tickets]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return formatDateGt(dateStr);
  };

  const formatDateTime = (dtStr) => {
    if (!dtStr) return "-";
    return formatDateTimeGt(dtStr);
  };

  /**
   * Momento real de arranque. Se toma de `startedAt`, que fija el backend al pulsar
   * Iniciar; `scheduledDate + startTime` solo sirve de respaldo para boletas antiguas
   * y da la fecha equivocada si la tarea se inicia un día distinto al programado.
   */
  const resolveStart = (ticket) => {
    if (ticket.startedAt) {
      const d = new Date(ticket.startedAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
    if (!ticket.scheduledDate || !ticket.startTime) return null;
    const [hh, mm] = ticket.startTime.split(":").map(Number);
    const d = new Date(ticket.scheduledDate + "T00:00:00");
    d.setHours(hh, mm, 0, 0);
    return d;
  };

  const calcExpectedEnd = (ticket) => {
    if (!ticket.estimatedHours) return null;
    const start = resolveStart(ticket);
    if (!start) return null;
    return addWorkDurationSkippingLunch(start, ticket.estimatedHours);
  };

  const calcActualDuration = (ticket) => {
    if (!ticket.completedAt) return null;
    let start = null;
    if (ticket.startedAt) {
      start = new Date(ticket.startedAt);
    } else if (ticket.scheduledDate && ticket.startTime) {
      const [hh, mm] = ticket.startTime.split(":").map(Number);
      start = new Date(ticket.scheduledDate + "T00:00:00");
      start.setHours(hh, mm, 0, 0);
    }
    if (!start || Number.isNaN(start.getTime())) return null;
    const end = new Date(ticket.completedAt);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return null;
    return Math.round(diffMs / 60000);
  };

  const isLateDelivery = (ticket) => {
    if (!ticket.completedAt) return false;
    const expected = calcExpectedEnd(ticket);
    if (!expected) return false;
    return new Date(ticket.completedAt) > expected;
  };

  if (loading) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center text-muted" style={{ padding: "48px 20px" }}>
        <Spinner color="info" />
        <span className="mt-3" style={{ fontSize: 13 }}>Cargando boleta(s)…</span>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center text-center" style={{ padding: "48px 20px" }}>
        <i className="nc-icon nc-paper text-muted" style={{ fontSize: 34 }} />
        <p className="text-muted mt-3 mb-0" style={{ fontSize: 13 }}>
          No se encontraron datos para la boleta.
        </p>
        {onClose && (
          <Button color="secondary" outline size="sm" className="mt-3" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>
    );
  }

  const printLabel = tickets.length > 1 ? `Imprimir ${tickets.length} boletas` : "Imprimir boleta";

  return (
    <div className="tkt-root">
      <style>{TICKET_STYLESHEET}</style>

      {/* Barra de acciones: fija al desplazar para no perder el botón en lotes largos */}
      <div
        className="no-print d-flex align-items-center justify-content-between"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          gap: 12,
          padding: "12px 16px",
          background: "#fff",
          borderBottom: "1px solid #e0e0e0",
          borderRadius: "6px 6px 0 0",
        }}
      >
        <div className="d-flex align-items-center" style={{ gap: 8, minWidth: 0 }}>
          <i className="nc-icon nc-paper" style={{ fontSize: 16, color: "#51cbce" }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Vista previa</span>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {tickets.length > 1 ? `${tickets.length} boletas` : tickets[0]?.taskCode}
          </span>
        </div>
        <div className="d-flex align-items-center" style={{ gap: 8 }}>
          <Button color="info" size="sm" className="mb-0" onClick={handlePrint}>
            <i className="nc-icon nc-paper mr-1" /> {printLabel}
          </Button>
          {onClose && (
            <Button color="secondary" outline size="sm" className="mb-0" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </div>

      {/* Contenido imprimible: su HTML es el que se clona a la ventana de impresión */}
      <div ref={printRef} style={{ padding: 16, background: "#f4f5f7" }}>
        {tickets.map((ticket) => {
          const deskSupervisorName = resolveDeskSupervisorNameForTicket(ticket, supervisorByDesk);
          const startReal = resolveStart(ticket);
          const expectedEnd = calcExpectedEnd(ticket);
          const late = isLateDelivery(ticket);
          const actualDuration = calcActualDuration(ticket);
          const items = ticket.items || [];
          const regularItems = items.filter((i) => !i.daySaleExtra);
          const dayItems = items.filter((i) => i.daySaleExtra);
          const totalEstHours = items.length > 0
            ? items.reduce((sum, i) => sum + (i.estimatedHours || 0), 0)
            : (ticket.estimatedHours || 0);
          const extraEstHours = items.length > 0
            ? items.reduce((sum, i) => sum + (i.daySaleExtra ? (i.estimatedHours || 0) : 0), 0)
            : 0;
          const baseEstHours = Math.max(totalEstHours - extraEstHours, 0);
          const totalEstDisplay = formatProductionDuration(totalEstHours);

          return (
            <div className="ticket" key={ticket.taskId}>
              {/* Header */}
              <div className="header">
                <h1>BOLETA DE TAREA</h1>
                <h2>{ticket.taskCode}</h2>
              </div>

              {/* Highlight: Mesa, OP y tiempo */}
              <div className="tkt-kpis">
                <div className="highlight">
                  <div>MESA</div>
                  <div className={deskSupervisorName ? "big big--sm" : "big"}>
                    {ticket.desk
                      ? deskDisplayLabel(
                          ticket.desk,
                          deskSupervisorName ? { [ticket.desk]: deskSupervisorName } : null
                        )
                      : "—"}
                  </div>
                </div>
                <div className="highlight">
                  <div>ORDEN DE PRODUCCIÓN</div>
                  <div className="big">{ticket.productionOrderCode || "—"}</div>
                </div>
                <div className="highlight">
                  <div>TIEMPO EST.</div>
                  <div className="big">{totalEstDisplay}</div>
                </div>
              </div>

              {/* Info */}
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Inicio:</span>
                  <span className="info-value">
                    {/* Fecha y hora del arranque real: mezclar la fecha programada con la
                        hora real daba dos datos de dias distintos en la misma linea. */}
                    {startReal ? formatDateTimeGt(startReal) : formatDate(ticket.scheduledDate)}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Entrega Estimada:</span>
                  <span className="info-value">
                    <strong>
                      {expectedEnd
                        ? formatDateTimeGt(expectedEnd)
                        : "-"}
                    </strong>
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Encargado Mesa:</span>
                  <span className="info-value">
                    <strong>{deskSupervisorName || "—"}</strong>
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Estado:</span>
                  <span className="info-value">
                    {ticket.status === "PENDING" ? "Pendiente" :
                     ticket.status === "IN_PROGRESS" ? "En Proceso" :
                     ticket.status === "COMPLETED" ? "Completada" :
                     ticket.status === "CANCELLED" ? "Cancelada" : ticket.status || "-"}
                  </span>
                </div>
              </div>

              {/* Notas de la orden */}
              {ticket.orderObservations && (
                <div className="notes-section">
                  <span className="tkt-notes-label">Notas de la Orden: </span>
                  <span>{ticket.orderObservations}</span>
                </div>
              )}

              {/* Products tables */}
              <div className="section-title">PRODUCTOS ({items.length})</div>
              {items.length > 0 ? (
                <>
                  {(() => {
                    const renderItemsTable = (tableItems, title, totalLabel) => {
                      if (!tableItems.length) return null;
                      let accumulatedHours = 0;
                      const tableTotalHours = tableItems.reduce(
                        (sum, item) => sum + (item.estimatedHours || 0),
                        0
                      );
                      return (
                        <div className="tkt-table-wrap">
                          <div className="tkt-table-title">{title}</div>
                          <table>
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Código</th>
                                <th>Producto</th>
                                <th>Color</th>
                                <th className="number">Cantidad</th>
                                <th className="number">Tiempo/Ud</th>
                                <th className="number">Tiempo Total</th>
                                <th className="number">Avance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableItems.map((item, idx) => {
                                const qty = item.quantity || 1;
                                const totalItemHours = item.estimatedHours || 0;
                                const perUnitHours = qty > 0 ? totalItemHours / qty : 0;
                                accumulatedHours += totalItemHours;
                                return (
                                  <tr key={`${title}-${idx}`}>
                                    <td>{idx + 1}</td>
                                    <td><strong>{item.productCode || "-"}</strong></td>
                                    <td>{item.productName || "-"}</td>
                                    <td>{item.colorName || "-"}</td>
                                    <td className="number"><strong>{qty}</strong></td>
                                    <td className="number">{formatProductionDuration(perUnitHours)}</td>
                                    <td className="number"><strong>{formatProductionDuration(totalItemHours)}</strong></td>
                                    <td className="number">{formatProductionDuration(accumulatedHours)}</td>
                                  </tr>
                                );
                              })}
                              <tr className="tkt-row-total">
                                <td colSpan="6" className="number">{totalLabel}</td>
                                <td className="number">{formatProductionDuration(tableTotalHours)}</td>
                                <td className="number">{formatProductionDuration(tableTotalHours)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    };

                    return (
                      <>
                        {renderItemsTable(regularItems, "Productos Normales", "TOTAL NORMALES")}
                        {renderItemsTable(dayItems, "Productos Del Dia", "TOTAL DEL DIA")}
                        <div className="tkt-grand-total">
                          <span>Tiempo total estimado</span>
                          <strong>{totalEstDisplay}</strong>
                        </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <p className="tkt-empty">Sin productos registrados.</p>
              )}

              {/* Observaciones a mano */}
              <div className="observations-area">
                <div className="section-title">OBSERVACIONES</div>
                <div className="tkt-breakdown">
                  <strong>Tiempo total estimado:</strong> {totalEstDisplay}
                  {extraEstHours > 0 && (
                    <span>
                      {" "}(Base: {formatProductionDuration(baseEstHours)} + Dia: {formatProductionDuration(extraEstHours)})
                    </span>
                  )}
                </div>
                <div className="obs-lines">
                  <div className="obs-line"></div>
                  <div className="obs-line"></div>
                  <div className="obs-line"></div>
                </div>
              </div>

              {/* Finalización */}
              <div className="end-grid">
                <div className="info-item">
                  <span className="info-label">Finalización:</span>
                  <span className="info-value">
                    {ticket.completedAt ? formatDateTime(ticket.completedAt) : "________________"}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Tiempo Real:</span>
                  <span className="info-value">
                    {actualDuration !== null
                      ? formatProductionDuration(actualDuration / 60)
                      : "________________"}
                  </span>
                </div>
              </div>

              {late && (
                <div className="late-badge">
                  ⚠️ ENTREGA TARDÍA — Se completó después de la hora estimada
                </div>
              )}

              {/* Signatures */}
              <div className="signature-area">
                <div className="signature-line">
                  <hr />
                  <span>Encargado de Mesa</span>
                </div>
                <div className="signature-line">
                  <hr />
                  <span>Supervisor</span>
                </div>
              </div>

              {/* Footer */}
              <div className="footer">
                <span>Mesa {ticket.desk || "-"} · {ticket.taskCode}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TaskTicketPrint;
