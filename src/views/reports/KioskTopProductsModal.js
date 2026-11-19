import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { getKioskTopProducts } from "services/kioskSalesByCategoryService";
import { formatCurrency } from "views/kiosks/pos/posUtils";
import * as XLSX from "xlsx";
import { deltaTone, formatDelta, formatQty, modelsToReach, pctChange } from "./kioskSalesInsights";
import "./KioskSalesByCategoryReport.css";

const SORT_UNITS = "units";
const SORT_AMOUNT = "amount";
const TOP_SIZE = 10;
const ALL_SUBGROUPS = "__ALL__";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatPercent = (value) => `${(Math.round(value * 10) / 10).toFixed(1)}%`;

const colorsText = (colors) =>
  (colors || []).length
    ? colors.map((entry) => `${entry.color} ${formatQty(entry.units)}`).join(" · ")
    : "Sin color registrado";

export function DeltaChip({ current, previous }) {
  const hasBase = num(previous) > 0;
  if (!hasBase) {
    return num(current) > 0 && previous != null ? (
      <span className="ksc-delta ksc-delta--new">Nuevo</span>
    ) : (
      <span className="ksc-delta ksc-delta--none">—</span>
    );
  }
  const pct = pctChange(current, previous);
  return <span className={`ksc-delta ksc-delta--${deltaTone(pct)}`}>{formatDelta(pct)}</span>;
}

/** Ordena y calcula participación y acumulado sobre lo que se está viendo (ya filtrado por subgrupo). */
export const rankItems = (items, sortBy) => {
  const sorted = [...(items || [])].sort((a, b) => {
    const diff =
      sortBy === SORT_AMOUNT ? num(b.totalAmount) - num(a.totalAmount) : num(b.units) - num(a.units);
    if (diff !== 0) return diff;
    const tie = sortBy === SORT_AMOUNT ? num(b.units) - num(a.units) : num(b.totalAmount) - num(a.totalAmount);
    return tie !== 0 ? tie : String(a.productName || "").localeCompare(String(b.productName || ""), "es");
  });
  const baseUnits = sorted.reduce((acc, item) => acc + Math.max(0, num(item.units)), 0);
  const baseAmount = sorted.reduce((acc, item) => acc + Math.max(0, num(item.totalAmount)), 0);
  const base = sortBy === SORT_AMOUNT ? baseAmount : baseUnits;
  let running = 0;
  return sorted.map((item, index) => {
    const metric = sortBy === SORT_AMOUNT ? num(item.totalAmount) : num(item.units);
    running += Math.max(0, metric);
    return {
      ...item,
      rank: index + 1,
      sharePct: base > 0 ? (Math.max(0, metric) / base) * 100 : 0,
      cumulativePct: base > 0 ? (running / base) * 100 : 0,
    };
  });
};

function KioskTopProductsModal({ target, query, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sortBy, setSortBy] = useState(SORT_UNITS);
  const [subgroup, setSubgroup] = useState(ALL_SUBGROUPS);
  const [showAll, setShowAll] = useState(false);

  const isOpen = Boolean(target);
  const categoryId = target?.categoryId ?? null;
  const from = query?.from;
  const to = query?.to;
  const kioskIds = query?.kioskIds;
  const compare = Boolean(query?.compare);

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    setData(null);
    setError("");
    setSortBy(SORT_UNITS);
    setSubgroup(ALL_SUBGROUPS);
    setShowAll(false);
    setLoading(true);
    getKioskTopProducts({ from, to, kioskIds, categoryId, compare })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "No se pudo cargar el top de productos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, categoryId, from, to, kioskIds, compare]);

  const items = useMemo(() => data?.items || [], [data]);

  const subgroups = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (!item.subgroupCode) return;
      const entry = map.get(item.subgroupCode) || {
        code: item.subgroupCode,
        label: item.subgroupLabel || item.subgroupCode,
        units: 0,
      };
      entry.units += num(item.units);
      map.set(item.subgroupCode, entry);
    });
    return [...map.values()].sort((a, b) => b.units - a.units);
  }, [items]);

  const visible = useMemo(
    () => (subgroup === ALL_SUBGROUPS ? items : items.filter((item) => item.subgroupCode === subgroup)),
    [items, subgroup]
  );
  const ranked = useMemo(() => rankItems(visible, sortBy), [visible, sortBy]);
  const rows = showAll ? ranked : ranked.slice(0, TOP_SIZE);

  const totalUnits = visible.reduce((acc, item) => acc + num(item.units), 0);
  const totalAmount = visible.reduce((acc, item) => acc + num(item.totalAmount), 0);
  const prevUnits = visible.reduce((acc, item) => acc + num(item.previousUnits), 0);
  const average = totalUnits > 0 ? totalAmount / totalUnits : 0;
  const half = useMemo(() => modelsToReach(ranked.map((item) => item.units), 0.5), [ranked]);
  const maxMetric = ranked.length ? Math.max(1, ...ranked.map((item) => num(item.units))) : 1;
  const kioskCount = data?.kioskCount || 0;
  const hasPrevious = data?.previousFrom != null;
  const cutIndex = ranked.findIndex((item) => item.cumulativePct >= 50);

  const exportExcel = () => {
    const head = [
      "#",
      "Código",
      "Producto",
      "Subgrupo",
      "Piezas",
      "Ventas con IVA Q",
      "% del total",
      "Acumulado",
      "Kioscos que lo vendieron",
      ...(hasPrevious ? ["Piezas periodo anterior"] : []),
      "Colores más vendidos",
    ];
    const body = ranked.map((item) => [
      item.rank,
      item.productCode,
      item.productName,
      item.subgroupLabel || "",
      formatQty(item.units),
      item.totalAmount,
      formatPercent(item.sharePct),
      formatPercent(item.cumulativePct),
      `${item.kiosksSold} de ${kioskCount}`,
      ...(hasPrevious ? [formatQty(item.previousUnits)] : []),
      colorsText(item.topColors),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Top de productos");
    const label = String(target?.label || "categoria").replace(/[^\p{L}\p{N}]+/gu, "_");
    XLSX.writeFile(wb, `top_${label}_${data?.from || from}_${data?.to || to}.xlsx`);
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} size="xl" scrollable className="ksc-top-modal">
      <ModalHeader toggle={onClose}>
        <span className="ksc-top-eyebrow">Productos más vendidos</span>
        <span className="ksc-top-title">{target?.label}</span>
        <span className="ksc-top-sub">
          {from} a {to} · {kioskCount ? `${kioskCount} kioscos` : "kioscos"}
          {hasPrevious ? ` · comparado con ${data.previousFrom} a ${data.previousTo}` : ""}
        </span>
      </ModalHeader>
      <ModalBody>
        {loading && (
          <div className="rpt-empty">
            <Spinner /> <div className="mt-2">Cargando productos…</div>
          </div>
        )}
        {error && <Alert color="danger">{error}</Alert>}
        {data && !loading && (
          <>
            <div className="ksc-top-tiles">
              <div>
                <span>Piezas</span>
                <strong>{formatQty(totalUnits)}</strong>
              </div>
              <div>
                <span>Ventas con IVA</span>
                <strong>{formatCurrency(totalAmount)}</strong>
              </div>
              <div>
                <span>Promedio por pieza</span>
                <strong>{formatCurrency(average)}</strong>
              </div>
              <div className="is-accent">
                <span>Concentración</span>
                <strong>
                  {half.count
                    ? `${half.count} ${half.count === 1 ? "modelo" : "modelos"} = ${Math.round(half.share)}% de las piezas`
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="ksc-top-controls">
              {subgroups.length > 1 && (
                <div className="rpt-segment" role="group" aria-label="Subgrupo">
                  <button
                    type="button"
                    className={subgroup === ALL_SUBGROUPS ? "is-active" : ""}
                    aria-pressed={subgroup === ALL_SUBGROUPS}
                    onClick={() => setSubgroup(ALL_SUBGROUPS)}
                  >
                    Todas
                  </button>
                  {subgroups.map((entry) => (
                    <button
                      key={entry.code}
                      type="button"
                      className={subgroup === entry.code ? "is-active" : ""}
                      aria-pressed={subgroup === entry.code}
                      onClick={() => setSubgroup(entry.code)}
                    >
                      {entry.label} · {formatQty(entry.units)}
                    </button>
                  ))}
                </div>
              )}
              <div className="ksc-top-sort">
                <span>Ordenar por</span>
                <div className="rpt-segment" role="group" aria-label="Orden">
                  <button
                    type="button"
                    className={sortBy === SORT_UNITS ? "is-active" : ""}
                    aria-pressed={sortBy === SORT_UNITS}
                    onClick={() => setSortBy(SORT_UNITS)}
                  >
                    Piezas
                  </button>
                  <button
                    type="button"
                    className={sortBy === SORT_AMOUNT ? "is-active" : ""}
                    aria-pressed={sortBy === SORT_AMOUNT}
                    onClick={() => setSortBy(SORT_AMOUNT)}
                  >
                    Ventas
                  </button>
                </div>
              </div>
            </div>

            {!ranked.length ? (
              <p className="text-muted mb-0">No hubo ventas de productos de esta categoría en el periodo.</p>
            ) : (
              <div className="rpt-table-wrap">
                <Table className="rpt-table rpt-table--compact ksc-top-table" responsive>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Modelo y colores más vendidos</th>
                      <th className="rpt-num">Piezas</th>
                      <th className="rpt-num">Ventas con IVA</th>
                      <th className="rpt-num">% del total</th>
                      <th>Acumulado</th>
                      <th className="rpt-num">Kioscos</th>
                      {hasPrevious && <th className="rpt-num">vs. anterior</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((item) => (
                      <tr
                        key={item.productId}
                        data-row-type="top-product"
                        className={cutIndex >= 0 && item.rank === cutIndex + 1 && !showAll ? "ksc-cut" : undefined}
                      >
                        <td className={item.rank <= 3 ? "ksc-rank ksc-rank--top" : "ksc-rank"}>{item.rank}</td>
                        <td>
                          <div className="ksc-prod-name">
                            {item.productName} <span className="ksc-prod-code">{item.productCode}</span>
                          </div>
                          <div className="ksc-prod-colors">{colorsText(item.topColors)}</div>
                        </td>
                        <td className="rpt-num">
                          <span className="ksc-top-units">{formatQty(item.units)}</span>
                          <span className="ksc-top-bar" aria-hidden="true">
                            <span style={{ width: `${Math.max(2, (num(item.units) / maxMetric) * 100)}%` }} />
                          </span>
                        </td>
                        <td className="rpt-num">{formatCurrency(item.totalAmount)}</td>
                        <td className="rpt-num">{formatPercent(item.sharePct)}</td>
                        <td className="ksc-cum">
                          <span>{formatPercent(item.cumulativePct)}</span>
                          <span className="ksc-share-bar" aria-hidden="true">
                            <span style={{ width: `${Math.min(100, item.cumulativePct)}%`, background: "#51cbce" }} />
                          </span>
                        </td>
                        <td className="rpt-num">
                          {item.kiosksSold}
                          <span className="text-muted"> / {kioskCount}</span>
                        </td>
                        {hasPrevious && (
                          <td className="rpt-num">
                            <DeltaChip current={item.units} previous={item.previousUnits} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
            {hasPrevious && prevUnits > 0 && (
              <p className="ksc-top-note">
                Total de la lista: {formatQty(totalUnits)} piezas contra {formatQty(prevUnits)} del periodo anterior.
              </p>
            )}
            <p className="ksc-top-note">
              Piezas netas: ventas menos devoluciones y cambios. «Kioscos» cuenta en cuántos se vendió al menos una
              pieza. La línea punteada marca dónde se junta la mitad de lo vendido; los colores solo cuentan ventas.
            </p>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <span className="ksc-top-count">
          {ranked.length ? `Mostrando ${rows.length} de ${ranked.length} modelos` : ""}
        </span>
        <Button color="secondary" outline onClick={exportExcel} disabled={!ranked.length}>
          Excel con los {ranked.length || ""}
        </Button>
        {ranked.length > TOP_SIZE && (
          <Button color="primary" onClick={() => setShowAll((value) => !value)}>
            {showAll ? "Ver solo el top 10" : `Ver los ${ranked.length} modelos`}
          </Button>
        )}
        <Button color="link" onClick={onClose}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default KioskTopProductsModal;
