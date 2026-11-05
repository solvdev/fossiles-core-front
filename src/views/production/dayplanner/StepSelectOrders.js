import React, { useState } from "react";
import { Button } from "reactstrap";
import { formatDateGt } from "utils/dateTimeHelper";
import { contar } from "utils/textHelper";
import FamilyBadge from "../dayboard/FamilyBadge";
import { LF_FILTER } from "./useDayPlanner";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const orderHours = (o) => (o.items
  ? o.items.reduce((s, i) => s + (i.remainingQuantity || 0) * (i.prdTimePerUnit || 0.1), 0)
  : (o.remainingHours || 0));

const ITEMS_PAGE = 15;
const ORDERS_PAGE = 40;

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cada palabra del filtro tiene que estar en el código, el nombre o el color («bil negro»). */
export function filterItems(items, query, onlyPicked, picks) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return items.filter((i) => {
    if (onlyPicked && picks[i.productionOrderItemId] === undefined) return false;
    if (!words.length) return true;
    const text = norm(`${i.productCode} ${i.productName} ${i.colorName}`);
    return words.every((w) => text.includes(w));
  });
}

/**
 * Una OP consolidada se muestra como UNA sola orden: su código, y los productos de todas las
 * órdenes que la forman en un solo listado (cada producto con el código de su orden).
 */
export function mergeGroupOrders(members) {
  const first = members[0];
  const ready = members.every((m) => m.items !== null && m.items !== undefined);
  const customers = Array.from(new Set(members.map((m) => m.customerName).filter(Boolean)));
  const dates = members.map((m) => m.deliveryDate).filter(Boolean).sort();
  return {
    ...first,
    code: first.groupCode,
    customerName: customers.join(", ") || null,
    deliveryDate: dates[0] || null,
    observations: null,
    remainingHours: members.reduce((s, m) => s + (m.remainingHours || 0), 0),
    itemCount: members.reduce((s, m) => s + (m.itemCount || 0), 0),
    remainingItemCount: members.reduce((s, m) => s + (m.remainingItemCount || 0), 0),
    items: ready ? members.flatMap((m) => m.items.map((i) => ({ ...i, orderCode: m.code }))) : null,
    memberCodes: members.map((m) => m.code),
  };
}

/** Filas del listado: las órdenes de una misma OP consolidada se juntan en una sola fila. */
export function buildOrderRows(visibleOrders, allOrders) {
  const rows = [];
  const seen = new Set();
  visibleOrders.forEach((o) => {
    if (!o.groupId) {
      rows.push({ key: `o${o.id}`, order: o, members: [o] });
      return;
    }
    if (seen.has(o.groupId)) return;
    seen.add(o.groupId);
    const members = allOrders.filter((x) => x.groupId === o.groupId && !x.onlineSale);
    const list = members.length > 0 ? members : [o];
    rows.push({ key: `g${o.groupId}`, order: mergeGroupOrders(list), members: list });
  });
  return rows;
}

function OrderRow({ order, members, selected, number, onToggle, picks, setPick, ensureItems }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(ITEMS_PAGE);
  const [query, setQuery] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const items = order.items || [];
  const itemsReady = order.items !== null && order.items !== undefined;
  // Sin los productos cargados, el resumen dice cuántos hay con restante.
  const n = itemsReady ? items.length : (order.remainingItemCount || order.itemCount || 0);
  const pickedCount = items.filter((i) => picks[i.productionOrderItemId] !== undefined).length;
  const filtering = query.trim() !== "" || onlyPicked;
  const visible = filtering ? filterItems(items, query, onlyPicked, picks) : items;
  // Con filtro, los botones de «todo» actúan solo sobre lo que se ve.
  const setAll = (mode) => visible.forEach((i) => setPick(
    i.productionOrderItemId, mode === "all" ? i.remainingQuantity : mode === "none" ? 0 : null));
  return (
    <div className={`dp-orow ${selected ? "is-sel" : ""} ${order.onlineSale ? "is-opl" : ""}`}>
      <label className="dp-chk">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle((members || [order])[0].id)}
          aria-label={`Marcar ${order.code}`}
        />
        <span className="dp-box" aria-hidden="true">{selected ? (number || "✓") : ""}</span>
      </label>
      <div className="dp-omain">
        <div className="dp-otop">
          <span><FamilyBadge family={order.family} /></span>
          <strong>{order.code}</strong>
          {order.groupCode ? (
            <span className="dp-chip lf" title="OP consolidada: sus órdenes se marcan y se reparten juntas">Consolidada</span>
          ) : order.luisFelipe && (
            <span className="dp-chip lf" title="Se puede juntar con otras en una OP consolidada desde el Tablero">Luis Felipe</span>
          )}
          {order.customerName && <span className="dp-muted">{order.customerName}</span>}
        </div>
        <div className="dp-ometa">
          {order.memberCodes ? `${contar(order.memberCodes.length, "orden", "órdenes")}: ${order.memberCodes.join(", ")} · ` : ""}
          {contar(n, "producto")} · {fmt(orderHours(order))} h
          {order.deliveryDate ? ` · entrega ${formatDateGt(order.deliveryDate)}` : ""}
          {pickedCount > 0 ? ` · ${pickedCount} con cantidad de hoy` : ""}
        </div>
        {order.observations && (
          <div className="dp-ometa" style={{ color: "#7a5a00" }}>Obs.: {order.observations}</div>
        )}
      </div>
      <button
        type="button"
        className="dp-link"
        aria-expanded={open}
        onClick={() => {
          if (!open && !itemsReady && ensureItems) ensureItems((members || [order]).map((m) => m.id));
          setOpen((v) => !v);
        }}
      >
        Elegir qué va hoy {open ? "▾" : "▸"}
      </button>
      {open && !itemsReady && (
        <div className="dp-detail"><span className="dp-small">Cargando productos…</span></div>
      )}
      {open && itemsReady && (
        <div className="dp-detail">
          <div className="dp-pick-tools">
            <span className="dp-small">Escriba las unidades de hoy. Si no escribe nada en ningún producto, entra lo que cabe en el día; si escribe en alguno, solo entra lo escrito.</span>
            <span className="dp-sp" />
            <Button className="dp-sm" onClick={() => setAll("auto")}>{filtering ? "Estos auto" : "Todo auto"}</Button>
            <Button className="dp-sm" onClick={() => setAll("all")}>{filtering ? "Estos hoy" : "Todo hoy"}</Button>
            <Button className="dp-sm" onClick={() => setAll("none")}>{filtering ? "Estos no" : "Nada hoy"}</Button>
          </div>
          {items.length > ITEMS_PAGE && (
            <div className="dp-item-filter">
              <input
                type="search"
                placeholder="Filtrar productos: código, nombre o color"
                aria-label={`Filtrar productos de ${order.code}`}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShown(ITEMS_PAGE); }}
              />
              <label className="dp-small">
                <input type="checkbox" checked={onlyPicked} onChange={(e) => { setOnlyPicked(e.target.checked); setShown(ITEMS_PAGE); }} />
                {" "}Solo con cantidad de hoy
              </label>
              <span className="dp-small dp-muted">
                {filtering ? `${visible.length} de ${items.length}` : contar(items.length, "producto")}
              </span>
            </div>
          )}
          {filtering && visible.length === 0 && (
            <div className="dp-small" style={{ padding: "8px 4px" }}>Ningún producto coincide con el filtro.</div>
          )}
          {visible.slice(0, shown).map((i) => {
            const id = i.productionOrderItemId;
            const value = picks[id];
            const hrs = (value === undefined ? i.remainingQuantity : value) * (i.prdTimePerUnit || 0.1);
            return (
              <div key={id}>
                <span>
                  {i.orderCode && <span className="dp-chip lf" style={{ fontSize: 11, padding: "0 6px", marginRight: 6 }}>{i.orderCode}</span>}
                  {i.productCode} {i.productName}{i.colorName ? ` · ${i.colorName}` : ""}
                  <small className="dp-muted"> · {fmt(i.prdTimePerUnit || 0.1)} h/u · quedan {i.remainingQuantity} u</small>
                </span>
                <span className="dp-pick">
                  <input
                    type="number" min="0" max={i.remainingQuantity} inputMode="numeric"
                    className={value !== undefined ? "is-set" : ""}
                    placeholder="auto"
                    aria-label={`Unidades de hoy de ${i.productName}`}
                    value={value === undefined ? "" : value}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setPick(id, raw === "" ? null : Math.min(Number(raw), i.remainingQuantity));
                    }}
                  />
                  <small className="dp-muted">{fmt(hrs)} h</small>
                </span>
              </div>
            );
          })}
          {shown < visible.length && (
            <div className="dp-more">
              <Button className="dp-sm" onClick={() => setShown((v) => v + ITEMS_PAGE)}>
                Ver más productos ({visible.length - shown})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Paso 1: elegir OPs. Las OPL van fijas arriba, con marca de prioridad y ya marcadas; las
 * demás van debajo en el orden de prioridad vigente, y el orden en que se marcan es su prioridad.
 */
export default function StepSelectOrders({ planner }) {
  const {
    loading, loadError, loadOrders, oplOrders, otherOrders, selectedIds, toggleOrder, markSection,
    search, setSearch, families, familyFilter, setFamilyFilter, hasMoreOrders, orders, picks, setPick,
    ensureItems,
  } = planner;
  const [filterOpen, setFilterOpen] = useState(false);
  const [shownOrders, setShownOrders] = useState(ORDERS_PAGE);

  if (loading) {
    return <div><div className="dp-skel" /><div className="dp-skel" /><div className="dp-skel" /></div>;
  }
  if (loadError) {
    return (
      <div className="dp-state">
        <div className="dp-big-icon" aria-hidden="true">⚠️</div>
        <h5>No se pudo cargar</h5>
        <p>Revise la conexión e intente otra vez.</p>
        <Button color="primary" className="dp-big" onClick={loadOrders}>Reintentar</Button>
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="dp-state">
        <div className="dp-big-icon" aria-hidden="true">✔</div>
        <h5>No hay OPs pendientes</h5>
        <p>Todo ya está en tareas.</p>
        <Button className="dp-big" onClick={loadOrders}>Actualizar</Button>
      </div>
    );
  }

  const allOpl = oplOrders.length > 0 && oplOrders.every((o) => selectedIds.includes(o.id));
  const allOthers = otherOrders.length > 0 && otherOrders.every((o) => selectedIds.includes(o.id));
  const rowKeyOf = (o) => (o.groupId ? `g${o.groupId}` : `o${o.id}`);
  // El orden de marcado cuenta por fila: una OP consolidada es un solo número.
  const selectedKeys = Array.from(new Set(selectedIds
    .map((id) => orders.find((x) => x.id === id))
    .filter((x) => x && !x.onlineSale)
    .map(rowKeyOf)));
  const rows = buildOrderRows(otherOrders, orders);
  const others = orders.filter((o) => !o.onlineSale);
  const familyCount = (f) => (f === "ALL" ? others.length
    : f === LF_FILTER ? others.filter((o) => o.luisFelipe).length
      : others.filter((o) => o.family === f).length);

  return (
    <div>
      {hasMoreOrders && (
        <div className="dp-note warn">
          <div className="dp-x">Hay más de 200 OPs activas y aquí caben 200. Use el buscador para encontrar una OP que no vea.</div>
        </div>
      )}
      {oplOrders.length > 0 && (
        <div className="dp-sec">
          <div className="dp-sec-h opl">
            <span className="dp-tag">PRIORIDAD</span>
            <span>OPL · ventas en línea</span>
            <span className="dp-sp" />
            <Button className="dp-sm" onClick={() => markSection(true)}>
              {allOpl ? "Quitar todas" : "Marcar todas"}
            </Button>
          </div>
          {oplOrders.map((o) => (
            <OrderRow key={o.id} order={o} selected={selectedIds.includes(o.id)} number={0} onToggle={toggleOrder} picks={picks} setPick={setPick} ensureItems={ensureItems} />
          ))}
        </div>
      )}

      <div className="dp-sec">
        <div className="dp-sec-h others">
          <span>Otras OPs</span>
          <span className="dp-small">(el orden en que las marque es su prioridad)</span>
          <span className="dp-sp" />
          <Button className="dp-sm" onClick={() => markSection(false)} disabled={otherOrders.length === 0}>
            {allOthers ? "Quitar todas" : "Marcar todas"}
          </Button>
        </div>
        <div className="dp-tools">
          <input
            type="search"
            id="dp-search"
            placeholder="Buscar OP o cliente"
            aria-label="Buscar OP o cliente"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="dp-link" aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
            Filtrar {filterOpen ? "▾" : "▸"}
          </button>
        </div>
        {filterOpen && (
          <div className="dp-chips">
            {families.map((f) => (
              <button key={f} type="button" aria-pressed={familyFilter === f} onClick={() => setFamilyFilter(f)}>
                {f === "ALL" ? "Todas" : f === LF_FILTER ? "Luis Felipe" : f}
                {` (${familyCount(f)})`}
              </button>
            ))}
          </div>
        )}
        {otherOrders.length === 0 ? (
          <p className="dp-small" style={{ padding: "12px 4px" }}>Ninguna OP coincide con la búsqueda.</p>
        ) : rows.slice(0, shownOrders).map((r) => (
          <OrderRow
            key={r.key}
            order={r.order}
            members={r.members}
            selected={selectedIds.includes(r.members[0].id)}
            number={selectedKeys.indexOf(r.key) + 1}
            onToggle={toggleOrder}
            picks={picks}
            setPick={setPick}
            ensureItems={ensureItems}
          />
        ))}
        {shownOrders < rows.length && (
          <div className="dp-more">
            <Button onClick={() => setShownOrders((v) => v + ORDERS_PAGE)}>
              Mostrar más OPs ({rows.length - shownOrders})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
