import React, { useMemo, useState } from "react";
import {
  fDate, fK, fN, fQ, monthName, pct, productName,
} from "views/executive/executiveModel";
import {
  BarCell, Card, Chips, Decide, GridTable, KpiGrid, Pill, Track, WeekColumns,
} from "views/executive/ExecutiveParts";

/* ================================================================ Rentabilidad */

const PV_FILTERS = (rent) => [
  ["todos", "Todos"],
  ["over", `Se produce de más (${rent.over.length})`],
  ["under", `Falta producir (${rent.under.length})`],
];

export function ProfitabilityPage({ m, marginMode, setMarginMode }) {
  const { rent, sales, fin, data } = m;
  const [pvFilter, setPvFilter] = useState("todos");
  const pvRows = rent.pv.filter((r) => pvFilter === "todos" || r.kind === pvFilter);
  const monthsOfStock = sales.sales > 0 ? rent.bandTotal / (sales.sales / data.days) / 30 : null;
  const topMargin = rent.margins.slice(0, 3);
  const lowMargin = rent.margins.slice(-3);
  const overTop = [...rent.over].sort((a, b) => b.producedForKiosks - a.producedForKiosks).slice(0, 2);
  const underTop = [...rent.under].sort((a, b) => b.soldKiosks - a.soldKiosks).slice(0, 5);
  const slowTop = rent.slow[0];
  return (
    <div className="x-stack">
      <KpiGrid
        items={[
          { label: "Inventario en kioscos y bodega", value: fK(rent.bandTotal), sub: `${fN(rent.bandPieces)} piezas a precio de venta` },
          monthsOfStock != null ? { label: "Meses de venta guardados", value: fN(monthsOfStock, 1), sub: `al ritmo de los últimos ${data.days} días` } : null,
          rent.over365 ? { label: "Alcanza para más de 1 año", value: fK(rent.over365.value), sub: `${fN(rent.over365.products)} productos` } : null,
          { label: "Se produce de más", value: fN(rent.over.length), sub: "productos con 2× o más de lo que venden" },
          { label: "Falta producir", value: fN(rent.under.length), sub: "se venden y casi no se hacen para kioscos" },
        ]}
      />

      <Card
        title="¿Producimos lo que se vende?"
        hint={`Últimos ${data.days} días. Producido para kioscos (órdenes OPK) contra lo que vendieron los kioscos. Lo de clientes va aparte porque ya está vendido.`}
        actions={<Chips options={PV_FILTERS(rent)} value={pvFilter} onChange={setPvFilter} />}
      >
        <div className="x-legend">
          <span><span className="x-sw" style={{ background: "#2F64E0" }} />Producido para kioscos</span>
          <span><span className="x-sw" style={{ background: "#D9631E" }} />Vendido en kioscos</span>
        </div>
        <GridTable
          minWidth={880}
          cols={[
            { label: "Producto", width: "minmax(0, 1.5fr)", cls: "ell" },
            { label: "Producido vs vendido", width: "minmax(0, 1.3fr)" },
            { label: "Hecho kiosco", width: "74px", align: "r", cls: "b" },
            { label: "Vendido", width: "70px", align: "r", cls: "b" },
            { label: "Clientes", width: "70px", align: "r", cls: "muted" },
            { label: "Existencia", width: "84px", align: "r" },
            { label: "Alcanza", width: "84px", align: "r" },
            { label: "Lectura", width: "140px" },
          ]}
          rows={pvRows.map((r) => [
            <span title={r.name}><b>{r.code}</b> <span className="muted">{r.label}</span></span>,
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <Track className="thin" parts={[{ w: r.wP }]} />
              <Track className="thin" parts={[{ w: r.wS, cls: "x-fillo" }]} />
            </span>,
            fN(r.producedForKiosks),
            fN(r.soldKiosks),
            fN(r.producedForClients),
            fN(r.stock),
            r.coverMonths == null ? "—" : `${fN(r.coverMonths, 1)} meses`,
            <Pill tone={r.tone}>{r.verdict}</Pill>,
          ])}
          empty="No hay productos con este filtro."
        />
        {overTop.length || underTop.length ? (
          <Decide>
            {overTop.length ? (
              <>
                Para kioscos se hicieron <b>{overTop.map((r) => `${fN(r.producedForKiosks)} ${r.code}`).join(" y ")}</b>, que venden{" "}
                {overTop.map((r) => fN(r.soldKiosks)).join(" y ")} en el periodo.{" "}
              </>
            ) : null}
            {underTop.length ? (
              <>
                En cambio <b>{underTop.map((r) => r.code).join(", ")}</b>, que se venden, casi no tuvieron producción para kioscos.{" "}
              </>
            ) : null}
            {fin.season && fin.season > 1.3
              ? `Parte de lo que sobra puede ser para la temporada (el año pasado ${monthName(fin.month === 12 ? 1 : fin.month + 1)} vendió ${fN(fin.season, 1)} veces lo de ${monthName(fin.month)}), pero las OPK deberían seguir lo que se vende.`
              : "Las próximas OPK deberían seguir lo que se vende."}
          </Decide>
        ) : null}
      </Card>

      <Card
        title="¿Qué deja más por hora de planta?"
        hint="Precio de kiosco sin IVA, menos cuero y materiales de la receta, dividido entre las horas que tarda una pieza. Es lo que queda para pagar planilla, kioscos y ganancia."
        actions={<Chips options={[["real", "Horas reales"], ["std", "Horas estándar"]]} value={marginMode} onChange={setMarginMode} />}
      >
        <GridTable
          minWidth={780}
          cols={[
            { label: "#", width: "30px", cls: "muted" },
            { label: "Producto", width: "minmax(0, 1.4fr)", cls: "ell" },
            { label: "Precio", width: "76px", align: "r" },
            { label: "Cuero + mat.", width: "86px", align: "r" },
            { label: "Margen", width: "84px", align: "r" },
            { label: "h/pieza", width: "64px", align: "r" },
            { label: "Por hora de planta", width: "minmax(0, 1.2fr)" },
            { label: "Q/hora", width: "80px", align: "r", cls: "b" },
          ]}
          rows={rent.margins.map((r) => [
            r.rank,
            <span title={r.name}><b>{r.code}</b> <span className="muted">{r.label}</span></span>,
            fQ(r.price),
            fQ(r.cost),
            fQ(r.margin),
            fN(r.hours, 2),
            <Track parts={[{ w: r.w, cls: r.tone === "fill" ? "x-fill" : r.tone === "fillo" ? "x-fillo" : "x-fill2" }]} />,
            fQ(r.perHour),
          ])}
          empty="Sin productos con precio y horas registradas."
        />
        {rent.margins.length >= 6 ? (
          <Decide>
            {marginMode === "std" ? "Con el tiempo estándar del catálogo" : "Con horas reales"},{" "}
            <b>{topMargin.map((r) => r.code).join(", ")}</b> dejan {fQ(topMargin[topMargin.length - 1].perHour)} o más por hora de planta;{" "}
            <b>{lowMargin.map((r) => r.code).join(", ")}</b> dejan {fQ(lowMargin[0].perHour)} o menos. Conviene empujar los primeros y revisar precio o
            proceso de los últimos.
            {marginMode === "std" ? " La diferencia contra las horas reales es tiempo que se pierde en la planta." : ""}
          </Decide>
        ) : null}
        <p className="x-hint" style={{ marginTop: 10 }}>
          Horas reales = mediana de las tareas de 90 días (menos afectada por tareas que quedaron abiertas). Si un producto no tiene herrajes en su receta,
          su costo de materiales sale más bajo de lo real. A clientes mayoristas se vende más barato que en kiosco.
        </p>
      </Card>

      <div className="x-row">
        <Card title="Dinero parado en inventario" hint={`${fK(rent.bandTotal)} en kioscos y bodega (a precio de venta), según cuánto tardaría en venderse al ritmo de 90 días.`} style={{ flex: "1 1 380px" }}>
          <div style={{ marginTop: 14 }}>
            <Track className="tall" parts={rent.bands.map((b) => ({ w: b.w, color: b.color }))} />
          </div>
          <GridTable
            cols={[
              { label: "", width: "14px" },
              { label: "Tarda en venderse", width: "minmax(0, 1fr)" },
              { label: "Piezas", width: "70px", align: "r" },
              { label: "Valor", width: "76px", align: "r", cls: "b" },
              { label: "%", width: "50px", align: "r", cls: "muted" },
            ]}
            rows={rent.bands.map((b) => [
              <span className="x-sw" style={{ background: b.color }} />,
              <span>{b.label} <span className="muted">· {fN(b.products)} productos</span></span>,
              fN(b.pieces),
              fK(b.value),
              pct(b.share),
            ])}
          />
          <Decide>
            El <b>{pct(rent.slowShare)}</b> del inventario tarda más de 6 meses en venderse o no se está vendiendo. Antes de producir más para kioscos,
            conviene moverlo: promociones, cambiarlo de kiosco o venderlo por mayor.
          </Decide>
        </Card>
        <Card title="Lo que más dinero tiene parado" hint="Productos con más de un año de existencia al ritmo de venta de los últimos 90 días." style={{ flex: "1 1 460px" }}>
          <GridTable
            minWidth={540}
            cols={[
              { label: "Producto", width: "minmax(0, 1.5fr)", cls: "ell" },
              { label: "Kioscos", width: "66px", align: "r" },
              { label: "PT", width: "56px", align: "r" },
              { label: "Venta 90 d", width: "72px", align: "r" },
              { label: "Valor", width: "74px", align: "r", cls: "b" },
              { label: "Alcanza para", width: "100px", align: "r", cls: "down" },
            ]}
            rows={rent.slow.slice(0, 10).map((s) => [
              <span title={s.name}><b>{s.code}</b> <span className="muted">{s.label}</span></span>,
              fN(s.kioskStock),
              fN(s.warehouseStock),
              fN(s.sold90),
              fK(s.value),
              s.coverageDays == null ? "sin venta" : s.coverageDays > 1095 ? "más de 3 años" : `${fN(s.coverageDays / 30)} meses`,
            ])}
            empty="Nada con más de un año de existencia."
          />
          {slowTop ? (
            <Decide>
              {slowTop.code} {slowTop.label} tiene <b>{fN(slowTop.kioskStock + slowTop.warehouseStock)} piezas</b> ({fK(slowTop.value)}) y se venden{" "}
              {fN(slowTop.sold90)} cada 90 días. No conviene producir más de estos hasta bajar la existencia.
            </Decide>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/* ================================================================ Ventas de kioscos */

export function SalesPage({ m, kiosk, setKiosk }) {
  const { sales, fin, data } = m;
  const selected = kiosk ? sales.kiosks.find((k) => k.locationId === kiosk) : null;
  const goal = selected ? fin.rows.find((r) => r.locationId === selected.locationId) : null;
  const panelTop = selected
    ? selected.top.map((t) => ({ code: t.code, label: productName(t.name), qty: t.qty }))
    : sales.top.slice(0, 10).map((t) => ({ code: t.code, label: t.label, qty: t.qty }));
  const maxQ = Math.max(1, ...panelTop.map((t) => t.qty));
  const wallets = sales.top.slice(0, 10).filter((t) => /^B-/.test(t.code)).length;
  const lowWarn = sales.lowStock.filter((t) => t.kiosksLow >= 5);
  return (
    <div className="x-stack">
      <KpiGrid
        items={[
          {
            label: `Ventas · ${data.days} días`,
            value: fQ(sales.sales),
            delta: sales.delta == null ? "" : `${sales.delta >= 0 ? "▲" : "▼"} ${pct(Math.abs(sales.delta), 1)}`,
            tone: sales.delta >= 0 ? "up" : "down",
            sub: "vs periodo anterior",
          },
          { label: "Ventas (tickets)", value: fN(sales.tickets), sub: `en ${fN(sales.activeCount)} kioscos con venta` },
          { label: "Ticket promedio", value: fQ(sales.ticketAvg), sub: "por venta" },
          { label: "Artículos vendidos", value: fN(sales.units), sub: sales.tickets ? `${fN(sales.units / sales.tickets, 1)} por venta` : "" },
        ]}
      />
      <Card title="Ventas por semana" hint="La barra clara es la semana en curso.">
        <WeekColumns weeks={sales.weeks} money />
      </Card>
      <div className="x-row">
        <Card title="Ranking de kioscos" hint="Toca un kiosco para ver qué se vende más ahí." style={{ flex: "1 1 360px" }}>
          <div className="x-klist">
            <button type="button" className={`x-krow ${selected ? "" : "on"}`} onClick={() => setKiosk(null)}>
              <span className="muted">·</span>
              <span className="b">Todos los kioscos</span>
              <span className="r b num">{fK(sales.sales)}</span>
            </button>
            {sales.kiosks.map((k) => (
              <button
                key={k.locationId}
                type="button"
                className={`x-krow ${selected && selected.locationId === k.locationId ? "on" : ""}`}
                onClick={() => setKiosk(k.locationId)}
              >
                <span className="muted num">{k.rank}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="ell" style={{ display: "block" }}>{k.label}</span>
                  <Track className="thin" parts={[{ w: k.w }]} />
                </span>
                <span className="r b num">{fK(k.sales)}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card
          title={selected ? `Lo que más se vende en ${selected.label}` : "Lo que más se vende en todos los kioscos"}
          hint={selected ? `Puesto ${selected.rank} de ${sales.kiosks.length} en venta de los últimos ${data.days} días.` : `Unidades vendidas en ${data.days} días (sin empaques ni cinchos por talla).`}
          style={{ flex: "2 1 440px" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 12 }}>
            {(selected
              ? [
                  ["Venta", fQ(selected.sales)],
                  ["Ventas", fN(selected.tickets)],
                  ["Ticket promedio", selected.tickets ? fQ(selected.sales / selected.tickets) : "—"],
                  ["Meta del mes", goal && goal.goal > 0 ? `${pct(goal.mtdPct)} al día ${Math.floor(fin.daysElapsed + 0.5)}` : "Sin meta"],
                ]
              : [
                  ["Venta", fK(sales.sales)],
                  ["Ventas", fN(sales.tickets)],
                  ["Ticket promedio", fQ(sales.ticketAvg)],
                  ["Kioscos con venta", fN(sales.activeCount)],
                ]
            ).map(([label, value]) => (
              <div className="x-mini" key={label}>
                <div className="x-kpi-label">{label}</div>
                <div className="v">{value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <GridTable
              cols={[
                { label: "#", width: "34px", cls: "muted" },
                { label: "Producto", width: "minmax(0, 1fr)", cls: "ell" },
                { label: "Unidades", width: "minmax(0, 1fr)" },
                { label: "Uds", width: "56px", align: "r", cls: "b" },
              ]}
              rows={panelTop.map((t, i) => [
                i + 1,
                <span><b>{t.code}</b> <span className="muted">{t.label}</span></span>,
                <Track parts={[{ w: (t.qty / maxQ) * 100 }]} />,
                fN(t.qty),
              ])}
              empty="Sin ventas en el periodo."
            />
          </div>
          {!selected && wallets >= 6 ? <Decide>Billeteras: {wallets} de los 10 más vendidos. Si hay que priorizar producción, estas son las que rotan.</Decide> : null}
          {selected ? <Decide>Para el siguiente envío a {selected.label}, priorizar lo que se vende ahí y no lo que sobra en bodega.</Decide> : null}
        </Card>
      </div>
      <Card title="Inventario bajo de lo más vendido" hint={`Los ${sales.lowStock.length} productos que más se venden y cuántos kioscos se están quedando sin ellos.`}>
        <GridTable
          minWidth={820}
          cols={[
            { label: "Producto", width: "minmax(0, 1.4fr)", cls: "ell" },
            { label: "Vendidas", width: "76px", align: "r" },
            { label: "En kioscos", width: "86px", align: "r" },
            { label: "Bodega PT", width: "80px", align: "r" },
            { label: "Sin stock", width: "76px", align: "r" },
            { label: "Con 1–2 u", width: "80px", align: "r", cls: "b" },
            { label: "Cobertura", width: "90px", align: "r" },
            { label: "Qué hacer", width: "150px" },
          ]}
          rows={sales.lowStock.map((t) => [
            <span title={t.name}><b>{t.code}</b> <span className="muted">{t.label}</span></span>,
            fN(t.qty),
            fN(t.kioskStock),
            fN(t.warehouseStock),
            fN(t.kiosksWithout),
            fN(t.kiosksLow),
            t.coverDays == null ? "—" : `${fN(t.coverDays)} días`,
            <Pill tone={t.tone}>{t.action}</Pill>,
          ])}
        />
        {lowWarn.length ? (
          <Decide>
            {lowWarn.map((t) => `${t.code} ${t.label}`).join(", ")} están <b>repartidos muy delgado</b>: {lowWarn.map((t) => `${t.kiosksLow}`).join(", ")} kioscos
            con 1 o 2 unidades. {lowWarn.map((t) => `${t.code}: ${t.action.toLowerCase()} (${fN(t.warehouseStock)} en bodega)`).join(". ")}.
          </Decide>
        ) : null}
      </Card>
    </div>
  );
}

/* ================================================================ Finanzas */

const FIN_SORTS = [
  ["util", "Utilidad"],
  ["meta", "% de meta"],
  ["venta", "Venta"],
];

export function FinancePage({ m }) {
  const { fin, recv, ads } = m;
  const [sort, setSort] = useState("util");
  const rows = useMemo(() => {
    const list = [...fin.rows];
    const profit = (r) => (r.pnl ? r.pnl.profit : -Infinity);
    if (sort === "util") list.sort((a, b) => profit(b) - profit(a));
    if (sort === "meta") list.sort((a, b) => (b.projPct || 0) - (a.projPct || 0));
    if (sort === "venta") list.sort((a, b) => (b.pnl ? b.pnl.sales : 0) - (a.pnl ? a.pnl.sales : 0));
    return list;
  }, [fin.rows, sort]);
  const pnlMonth = fin.pnlMonth ? monthName(fin.pnlMonth) : "";
  const curMonth = monthName(fin.month);
  const day = Math.floor(fin.daysElapsed + 0.5);
  const adsWithRatio = ads.filter((a) => a.ratio != null);
  const ratios = adsWithRatio.map((a) => a.ratio);
  return (
    <div className="x-stack">
      <KpiGrid
        items={[
          { label: `Meta de ${curMonth}`, value: fK(fin.goalTotal), sub: `suma de ${fN(fin.rows.filter((r) => r.goal > 0).length)} kioscos` },
          { label: `Vendido al día ${day}`, value: fK(fin.mtdTotal), delta: fin.goalTotal ? pct(fin.mtdTotal / fin.goalTotal) : "", sub: "de la meta" },
          {
            label: "Proyección al cierre",
            value: fK(fin.projTotal),
            delta: fin.goalTotal ? pct(fin.projTotal / fin.goalTotal) : "",
            tone: fin.goalTotal && fin.projTotal / fin.goalTotal >= 0.9 ? "up" : "down",
            sub: "de la meta",
          },
          fin.hasPnl ? { label: `Utilidad ${pnlMonth}`, value: fK(fin.profitTotal), tone: fin.profitTotal >= 0 ? "up" : "down", sub: "P&L de Finanzas por kiosco" } : null,
          fin.hasPnl ? { label: "Kioscos con pérdida", value: fN(fin.losers.length), sub: `en ${pnlMonth}` } : null,
          fin.yoy != null
            ? {
                label: `${curMonth} vs año pasado`,
                value: `${fin.yoy >= 0 ? "▲" : "▼"} ${pct(Math.abs(fin.yoy), 1)}`,
                tone: fin.yoy >= 0 ? "up" : "down",
                sub: `días 1–${fin.sameDaysUntil}: ${fK(fin.monthToDate)} contra ${fK(fin.lastYearSameDays)}`,
              }
            : null,
          fin.season
            ? {
                label: `${monthName(fin.month === 12 ? 1 : fin.month + 1)} del año pasado`,
                value: fK(fin.lastYearNextMonth),
                delta: `${fN(fin.season, 1)}×`,
                tone: "up",
                sub: `lo de ${curMonth}: la temporada pesa`,
              }
            : null,
        ]}
      />

      <Card
        title="Salud de cada kiosco"
        hint={`${pnlMonth ? `${pnlMonth[0].toUpperCase()}${pnlMonth.slice(1)}: utilidad del P&L oficial de Finanzas. ` : ""}${curMonth[0].toUpperCase()}${curMonth.slice(1)}: hacia dónde va contra la meta.`}
        actions={
          <>
            <span className="muted" style={{ fontSize: 12.5 }}>Ordenar por</span>
            <Chips options={FIN_SORTS} value={sort} onChange={setSort} />
          </>
        }
      >
        {fin.pnlUnavailable ? <div className="x-note" style={{ marginTop: 10 }}>{fin.pnlUnavailable}</div> : null}
        <GridTable
          minWidth={880}
          cols={[
            { label: "Kiosco", width: "minmax(0, 1.3fr)", cls: "b ell" },
            { label: `Venta ${pnlMonth.slice(0, 3)}`, width: "92px", align: "r" },
            { label: "Fijos", width: "86px", align: "r" },
            { label: "Utilidad", width: "96px", align: "r", cls: "b" },
            { label: "Equilibrio", width: "96px", align: "r" },
            { label: `${curMonth}: avance a la meta`, width: "minmax(0, 1fr)" },
            { label: "Proyección", width: "92px", align: "r" },
          ]}
          rows={rows.map((r) => {
            const wm = Math.min(100, (r.mtdPct || 0) * 100);
            const wp = Math.max(0, Math.min(100 - wm, ((r.projPct || 0) - (r.mtdPct || 0)) * 100));
            const pp = r.projPct;
            return [
              r.label,
              r.pnl ? fK(r.pnl.sales) : "—",
              r.pnl ? fK(r.pnl.fixedCosts) : "—",
              r.pnl ? <span className={r.pnl.profit < 0 ? "down" : "up"}>{fK(r.pnl.profit)}</span> : "—",
              r.pnl ? fK(r.pnl.breakEven) : "—",
              r.goal > 0 ? <BarCell parts={[{ w: wm }, { w: wp, cls: "x-fill2" }]} value={`${pct(r.mtdPct)}`} /> : <span className="muted">Sin meta</span>,
              pp == null ? "—" : <Pill tone={pp >= 0.9 ? "ok" : pp >= 0.7 ? "mid" : "bad"}>{pct(pp)}</Pill>,
            ];
          })}
        />
        {fin.goalTotal > 0 ? (
          <Decide>
            {fin.reach ? `${fN(fin.reach)} kioscos llegan a la meta de ${curMonth} al ritmo actual` : `Ningún kiosco llega a la meta de ${curMonth} al ritmo actual`}
            {fin.best ? `; el mejor es ${fin.best.label} con ${pct(fin.best.projPct)}` : ""}.
            {fin.goalVsLastMonth && fin.goalVsLastMonth > 1.3
              ? ` La meta total es ${fN(fin.goalVsLastMonth, 1)} veces lo vendido en ${pnlMonth}: o la temporada sube mucho la venta o hay que ajustar metas y comisiones.`
              : ""}
          </Decide>
        ) : null}
      </Card>

      <div className="x-row">
        <Card title="Cuánto nos deben los clientes" hint="Cuentas por cobrar de clientes mayoristas." style={{ flex: "1 1 420px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 22, marginTop: 12 }}>
            <div>
              <div className="x-kpi-label">Por cobrar</div>
              <div className="x-kpi-value">{fQ(recv.balance)}</div>
              <div className="x-kpi-sub">{fN(recv.customers)} clientes</div>
            </div>
            <div>
              <div className="x-kpi-label">Cobrado en el periodo</div>
              <div className="x-kpi-value">{fQ(recv.collectedInPeriod)}</div>
              <div className="x-kpi-sub">pagos registrados</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <GridTable
              minWidth={440}
              cols={[
                { label: "Cliente", width: "minmax(0, 1.6fr)", cls: "b ell" },
                { label: "", width: "minmax(0, 1fr)" },
                { label: "Debe", width: "90px", align: "r", cls: "b" },
                { label: "Último pago", width: "92px", align: "r" },
              ]}
              rows={recv.top.map((d) => [
                <span title={d.name}>{d.label}</span>,
                <Track parts={[{ w: d.w, cls: "x-fillo" }]} />,
                fQ(d.balance),
                <span className={d.late ? "down" : ""}>{d.lastPayment ? fDate(d.lastPayment) : "sin pagos"}</span>,
              ])}
              empty="Ningún cliente con saldo."
            />
          </div>
          <Decide>
            {recv.top.filter((d) => d.late).length
              ? `${recv.top.filter((d) => d.late).slice(0, 2).map((d) => d.label).join(" y ")} no pagan hace más de 2 meses. `
              : ""}
            {recv.creditDaysConfigured
              ? "Revisar los saldos que ya pasaron sus días de crédito."
              : "Ningún cliente tiene días de crédito configurados: con eso se separa lo vencido de lo que aún no toca cobrar."}
          </Decide>
        </Card>

        <Card title="¿Rinde la publicidad?" hint="Ventas en línea que entran por cada quetzal invertido en publicidad." style={{ flex: "1 1 380px" }}>
          <GridTable
            minWidth={400}
            cols={[
              { label: "Mes", width: "minmax(0, 1.2fr)", cls: "b" },
              { label: "Publicidad", width: "90px", align: "r" },
              { label: "Ventas", width: "96px", align: "r" },
              { label: "Por Q1", width: "80px", align: "r" },
            ]}
            rows={ads.map((a) => [a.label, fQ(a.adSpend), fQ(a.onlineSales), a.ratio == null ? "—" : <Pill tone={a.tone}>{`Q${fN(a.ratio, 2)}`}</Pill>])}
          />
          {ratios.length ? (
            <Decide>
              Por cada Q1 de publicidad entran entre <b>Q{fN(Math.min(...ratios), 2)} y Q{fN(Math.max(...ratios), 2)}</b> en ventas.
              {Math.max(...ratios) < 2
                ? " Después de producto, envío y comisiones casi no queda nada: medir qué campaña trae ventas y cortar las que no. Una meta sana es Q3 o más por cada Q1."
                : " Medir por campaña para mover el presupuesto a las que más traen."}
            </Decide>
          ) : null}
        </Card>
      </div>

      <Card className="soft" title="Cómo se calcula">
        <p className="x-hint">
          Utilidad, costos fijos y equilibrio salen del P&amp;L de Finanzas por kiosco del mes cerrado (incluye costo de producto, comisiones, tarjeta,
          impuestos y fijos). Proyección = lo vendido en el mes llevado al total de días. La venta del año pasado sale del histórico importado. Los
          sitios marcados como fuera de reportes no aparecen en el P&amp;L.
        </p>
      </Card>
    </div>
  );
}
