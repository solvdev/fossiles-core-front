import React, { useState } from "react";
import {
  addDays, fDate, fK, fN, fQ, monthName, pct,
} from "views/executive/executiveModel";
import {
  BarCell, Card, Chips, Decide, GridTable, KpiGrid, Track, WeekColumns,
} from "views/executive/ExecutiveParts";

/* ================================================================ Resumen */

function AlertItem({ alert, open, onToggle, onGo }) {
  return (
    <div className="x-alert">
      <span>
        <span className={`x-tag ${alert.tone}`}>{alert.tag}</span>
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: "1 1 260px" }}>
            <div className="x-alert-title">{alert.title}</div>
            <div className="x-alert-detail">{alert.detail}</div>
            <div className="x-alert-action">→ {alert.action}</div>
          </div>
          <button type="button" className={`x-chip ${open ? "on" : ""}`} aria-expanded={open} onClick={onToggle}>
            {open ? "Ocultar" : "Ver detalle"}
          </button>
        </div>
        {open ? (
          <div className="x-alert-box">
            <div className="x-kpi-label">{alert.dTitle}</div>
            <GridTable
              cols={[
                { label: alert.head[0], width: "minmax(0, 1.4fr)", cls: "b" },
                { label: alert.head[1], align: "r" },
                { label: alert.head[2], align: "r" },
                { label: alert.head[3], align: "r" },
              ]}
              rows={alert.rows.map((r) => [r.c0, r.c1, r.c2, <span className={r.bad ? "down" : ""}>{r.c3}</span>])}
            />
            {alert.note ? <p className="x-hint" style={{ color: "#3D4657" }}>{alert.note}</p> : null}
            <button type="button" className="x-chip" style={{ marginTop: 10 }} onClick={onGo}>
              {alert.goLabel} →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SummaryPage({ m, go }) {
  const { prod, sales, fin, recv, orders, data } = m;
  const [openId, setOpenId] = useState(m.alerts[0]?.id || null);
  const bigOrders = orders.rows.slice(0, 4);
  const topK = sales.kiosks.filter((k) => k.tickets > 0);
  const ends = [...topK.slice(0, 3).map((k) => ({ ...k, up: true })), ...topK.slice(-3).reverse().map((k) => ({ ...k, up: false }))];
  return (
    <div className="x-stack">
      <KpiGrid
        items={[
          {
            label: `Ventas kioscos · ${data.days} días`,
            value: fQ(sales.sales),
            delta: sales.delta == null ? "" : `${sales.delta >= 0 ? "▲" : "▼"} ${pct(Math.abs(sales.delta), 1)}`,
            tone: sales.delta >= 0 ? "up" : "down",
            sub: "vs periodo anterior",
          },
          { label: `Piezas producidas · ${data.days} días`, value: fN(prod.pieces), sub: `${fN(prod.tasks)} tareas · ${fN(prod.hours)} h` },
          { label: "Pendiente por producir", value: fN(prod.backlogPending), sub: "piezas en órdenes abiertas (sin cinchos)" },
          {
            label: "Al ritmo actual termina en",
            value: prod.weeksToFinish == null ? "—" : `${fN(prod.weeksToFinish, 1)} sem`,
            sub: prod.finishDate ? `≈ ${fDate(prod.finishDate)}` : "",
          },
          {
            label: "Órdenes atrasadas",
            value: fN(orders.overdue),
            delta: orders.open ? pct(orders.overdue / orders.open) : "",
            tone: "down",
            sub: `de ${fN(orders.open)} abiertas`,
          },
          fin.goalTotal > 0
            ? {
                label: `${monthName(fin.month)} vs meta`,
                value: pct(fin.projTotal / fin.goalTotal),
                tone: "",
                sub: `proyección ${fK(fin.projTotal)} de ${fK(fin.goalTotal)}`,
              }
            : null,
          fin.yoy != null
            ? {
                label: `${monthName(fin.month)} vs año pasado`,
                value: `${fin.yoy >= 0 ? "▲" : "▼"} ${pct(Math.abs(fin.yoy), 1)}`,
                sub: `días 1–${fin.sameDaysUntil}, todos los kioscos`,
              }
            : null,
          { label: "Por cobrar a clientes", value: fK(recv.balance), sub: `${fN(recv.customers)} clientes · cobrado ${fK(recv.collectedInPeriod)}` },
        ]}
      />

      <div className="x-row">
        <Card
          title="Qué atender"
          hint="Ordenado por impacto. Solo aparece lo que los datos justifican; «Ver detalle» abre los números detrás."
          style={{ flex: "3 1 460px" }}
        >
          <div style={{ marginTop: 6 }}>
            {m.alerts.length === 0 ? <div className="x-empty">Nada urgente en este periodo.</div> : null}
            {m.alerts.map((a) => (
              <AlertItem
                key={a.id}
                alert={a}
                open={openId === a.id}
                onToggle={() => setOpenId(openId === a.id ? null : a.id)}
                onGo={() => go(a.page, a.goState)}
              />
            ))}
          </div>
        </Card>
        <div style={{ flex: "2 1 340px", display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <Card title="Ventas de kioscos por semana" hint="La barra clara es la semana en curso.">
            <WeekColumns weeks={sales.weeks.slice(-8)} money />
          </Card>
          <Card title="Piezas producidas por semana" hint={`Promedio de las últimas 4 semanas completas: ${fN(prod.avgWeekPieces)} piezas.`}>
            <WeekColumns weeks={prod.weeks.slice(-8)} />
          </Card>
        </div>
      </div>

      <div className="x-grid">
        <Card title="Lo que más se vende ahora" hint={`Unidades vendidas en kioscos, ${data.days} días.`}>
          <GridTable
            cols={[{ label: "Producto", width: "minmax(0, 1fr)", cls: "ell" }, { label: "", width: "90px" }, { label: "Uds", width: "48px", align: "r", cls: "b" }]}
            rows={sales.top.slice(0, 5).map((t) => [
              <span><b>{t.code}</b> <span className="muted">{t.label}</span></span>,
              <Track parts={[{ w: (t.qty / (sales.top[0]?.qty || 1)) * 100 }]} />,
              fN(t.qty),
            ])}
          />
        </Card>
        <Card title="Kioscos: los que más y los que menos" hint={`Venta de los últimos ${data.days} días.`}>
          <GridTable
            cols={[{ label: "Kiosco", width: "minmax(0, 1fr)", cls: "ell" }, { label: "Venta", width: "96px", align: "r", cls: "b" }]}
            rows={ends.map((k) => [
              <span><span className={`x-tag ${k.up ? "prod" : "inv"}`}>{k.up ? "Arriba" : "Abajo"}</span> {k.label}</span>,
              fQ(k.sales),
            ])}
          />
        </Card>
        <Card title="Órdenes grandes" hint="Azul = terminado, claro = en proceso.">
          {bigOrders.map((o) => (
            <div key={o.id} style={{ padding: "8px 0", borderBottom: "1px solid #EEF1F5" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <b>{o.code}</b>
                <span className="num">{pct(o.progress)}</span>
              </div>
              <Track className="" parts={[{ w: o.pd }, { w: o.pw, cls: "x-fill2" }]} />
              <div className="x-hint">
                {fN(Math.min(o.done, o.ordered))} de {fN(o.ordered)} terminadas
                {o.inProgress ? ` · ${fN(o.inProgress)} en proceso` : ""} · {o.customer}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ================================================================ Producción */

export function ProductionPage({ m }) {
  const { prod, leather, data } = m;
  const [target, setTarget] = useState(8);
  const [cost, setCost] = useState("");
  const costNum = Number(cost);
  const hasCost = cost !== "" && costNum > 0;
  const need = prod.backlogPending / target;
  const ratio = prod.avgWeekPieces > 0 ? need / prod.avgWeekPieces : null;
  return (
    <div className="x-stack">
      <KpiGrid
        items={[
          prod.startedOn
            ? { label: "Desde el inicio", value: `${fN(prod.daysSinceStart)} días`, sub: `desde el ${fDate(prod.startedOn)} · ${fN(prod.totalPieces)} piezas en ${fN(prod.totalTasks)} tareas` }
            : null,
          { label: `Producido · ${data.days} días`, value: fN(prod.pieces), sub: `piezas · ${fN(prod.pieces / prod.workDays)} por día hábil` },
          { label: "Horas por pieza", value: `${fN(prod.hoursPerPiece, 1)} h`, sub: `${fN(prod.hours)} h registradas` },
          { label: "Tareas a tiempo", value: pct(prod.onTime), delta: `${fN(prod.delayedTasks)} atrasadas`, tone: "down", sub: `de ${fN(prod.tasks)} terminadas` },
          { label: "Pendiente", value: fN(prod.backlogPending), sub: prod.weeksToFinish == null ? "piezas" : `piezas · ${fN(prod.weeksToFinish, 1)} semanas al ritmo actual` },
        ]}
      />

      <div className="x-row">
        <Card
          title="Ritmo de producción"
          hint={`Piezas terminadas por semana. Promedio reciente: ${fN(prod.avgWeekPieces)} por semana.`}
          style={{ flex: "3 1 440px" }}
        >
          <WeekColumns weeks={prod.weeks} />
        </Card>
        <Card title="¿Cuándo termino lo que queda?" hint="Piezas pendientes en órdenes abiertas, sin las de cinchos por talla." style={{ flex: "2 1 340px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12 }}>
            <div>
              <div className="x-kpi-label">Faltan</div>
              <div className="x-kpi-value">{fN(prod.backlogPending)}</div>
              <div className="x-kpi-sub">piezas</div>
            </div>
            <div>
              <div className="x-kpi-label">Al ritmo actual</div>
              <div className="x-kpi-value">{prod.weeksToFinish == null ? "—" : `${fN(prod.weeksToFinish, 1)} sem`}</div>
              <div className="x-kpi-sub">{prod.finishDate ? `termina ≈ ${fDate(prod.finishDate)}` : ""}</div>
            </div>
          </div>
          <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600 }}>Quiero terminar en:</div>
          <div className="x-chips" style={{ marginTop: 8 }}>
            <Chips options={[4, 8, 12, 16].map((w) => [w, `${w} semanas`])} value={target} onChange={setTarget} />
          </div>
          <Decide>
            Para terminar en <b>{target} semanas</b> (≈ {fDate(addDays(data.to, target * 7))}) se necesitan{" "}
            <b>{fN(need)} piezas por semana</b>
            {ratio == null ? "." : ratio <= 1 ? ", menos que el ritmo actual. Alcanza." : `, ${fN(ratio, 1)} veces el ritmo actual. Faltan ${fN(need - prod.avgWeekPieces)} por semana: más personal, horas extra o maquila.`}
          </Decide>
        </Card>
      </div>

      <div className="x-row">
        <Card title="¿De quién es la producción?" hint={`Participación de cada mesa en las piezas terminadas (${data.days} días).`} style={{ flex: "1 1 420px" }}>
          <GridTable
            minWidth={460}
            cols={[
              { label: "Mesa", width: "110px", cls: "b" },
              { label: "% de las piezas", width: "minmax(0, 1fr)" },
              { label: "Piezas", width: "56px", align: "r" },
              { label: "Horas", width: "60px", align: "r" },
              { label: "h/pieza", width: "64px", align: "r" },
            ]}
            rows={prod.desks.map((d) => [
              d.label,
              <BarCell parts={[{ w: d.w }]} value={pct(d.share)} />,
              fN(d.pieces),
              d.hours == null ? "—" : fN(d.hours),
              <span className={d.slow ? "down" : ""}>{d.hp == null ? "—" : fN(d.hp, 1)}</span>,
            ])}
          />
          {prod.slowDesk || prod.noHours.length ? (
            <Decide>
              {prod.slowDesk ? (
                <>
                  {prod.slowDesk.label} usa <b>{fN(prod.slowDesk.hp, 1)} h por pieza</b> contra {fN(prod.hoursPerPiece, 1)} h de promedio. Revisar qué
                  productos le tocan o si deja tareas abiertas de un día para otro.{" "}
                </>
              ) : null}
              {prod.noHours.length ? `${prod.noHours.map((d) => d.label).join(", ")} no registra horas.` : ""}
            </Decide>
          ) : null}
        </Card>

        <Card
          title="¿Dónde se va el tiempo (y el dinero)?"
          hint={`Productos con más horas en ${data.days} días.`}
          style={{ flex: "1 1 420px" }}
          actions={
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label htmlFor="xdash-cost" style={{ fontSize: 12, fontWeight: 600, color: "#3D4657", margin: 0 }}>
                Costo por hora de mano de obra (Q)
              </label>
              <input id="xdash-cost" className="x-input" type="number" min="0" step="1" placeholder="Ej. 20" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
          }
        >
          <GridTable
            minWidth={480}
            cols={[
              { label: "Producto", width: "minmax(0, 1.3fr)", cls: "b ell" },
              { label: "Horas", width: "minmax(0, 1fr)" },
              { label: "Pzs", width: "46px", align: "r" },
              { label: "h/pieza", width: "60px", align: "r" },
              { label: "Q/pieza", width: "70px", align: "r" },
            ]}
            rows={prod.productTime.map((r) => [
              <span title={r.name}>{r.code}</span>,
              <BarCell parts={[{ w: r.w, cls: "x-fillo" }]} value={fN(r.hours)} />,
              fN(r.pieces),
              fN(r.hp, 1),
              hasCost ? fQ(r.hp * costNum) : "—",
            ])}
          />
          {prod.top3.length ? (
            <Decide>
              {prod.top3.map((r) => r.code).join(", ")} se llevan <b>{fN(prod.top3Hours)} horas</b> con {fN(prod.top3Pieces)} piezas ({pct(prod.top3HoursShare)} de
              las horas). Si su precio no cubre ese tiempo, conviene subir precio, simplificar el modelo o mandarlo a maquila.
            </Decide>
          ) : null}
        </Card>
      </div>

      <Card
        title="¿Alcanza el cuero para lo que está pedido?"
        hint="Cuero que necesitan las piezas que aún no empiezan (según receta por color) contra lo que hay en bodega, en pies²."
      >
        <GridTable
          minWidth={600}
          cols={[
            { label: "Cuero", width: "minmax(0, 1.4fr)", cls: "b ell" },
            { label: "Se necesita", width: "92px", align: "r" },
            { label: "Hay", width: "80px", align: "r" },
            { label: "Cubierto", width: "minmax(0, 1.2fr)" },
            { label: "Falta", width: "90px", align: "r" },
          ]}
          rows={leather.rows.map((l) => [
            l.label,
            fN(l.needed),
            fN(l.available),
            <BarCell parts={[{ w: l.covered * 100 }]} value={pct(l.covered)} />,
            <span className={l.missing > 0 ? "down" : ""}>{fN(l.missing)}</span>,
          ])}
          empty="Las órdenes abiertas no piden cuero con receta."
        />
        {leather.missing > 0 ? (
          <Decide>
            Faltan <b>{fN(leather.missing)} pies²</b>. {leather.short.slice(0, 4).map((r) => r.label).join(", ")} son los que paran la producción: definir cuánto
            comprar ya y qué parte de las órdenes se puede dejar para después.
          </Decide>
        ) : null}
      </Card>

      <Card className="soft" title="Para que los tiempos sean exactos">
        <p className="x-hint">
          El tiempo de una tarea se mide de inicio a fin, con pausas y noches incluidas, y la maquila no registra horas. Con una pausa obligatoria al cerrar el
          día, las horas por pieza pasan a ser costo real.
        </p>
      </Card>
    </div>
  );
}

/* ================================================================ Órdenes */

const ORDER_FILTERS = [
  ["todas", "Todas"],
  ["sin", "Sin empezar"],
  ["proceso", "En proceso"],
  ["casi", "Casi listas (80 %+)"],
];

export function OrdersPage({ m }) {
  const { orders } = m;
  const [filter, setFilter] = useState("todas");
  const backlog = m.prod;
  const rows = orders.rows.filter((o) => {
    if (filter === "sin") return o.done === 0 && o.inProgress === 0;
    if (filter === "proceso") return (o.done > 0 || o.inProgress > 0) && o.progress < 0.8;
    if (filter === "casi") return o.progress >= 0.8;
    return true;
  });
  const notStarted = orders.notStarted.slice(0, 3);
  return (
    <div className="x-stack">
      <KpiGrid
        items={[
          { label: "Órdenes abiertas", value: fN(orders.open), sub: `${fN(orders.pending)} pendientes · ${fN(orders.inProgress)} en proceso` },
          { label: "Atrasadas", value: fN(orders.overdue), delta: orders.open ? pct(orders.overdue / orders.open) : "", tone: "down", sub: "pasaron su fecha de entrega" },
          {
            label: "Avance general",
            value: backlog.backlogOrdered ? pct(backlog.backlogDone / backlog.backlogOrdered) : "—",
            sub: `${fN(backlog.backlogDone)} de ${fN(backlog.backlogOrdered)} piezas (sin cinchos)`,
          },
          { label: "En proceso ahora", value: fN(backlog.backlogInProgress), sub: "piezas en mesas" },
        ]}
      />
      <Card title="Órdenes abiertas por tipo" hint={`${fN(orders.open)} órdenes pendientes o en proceso.`}>
        <div style={{ marginTop: 14 }}>
          <Track className="tall" parts={orders.types.map((t) => ({ w: t.w, color: t.color }))} />
        </div>
        <div className="x-legend">
          {orders.types.map((t) => (
            <span key={t.type}>
              <span className="x-sw" style={{ background: t.color }} />
              {t.label} <b className="num">{fN(t.count)}</b>
            </span>
          ))}
        </div>
      </Card>
      <Card
        title="Avance por orden"
        hint="Porcentaje de piezas terminadas sobre lo pedido; las de cinchos se ven en su propia pantalla de producción."
        actions={<Chips options={ORDER_FILTERS} value={filter} onChange={setFilter} />}
      >
        <GridTable
          minWidth={680}
          cols={[
            { label: "Orden", width: "90px", cls: "b" },
            { label: "Cliente / destino", width: "minmax(0, 1.2fr)", cls: "ell muted" },
            { label: "Entrega", width: "84px" },
            { label: "Avance", width: "minmax(0, 1.4fr)" },
            { label: "Terminadas", width: "110px", align: "r" },
            { label: "Faltan", width: "70px", align: "r", cls: "b" },
          ]}
          rows={rows.map((o) => [
            o.code,
            <span title={o.customer}>{o.customer}</span>,
            o.deliveryDate ? (
              <span className={o.deliveryDate < m.data.to ? "down" : ""}>{fDate(o.deliveryDate, false)}</span>
            ) : (
              "—"
            ),
            <BarCell parts={[{ w: o.pd }, { w: o.pw, cls: "x-fill2" }]} value={pct(o.progress)} />,
            `${fN(Math.min(o.done, o.ordered))} de ${fN(o.ordered)}`,
            fN(o.pending),
          ])}
          empty="No hay órdenes con este filtro."
        />
        {notStarted.length ? (
          <Decide>
            {notStarted.map((o) => o.code).join(", ")} ({fN(notStarted.reduce((a, o) => a + o.ordered, 0))} piezas) no han empezado. Si tienen fecha cercana,
            darles prioridad en «Armar el día».
          </Decide>
        ) : null}
      </Card>
    </div>
  );
}
