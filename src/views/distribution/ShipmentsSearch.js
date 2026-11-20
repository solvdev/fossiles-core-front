import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Label, Spinner, Table } from "reactstrap";
import { getShipmentSearchOptions, searchShipments } from "services/productDistributionService";
import { exportKioskShipmentsExcel, openKioskShipmentsPrintWindow, shipmentStatusMeta } from "utils/kioskShipmentsExport";
import { formatDateGt } from "utils/dateTimeHelper";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import ShipmentSearchDetailPanel from "./ShipmentSearchDetailPanel";
import {
  DATE_FIELDS,
  EXPORT_MAX,
  OP_TYPES,
  ORDERS,
  ORIGINS,
  PAGE_SIZE,
  PROVENANCES,
  STATUSES,
  TEXT_FILTERS,
  apiFilters,
  dateFieldLabel,
  emptyFilters,
  filtersFromParams,
  itemDate,
  lastDaysRange,
  linesSummary,
  originLabel,
  paramsFromFilters,
  provenanceDetail,
  provenanceLabel,
  provenanceMeta,
} from "./shipmentsSearchFilters";
import "./ShipmentsSearch.css";

const textDrafts = (f) => Object.fromEntries(TEXT_FILTERS.map(({ key }) => [key, f[key] || ""]));
const hasAdvanced = (f) =>
  Boolean(
    f.distributionNumber || f.productionOrderCode || f.productionOrderType || f.dispatchOrigin || f.person ||
      f.notes || f.receiptDifference || f.pendingProduction || f.order !== "date-desc"
  );
const fmtQty = (v) => {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};
const exportOptions = (range) => ({
  multiKiosk: true,
  provenanceOf: provenanceLabel,
  title: "ENVÍOS · CONSULTA",
  range,
  fileLabel: "Consulta",
});

/**
 * Distribución › Envíos: cualquier envío del sistema por procedencia, con filtros combinables guardados en la URL,
 * detalle en panel lateral, selección múltiple, PDF (una hoja por envío + resumen) y Excel.
 */
function ShipmentsSearch() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramsKey = searchParams.toString();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(paramsKey)), [paramsKey]);

  const [drafts, setDrafts] = useState(() => textDrafts(filters));
  const [showMore, setShowMore] = useState(() => hasAdvanced(filters));
  const [options, setOptions] = useState({ allKiosks: true, kiosks: [], supervisors: [] });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Map());
  const [openItem, setOpenItem] = useState(null);
  const [kioskMenuOpen, setKioskMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestRef = useRef(0);
  const kioskPickRef = useRef(null);

  const updateFilters = useCallback(
    (patch, { keepPage = false } = {}) => {
      const next = { ...filters, ...patch };
      if (!keepPage) next.page = 0;
      setSearchParams(paramsFromFilters(next), { replace: true });
    },
    [filters, setSearchParams]
  );

  // Los cuadros de texto escriben en la URL un momento después de dejar de teclear.
  useEffect(() => {
    const changed = TEXT_FILTERS.some(({ key }) => String(drafts[key] || "").trim() !== filters[key]);
    if (!changed) return undefined;
    const timer = setTimeout(() => updateFilters(drafts), 450);
    return () => clearTimeout(timer);
  }, [drafts, filters, updateFilters]);

  useEffect(() => {
    getShipmentSearchOptions()
      .then((data) => setOptions({ allKiosks: true, kiosks: [], supervisors: [], ...(data || {}) }))
      .catch((err) => showError(err.message || "No se pudieron cargar los kioscos"));
  }, []);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError("");
    searchShipments(apiFilters(filters))
      .then((data) => {
        if (requestRef.current === requestId) setResult(data);
      })
      .catch((err) => {
        if (requestRef.current === requestId) {
          setResult(null);
          setError(err.message || "No se pudieron buscar los envíos");
        }
      })
      .finally(() => {
        if (requestRef.current === requestId) setLoading(false);
      });
  }, [filters]);

  useEffect(() => {
    if (!kioskMenuOpen) return undefined;
    const onDown = (e) => {
      if (kioskPickRef.current && !kioskPickRef.current.contains(e.target)) setKioskMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [kioskMenuOpen]);

  const kioskById = useMemo(() => new Map((options.kiosks || []).map((k) => [Number(k.id), k])), [options.kiosks]);
  const kioskGroups = useMemo(() => {
    const groups = new Map();
    (options.kiosks || []).forEach((k) => {
      const key = k.departamento || "Sin departamento";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(k);
    });
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [options.kiosks]);

  const items = useMemo(() => result?.items || [], [result]);
  const total = result?.total || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleIn = (list, value) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const toggleKiosk = (id) => updateFilters({ kioskIds: toggleIn(filters.kioskIds, Number(id)) });
  const addKiosks = (ids) =>
    updateFilters({ kioskIds: [...new Set([...filters.kioskIds, ...ids.map(Number)])] });

  const clearAll = () => {
    const empty = emptyFilters();
    setDrafts(textDrafts(empty));
    setSearchParams(paramsFromFilters(empty), { replace: true });
  };

  const removeTag = (tag) => {
    if (tag.text) setDrafts((d) => ({ ...d, [tag.key]: "" }));
    updateFilters(tag.patch);
  };

  const activeTags = useMemo(() => {
    const tags = [];
    if (filters.from || filters.to) {
      tags.push({
        id: "date",
        label: `Fecha ${dateFieldLabel(filters.dateField)}: ${filters.from ? formatDateGt(filters.from) : "…"} – ${
          filters.to ? formatDateGt(filters.to) : "hoy"
        }`,
        patch: { from: "", to: "" },
      });
    }
    filters.kioskIds.forEach((id) => {
      const k = kioskById.get(id);
      tags.push({
        id: `k${id}`,
        label: `Kiosco: ${k ? k.name : `#${id}`}`,
        patch: { kioskIds: filters.kioskIds.filter((x) => x !== id) },
      });
    });
    filters.provenances.forEach((p) =>
      tags.push({ id: `p${p}`, label: provenanceMeta(p).label, patch: { provenances: filters.provenances.filter((x) => x !== p) } })
    );
    filters.statuses.forEach((s) =>
      tags.push({
        id: `s${s}`,
        label: (STATUSES.find((x) => x.key === s) || { label: s }).label,
        patch: { statuses: filters.statuses.filter((x) => x !== s) },
      })
    );
    TEXT_FILTERS.forEach(({ key, label }) => {
      if (filters[key]) tags.push({ id: key, key, text: true, label: `${label}: ${filters[key]}`, patch: { [key]: "" } });
    });
    if (filters.productionOrderType)
      tags.push({ id: "opType", label: `Tipo de OP: ${filters.productionOrderType}`, patch: { productionOrderType: "" } });
    if (filters.dispatchOrigin)
      tags.push({ id: "origin", label: `Origen: ${originLabel(filters.dispatchOrigin)}`, patch: { dispatchOrigin: "" } });
    if (filters.receiptDifference)
      tags.push({ id: "diff", label: "Con diferencia en recepción", patch: { receiptDifference: false } });
    if (filters.pendingProduction)
      tags.push({ id: "pend", label: "Pendiente de producción", patch: { pendingProduction: false } });
    return tags;
  }, [filters, kioskById]);

  const toggleSelected = (item) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, item);
      return next;
    });
  const allOnPage = items.length > 0 && items.every((i) => selected.has(i.id));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      items.forEach((i) => (allOnPage ? next.delete(i.id) : next.set(i.id, i)));
      return next;
    });

  const range = useMemo(() => (result ? { from: result.from, to: result.to } : null), [result]);

  const printList = useCallback(async (list) => {
    try {
      const ok = await openKioskShipmentsPrintWindow(list, {
        withSummary: list.length > 1,
        title: "RESUMEN DE ENVÍOS",
        provenanceOf: provenanceLabel,
      });
      if (!ok) showError("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes e intenta de nuevo.");
    } catch (err) {
      showError(err.message || "No se pudo preparar la impresión");
    }
  }, []);

  const excelList = useCallback(
    (list) => {
      try {
        const file = exportKioskShipmentsExcel(list, exportOptions(range));
        showSuccess(`Descargado ${file}`);
      } catch (err) {
        showError(err.message || "No se pudo generar el Excel");
      }
    },
    [range]
  );

  const exportWholeList = async () => {
    setExporting(true);
    try {
      const data = await searchShipments(apiFilters(filters, { page: 0, size: EXPORT_MAX }));
      const list = data?.items || [];
      if (!list.length) {
        showWarning("No hay envíos para exportar con estos filtros.");
        return;
      }
      if ((data.total || 0) > list.length) {
        showWarning(`Se exportan los primeros ${list.length} de ${data.total} envíos. Acota los filtros para el resto.`);
      }
      exportKioskShipmentsExcel(list, exportOptions({ from: data.from, to: data.to }));
    } catch (err) {
      showError(err.message || "No se pudo exportar el listado");
    } finally {
      setExporting(false);
    }
  };

  const copyLink = () => {
    const url = window.location.href;
    const done = () => showSuccess("Enlace copiado: abre la misma búsqueda.");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => window.prompt("Copia el enlace:", url));
    } else {
      window.prompt("Copia el enlace:", url);
    }
  };

  const closeDetail = useCallback(() => setOpenItem(null), []);
  const openDistribution = useCallback((id) => navigate(`/admin/product-distributions/${id}`), [navigate]);

  const kioskInputLabel = filters.kioskIds.length
    ? filters.kioskIds.map((id) => kioskById.get(id)?.name || `#${id}`).join(", ")
    : options.allKiosks
      ? "Todos los kioscos"
      : "Mis kioscos";

  return (
    <div className="content dist-contrast">
      <Card>
        <CardHeader>
          <div className="d-flex flex-wrap justify-content-between align-items-end" style={{ gap: 12 }}>
            <div>
              <CardTitle tag="h4" className="mb-1">
                Envíos
              </CardTitle>
              <p className="text-muted small mb-0" style={{ maxWidth: "70ch" }}>
                Cualquier envío del sistema por procedencia: directos a kiosco, de distribución, por orden de
                producción, ENVP y ENVI. Abre uno para ver el detalle, o márcalos para imprimir o exportar.
              </p>
            </div>
            <Button color="success" size="sm" outline onClick={exportWholeList} disabled={exporting || !total}>
              {exporting ? <Spinner size="sm" /> : "Excel del listado"}
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {!options.allKiosks ? (
            <Alert color="warning" className="py-2">
              Solo ves los envíos de tus kioscos.
            </Alert>
          ) : null}

          <form className="shs-filters" onSubmit={(e) => e.preventDefault()} autoComplete="off">
            <div className="shs-row">
              <div className="shs-field wide">
                <Label className="shs-label" for="shs-date-field">
                  Fecha
                </Label>
                <div className="shs-daterow">
                  <Input
                    id="shs-date-field"
                    type="select"
                    bsSize="sm"
                    value={filters.dateField}
                    onChange={(e) => updateFilters({ dateField: e.target.value })}
                  >
                    {DATE_FIELDS.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </Input>
                  <Input
                    type="date"
                    bsSize="sm"
                    aria-label="Desde"
                    value={filters.from}
                    onChange={(e) => updateFilters({ from: e.target.value })}
                  />
                  <Input
                    type="date"
                    bsSize="sm"
                    aria-label="Hasta"
                    value={filters.to}
                    onChange={(e) => updateFilters({ to: e.target.value })}
                  />
                </div>
                <div className="shs-chips">
                  {[["Hoy", 0], ["7 días", 7], ["30 días", 30], ["90 días", 90], ["1 año", 365]].map(([label, days]) => (
                    <button key={label} type="button" className="shs-chip" onClick={() => updateFilters(lastDaysRange(days))}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="shs-field shs-kiosk-pick" ref={kioskPickRef}>
                <Label className="shs-label" for="shs-kiosk">
                  Kiosco destino
                </Label>
                <Input
                  id="shs-kiosk"
                  bsSize="sm"
                  readOnly
                  value={kioskInputLabel}
                  onClick={() => setKioskMenuOpen((v) => !v)}
                  style={{ cursor: "pointer" }}
                />
                {kioskMenuOpen ? (
                  <div className="shs-kiosk-menu">
                    {(options.supervisors || []).length ? (
                      <>
                        <h6>Por supervisora</h6>
                        <div className="shs-chips px-1">
                          {options.supervisors.map((s) => (
                            <button key={s.userId} type="button" className="shs-chip" onClick={() => addKiosks(s.kioskIds)}>
                              {s.name} <span className="shs-count">{s.kioskIds.length}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : null}
                    {kioskGroups.map(([region, kiosks]) => (
                      <div key={region}>
                        <h6>
                          {region}
                          <button type="button" className="shs-linkbtn" onClick={() => addKiosks(kiosks.map((k) => k.id))}>
                            Todo {region}
                          </button>
                        </h6>
                        {kiosks.map((k) => (
                          <label key={k.id}>
                            <input
                              type="checkbox"
                              checked={filters.kioskIds.includes(Number(k.id))}
                              onChange={() => toggleKiosk(k.id)}
                            />
                            {k.name} <span className="text-muted small">{k.code}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                    {!kioskGroups.length ? <div className="text-muted small p-2">Sin kioscos.</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="shs-field">
                <Label className="shs-label" for="shs-product">
                  Producto, código, color o talla
                </Label>
                <Input
                  id="shs-product"
                  bsSize="sm"
                  placeholder="Ej. B-56 tostado"
                  value={drafts.product}
                  onChange={(e) => setDrafts((d) => ({ ...d, product: e.target.value }))}
                />
              </div>
              <div className="shs-field">
                <Label className="shs-label" for="shs-number">
                  Número de envío
                </Label>
                <Input
                  id="shs-number"
                  bsSize="sm"
                  placeholder="Ej. 00065 o MIRAF2-ENV"
                  value={drafts.shipmentNumber}
                  onChange={(e) => setDrafts((d) => ({ ...d, shipmentNumber: e.target.value }))}
                />
              </div>
            </div>

            <div className="shs-field">
              <span className="shs-label">Procedencia</span>
              <div className="shs-chips">
                {PROVENANCES.filter((p) => p.key !== "OTRO" || result?.countsByProvenance?.OTRO).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`shs-chip${filters.provenances.includes(p.key) ? " active" : ""}`}
                    onClick={() => updateFilters({ provenances: toggleIn(filters.provenances, p.key) })}
                  >
                    {p.label}
                    <span className="shs-count">{result?.countsByProvenance?.[p.key] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="shs-field">
              <span className="shs-label">Estado</span>
              <div className="shs-chips">
                {STATUSES.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`shs-chip${filters.statuses.includes(s.key) ? " active" : ""}`}
                    onClick={() => updateFilters({ statuses: toggleIn(filters.statuses, s.key) })}
                  >
                    {s.label}
                    <span className="shs-count">{result?.countsByStatus?.[s.key] ?? 0}</span>
                  </button>
                ))}
              </div>
            </div>

            <button type="button" className="shs-linkbtn" onClick={() => setShowMore((v) => !v)}>
              {showMore ? "Menos filtros ▴" : "Más filtros ▾"}
            </button>
            {showMore ? (
              <div className="shs-more">
                <div className="shs-row">
                  <div className="shs-field">
                    <Label className="shs-label" for="shs-dist">
                      Distribución
                    </Label>
                    <Input
                      id="shs-dist"
                      bsSize="sm"
                      placeholder="DIST-20261021-060"
                      value={drafts.distributionNumber}
                      onChange={(e) => setDrafts((d) => ({ ...d, distributionNumber: e.target.value }))}
                    />
                  </div>
                  <div className="shs-field">
                    <Label className="shs-label" for="shs-op">
                      Código de OP
                    </Label>
                    <Input
                      id="shs-op"
                      bsSize="sm"
                      placeholder="OPK-29"
                      value={drafts.productionOrderCode}
                      onChange={(e) => setDrafts((d) => ({ ...d, productionOrderCode: e.target.value }))}
                    />
                  </div>
                  <div className="shs-field">
                    <Label className="shs-label" for="shs-optype">
                      Tipo de OP
                    </Label>
                    <Input
                      id="shs-optype"
                      type="select"
                      bsSize="sm"
                      value={filters.productionOrderType}
                      onChange={(e) => updateFilters({ productionOrderType: e.target.value })}
                    >
                      <option value="">Cualquiera</option>
                      {OP_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Input>
                  </div>
                  <div className="shs-field">
                    <Label className="shs-label" for="shs-origin">
                      Origen de descarga
                    </Label>
                    <Input
                      id="shs-origin"
                      type="select"
                      bsSize="sm"
                      value={filters.dispatchOrigin}
                      onChange={(e) => updateFilters({ dispatchOrigin: e.target.value })}
                    >
                      <option value="">Cualquiera</option>
                      {ORIGINS.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </Input>
                  </div>
                  <div className="shs-field">
                    <Label className="shs-label" for="shs-person">
                      Creado, enviado o recibido por
                    </Label>
                    <Input
                      id="shs-person"
                      bsSize="sm"
                      placeholder="Nombre de usuario"
                      value={drafts.person}
                      onChange={(e) => setDrafts((d) => ({ ...d, person: e.target.value }))}
                    />
                  </div>
                  <div className="shs-field">
                    <Label className="shs-label" for="shs-notes">
                      Texto en notas
                    </Label>
                    <Input
                      id="shs-notes"
                      bsSize="sm"
                      placeholder="Ej. urgente"
                      value={drafts.notes}
                      onChange={(e) => setDrafts((d) => ({ ...d, notes: e.target.value }))}
                    />
                  </div>
                  <div className="shs-field">
                    <Label className="shs-label" for="shs-order">
                      Orden
                    </Label>
                    <Input
                      id="shs-order"
                      type="select"
                      bsSize="sm"
                      value={filters.order}
                      onChange={(e) => updateFilters({ order: e.target.value })}
                    >
                      {ORDERS.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </Input>
                  </div>
                </div>
                <div className="shs-checks">
                  <Label check className="mb-0">
                    <Input
                      type="checkbox"
                      checked={filters.receiptDifference}
                      onChange={(e) => updateFilters({ receiptDifference: e.target.checked })}
                    />{" "}
                    Con diferencia en la recepción
                  </Label>
                  <Label check className="mb-0">
                    <Input
                      type="checkbox"
                      checked={filters.pendingProduction}
                      onChange={(e) => updateFilters({ pendingProduction: e.target.checked })}
                    />{" "}
                    Pendiente de producción (faltante de reposición)
                  </Label>
                </div>
              </div>
            ) : null}

            <div className="shs-active">
              {activeTags.length ? (
                <>
                  <span className="shs-label">Filtros activos</span>
                  {activeTags.map((tag) => (
                    <span key={tag.id} className="shs-tag">
                      {tag.label}
                      <button type="button" aria-label={`Quitar ${tag.label}`} onClick={() => removeTag(tag)}>
                        ×
                      </button>
                    </span>
                  ))}
                  <button type="button" className="shs-linkbtn" onClick={clearAll}>
                    Limpiar
                  </button>
                </>
              ) : (
                <span className="text-muted small">Sin filtros: se muestran los últimos 90 días.</span>
              )}
              <span className="flex-grow-1" />
              <Button color="secondary" size="sm" outline onClick={copyLink}>
                Copiar enlace
              </Button>
            </div>
          </form>

          <div className="shs-result-bar">
            <div>
              <strong>
                {total} envío{total === 1 ? "" : "s"}
              </strong>{" "}
              {total ? <span className="text-muted small">· {fmtQty(result?.totalUnits)} unidades</span> : null}
              {loading ? <Spinner size="sm" className="ml-2" /> : null}
            </div>
            <div className="d-flex flex-wrap" style={{ gap: 6 }}>
              {result?.defaultRangeApplied ? (
                <span className="shs-cap">Sin rango de fechas: solo los últimos 90 días. Elige fechas para ir más atrás.</span>
              ) : null}
              {result?.truncated ? (
                <span className="shs-cap">
                  El rango tiene más de {result.maxScanned} envíos: el total puede estar incompleto. Acota fechas o kiosco.
                </span>
              ) : null}
            </div>
          </div>

          {selected.size ? (
            <div className="shs-selbar">
              <strong>
                {selected.size} envío{selected.size === 1 ? "" : "s"} marcado{selected.size === 1 ? "" : "s"}
              </strong>
              <span className="shs-grow" />
              <Button color="light" size="sm" onClick={() => printList([...selected.values()])}>
                Imprimir PDF
              </Button>
              <Button color="light" size="sm" onClick={() => excelList([...selected.values()])}>
                Excel
              </Button>
              <Button color="link" size="sm" className="text-white" onClick={() => setSelected(new Map())}>
                Quitar selección
              </Button>
            </div>
          ) : null}

          {error ? <Alert color="danger">{error}</Alert> : null}

          <div className="shs-table-wrap">
            {!loading && !error && result && !items.length ? (
              <div className="shs-empty">
                <h5 className="mb-0">Ningún envío coincide con estos filtros</h5>
                <p className="text-muted mb-0">Prueba a quitar alguno. Lo que más suele reducir la búsqueda:</p>
                <ul>
                  {filters.provenances.length ? <li>la procedencia elegida</li> : null}
                  {filters.product ? (
                    <li>el producto «{filters.product}»: prueba solo el código o solo el color</li>
                  ) : null}
                  <li>
                    la fecha {dateFieldLabel(filters.dateField)}
                    {filters.dateField === "sent" || filters.dateField === "received"
                      ? ": un envío que no ha salido o no se ha recibido no tiene esa fecha"
                      : ""}
                  </li>
                  {filters.kioskIds.length ? <li>los kioscos elegidos</li> : null}
                </ul>
                <Button color="primary" size="sm" onClick={clearAll}>
                  Limpiar filtros
                </Button>
              </div>
            ) : (
              <Table size="sm" className="shs-table">
                <thead>
                  <tr>
                    <th>
                      <Input
                        type="checkbox"
                        className="position-static m-0"
                        aria-label="Marcar todos los de esta página"
                        checked={allOnPage}
                        onChange={togglePage}
                      />
                    </th>
                    <th>Envío</th>
                    <th>Procedencia</th>
                    <th>Destino</th>
                    <th>Estado</th>
                    <th>Fecha {dateFieldLabel(filters.dateField)}</th>
                    <th className="text-right">Unid.</th>
                    <th className="shs-hide-sm">Origen descarga</th>
                    <th className="shs-hide-sm">Productos</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const prov = provenanceMeta(item.provenance);
                    const status = shipmentStatusMeta(item.status);
                    const detail = provenanceDetail(item);
                    const date = itemDate(item, filters.dateField);
                    return (
                      <tr
                        key={item.id}
                        className={openItem?.id === item.id ? "open" : undefined}
                        onClick={() => setOpenItem(item)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="checkbox"
                            className="position-static m-0"
                            aria-label={`Marcar ${item.shipmentNumber}`}
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelected(item)}
                          />
                        </td>
                        <td>
                          <span className="shs-num">{item.shipmentNumber || `#${item.id}`}</span>
                          <span className="shs-sub">{item.createdByName ? `por ${item.createdByName}` : ""}</span>
                        </td>
                        <td>
                          <span className={`shs-prov ${prov.cls}`}>{prov.label}</span>
                          {detail ? <span className="shs-sub shs-num">{detail}</span> : null}
                        </td>
                        <td>
                          {item.locationName || "—"}
                          <span className="shs-sub">
                            {item.locationCode || "sin kiosco"}
                            {item.locationDepartamento ? ` · ${item.locationDepartamento}` : ""}
                          </span>
                        </td>
                        <td>
                          <Badge color={status.color}>{status.label}</Badge>
                          {item.receiptDifference ? <span className="shs-flag">Diferencia</span> : null}
                        </td>
                        <td>{date ? formatDateGt(date) : "—"}</td>
                        <td className="text-right">{fmtQty(item.totalUnits) || "—"}</td>
                        <td className="shs-hide-sm">
                          {item.dispatchOrigin ? (
                            <span className={item.dispatchOrigin === "MIXTO" ? "shs-origin-mix" : undefined}>
                              {item.dispatchOrigin === "MIXTO" ? "Mixto" : originLabel(item.dispatchOrigin)}
                            </span>
                          ) : (
                            <span className="text-muted small">—</span>
                          )}
                        </td>
                        <td className="shs-hide-sm small">{linesSummary(item)}</td>
                      </tr>
                    );
                  })}
                  {!items.length ? (
                    <tr>
                      <td colSpan={9} className="text-center text-muted py-4">
                        {loading ? "Buscando envíos…" : "—"}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </Table>
            )}
            {total > PAGE_SIZE ? (
              <div className="shs-pager">
                <span className="text-muted">
                  Página {filters.page + 1} de {pages} · {PAGE_SIZE} por página
                </span>
                <Button
                  size="sm"
                  outline
                  disabled={filters.page === 0}
                  onClick={() => updateFilters({ page: filters.page - 1 }, { keepPage: true })}
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  outline
                  disabled={filters.page + 1 >= pages}
                  onClick={() => updateFilters({ page: filters.page + 1 }, { keepPage: true })}
                >
                  Siguiente
                </Button>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <ShipmentSearchDetailPanel
        item={openItem}
        onClose={closeDetail}
        onPrint={(item) => printList([item])}
        onExcel={(item) => excelList([item])}
        onOpenDistribution={openDistribution}
      />
    </div>
  );
}

export default ShipmentsSearch;
