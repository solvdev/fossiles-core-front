import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import InventoryRotationReport from "./InventoryRotationReport";
import MaterialStockReport from "./MaterialStockReport";
import KioskStockReport from "./KioskStockReport";
import "./reportsDesign.css";

const TABS = [
  { key: "rotacion", label: "Rotación y cobertura" },
  { key: "materiales", label: "Inventario de materiales" },
  { key: "kioscos", label: "Existencias por kiosco" },
  { key: "kardex", label: "Kardex" },
];

const KARDEX = [
  {
    title: "Kardex de materiales",
    text: "Cada entrada y salida de un material con su saldo: compras, consumos a producción y ajustes.",
    to: "/admin/material-inventory-kardex",
    accent: "#c2410c",
  },
  {
    title: "Kardex de productos",
    text: "Los movimientos de producto terminado por ubicación: ingresos, envíos, ventas y devoluciones.",
    to: "/admin/inventory-kardex",
    accent: "#1d4ed8",
  },
  {
    title: "Kardex histórico de producto terminado",
    text: "El historial completo de producto terminado, para revisar lo que pasó en fechas anteriores.",
    to: "/admin/inventory-kardex-historico",
    accent: "#047857",
  },
];

function KardexLinks() {
  const navigate = useNavigate();
  return (
    <div>
      <p className="rpt-subtitle">
        El kardex es la lista de movimientos de cada material o producto. Se abre en su propia pantalla porque se
        filtra por fechas, ubicación y producto.
      </p>
      <div className="rpt-link-grid">
        {KARDEX.map((k) => (
          <button
            key={k.to}
            type="button"
            className="rpt-link-card"
            style={{ borderTopColor: k.accent }}
            onClick={() => navigate(k.to)}
          >
            <h5>{k.title}</h5>
            <p>{k.text}</p>
            <span className="rpt-link-go">Abrir →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Reportes de inventario: una sola página con cuatro pestañas y el mismo diseño en todas. */
function InventoryReports() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = TABS.some((t) => t.key === requested) ? requested : "rotacion";

  const select = (key) => {
    const next = new URLSearchParams(params);
    next.set("tab", key);
    setParams(next, { replace: true });
  };

  return (
    <div className="content rpt-page">
      <div className="rpt-hub-head">
        <h3>Reportes de inventario</h3>
        <p className="rpt-subtitle">Elige qué quieres revisar. Todos se pueden bajar a Excel.</p>
        <div className="rpt-hub-tabs" role="tablist" aria-label="Reportes de inventario">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              className={`rpt-hub-tab${active === t.key ? " is-active" : ""}`}
              onClick={() => select(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {active === "rotacion" && <InventoryRotationReport embedded />}
      {active === "materiales" && <MaterialStockReport />}
      {active === "kioscos" && <KioskStockReport />}
      {active === "kardex" && <KardexLinks />}
    </div>
  );
}

export default InventoryReports;
