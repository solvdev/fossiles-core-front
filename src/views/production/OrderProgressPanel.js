import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Col, Input, Row, Spinner, Table } from "reactstrap";
import { getOrderProgress } from "services/productionProgressService";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  STAGES,
  TASK_STATUS,
  WORKFLOW_LABELS,
  buildProgressView,
  deliveryLabel,
  elapsedLabel,
  exportOrderProgressExcel,
  fmtDate,
  fmtInt,
  orderTypesIn,
  pctOf,
  taskProductsText,
  timeLabel,
} from "utils/orderProgressReport";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const CARD = { borderRadius: 12, marginBottom: 18 };
const MUTED = "#6b7280";
const HEAD_ROW = { fontSize: 11, textTransform: "uppercase", color: MUTED };

function Kpi({ label, value, unit, hint, tone = "#111827", bg = "#fff", swatch }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 14px", background: bg, height: "100%" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: MUTED }}>
        {swatch && <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: swatch, marginRight: 5 }} />}
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: tone }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4 }}>{unit}</span>}
      </div>
      {hint && <div style={{ fontSize: 12, color: MUTED }}>{hint}</div>}
    </div>
  );
}

function Chip({ children, color = "#374151", bg = "#fff", border = "#e5e7eb", title, strong }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", border: `1px solid ${border}`, borderRadius: 999,
        padding: "1px 8px", fontSize: 12, background: bg, color, whiteSpace: "nowrap", fontWeight: strong ? 700 : 500,
      }}
    >
      {children}
    </span>
  );
}

/** Barra apilada por etapa con el número de piezas dentro de cada tramo. */
function StageBar({ stages, height = 18, showNumbers = true }) {
  const total = Number(stages?.units || 0);
  if (total <= 0) return <div style={{ height, borderRadius: 6, background: "#f3f4f6" }} />;
  return (
    <div style={{ display: "flex", height, borderRadius: 6, overflow: "hidden", background: "#f3f4f6" }}>
      {STAGES.map((st) => {
        const n = Number(stages[st.key] || 0);
        if (n <= 0) return null;
        const pct = (n * 100) / total;
        return (
          <div
            key={st.key}
            title={`${st.label}: ${fmtInt(n)} pzas (${pct.toFixed(0)}%)`}
            style={{
              width: `${pct}%`, background: st.color, color: st.key === "noTask" || st.key === "pending" ? "#111827" : "#fff",
              fontSize: 11, fontWeight: 700, lineHeight: `${height}px`, textAlign: "center", overflow: "hidden", whiteSpace: "nowrap",
            }}
          >
            {showNumbers && pct >= 7 ? fmtInt(n) : ""}
          </div>
        );
      })}
    </div>
  );
}

/** «20 terminadas · 10 en bodega/QA · …» como chips de color, sin las etapas en cero. */
function StageChips({ stages }) {
  return (
    <div className="d-flex flex-wrap" style={{ gap: 4 }}>
      {STAGES.filter((st) => Number(stages?.[st.key] || 0) > 0).map((st) => (
        <span key={st.key} style={{ fontSize: 12, color: st.text, whiteSpace: "nowrap" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: st.color, marginRight: 4 }} />
          <strong>{fmtInt(stages[st.key])}</strong> {st.short}
        </span>
      ))}
    </div>
  );
}

function StatusPill({ status }) {
  const s = TASK_STATUS[status] || { label: status, color: "#374151", bg: "#f3f4f6" };
  return <Chip color={s.color} bg={s.bg} border={s.bg} strong>{s.label}</Chip>;
}

const Check = ({ ok, na }) =>
  na ? <span style={{ color: "#9ca3af" }} title="No lleva">—</span>
    : ok ? <span style={{ color: "#047857", fontWeight: 700 }} title="Sí">✓</span>
      : <span style={{ color: "#b91c1c", fontWeight: 700 }} title="No">✗</span>;

/** Tarea en mesa ahora, en una sola línea: mesa, tarea, productos, desde cuándo. */
function WorkingNow({ task, todayYmd, now }) {
  return (
    <div
      style={{
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 12,
        border: "1px solid #bfdbfe", background: task.paused ? "#f9fafb" : "#eff6ff", borderRadius: 8, padding: "4px 8px",
      }}
    >
      <strong style={{ color: "#1d4ed8" }}>{task.desk != null ? `Mesa ${task.desk}` : "Sin mesa"}</strong>
      <span>{task.code}</span>
      <span style={{ color: "#374151" }}>{taskProductsText(task)}</span>
      {task.baseOrderCode && <Chip color="#6d28d9" bg="#f5f3ff" border="#ddd6fe">Extra en {task.baseOrderCode}</Chip>}
      {task.startedAt && (
        <span style={{ color: MUTED }}>
          desde {timeLabel(task.startedAt, todayYmd)}{!task.paused && ` (${elapsedLabel(task.startedAt, now)})`}
        </span>
      )}
      {task.paused && <Chip color="#92400e" bg="#fef3c7" border="#fde68a" strong>Pausada {timeLabel(task.pausedAt, todayYmd)}</Chip>}
      {task.delayed && <Chip color="#b91c1c" bg="#fee2e2" border="#fecaca" strong>Atrasada</Chip>}
    </div>
  );
}

function LinesTable({ lines }) {
  return (
    <Table responsive size="sm" className="mb-0" style={{ background: "#fff" }}>
      <thead>
        <tr style={HEAD_ROW}>
          <th>Producto</th><th>Color</th>
          <th className="text-right">Pedidas</th>
          {STAGES.map((st) => <th key={st.key} className="text-right" style={{ color: st.text }}>{st.label}</th>)}
          <th style={{ minWidth: 110 }}>Avance</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.itemId}>
            <td>
              <strong>{l.productCode || "—"}</strong> <span style={{ color: "#4b5563" }}>{l.productName}</span>
              {l.brandName && <div style={{ fontSize: 11, color: MUTED }}>Marca: {l.brandName}</div>}
              {l.extraUnits > 0 && <div style={{ fontSize: 11, color: "#6d28d9" }}>{fmtInt(l.extraUnits)} como extra OPL</div>}
              {l.overAssignedUnits > 0 && (
                <div style={{ fontSize: 11, color: "#b45309" }}>{fmtInt(l.overAssignedUnits)} pzas de más en tareas</div>
              )}
            </td>
            <td style={{ whiteSpace: "nowrap" }}>{l.colorName || "—"}</td>
            <td className="text-right"><strong>{fmtInt(l.stages?.units)}</strong></td>
            {STAGES.map((st) => (
              <td key={st.key} className="text-right" style={{ color: l.stages?.[st.key] ? st.text : "#d1d5db" }}>
                {fmtInt(l.stages?.[st.key])}
              </td>
            ))}
            <td style={{ verticalAlign: "middle" }}>
              <StageBar stages={l.stages} height={10} showNumbers={false} />
              {l.receivedUnits > 0 && <div style={{ fontSize: 11, color: MUTED }}>{fmtInt(l.receivedUnits)} recibidas en bodega</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function TasksTable({ tasks, todayYmd }) {
  if (!tasks.length) {
    return <div style={{ fontSize: 13, color: MUTED, padding: "6px 0" }}>Esta orden todavía no tiene tareas.</div>;
  }
  return (
    <Table responsive size="sm" className="mb-0" style={{ background: "#fff" }}>
      <thead>
        <tr style={HEAD_ROW}>
          <th>Tarea</th><th>Estado</th><th>Flujo</th><th className="text-center">Mesa</th>
          <th className="text-right">Pzas</th><th>Productos</th><th>Programada</th><th>Inicio / fin</th>
          <th className="text-center">Cuero</th><th className="text-center">Materiales</th><th className="text-center">Troquel</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.taskId} style={t.status === "IN_PROGRESS" ? { background: "#f8fbff" } : undefined}>
            <td style={{ whiteSpace: "nowrap" }}>
              <strong>{t.code}</strong>
              {t.baseOrderCode && <div style={{ fontSize: 11, color: "#6d28d9" }}>{t.extra ? "Extra en" : "Junto con"} {t.baseOrderCode}</div>}
              {t.materialsTask && <div style={{ fontSize: 11, color: MUTED }}>Materiales cincho</div>}
            </td>
            <td style={{ whiteSpace: "nowrap" }}>
              <StatusPill status={t.status} />
              {t.paused && <div style={{ fontSize: 11, color: "#92400e", fontWeight: 700 }}>Pausada</div>}
              {t.delayed && <div style={{ fontSize: 11, color: "#b91c1c", fontWeight: 700 }}>Atrasada</div>}
            </td>
            <td style={{ fontSize: 12 }}>{WORKFLOW_LABELS[t.workflowStatus] || t.workflowStatus || "—"}</td>
            <td className="text-center">
              {t.desk != null ? <strong>{t.desk}</strong>
                : t.workedDesk != null ? <span style={{ color: MUTED }} title="Mesa donde se trabajó">({t.workedDesk})</span> : "—"}
            </td>
            <td className="text-right">
              <strong>{fmtInt(t.units)}</strong>
              {t.taskUnits > t.units && <div style={{ fontSize: 11, color: MUTED }} title="Piezas de toda la tarea">de {fmtInt(t.taskUnits)}</div>}
            </td>
            <td style={{ fontSize: 12, minWidth: 160 }}>{taskProductsText(t)}</td>
            <td style={{ whiteSpace: "nowrap" }}>{fmtDate(t.scheduledDate)}</td>
            <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
              {t.startedAt ? timeLabel(t.startedAt, todayYmd) : "—"}
              {t.completedAt && <div style={{ color: MUTED }}>fin {timeLabel(t.completedAt, todayYmd)}</div>}
            </td>
            <td className="text-center"><Check ok={t.leatherDelivered} /></td>
            <td className="text-center"><Check ok={t.materialsDelivered} na={!t.requiresMaterials} /></td>
            <td className="text-center"><Check ok={t.dieCutReady} /></td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function OrderRow({ order, open, onToggle, todayYmd, now }) {
  const s = order.stages || {};
  const due = deliveryLabel(order);
  const working = (order.tasks || []).filter((t) => t.status === "IN_PROGRESS");
  const donePct = pctOf(s.done, s.units);
  return (
    <div style={{ borderTop: "1px solid #e5e7eb", background: open ? "#f9fafb" : "#fff" }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        style={{ padding: "10px 12px", cursor: "pointer" }}
      >
        <div className="d-flex flex-wrap align-items-center" style={{ gap: "4px 10px" }}>
          <span style={{ color: MUTED, width: 12 }}>{open ? "▾" : "▸"}</span>
          <strong style={{ fontSize: 15 }}>{order.code}</strong>
          <span style={{ fontSize: 12, color: MUTED }}>
            {ORDER_TYPE_LABELS[order.orderType] || order.orderType} · {ORDER_STATUS_LABELS[order.status] || order.status}
          </span>
          <span style={{ fontSize: 13, color: "#374151", minWidth: 0, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {order.customerName || "—"}
          </span>
          <span className="ml-auto d-flex align-items-center" style={{ gap: 6 }}>
            {order.deliveryDate && <span style={{ fontSize: 12, color: MUTED }}>Entrega {fmtDate(order.deliveryDate)}</span>}
            <Chip color={due.tone} bg={due.bg} border={due.bg} strong>{due.text}</Chip>
          </span>
        </div>

        <div className="d-flex flex-wrap align-items-center" style={{ gap: "4px 12px", marginTop: 8 }}>
          <div style={{ flex: "1 1 260px", minWidth: 200 }}>
            <StageBar stages={s} />
          </div>
          <div style={{ whiteSpace: "nowrap", fontSize: 13 }}>
            <strong style={{ fontSize: 16 }}>{fmtInt(s.done)}</strong>
            <span style={{ color: MUTED }}> de {fmtInt(s.units)} pzas terminadas ({donePct}%)</span>
          </div>
        </div>
        <div style={{ marginTop: 4 }}>
          <StageChips stages={s} />
        </div>

        {working.length > 0 && (
          <div className="d-flex flex-wrap align-items-center" style={{ gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#1d4ed8" }}>En mesa ahora</span>
            {working.slice(0, open ? working.length : 3).map((t) => (
              <WorkingNow key={t.taskId} task={t} todayYmd={todayYmd} now={now} />
            ))}
            {!open && working.length > 3 && <span style={{ fontSize: 12, color: MUTED }}>+{working.length - 3} más</span>}
          </div>
        )}
      </div>

      {open && (
        <div style={{ padding: "0 12px 12px 24px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: MUTED, margin: "4px 0" }}>
            Avance por producto · {fmtInt((order.lines || []).length)} líneas
            {order.receivedUnits > 0 && <span style={{ textTransform: "none", fontWeight: 500 }}> · {fmtInt(order.receivedUnits)} pzas recibidas en bodega</span>}
          </div>
          <LinesTable lines={order.lines || []} />
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: MUTED, margin: "12px 0 4px" }}>
            Tareas · {fmtInt(order.taskCount)}
          </div>
          <TasksTable tasks={order.tasks || []} todayYmd={todayYmd} />
        </div>
      )}
    </div>
  );
}

const PAGE = 60;

/** Avance de cada OP activa en piezas por etapa, qué se trabaja ahora y sus tareas. */
export default function OrderProgressPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderType, setOrderType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [onlyWorking, setOnlyWorking] = useState(false);
  const [onlyLate, setOnlyLate] = useState(false);
  const [openOrders, setOpenOrders] = useState(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getOrderProgress());
      setNow(new Date());
    } catch (e) {
      setError(e.message || "No se pudo cargar el avance de las órdenes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setLimit(PAGE); }, [orderType, search, onlyWorking, onlyLate]);

  const view = useMemo(
    () => buildProgressView(data, { orderType, search, onlyWorking, onlyLate }),
    [data, orderType, search, onlyWorking, onlyLate]
  );
  const types = useMemo(() => orderTypesIn(data), [data]);
  const todayYmd = data?.today ? String(data.today).slice(0, 10) : "";

  const filtersLabel = [
    orderType !== "ALL" ? `Tipo: ${ORDER_TYPE_LABELS[orderType] || orderType}` : null,
    search.trim() ? `Búsqueda: "${search.trim()}"` : null,
    onlyWorking ? "Solo con trabajo en mesa" : null,
    onlyLate ? "Solo atrasadas" : null,
  ].filter(Boolean).join(" · ");

  const toggleOrder = (id) => setOpenOrders((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const shown = view.orders.slice(0, limit);
  const allOpen = shown.length > 0 && shown.every((o) => openOrders.has(o.orderId));

  if (loading && !data) {
    return <div className="text-center py-5"><Spinner color="primary" /><div className="mt-2">Calculando avance de las órdenes…</div></div>;
  }
  if (error && !data) {
    return <Alert color="danger">{error} <Button size="sm" color="danger" outline className="ml-2" onClick={load}>Reintentar</Button></Alert>;
  }

  const t = view.totals;
  const st = t.stages;
  const toggleBtn = (active, onClick, label) => (
    <Button size="sm" color={active ? "primary" : "secondary"} outline={!active} onClick={onClick} className="my-0" style={{ flex: "1 1 auto" }}>
      {active ? "✓ " : ""}{label}
    </Button>
  );

  return (
    <div>
      {/* Filtros */}
      <Card style={CARD}>
        <CardBody style={{ paddingBottom: 8 }}>
          <Row className="align-items-end">
            <Col lg="3" md="4" className="mb-2">
              <small className="text-muted d-block mb-1">Tipo de orden</small>
              <Input type="select" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="ALL">Todas las órdenes activas</option>
                {types.map((tp) => <option key={tp} value={tp}>{ORDER_TYPE_LABELS[tp] || tp}</option>)}
              </Input>
            </Col>
            <Col lg="3" md="4" className="mb-2">
              <small className="text-muted d-block mb-1">Buscar</small>
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="OP, cliente, producto o tarea…" />
            </Col>
            <Col lg="3" md="4" className="mb-2">
              <small className="text-muted d-block mb-1">Mostrar solo</small>
              <div className="d-flex" style={{ gap: 6 }}>
                {toggleBtn(onlyWorking, () => setOnlyWorking((v) => !v), "En mesa ahora")}
                {toggleBtn(onlyLate, () => setOnlyLate((v) => !v), "Atrasadas")}
              </div>
            </Col>
            <Col lg="3" md="12" className="mb-2 text-lg-right">
              <Button color="success" className="mr-2 my-0" onClick={() => exportOrderProgressExcel(view, filtersLabel)} disabled={view.orders.length === 0}>
                <i className="fa fa-file-excel-o mr-1" /> Excel
              </Button>
              <Button color="secondary" outline className="my-0" onClick={load} disabled={loading} title="Volver a calcular">
                {loading ? <Spinner size="sm" /> : <i className="fa fa-refresh" />}
              </Button>
            </Col>
          </Row>
          <div className="d-flex flex-wrap align-items-center" style={{ gap: "2px 12px", fontSize: 12, color: MUTED }}>
            {STAGES.map((s) => (
              <span key={s.key} style={{ whiteSpace: "nowrap" }}>
                <span style={{ display: "inline-block", width: 10, height: 10, background: s.color, borderRadius: 2, marginRight: 4 }} />
                {s.label}
              </span>
            ))}
            {data?.generatedAt && <span>· Calculado {formatDateTimeGt(data.generatedAt)}</span>}
          </div>
          {error && <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>{error}</div>}
        </CardBody>
      </Card>

      {/* Totales en piezas */}
      <Row className="mb-2">
        <Col xl lg="3" sm="4" xs="6" className="mb-2">
          <Kpi label="Piezas pedidas" value={fmtInt(st.units)} hint={`${fmtInt(t.orders)} órdenes activas`} />
        </Col>
        <Col xl lg="3" sm="4" xs="6" className="mb-2">
          <Kpi label="Terminadas" swatch={STAGES[0].color} value={fmtInt(st.done)} tone="#047857" hint={`${pctOf(st.done, st.units)}% de lo pedido`} />
        </Col>
        <Col xl lg="3" sm="4" xs="6" className="mb-2">
          <Kpi label="En bodega/QA" swatch={STAGES[1].color} value={fmtInt(st.warehouse)} tone="#6d28d9" hint="terminadas en mesa, por recibir" />
        </Col>
        <Col xl lg="3" sm="4" xs="6" className="mb-2">
          <Kpi
            label="En mesa ahora"
            swatch={STAGES[2].color}
            value={fmtInt(st.inProgress)}
            tone="#1d4ed8"
            bg="#eff6ff"
            hint={`${fmtInt(t.tasksInProgress)} tareas · ${fmtInt(t.ordersWorkingNow)} OP`}
          />
        </Col>
        <Col xl lg="4" sm="4" xs="6" className="mb-2">
          <Kpi label="Por iniciar" swatch={STAGES[3].color} value={fmtInt(st.pending)} tone="#b45309" hint="con tarea, sin empezar" />
        </Col>
        <Col xl lg="4" sm="6" xs="6" className="mb-2">
          <Kpi label="Sin tarea" swatch={STAGES[4].color} value={fmtInt(st.noTask)} tone="#4b5563" hint="falta armar la tarea" />
        </Col>
        <Col xl lg="4" sm="6" xs="12" className="mb-2">
          <Kpi
            label="OP atrasadas"
            value={fmtInt(t.lateOrders)}
            tone={t.lateOrders > 0 ? "#b91c1c" : "#047857"}
            bg={t.lateOrders > 0 ? "#fef2f2" : "#fff"}
            hint={t.lateOrders > 0 ? `${fmtInt(t.lateUnits)} pzas sin terminar` : "ninguna vencida"}
          />
        </Col>
      </Row>

      {/* Avance general */}
      {st.units > 0 && (
        <Card style={CARD}>
          <CardBody>
            <div className="d-flex justify-content-between flex-wrap" style={{ gap: 6, marginBottom: 6 }}>
              <strong>Avance total en piezas</strong>
              <span style={{ fontSize: 13, color: MUTED }}>{fmtInt(st.done)} de {fmtInt(st.units)} terminadas ({pctOf(st.done, st.units)}%)</span>
            </div>
            <StageBar stages={st} height={24} />
            <div style={{ marginTop: 6 }}><StageChips stages={st} /></div>
          </CardBody>
        </Card>
      )}

      {/* Por orden */}
      <Card style={CARD}>
        <CardHeader className="d-flex justify-content-between align-items-center flex-wrap" style={{ gap: 8 }}>
          <div>
            <h5 className="mb-0">Avance por orden</h5>
            <small className="text-muted">
              {fmtInt(view.orders.length)} órdenes, de la entrega más próxima a la más lejana. Toca una para ver sus productos y tareas.
            </small>
          </div>
          {shown.length > 0 && (
            <Button size="sm" color="secondary" outline className="my-0"
              onClick={() => setOpenOrders(allOpen ? new Set() : new Set(shown.map((o) => o.orderId)))}>
              {allOpen ? "Cerrar todas" : "Abrir todas"}
            </Button>
          )}
        </CardHeader>
        <CardBody className="p-0">
          {view.orders.length === 0 ? (
            <Alert color="light" className="m-3">No hay órdenes con estos filtros.</Alert>
          ) : (
            <>
              {shown.map((o) => (
                <OrderRow
                  key={o.orderId}
                  order={o}
                  open={openOrders.has(o.orderId)}
                  onToggle={() => toggleOrder(o.orderId)}
                  todayYmd={todayYmd}
                  now={now}
                />
              ))}
              {view.orders.length > shown.length && (
                <div className="text-center" style={{ borderTop: "1px solid #e5e7eb", padding: 10 }}>
                  <Button size="sm" color="secondary" outline className="my-0" onClick={() => setLimit((n) => n + PAGE)}>
                    Ver {fmtInt(Math.min(PAGE, view.orders.length - shown.length))} más de {fmtInt(view.orders.length - shown.length)}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
