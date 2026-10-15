import React, { useState } from "react";
import { Button } from "reactstrap";
import { formatDateGt } from "utils/dateTimeHelper";
import { contar } from "utils/textHelper";
import FamilyBadge from "../organizer/FamilyBadge";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const orderHours = (o) => (o.items || []).reduce(
  (s, i) => s + (i.remainingQuantity || 0) * (i.prdTimePerUnit || 0.1), 0);

function OrderRow({ order, selected, number, onToggle }) {
  const [open, setOpen] = useState(false);
  const n = (order.items || []).length;
  return (
    <div className={`dp-orow ${selected ? "is-sel" : ""} ${order.onlineSale ? "is-opl" : ""}`}>
      <label className="dp-chk">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(order.id)}
          aria-label={`Marcar ${order.code}`}
        />
        <span className="dp-box" aria-hidden="true">{selected ? (number || "✓") : ""}</span>
      </label>
      <div className="dp-omain">
        <div className="dp-otop">
          <span><FamilyBadge family={order.family} /></span>
          <strong>{order.code}</strong>
          {order.customerName && <span className="dp-muted">{order.customerName}</span>}
        </div>
        <div className="dp-ometa">
          {contar(n, "producto")} · {fmt(orderHours(order))} h
          {order.deliveryDate ? ` · entrega ${formatDateGt(order.deliveryDate)}` : ""}
        </div>
        {order.observations && (
          <div className="dp-ometa" style={{ color: "#7a5a00" }}>Obs.: {order.observations}</div>
        )}
      </div>
      <button type="button" className="dp-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        Ver productos {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="dp-detail">
          {(order.items || []).map((i) => (
            <div key={i.productionOrderItemId}>
              <span>
                {i.productCode} {i.productName}{i.colorName ? ` · ${i.colorName}` : ""}
              </span>
              <span>{i.remainingQuantity} u · {fmt(i.remainingQuantity * (i.prdTimePerUnit || 0.1))} h</span>
            </div>
          ))}
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
    search, setSearch, families, familyFilter, setFamilyFilter, hasMoreOrders, orders,
  } = planner;
  const [filterOpen, setFilterOpen] = useState(false);

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
  const numberOf = (o) => (o.onlineSale ? 0
    : selectedIds.filter((id) => orders.find((x) => x.id === id && !x.onlineSale)).indexOf(o.id) + 1);

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
            <OrderRow key={o.id} order={o} selected={selectedIds.includes(o.id)} number={0} onToggle={toggleOrder} />
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
                {f === "ALL" ? "Todas" : f}
              </button>
            ))}
          </div>
        )}
        {otherOrders.length === 0 ? (
          <p className="dp-small" style={{ padding: "12px 4px" }}>Ninguna OP coincide con la búsqueda.</p>
        ) : otherOrders.map((o) => (
          <OrderRow
            key={o.id}
            order={o}
            selected={selectedIds.includes(o.id)}
            number={numberOf(o)}
            onToggle={toggleOrder}
          />
        ))}
      </div>
    </div>
  );
}
