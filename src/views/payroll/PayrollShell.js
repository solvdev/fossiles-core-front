import React, { useEffect, useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { useAuth } from "contexts/AuthContext";
import { getEmployeeCharges } from "services/payrollService";
import "assets/css/payroll-ui.css";

/** Pestañas del módulo. Planillas, Fichas y Parámetros viven en /admin/payroll; Cargos tiene su ruta. */
export const PAYROLL_TABS = [
  { key: "runs", label: "Planillas", to: "/admin/payroll", permission: "PLANILLA.CORRIDAS.VER" },
  { key: "profiles", label: "Fichas", to: "/admin/payroll", permission: "PLANILLA.CORRIDAS.VER" },
  { key: "parameters", label: "Parámetros", to: "/admin/payroll", permission: "PLANILLA.CORRIDAS.VER" },
  { key: "charges", label: "Cargos a colaboradores", to: "/admin/payroll/charges", permission: "PLANILLA.CARGOS.VER" },
];

/**
 * Encabezado común de Planilla y de Cargos a colaboradores.
 * `active` es la pestaña abierta; `onSelect(key)` cambia de pestaña cuando es de la misma pantalla.
 */
function PayrollShell({ active, onSelect, chargesToDecide, children }) {
  const { hasPermission } = useAuth();
  const inRouter = useInRouterContext();
  const canSeeCharges = hasPermission("PLANILLA.CARGOS.VER");
  const [pending, setPending] = useState(null);

  // Cuántos cargos esperan decisión, para avisarlo en la pestaña sin tener que abrirla.
  useEffect(() => {
    if (chargesToDecide !== undefined || !canSeeCharges) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const list = (await getEmployeeCharges({})) || [];
        if (!cancelled) {
          setPending(list.filter((c) => (c.status === "PENDIENTE" || c.status === "PARCIAL") && !c.settlementMethod).length);
        }
      } catch (error) {
        // El aviso es solo una ayuda: si falla, la pestaña queda sin número.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chargesToDecide, canSeeCharges]);

  const count = chargesToDecide !== undefined ? chargesToDecide : pending;
  const tabs = PAYROLL_TABS.filter((tab) => hasPermission(tab.permission));

  return (
    <div className="content pl">
      <div className="pl-head">
        <h4>Planilla</h4>
        <p className="pl-sub mb-0">Pagos quincenales, fichas, parámetros de ley y compras de colaboradores.</p>
      </div>
      <nav className="pl-tabs" role="tablist" aria-label="Secciones de planilla">
        {tabs.map((tab) => {
          const selected = tab.key === active;
          const badge = tab.key === "charges" && count > 0 ? <span className="pl-count">{count} por decidir</span> : null;
          const inside = tab.key !== "charges" && onSelect;
          if (inside) {
            return (
              <button key={tab.key} type="button" role="tab" className="pl-tab" aria-selected={selected} onClick={() => onSelect(tab.key)}>
                {tab.label}
              </button>
            );
          }
          if (selected || !inRouter) {
            return (
              <button key={tab.key} type="button" role="tab" className="pl-tab" aria-selected={selected} disabled={!selected}>
                {tab.label}{badge}
              </button>
            );
          }
          return (
            <Link key={tab.key} role="tab" className="pl-tab" aria-selected={false} to={tab.to} state={{ tab: tab.key }}>
              {tab.label}{badge}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}

export default PayrollShell;
