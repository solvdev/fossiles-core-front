import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { getCinchoOrders } from "services/cinchoProductionService";
import { updateManagedCinchoOrderStatus } from "services/productionOrderService";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { contar } from "utils/textHelper";
import { deliveryUrgency, sizeColumns } from "utils/cinchoDayBoardHelper";
import { isManagedCinchoOrderType } from "utils/cinchoProductionHelper";
import { isLuisFelipeVendorFlow } from "utils/luisFelipeVendorHelper";
import OpcGenerateShipmentModal from "components/production/OpcGenerateShipmentModal";
import ProductionOrderPartialReleasesPanel from "components/production/ProductionOrderPartialReleasesPanel";

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  IN_QA: "En QA",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  DRAFT: "Borrador",
};

const SCOPES = [
  { id: "ACTIVE", label: "Activas" },
  { id: "PENDING", label: "Pendientes" },
  { id: "IN_PROGRESS", label: "En progreso" },
  { id: "COMPLETED", label: "Completadas" },
  { id: "CANCELLED", label: "Canceladas" },
];

const SOURCES = [
  { id: "ALL", label: "Todo" },
  { id: "OPC", label: "OP de cinchos" },
  { id: "SALES", label: "Cinchos de ventas (OPL / OPCK)" },
];

const LINE_STATUS = {
  PENDING: { label: "Sin empezar", cls: "pend" },
  IN_PROGRESS: { label: "En mesa", cls: "prog" },
  COMPLETED: { label: "Hecha", cls: "done" },
};

const CSS = `
.cpv{--ink:#2c2c2c;--muted:#6b7177;--line:#e3e1dc;--soft:#f6f5f2;--ok:#2f8f5b;--warn:#c9821b;--bad:#c8402a;--info:#2b6cb0;--lf:#6f42c1}
.cpv h4{margin:0;font-weight:700}
.cpv .cpv-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-bottom:14px}
.cpv .cpv-grow{flex:1 1 260px}
.cpv .cpv-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.cpv .cpv-kpi{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;text-align:left;cursor:default}
.cpv button.cpv-kpi{cursor:pointer}
.cpv button.cpv-kpi:hover{border-color:#b9b4aa}
.cpv .cpv-kpi b{display:block;font-size:24px;line-height:1.1;color:var(--ink)}
.cpv .cpv-kpi span{font-size:12px;color:var(--muted)}
.cpv .cpv-kpi.bad b{color:var(--bad)}
.cpv .cpv-kpi.warn b{color:var(--warn)}
.cpv .cpv-bar{height:6px;background:#ece9e3;border-radius:4px;overflow:hidden;margin-top:6px}
.cpv .cpv-bar i{display:block;height:100%;background:var(--ok)}
.cpv .cpv-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:12px}
.cpv .cpv-tools input[type=search]{flex:1 1 240px;min-height:40px;border:1px solid #c9c4bb;border-radius:8px;padding:0 12px}
.cpv .cpv-seg{display:inline-flex;flex-wrap:wrap;border:1px solid #c9c4bb;border-radius:8px;overflow:hidden;background:#fff}
.cpv .cpv-seg button{border:0;background:#fff;padding:0 12px;min-height:38px;font-size:13px;cursor:pointer;color:var(--ink)}
.cpv .cpv-seg button+button{border-left:1px solid #c9c4bb}
.cpv .cpv-seg button[aria-pressed=true]{background:#51504a;color:#fff;font-weight:700}
.cpv .cpv-list{display:flex;flex-direction:column;gap:10px}
.cpv .cpv-card{background:#fff;border:1px solid var(--line);border-left:4px solid #c9c4bb;border-radius:10px}
.cpv .cpv-card.late{border-left-color:var(--bad)}
.cpv .cpv-card.today{border-left-color:#e8590c}
.cpv .cpv-card.soon{border-left-color:var(--warn)}
.cpv .cpv-card.done{border-left-color:var(--ok)}
.cpv .cpv-row{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;padding:12px 14px}
.cpv .cpv-row > .c-main{flex:1 1 260px;min-width:0}
.cpv .cpv-row > .c-due{flex:0 0 190px}
.cpv .cpv-row > .c-qty{flex:0 0 170px}
.cpv .cpv-row > .cpv-actions{flex:0 0 390px;margin-left:auto}
@media (max-width: 700px){.cpv .cpv-row > .c-due,.cpv .cpv-row > .c-qty,.cpv .cpv-row > .cpv-actions{flex:1 1 100%;justify-content:flex-start}}
.cpv .cpv-clamp{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.cpv .cpv-title{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.cpv .cpv-title strong{font-size:15px}
.cpv .cpv-sub{font-size:12px;color:var(--muted);margin-top:2px}
.cpv .cpv-fam{font-size:11px;font-weight:800;border-radius:4px;padding:1px 6px;color:#fff;background:#51504a}
.cpv .cpv-fam.OPL{background:var(--info)}
.cpv .cpv-fam.OPCK{background:#17a2b8}
.cpv .cpv-fam.OPCF{background:#b7791f}
.cpv .cpv-fam.OPCM{background:#718096}
.cpv .cpv-chip{font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;background:var(--soft);color:var(--muted);border:1px solid var(--line)}
.cpv .cpv-chip.lf{background:#efe7fb;color:var(--lf);border-color:#d9c8f5}
.cpv .cpv-chip.mixed{background:#fff7e0;color:#7a5a00;border-color:#f3d37a}
.cpv .cpv-due{font-size:13px;font-weight:700}
.cpv .cpv-due.late{color:var(--bad)}
.cpv .cpv-due.today{color:#e8590c}
.cpv .cpv-due.soon{color:var(--warn)}
.cpv .cpv-due.ok,.cpv .cpv-due.none{color:var(--muted)}
.cpv .cpv-prog{font-size:12px;color:var(--muted)}
.cpv .cpv-st{display:inline-block;font-size:11px;font-weight:700;border-radius:4px;padding:2px 8px}
.cpv .cpv-st.PENDING,.cpv .cpv-st.DRAFT{background:#fff3d6;color:#7a4b00}
.cpv .cpv-st.IN_PROGRESS,.cpv .cpv-st.IN_QA{background:#e3efff;color:var(--info)}
.cpv .cpv-st.COMPLETED{background:#e3f4ea;color:var(--ok)}
.cpv .cpv-st.CANCELLED{background:#fde8e4;color:var(--bad)}
.cpv .cpv-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:center}
.cpv .cpv-actions .btn{margin:0}
.cpv .cpv-detail{border-top:1px solid var(--line);padding:10px 14px 14px;overflow-x:auto}
.cpv table.cpv-grid{width:100%;border-collapse:collapse;font-size:12px}
.cpv table.cpv-grid th{font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);font-weight:700;border-bottom:1px solid var(--line);padding:6px 8px;white-space:nowrap}
.cpv table.cpv-grid td{border-bottom:1px solid #f0eee9;padding:6px 8px;vertical-align:middle}
.cpv table.cpv-grid td.n,.cpv table.cpv-grid th.n{text-align:center;font-variant-numeric:tabular-nums}
.cpv table.cpv-grid td.zero{color:#cfcac0}
.cpv table.cpv-grid tfoot td{font-weight:800;border-top:2px solid var(--line);border-bottom:0}
.cpv .cpv-ls{font-size:11px;font-weight:700;border-radius:4px;padding:1px 6px;white-space:nowrap}
.cpv .cpv-ls.pend{background:var(--soft);color:var(--muted)}
.cpv .cpv-ls.prog{background:#e3efff;color:var(--info)}
.cpv .cpv-ls.done{background:#e3f4ea;color:var(--ok)}
.cpv .cpv-empty{background:#fff;border:1px dashed #c9c4bb;border-radius:10px;padding:28px;text-align:center;color:var(--muted)}
.cpv .cpv-note{font-size:12px;color:var(--muted);margin:6px 2px}
.cpv .cpv-skel{height:68px;border-radius:10px;background:linear-gradient(90deg,#f1efea,#f8f7f4,#f1efea);background-size:200% 100%;animation:cpvsk 1.2s infinite}
@keyframes cpvsk{0%{background-position:200% 0}100%{background-position:-200% 0}}
`;

function OrderLines({ order }) {
  const cols = sizeColumns(order.lines);
  const totals = cols.map((c) => order.lines.reduce((s, l) => s + (Number(l.sizes?.[c]) || 0), 0));
  return (
    <table className="cpv-grid">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Color</th>
          {cols.map((c) => <th key={c} className="n">{c}</th>)}
          <th className="n">Total</th>
          <th>Línea</th>
        </tr>
      </thead>
      <tbody>
        {order.lines.map((l) => {
          const st = LINE_STATUS[l.workStatus] || LINE_STATUS.PENDING;
          const done = l.delivered || l.workStatus === "COMPLETED";
          return (
            <tr key={l.productionOrderItemId}>
              <td>
                <strong>{l.productCode}</strong> {l.productName}
                {l.observations && <div className="cpv-sub">Obs.: {l.observations}</div>}
              </td>
              <td>{l.colorName || "—"}</td>
              {cols.map((c) => {
                const q = Number(l.sizes?.[c]) || 0;
                return <td key={c} className={`n ${q ? "" : "zero"}`}>{q || "·"}</td>;
              })}
              <td className="n"><strong>{l.totalQty}</strong></td>
              <td>
                <span className={`cpv-ls ${done ? "done" : st.cls}`}>{done ? (l.delivered ? "Entregada" : "Hecha") : st.label}</span>
                {l.lastWorkDate && <div className="cpv-sub">{formatDateGt(l.lastWorkDate)}</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
      {order.lines.length > 1 && (
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            {totals.map((t, i) => <td key={cols[i]} className="n">{t || ""}</td>)}
            <td className="n">{order.totalQty}</td>
            <td />
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function OrderCard({ order, today, open, onToggle, onStatus, busy, onDetail }) {
  const closed = order.status === "COMPLETED" || order.status === "CANCELLED";
  const urg = closed ? { label: "", tone: "none" } : deliveryUrgency(order.deliveryDate, today);
  const managed = isManagedCinchoOrderType(order.orderType);
  const pct = order.lineCount ? Math.round((order.linesDone / order.lineCount) * 100) : 0;
  return (
    <div className={`cpv-card ${order.status === "COMPLETED" ? "done" : urg.tone}`}>
      <div className="cpv-row">
        <div className="c-main">
          <div className="cpv-title">
            <span className={`cpv-fam ${order.family}`}>{order.family}</span>
            <strong>{order.code}</strong>
            {order.groupCode && <span className="cpv-chip lf" title="OP consolidada de Luis Felipe">{order.groupCode}</span>}
            {order.mixedOrder && (
              <span className="cpv-chip mixed" title="La venta también lleva productos que se hacen en las mesas">
                También va a mesas
              </span>
            )}
          </div>
          <div className="cpv-sub cpv-clamp" title={order.customerName || ""}>
            {order.customerName || "Sin cliente"}{order.sellerName ? ` · ${order.sellerName}` : ""}
          </div>
        </div>
        <div className="c-due">
          {order.deliveryDate ? (
            <>
              <div className={`cpv-due ${urg.tone}`}>{urg.label || `Entrega ${formatDateGt(order.deliveryDate)}`}</div>
              <div className="cpv-sub">
                Entrega {formatDateGt(order.deliveryDate)}{order.startDate ? ` · inicio ${formatDateGt(order.startDate)}` : ""}
              </div>
            </>
          ) : <div className="cpv-due none">Sin fecha de entrega</div>}
        </div>
        <div className="c-qty">
          <div><strong>{order.totalQty}</strong> uds · {contar(order.lineCount, "línea")}</div>
          <div className="cpv-bar" title={`${order.linesDone} de ${order.lineCount} líneas hechas`}><i style={{ width: `${pct}%` }} /></div>
          <div className="cpv-prog">
            {order.linesDone}/{order.lineCount} hechas{order.linesInProgress ? ` · ${order.linesInProgress} en mesa` : ""}
          </div>
        </div>
        <div className="cpv-actions">
          <span className={`cpv-st ${order.status}`}>{STATUS_LABELS[order.status] || order.status}</span>
          {managed && order.status === "PENDING" && (
            <Button size="sm" color="info" disabled={busy} onClick={() => onStatus(order, "IN_PROGRESS")}>Iniciar</Button>
          )}
          {managed && order.status === "IN_PROGRESS" && (
            <Button size="sm" color="success" disabled={busy} onClick={() => onStatus(order, "COMPLETED")}>Completar</Button>
          )}
          <Button size="sm" color="secondary" outline aria-expanded={open} onClick={onToggle}>
            {open ? "Ocultar ▴" : "Productos ▾"}
          </Button>
          <Button size="sm" color="link" className="p-0" onClick={() => onDetail(order)}>Más</Button>
        </div>
      </div>
      {open && (
        <div className="cpv-detail">
          {order.observations && <div className="cpv-note">Obs.: {order.observations}</div>}
          <OrderLines order={order} />
        </div>
      )}
    </div>
  );
}

/**
 * Cinchos en producción: las OP de cinchos (OPC/OPCF/OPCM) y los cinchos y pulseras de las
 * ventas (OPL/OPCK), con lo urgente arriba.
 *
 * Arriba el resumen de lo activo; cada orden dice cuánto falta para su entrega, cuántas
 * unidades lleva y cuántas líneas se marcaron hechas en el cuadro de cinchos del Tablero.
 * Los productos se ven como tabla producto × talla, que es como se cortan.
 */
function CinchosProductionOrdersView() {
  const [scope, setScope] = useState("ACTIVE");
  const [source, setSource] = useState("ALL");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [shipmentOrder, setShipmentOrder] = useState(null);
  const today = getTodayYmdGuatemala();
  const reqRef = useRef(0);

  // El buscador va al servidor cuando se deja de escribir.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const req = ++reqRef.current;
    setLoading(true);
    setError("");
    try {
      const res = await getCinchoOrders({ scope, source, search: query });
      if (req === reqRef.current) setData(res);
    } catch (e) {
      if (req === reqRef.current) setError(e.message || "No se pudieron cargar los cinchos");
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  }, [scope, source, query]);

  useEffect(() => { load(); }, [load]);

  const orders = useMemo(() => data?.orders || [], [data]);
  const summary = data?.summary;
  const unitsPct = summary?.units ? Math.round((summary.unitsDone / summary.units) * 100) : 0;

  const toggle = (id) => setOpenIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOpen = orders.length > 0 && orders.every((o) => openIds.has(o.id));

  const changeStatus = async (order, status) => {
    setBusyId(order.id);
    try {
      await updateManagedCinchoOrderStatus(order.id, status);
      showSuccess(`${order.code}: ${STATUS_LABELS[status].toLowerCase()}`);
      setDetail(null);
      await load();
    } catch (e) {
      showError(e.message || "No se pudo cambiar el estado");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="content cpv">
      <style>{CSS}</style>
      <div className="cpv-head">
        <div className="cpv-grow">
          <h4>Cinchos en producción</h4>
          <small className="text-muted">
            OP de cinchos y los cinchos o pulseras de ventas en línea y kiosko. Lo más urgente va arriba.
          </small>
        </div>
        <Button color="secondary" outline onClick={load} disabled={loading}>
          {loading ? <Spinner size="sm" /> : "Actualizar"}
        </Button>
      </div>

      {summary && (
        <div className="cpv-kpis">
          <button type="button" className="cpv-kpi" onClick={() => setScope("ACTIVE")} title="Ver las activas">
            <b>{summary.orders}</b><span>OP activas</span>
          </button>
          <button type="button" className="cpv-kpi" onClick={() => setScope("PENDING")} title="Ver las pendientes">
            <b>{summary.pending}</b><span>Sin empezar</span>
          </button>
          <button type="button" className="cpv-kpi" onClick={() => setScope("IN_PROGRESS")} title="Ver las que están en progreso">
            <b>{summary.inProgress}</b><span>En progreso</span>
          </button>
          <div className={`cpv-kpi ${summary.late ? "bad" : ""}`}>
            <b>{summary.late}</b><span>Atrasadas (entrega ya pasó)</span>
          </div>
          <div className={`cpv-kpi ${summary.dueSoon ? "warn" : ""}`}>
            <b>{summary.dueSoon}</b><span>Se entregan en 7 días</span>
          </div>
          <div className="cpv-kpi">
            <b>{summary.unitsDone} / {summary.units}</b><span>Unidades hechas ({unitsPct}%)</span>
            <div className="cpv-bar"><i style={{ width: `${unitsPct}%` }} /></div>
          </div>
        </div>
      )}

      <div className="cpv-tools">
        <input
          type="search"
          placeholder="Buscar OP, cliente, producto o color"
          aria-label="Buscar OP, cliente, producto o color"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="cpv-seg" role="group" aria-label="Estado">
          {SCOPES.map((s) => (
            <button key={s.id} type="button" aria-pressed={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</button>
          ))}
        </div>
        <div className="cpv-seg" role="group" aria-label="Origen">
          {SOURCES.map((s) => (
            <button key={s.id} type="button" aria-pressed={source === s.id} onClick={() => setSource(s.id)}>{s.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="cpv-empty" role="alert">{error} <Button color="link" onClick={load}>Reintentar</Button></div>}

      {!error && loading && !data && (
        <div className="cpv-list"><div className="cpv-skel" /><div className="cpv-skel" /><div className="cpv-skel" /></div>
      )}

      {!error && data && (
        <>
          <div className="d-flex align-items-center justify-content-between">
            <div className="cpv-note">
              {contar(orders.length, "orden", "órdenes")}
              {data.truncated ? " · se muestran las más recientes; use el buscador para encontrar una anterior" : ""}
            </div>
            {orders.length > 0 && (
              <Button color="link" size="sm" className="p-0"
                onClick={() => setOpenIds(allOpen ? new Set() : new Set(orders.map((o) => o.id)))}>
                {allOpen ? "Ocultar todos los productos" : "Ver todos los productos"}
              </Button>
            )}
          </div>
          {orders.length === 0 ? (
            <div className="cpv-empty">
              {query ? "Ninguna orden coincide con la búsqueda." : "No hay órdenes en este estado."}
            </div>
          ) : (
            <div className="cpv-list" style={{ opacity: loading ? 0.6 : 1 }}>
              {orders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  today={today}
                  open={openIds.has(o.id)}
                  onToggle={() => toggle(o.id)}
                  onStatus={changeStatus}
                  busy={busyId === o.id}
                  onDetail={setDetail}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal isOpen={!!detail} toggle={() => setDetail(null)} size="lg">
        <ModalHeader toggle={() => setDetail(null)}>{detail?.code} · {detail?.customerName || "Sin cliente"}</ModalHeader>
        <ModalBody>
          {detail && (
            <div className="cpv">
              <div className="cpv-sub" style={{ fontSize: 13, marginBottom: 10 }}>
                {detail.orderType} · {STATUS_LABELS[detail.status] || detail.status}
                {detail.deliveryDate ? ` · entrega ${formatDateGt(detail.deliveryDate)}` : ""}
                {detail.sellerName ? ` · vendedor ${detail.sellerName}` : ""}
              </div>
              {detail.observations && <div className="cpv-note">Obs.: {detail.observations}</div>}
              <OrderLines order={detail} />
              {isManagedCinchoOrderType(detail.orderType) && (
                <div className="mt-3">
                  <label htmlFor="cpv-status" className="small text-muted mb-1">Estado de la OP</label>
                  <Input
                    id="cpv-status"
                    type="select"
                    value={detail.status}
                    disabled={busyId === detail.id}
                    onChange={(e) => changeStatus(detail, e.target.value)}
                  >
                    {["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </Input>
                </div>
              )}
              {detail.family !== "OPL" && detail.family !== "OPCK" && isLuisFelipeVendorFlow(detail.orderType, detail.sellerName) && (
                <div className="mt-3"><ProductionOrderPartialReleasesPanel order={detail} /></div>
              )}
              {(detail.family === "OPL" || detail.family === "OPCK") && (
                <p className="cpv-note mt-3">
                  El estado de una venta no se cambia aquí: el resto del pedido sigue en el Centro de Producción.
                  Sus líneas de cincho se marcan en el cuadro de cinchos del Tablero.
                </p>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setDetail(null)}>Cerrar</Button>
          {detail && detail.family !== "OPL" && detail.family !== "OPCK" && (
            <Button color="success" outline onClick={() => setShipmentOrder(detail)}>Generar envío</Button>
          )}
        </ModalFooter>
      </Modal>

      <OpcGenerateShipmentModal
        isOpen={!!shipmentOrder}
        toggle={() => setShipmentOrder(null)}
        order={shipmentOrder}
        onGenerated={() => setShipmentOrder(null)}
      />
    </div>
  );
}

export default CinchosProductionOrdersView;
