import React, { useState, useEffect, useRef } from "react";
import { getTaskTicket, getTicketsByProductionOrder } from "services/taskService";
import { showError } from "utils/notificationHelper";
import { formatDateGt, formatDateTimeGt, formatNowGt } from "utils/dateTimeHelper";

function TaskTicketPrint({ taskId, productionOrderId, onClose }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const printRef = useRef();

  useEffect(() => {
    loadTickets();
  }, [taskId, productionOrderId]);

  const loadTickets = async () => {
    try {
      setLoading(true);
      if (taskId) {
        const ticket = await getTaskTicket(taskId);
        setTickets([ticket]);
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
    const printWindow = window.open("", "_blank", "width=800,height=600");

    printWindow.document.write(`
      <html>
        <head>
          <title>Boleta de Tarea</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #000; }
            .ticket { 
              page-break-after: always; 
              padding: 15px; 
              max-width: 800px; 
              margin: 0 auto;
              border: 2px solid #000;
              margin-bottom: 10px;
            }
            .ticket:last-child { page-break-after: auto; }
            .header { 
              text-align: center; 
              border-bottom: 2px solid #000; 
              padding-bottom: 8px; 
              margin-bottom: 10px; 
            }
            .header h1 { font-size: 18px; margin-bottom: 2px; }
            .header h2 { font-size: 14px; font-weight: normal; }
            .info-grid { 
              display: grid; 
              grid-template-columns: 1fr 1fr; 
              gap: 4px 16px; 
              margin-bottom: 10px;
              border-bottom: 1px dashed #999;
              padding-bottom: 8px;
            }
            .info-item { display: flex; }
            .info-label { font-weight: bold; min-width: 130px; }
            .highlight { 
              background-color: #f0f0f0; 
              padding: 6px 10px; 
              text-align: center; 
              margin-bottom: 10px;
              border: 1px solid #ccc;
            }
            .highlight .big { font-size: 22px; font-weight: bold; }
            .section-title { 
              font-size: 13px; 
              font-weight: bold; 
              border-bottom: 1px solid #000; 
              padding-bottom: 3px; 
              margin: 10px 0 6px 0;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 8px; 
            }
            th, td { 
              border: 1px solid #333; 
              padding: 4px 6px; 
              text-align: left; 
              font-size: 11px;
            }
            th { background-color: #e0e0e0; font-weight: bold; }
            td.number { text-align: right; }
            .notes-section {
              background-color: #f8f8f8;
              border: 1px solid #ccc;
              padding: 6px 10px;
              margin-bottom: 10px;
              font-size: 11px;
            }
            .observations-area { margin-top: 10px; }
            .obs-lines { padding: 4px 0; }
            .obs-line { border-bottom: 1px solid #bbb; height: 22px; margin-bottom: 2px; }
            .end-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 4px 16px;
              margin-top: 10px;
              border: 1px solid #ccc;
              padding: 8px 10px;
              background-color: #fafafa;
            }
            .late-badge {
              background-color: #fff3cd;
              border: 1px solid #ffc107;
              padding: 3px 8px;
              font-size: 10px;
              font-weight: bold;
              color: #856404;
              text-align: center;
              margin-top: 6px;
            }
            .signature-area {
              margin-top: 40px;
              display: flex;
              justify-content: space-around;
            }
            .signature-line {
              text-align: center;
              width: 200px;
            }
            .signature-line hr {
              border: none;
              border-top: 1px solid #000;
              margin-bottom: 4px;
            }
            .footer { 
              margin-top: 12px; 
              border-top: 1px solid #999;
              padding-top: 6px;
              display: flex; 
              justify-content: space-between; 
              font-size: 10px;
              color: #666;
            }
            @media print {
              body { margin: 0; }
              .ticket { border: 2px solid #000; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    return formatDateGt(dateStr);
  };

  const formatDateTime = (dtStr) => {
    if (!dtStr) return "-";
    return formatDateTimeGt(dtStr);
  };

  const calcExpectedEnd = (ticket) => {
    if (!ticket.scheduledDate || !ticket.startTime || !ticket.estimatedHours) return null;
    const [hh, mm] = ticket.startTime.split(":").map(Number);
    const start = new Date(ticket.scheduledDate + "T00:00:00");
    start.setHours(hh, mm, 0, 0);
    return new Date(start.getTime() + ticket.estimatedHours * 60 * 60 * 1000);
  };

  const calcActualDuration = (ticket) => {
    if (!ticket.scheduledDate || !ticket.startTime || !ticket.completedAt) return null;
    const [hh, mm] = ticket.startTime.split(":").map(Number);
    const start = new Date(ticket.scheduledDate + "T00:00:00");
    start.setHours(hh, mm, 0, 0);
    const end = new Date(ticket.completedAt);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return null;
    const mins = Math.round(diffMs / 60000);
    return mins;
  };

  const isLateDelivery = (ticket) => {
    if (!ticket.completedAt) return false;
    const expected = calcExpectedEnd(ticket);
    if (!expected) return false;
    return new Date(ticket.completedAt) > expected;
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>Cargando boleta(s)...</p>
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <p>No se encontraron datos para la boleta.</p>
        {onClose && (
          <button onClick={onClose} style={{ marginTop: "10px", padding: "6px 16px" }}>
            Cerrar
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ padding: "10px", textAlign: "center", borderBottom: "1px solid #ddd", marginBottom: "10px" }}>
        <button
          onClick={handlePrint}
          style={{
            padding: "8px 24px",
            backgroundColor: "#51cbce",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            marginRight: "10px",
          }}
        >
          🖨️ Imprimir {tickets.length > 1 ? `(${tickets.length} boletas)` : "Boleta"}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              padding: "8px 24px",
              backgroundColor: "#999",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Cerrar
          </button>
        )}
      </div>

      {/* Printable content */}
      <div ref={printRef}>
        {tickets.map((ticket) => {
          const expectedEnd = calcExpectedEnd(ticket);
          const late = isLateDelivery(ticket);
          const actualDuration = calcActualDuration(ticket);
          const items = ticket.items || [];
          const regularItems = items.filter((i) => !i.daySaleExtra);
          const dayItems = items.filter((i) => i.daySaleExtra);
          const totalEstMin = items.length > 0
            ? items.reduce((sum, i) => sum + Math.round((i.estimatedHours || 0) * 60), 0)
            : Math.round((ticket.estimatedHours || 0) * 60);
          const extraEstMin = items.length > 0
            ? items.reduce((sum, i) => sum + (i.daySaleExtra ? Math.round((i.estimatedHours || 0) * 60) : 0), 0)
            : 0;
          const baseEstMin = Math.max(totalEstMin - extraEstMin, 0);
          const totalEstDisplay = `${totalEstMin} min`;

          return (
            <div className="ticket" key={ticket.taskId}>
              {/* Header */}
              <div className="header">
                <h1>BOLETA DE TAREA</h1>
                <h2>{ticket.taskCode}</h2>
              </div>

              {/* Highlight: Mesa + Troquelado */}
              <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                <div className="highlight" style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px" }}>MESA</div>
                  <div className="big">{ticket.desk || "—"}</div>
                </div>
                <div className="highlight" style={{ flex: 2 }}>
                  <div style={{ fontSize: "10px" }}>ORDEN DE PRODUCCIÓN</div>
                  <div className="big">{ticket.productionOrderCode || "—"}</div>
                </div>
                <div className="highlight" style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px" }}>TROQUELADO</div>
                  <div className="big">{ticket.dieCutReady ? "✔ SÍ" : "☐ NO"}</div>
                </div>
                <div className="highlight" style={{ flex: 1 }}>
                  <div style={{ fontSize: "10px" }}>TIEMPO EST.</div>
                  <div className="big">{totalEstDisplay}</div>
                </div>
              </div>

              {/* Info */}
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Fecha Inicio:</span>
                  <span className="info-value">
                    {formatDate(ticket.scheduledDate)}
                    {ticket.startTime ? ` — ${ticket.startTime}` : ""}
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
                  <span className="info-value" style={{ borderBottom: "1px solid #999", minWidth: "140px", display: "inline-block" }}>&nbsp;</span>
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
                  <span style={{ fontWeight: "bold" }}>Notas de la Orden: </span>
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
                      let accumulatedMin = 0;
                      const tableTotalMin = tableItems.reduce(
                        (sum, item) => sum + Math.round((item.estimatedHours || 0) * 60),
                        0
                      );
                      return (
                        <div style={{ marginBottom: "8px" }}>
                          <div style={{ fontWeight: "bold", fontSize: "11px", marginBottom: "4px" }}>
                            {title}
                          </div>
                          <table>
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Código</th>
                                <th>Producto</th>
                                <th>Color</th>
                                <th style={{ textAlign: "right" }}>Cantidad</th>
                                <th style={{ textAlign: "right" }}>Tiempo/Ud</th>
                                <th style={{ textAlign: "right" }}>Tiempo Total</th>
                                <th style={{ textAlign: "right" }}>Avance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableItems.map((item, idx) => {
                                const qty = item.quantity || 1;
                                const totalItemMin = Math.round((item.estimatedHours || 0) * 60);
                                const perUnitMin = qty > 0 ? (totalItemMin / qty).toFixed(1) : 0;
                                accumulatedMin += totalItemMin;
                                return (
                                  <tr key={`${title}-${idx}`}>
                                    <td>{idx + 1}</td>
                                    <td><strong>{item.productCode || "-"}</strong></td>
                                    <td>{item.productName || "-"}</td>
                                    <td>{item.colorName || "-"}</td>
                                    <td className="number"><strong>{qty}</strong></td>
                                    <td className="number">{perUnitMin} min</td>
                                    <td className="number"><strong>{totalItemMin} min</strong></td>
                                    <td className="number">{accumulatedMin} min</td>
                                  </tr>
                                );
                              })}
                              <tr style={{ fontWeight: "bold", backgroundColor: "#f0f0f0" }}>
                                <td colSpan="6" style={{ textAlign: "right" }}>{totalLabel}</td>
                                <td className="number">{tableTotalMin} min</td>
                                <td className="number">{tableTotalMin} min</td>
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
                        <table>
                          <tbody>
                            <tr style={{ fontWeight: "bold", backgroundColor: "#e9ecef" }}>
                              <td style={{ textAlign: "right", border: "1px solid #333", padding: "4px 6px" }}>
                                TIEMPO TOTAL ESTIMADO
                              </td>
                              <td style={{ textAlign: "right", border: "1px solid #333", padding: "4px 6px", width: "130px" }}>
                                {totalEstMin} min
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </>
                    );
                  })()}
                </>
              ) : (
                <p style={{ textAlign: "center", color: "#999", padding: "10px" }}>
                  Sin productos registrados.
                </p>
              )}

              {/* Observaciones a mano */}
              <div className="observations-area">
                <div className="section-title">OBSERVACIONES</div>
                <div style={{ fontSize: "11px", marginBottom: "6px", color: "#444" }}>
                  <strong>Tiempo total estimado:</strong> {totalEstMin} min
                  {extraEstMin > 0 && (
                    <span> (Base: {baseEstMin} min + Dia: {extraEstMin} min)</span>
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
                    {actualDuration !== null ? `${actualDuration} min` : "________________"}
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
                <span>Impreso: {formatNowGt()}</span>
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
