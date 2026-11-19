import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Modal, ModalBody, ModalHeader, Spinner } from "reactstrap";
import { ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import ExcelStyleFilter from "components/inventory/ExcelStyleFilter";
import { getKioscoStockReport } from "services/kioscoInventoryService";
import { getKioskSites } from "services/kioskFinancialsService";
import { getProductCategories } from "services/productCategoryService";
import {
  KIOSK_GROUP_OPTIONS,
  STOCK_DIMENSIONS,
  buildCategoryFilterItems,
  buildKioskFilterItems,
  buildPivot,
  buildStockRecords,
  dimensionLabel,
  exportStockQueryExcel,
  filterRecords,
  natural,
  stockQueryFiltersLabel,
  sumBy,
  summarizeRecords,
} from "utils/kioskStockQuery";
import { showError } from "utils/notificationHelper";
import "./KioskStockQueryModal.css";

/** Todos los kioscos reales (Entrecueros incluido); solo se dejan fuera los de prueba. */
const includedKiosks = (kiosks) => (kiosks || []).filter((k) => !k.posTestMode);

const fmt = (n) => Number(n || 0).toLocaleString("es-GT", { maximumFractionDigits: 0 });

/**
 * Consulta de stock en todos los kioscos (o en los que se elijan): se filtra por kiosco, categoría,
 * producto y color, y se ve sumado por la dimensión que se pida, con otra opcional en columnas.
 */
function KioskStockQueryModal({ isOpen, toggle, kiosks, products }) {
  const [apiRows, setApiRows] = useState(null);
  const [categories, setCategories] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [kioskKeys, setKioskKeys] = useState([]);
  const [categoryKeys, setCategoryKeys] = useState([]);
  const [productId, setProductId] = useState("");
  const [color, setColor] = useState("");
  const [groupKey, setGroupKey] = useState("kiosk");
  const [crossKey, setCrossKey] = useState("none");
  const [order, setOrder] = useState("desc");
  const [kioskGroup, setKioskGroup] = useState("salesCategory");
  const requestId = useRef(0);

  // La categoría A/B/C de cada kiosco vive en el sitio de Finanzas (Costos por kiosco > Sitios).
  const kioskList = useMemo(() => {
    const categoryByLocation = new Map(
      (sites || []).filter((s) => s.locationId != null).map((s) => [Number(s.locationId), s.salesCategory])
    );
    return includedKiosks(kiosks).map((k) => ({
      ...k,
      salesCategory: categoryByLocation.get(Number(k.id)) || "",
    }));
  }, [kiosks, sites]);

  const kioskIdsKey = useMemo(() => includedKiosks(kiosks).map((k) => k.id).join(","), [kiosks]);

  const load = useCallback(async () => {
    const ids = kioskIdsKey ? kioskIdsKey.split(",").map(Number) : [];
    if (!ids.length) {
      setApiRows([]);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const [rows, cats, siteList] = await Promise.all([
        getKioscoStockReport(ids),
        getProductCategories().catch(() => []),
        getKioskSites().catch(() => []),
      ]);
      if (id !== requestId.current) return;
      setApiRows(rows || []);
      setCategories(Array.isArray(cats) ? cats : []);
      setSites(Array.isArray(siteList) ? siteList : []);
    } catch (err) {
      if (id !== requestId.current) return;
      setApiRows(null);
      setError(err.message || "No se pudo cargar el stock de los kioscos.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [kioskIdsKey]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const records = useMemo(
    () => buildStockRecords({ apiRows, kiosks: kioskList, products, categories }),
    [apiRows, kioskList, products, categories]
  );

  const product = useMemo(
    () => (products || []).find((p) => String(p.id) === String(productId)) || null,
    [products, productId]
  );
  const productCode = product?.code || "";

  const categoryNameById = useMemo(
    () => new Map((categories || []).map((c) => [Number(c.id), c.name || c.code])),
    [categories]
  );
  const productChoices = useMemo(() => {
    if (!categoryKeys.length) return products || [];
    const wanted = new Set(categoryKeys);
    return (products || []).filter((p) => wanted.has(categoryNameById.get(Number(p.categoryId))));
  }, [products, categoryKeys, categoryNameById]);

  const filtered = useMemo(
    () => filterRecords(records, { kioskIds: kioskKeys, categories: categoryKeys, productCode, color }),
    [records, kioskKeys, categoryKeys, productCode, color]
  );

  const colorOptions = useMemo(() => {
    const base = filterRecords(records, { kioskIds: kioskKeys, categories: categoryKeys, productCode });
    return [...new Set(base.map((r) => r.color))].sort(natural);
  }, [records, kioskKeys, categoryKeys, productCode]);
  const colorValue = colorOptions.includes(color) ? color : "";

  const kioskItems = useMemo(() => buildKioskFilterItems(kioskList, kioskGroup), [kioskList, kioskGroup]);
  const categoryItems = useMemo(() => buildCategoryFilterItems(records, categories), [records, categories]);

  const kioskCounts = useMemo(() => {
    const base = filterRecords(records, { categories: categoryKeys, productCode, color: colorValue });
    const sums = sumBy(base, (r) => String(r.locationId));
    return sums;
  }, [records, categoryKeys, productCode, colorValue]);
  const categoryCounts = useMemo(() => {
    const base = filterRecords(records, { kioskIds: kioskKeys, productCode, color: colorValue });
    return sumBy(base, (r) => r.category);
  }, [records, kioskKeys, productCode, colorValue]);

  const effectiveCross = crossKey === groupKey ? "none" : crossKey;
  const pivot = useMemo(
    () => buildPivot(filtered, groupKey, effectiveCross, order),
    [filtered, groupKey, effectiveCross, order]
  );
  const kpi = useMemo(() => summarizeRecords(filtered), [filtered]);

  const filtersLabel = () =>
    stockQueryFiltersLabel({
      kioskLabels: kioskItems.filter((i) => kioskKeys.includes(i.key)).map((i) => i.label),
      categories: categoryKeys,
      productLabel: product ? `${product.code} · ${product.name}` : "",
      color: colorValue,
    });

  const exportExcel = () => {
    if (!filtered.length) {
      showError("No hay existencias para exportar con esos filtros.");
      return;
    }
    try {
      exportStockQueryExcel({
        records: filtered,
        pivot,
        groupKey,
        crossKey: effectiveCross,
        filtersLabel: filtersLabel(),
      });
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  const clearFilters = () => {
    setKioskKeys([]);
    setCategoryKeys([]);
    setProductId("");
    setColor("");
  };

  const hasFilters = kioskKeys.length > 0 || categoryKeys.length > 0 || Boolean(productId) || Boolean(colorValue);

  const summaryText = (() => {
    const bits = [
      kioskKeys.length ? `${kioskKeys.length} ${kioskKeys.length === 1 ? "kiosko" : "kioscos"}` : "todos los kioscos",
      categoryKeys.length ? categoryKeys.join(", ") : "todas las categorías",
    ];
    if (product) bits.push(product.code);
    if (colorValue) bits.push(`color ${colorValue}`);
    return `Mostrando ${bits.join(" · ")}. Agrupado por ${dimensionLabel(groupKey).toLowerCase()}${
      effectiveCross !== "none" ? ` y cruzado con ${dimensionLabel(effectiveCross).toLowerCase()}` : ""
    }.`;
  })();

  const heat = (v) =>
    v > 0 && pivot.max > 0
      ? { background: `rgba(11,110,113,${(0.07 + (0.38 * v) / pivot.max).toFixed(2)})`, color: "#0f2b2d" }
      : undefined;

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl" className="ksq-modal" contentClassName="ksq-content">
      <ModalHeader toggle={toggle} className="ksq-header">
        <div className="ksq-title">Consultar stock en kioscos</div>
        <div className="ksq-subtitle">{summaryText}</div>
      </ModalHeader>
      <ModalBody className="ksq-body">
        <div className="ksq-actions">
          <Button color="success" size="sm" onClick={exportExcel} disabled={loading || !filtered.length}>
            <i className="nc-icon nc-cloud-download-93 mr-1" />
            Descargar Excel
          </Button>
          <Button color="secondary" outline size="sm" onClick={load} disabled={loading}>
            <i className="nc-icon nc-refresh-69 mr-1" />
            Actualizar
          </Button>
        </div>

        <div className="ksq-filters">
          <ExcelStyleFilter
            label="Kioscos"
            title="Filtrar kioscos"
            items={kioskItems}
            value={kioskKeys}
            onChange={setKioskKeys}
            allText="Todos los kioscos"
            noun="kioscos"
            counts={kioskCounts}
            grouped
            searchPlaceholder="Buscar kiosco o grupo…"
            width={320}
            panelWidth={430}
            headerExtra={
              <div className="ksq-kgroup">
                <span>Agrupar por</span>
                <div className="ksq-seg ksq-seg-sm">
                  {KIOSK_GROUP_OPTIONS.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      aria-pressed={kioskGroup === g.key}
                      className={kioskGroup === g.key ? "on" : ""}
                      onClick={() => setKioskGroup(g.key)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            }
          />
          <ExcelStyleFilter
            label="Categoría de producto"
            title="Filtrar categorías de producto"
            items={categoryItems}
            value={categoryKeys}
            onChange={setCategoryKeys}
            allText="Todas las categorías"
            noun="categorías"
            counts={categoryCounts}
            searchPlaceholder="Buscar categoría…"
            width={260}
            panelWidth={340}
          />
          <div className="ksq-product">
            <div className="esf-label">Producto</div>
            <ProductSelector
              products={productChoices}
              value={productId}
              onChange={(p) => {
                setProductId(p ? String(p.id) : "");
                setColor("");
              }}
              placeholder="Todos los productos"
              fluid
            />
            {productId ? (
              <button type="button" className="ksq-link ksq-link-inline" onClick={() => { setProductId(""); setColor(""); }}>
                Quitar producto
              </button>
            ) : null}
          </div>
          <div className="ksq-color">
            <div className="esf-label">Color</div>
            <select
              className="ksq-select"
              aria-label="Color"
              value={colorValue}
              onChange={(e) => setColor(e.target.value)}
            >
              <option value="">Todos los colores</option>
              {colorOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {hasFilters ? (
            <button type="button" className="ksq-link" onClick={clearFilters}>
              Limpiar filtros
            </button>
          ) : null}
        </div>

        <div className="ksq-groupbar">
          <div className="ksq-seg-wrap">
            <span>Ver por</span>
            <div className="ksq-seg">
              {STOCK_DIMENSIONS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={groupKey === d.key}
                  className={groupKey === d.key ? "on" : ""}
                  onClick={() => {
                    setGroupKey(d.key);
                    if (crossKey === d.key) setCrossKey("none");
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ksq-seg-wrap">
            <span>Cruzar con</span>
            <div className="ksq-seg">
              <button
                type="button"
                aria-pressed={effectiveCross === "none"}
                className={effectiveCross === "none" ? "on" : ""}
                onClick={() => setCrossKey("none")}
              >
                Nada
              </button>
              {STOCK_DIMENSIONS.filter((d) => d.key !== groupKey).map((d) => (
                <button
                  key={d.key}
                  type="button"
                  aria-pressed={effectiveCross === d.key}
                  className={effectiveCross === d.key ? "on" : ""}
                  onClick={() => setCrossKey(d.key)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="ksq-sort"
            onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
            disabled={groupKey === "size"}
          >
            Orden: {groupKey === "size" ? "por talla" : order === "desc" ? "mayor stock primero" : "A–Z"}
          </button>
        </div>

        {error ? (
          <Alert color="danger" className="mt-3 mb-0">
            {error}{" "}
            <Button color="link" size="sm" className="p-0 align-baseline" onClick={load}>
              Reintentar
            </Button>
          </Alert>
        ) : null}

        <div className="ksq-kpis">
          <div className="ksq-kpi">
            <div className="ksq-kpi-label">Unidades en total</div>
            <div className="ksq-kpi-value ksq-kpi-accent">{fmt(kpi.units)}</div>
          </div>
          <div className="ksq-kpi">
            <div className="ksq-kpi-label">Kioscos incluidos</div>
            <div className="ksq-kpi-value">{fmt(kpi.kiosks)}</div>
          </div>
          <div className="ksq-kpi">
            <div className="ksq-kpi-label">Productos distintos</div>
            <div className="ksq-kpi-value">{fmt(kpi.products)}</div>
          </div>
          <div className="ksq-kpi">
            <div className="ksq-kpi-label">Variantes (color y herraje)</div>
            <div className="ksq-kpi-value">{fmt(kpi.variants)}</div>
          </div>
        </div>

        {loading && !apiRows ? (
          <div className="ksq-state">
            <Spinner size="sm" className="mr-2" />
            Cargando el stock de los kioscos…
          </div>
        ) : filtered.length === 0 && !error ? (
          <div className="ksq-state ksq-state-empty">
            <div className="ksq-state-title">Sin existencias con esos filtros</div>
            <div>Prueba quitando el color o el producto.</div>
          </div>
        ) : filtered.length > 0 ? (
          <div className={`ksq-table-box ${loading ? "ksq-loading" : ""}`}>
            <table className="ksq-table">
              <thead>
                <tr>
                  <th className="ksq-sticky-col">{dimensionLabel(groupKey)}</th>
                  {pivot.colKeys.map((c) => (
                    <th key={c} className="ksq-num">
                      {c}
                    </th>
                  ))}
                  <th className="ksq-num ksq-total-head">Total</th>
                  <th className="ksq-pct-head">% del total</th>
                </tr>
              </thead>
              <tbody>
                {pivot.rowKeys.map((a) => {
                  const total = pivot.rowTotals[a];
                  const pct = pivot.grand ? (total / pivot.grand) * 100 : 0;
                  return (
                    <tr key={a}>
                      <td className="ksq-sticky-col">{a}</td>
                      {pivot.colKeys.map((b) => {
                        const v = pivot.matrix[a][b] || 0;
                        return (
                          <td key={b} className={`ksq-num ${v ? "" : "ksq-zero"}`} style={heat(v)}>
                            {v ? fmt(v) : "—"}
                          </td>
                        );
                      })}
                      <td className="ksq-num ksq-total">{fmt(total)}</td>
                      <td className="ksq-pct">
                        <div className="ksq-bar">
                          <div style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                        <span>{pct.toFixed(1).replace(/\.0$/, "")} %</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="ksq-sticky-col">Total general</td>
                  {pivot.colKeys.map((b) => (
                    <td key={b} className="ksq-num">
                      {fmt(pivot.colTotals[b])}
                    </td>
                  ))}
                  <td className="ksq-num ksq-total">{fmt(pivot.grand)}</td>
                  <td className="ksq-pct">100 %</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </ModalBody>
    </Modal>
  );
}

export default KioskStockQueryModal;
