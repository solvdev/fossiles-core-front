import React from "react";

/**
 * Barra del listado de inventario: botón "Con existencia / Todo" y total de
 * piezas por color (clic en un color para filtrar la lista, otro clic lo quita).
 */
export default function StockListControls({
  onlyWithStock,
  onToggleOnlyWithStock,
  withStockCount,
  allCount,
  colorTotals,
  colorFilter,
  onColorFilterChange,
  unitLabel = "pzas",
}) {
  const colors = colorTotals?.colors || [];
  return (
    <div className="kma-stock-controls">
      <div className="kma-stock-toggle" role="group" aria-label="Filtro de existencia">
        <button
          type="button"
          className={onlyWithStock ? "on" : ""}
          aria-pressed={onlyWithStock}
          onClick={() => onToggleOnlyWithStock(true)}
        >
          Con existencia <span>{withStockCount}</span>
        </button>
        <button
          type="button"
          className={!onlyWithStock ? "on" : ""}
          aria-pressed={!onlyWithStock}
          onClick={() => onToggleOnlyWithStock(false)}
        >
          Todo <span>{allCount}</span>
        </button>
      </div>

      {colors.length > 0 && (
        <div className="kma-color-totals">
          <div className="kma-color-totals-head">
            <span className="kll-label">Total por color</span>
            <b>
              {colorTotals.total} {unitLabel}
            </b>
          </div>
          <div className="kma-color-chips">
            {colors.map((c) => {
              const active = colorFilter === c.color;
              return (
                <button
                  type="button"
                  key={c.color}
                  className={`kma-color-chip${active ? " on" : ""}${c.total < 0 ? " neg" : ""}`}
                  aria-pressed={active}
                  title={`${c.color}: ${c.total} ${unitLabel} en ${c.products} fila(s) de inventario`}
                  onClick={() => onColorFilterChange(active ? "" : c.color)}
                >
                  {c.color}
                  <b>{c.total}</b>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
