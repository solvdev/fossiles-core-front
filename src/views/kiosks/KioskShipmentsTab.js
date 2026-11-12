import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Input, Spinner, Table } from "reactstrap";
import { getShipmentsByKiosk } from "services/productDistributionService";
import {
  getMonthStartYmdGuatemala,
  getTodayYmdGuatemala,
  shiftYmdGuatemala,
  formatDateGt,
  formatDateTimeGt,
} from "utils/dateTimeHelper";
import { formatPackingItemLabel, getShipmentPackingItems } from "utils/shipmentPackingHelper";
import {
  SHIPMENT_STATUS_GROUPS,
  countByGroup,
  exportKioskShipmentsExcel,
  filterShipments,
  lineVariantLabel,
  openKioskShipmentsPrintWindow,
  shipmentDate,
  shipmentHasReceipt,
  shipmentLines,
  shipmentOriginLabel,
  shipmentPieces,
  shipmentReceivedPieces,
  shipmentStatusMeta,
} from "utils/kioskShipmentsExport";
import { showError, showSuccess } from "utils/notificationHelper";
import "./KioskShipmentsTab.css";

/** El back devuelve como máximo 500 envíos por consulta. */
const BACKEND_MAX = 500;

const PRESETS = [
  { key: "7", label: "7 días", range: () => ({ from: shiftYmdGuatemala(getTodayYmdGuatemala(), -6), to: getTodayYmdGuatemala() }) },
  { key: "30", label: "30 días", range: () => ({ from: shiftYmdGuatemala(getTodayYmdGuatemala(), -29), to: getTodayYmdGuatemala() }) },
  { key: "MONTH", label: "Este mes", range: () => ({ from: getMonthStartYmdGuatemala(), to: getTodayYmdGuatemala() }) },
  { key: "90", label: "90 días", range: () => ({ from: shiftYmdGuatemala(getTodayYmdGuatemala(), -89), to: getTodayYmdGuatemala() }) },
  { key: "365", label: "1 año", range: () => ({ from: shiftYmdGuatemala(getTodayYmdGuatemala(), -364), to: getTodayYmdGuatemala() }) },
];

const DEFAULT_PRESET = "30";
const presetRange = (key) => (PRESETS.find((p) => p.key === key) || PRESETS[1]).range();

function ShipmentDetail({ shipment }) {
  const lines = shipmentLines(shipment);
  const hasReceipt = shipmentHasReceipt(shipment);
  const packing = getShipmentPackingItems(shipment);
  const notes = String(shipment.notes || "").trim();
  const origin = shipmentOriginLabel(shipment);
  return (
    <div className="kship-detail">
      <div className="kship-sub mb-2">
        {shipment.sentAt ? <>Enviado {formatDateTimeGt(shipment.sentAt)}</> : <>Creado {formatDateTimeGt(shipment.createdAt)}</>}
        {shipment.receivedAt ? <> · Recibido {formatDateTimeGt(shipment.receivedAt)}</> : null}
        {shipment.createdByName ? <> · Por {shipment.createdByName}</> : null}
        {origin ? <> · Origen {origin}</> : null}
      </div>
      <Table responsive size="sm" className="mb-2 bg-white">
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Color</th>
            <th>Talla</th>
            <th className="text-right">Enviado</th>
            {hasReceipt && <th className="text-right">Recibido</th>}
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={hasReceipt ? 6 : 5} className="text-center text-muted">Sin líneas</td>
            </tr>
          ) : (
            lines.map((l) => {
              const variant = lineVariantLabel(l);
              const short = l.quantityReceived != null && Number(l.quantityReceived) < Number(l.quantity);
              return (
                <tr key={l.id ?? `${l.productId}-${l.colorId}-${l.size}-${l.hardwareCondition}`}>
                  <td>{l.productCode || "—"}</td>
                  <td>
                    {l.productName || "—"}
                    {variant ? <div className="kship-sub">{variant}</div> : null}
                  </td>
                  <td>{l.colorName || "—"}</td>
                  <td>{l.size || "—"}</td>
                  <td className="text-right font-weight-bold">{Number(l.quantity) || 0}</td>
                  {hasReceipt && (
                    <td className={`text-right ${short ? "text-danger font-weight-bold" : ""}`}>
                      {l.quantityReceived != null ? Number(l.quantityReceived) : "—"}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
      {packing.length > 0 && (
        <div className="kship-sub mb-2">
          <strong>Empaque:</strong>{" "}
          {packing.map((p) => `${formatPackingItemLabel(p)} × ${Number(p.quantity) || 0}`).join(" · ")}
        </div>
      )}
      {notes ? <div className="kship-note">{notes}</div> : null}
    </div>
  );
}

/**
 * Pestaña «Envíos» de Inventario de Kioskos: lista los envíos de un kiosko (cualquier estado) y permite
 * verlos, imprimirlos / guardarlos en PDF y descargarlos en Excel, uno por uno o varios a la vez.
 */
function KioskShipmentsTab({ locationId, locationName }) {
  const [preset, setPreset] = useState(DEFAULT_PRESET);
  const [range, setRange] = useState(() => presetRange(DEFAULT_PRESET));
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupKey, setGroupKey] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(() => new Set());
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!locationId) {
      setShipments([]);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await getShipmentsByKiosk(locationId, range.from, range.to);
      if (requestId !== requestRef.current) return;
      setShipments(Array.isArray(data) ? data : []);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setShipments([]);
      setError(err.message || "No se pudieron cargar los envíos del kiosko.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [locationId, range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  // Al cambiar de kiosko se limpia lo marcado y lo expandido (los ids ya no aplican).
  useEffect(() => {
    setSelected(new Set());
    setExpanded(new Set());
    setGroupKey("ALL");
    setQuery("");
  }, [locationId]);

  const searched = useMemo(() => filterShipments(shipments, { groupKey: "ALL", query }), [shipments, query]);
  const counts = useMemo(() => countByGroup(searched), [searched]);
  const visible = useMemo(() => filterShipments(shipments, { groupKey, query }), [shipments, groupKey, query]);

  const visibleIds = useMemo(() => visible.map((s) => s.id), [visible]);
  const selectedVisible = useMemo(() => visible.filter((s) => selected.has(s.id)), [visible, selected]);
  const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;

  // Lo que exportan los botones: lo marcado, o toda la lista filtrada si no hay nada marcado.
  const targets = selectedVisible.length > 0 ? selectedVisible : visible;
  const hasSelection = selectedVisible.length > 0;
  const targetPieces = useMemo(() => targets.reduce((sum, s) => sum + shipmentPieces(s), 0), [targets]);

  const toggleSelected = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });

  const toggleExpanded = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyPreset = (key) => {
    setPreset(key);
    setRange(presetRange(key));
  };

  const onDateChange = (field, value) => {
    setPreset("CUSTOM");
    setRange((prev) => {
      const next = { ...prev, [field]: value };
      // Si el usuario invierte las fechas, la otra se acomoda para no pedir un rango imposible.
      if (next.from && next.to && next.from > next.to) {
        if (field === "from") next.to = value;
        else next.from = value;
      }
      return next;
    });
  };

  const doPdf = (list) => {
    if (!list.length) return;
    const ok = openKioskShipmentsPrintWindow(list, { kioskName: locationName, range });
    if (!ok) {
      showError("El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.");
    } else if (list.length > 1) {
      showSuccess(`Se preparó el documento de ${list.length} envíos. Elige «Guardar como PDF» o tu impresora.`);
    }
  };

  const doExcel = (list) => {
    if (!list.length) return;
    try {
      const fileName = exportKioskShipmentsExcel(list, { kioskName: locationName, range });
      showSuccess(`Excel descargado: ${fileName}`);
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  const capped = shipments.length >= BACKEND_MAX;

  if (!locationId) {
    return (
      <div className="kship-empty">
        <div className="kship-empty-title">Elige un kiosko</div>
        Selecciona un kiosko arriba para ver sus envíos y poder imprimirlos o descargarlos.
      </div>
    );
  }

  return (
    <div className="kship-root">
      {/* Filtros */}
      <div className="kship-toolbar">
        <div className="row">
          <div className="col-lg-7 mb-3 mb-lg-0">
            <p className="kship-toolbar-label">Período</p>
            <div className="kship-chips mb-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`kship-chip ${preset === p.key ? "active" : ""}`}
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="kship-dates">
              <span className="kship-sub">Del</span>
              <Input
                type="date"
                bsSize="sm"
                value={range.from || ""}
                max={range.to || undefined}
                onChange={(e) => onDateChange("from", e.target.value)}
              />
              <span className="kship-sub">al</span>
              <Input
                type="date"
                bsSize="sm"
                value={range.to || ""}
                min={range.from || undefined}
                onChange={(e) => onDateChange("to", e.target.value)}
              />
            </div>
          </div>
          <div className="col-lg-5">
            <p className="kship-toolbar-label">Buscar</p>
            <Input
              type="search"
              bsSize="sm"
              placeholder="Número de envío, producto, color…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="kship-sub mt-1">Busca dentro del período elegido.</div>
          </div>
        </div>
        <p className="kship-toolbar-label mt-3">Estado</p>
        <div className="kship-chips">
          {SHIPMENT_STATUS_GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              className={`kship-chip ${groupKey === g.key ? "active" : ""}`}
              onClick={() => setGroupKey(g.key)}
            >
              {g.label}
              <span className="kship-chip-count">{counts[g.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <Alert color="danger" className="d-flex justify-content-between align-items-center">
          <span>{error}</span>
          <Button size="sm" color="danger" outline onClick={() => void load()}>
            Reintentar
          </Button>
        </Alert>
      )}
      {capped && (
        <Alert color="warning" className="py-2">
          Se muestran solo los {BACKEND_MAX} envíos más recientes del período. Acota las fechas para ver el resto.
        </Alert>
      )}

      {/* Barra de acciones */}
      <div className={`kship-actionbar ${hasSelection ? "is-selection" : ""}`}>
        <div>
          <div className="kship-actionbar-title">
            {loading ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Cargando envíos…
              </>
            ) : hasSelection ? (
              <>
                {selectedVisible.length} envío{selectedVisible.length === 1 ? "" : "s"} marcado{selectedVisible.length === 1 ? "" : "s"}
              </>
            ) : (
              <>
                {visible.length} envío{visible.length === 1 ? "" : "s"} en la lista
              </>
            )}
          </div>
          <div className="kship-actionbar-sub">
            {visible.length === 0
              ? "No hay nada que imprimir con estos filtros."
              : hasSelection
                ? `${targetPieces} pieza${targetPieces === 1 ? "" : "s"} · los botones usan solo lo marcado`
                : `${targetPieces} pieza${targetPieces === 1 ? "" : "s"} · marca envíos para elegir cuáles, o usa los botones para toda la lista`}
          </div>
        </div>
        <div className="kship-actionbar-buttons">
          {hasSelection && (
            <Button size="sm" color="link" className="text-white" onClick={() => setSelected(new Set())}>
              Quitar marcas
            </Button>
          )}
          <Button
            size="sm"
            color={hasSelection ? "light" : "primary"}
            disabled={loading || targets.length === 0}
            onClick={() => doPdf(targets)}
            title="Abre el documento para imprimirlo o guardarlo como PDF"
          >
            <i className="nc-icon nc-single-copy-04 mr-1" />
            PDF / Imprimir{targets.length > 1 ? ` (${targets.length})` : ""}
          </Button>
          <Button
            size="sm"
            color={hasSelection ? "light" : "success"}
            disabled={loading || targets.length === 0}
            onClick={() => doExcel(targets)}
            title="Descarga un archivo de Excel"
          >
            <i className="nc-icon nc-paper mr-1" />
            Excel{targets.length > 1 ? ` (${targets.length})` : ""}
          </Button>
        </div>
      </div>

      {/* Lista */}
      {!loading && visible.length === 0 ? (
        <div className="kship-empty">
          <div className="kship-empty-title">
            {shipments.length === 0 ? "Este kiosko no tiene envíos en el período" : "Ningún envío coincide con los filtros"}
          </div>
          {shipments.length === 0 ? (
            <>
              Prueba con un período más largo.{" "}
              <Button color="link" size="sm" className="p-0 align-baseline" onClick={() => applyPreset("365")}>
                Ver el último año
              </Button>
            </>
          ) : (
            <>
              <Button
                color="link"
                size="sm"
                className="p-0 align-baseline"
                onClick={() => {
                  setGroupKey("ALL");
                  setQuery("");
                }}
              >
                Quitar filtros
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          {visible.length > 0 && (
            <label className="d-flex align-items-center mb-2 pl-1" style={{ gap: 8, cursor: "pointer", fontSize: "0.85rem" }}>
              <input type="checkbox" className="kship-check" checked={allVisibleSelected} onChange={toggleAllVisible} />
              Marcar todos los de la lista ({visible.length})
            </label>
          )}
          <div className="kship-list">
            {visible.map((s) => {
              const meta = shipmentStatusMeta(s.status);
              const isSelected = selected.has(s.id);
              const isOpen = expanded.has(s.id);
              const pieces = shipmentPieces(s);
              const received = shipmentReceivedPieces(s);
              const hasReceipt = shipmentHasReceipt(s);
              const pct = pieces > 0 ? Math.min(100, Math.round((received / pieces) * 100)) : 0;
              const origin = shipmentOriginLabel(s);
              return (
                <div key={s.id} className={`kship-card st-${meta.color} ${isSelected ? "is-selected" : ""}`}>
                  <div className="kship-row">
                    <input
                      type="checkbox"
                      className="kship-check"
                      checked={isSelected}
                      onChange={() => toggleSelected(s.id)}
                      aria-label={`Marcar envío ${s.shipmentNumber}`}
                    />
                    <div>
                      <span className="kship-num" onClick={() => toggleExpanded(s.id)}>
                        {s.shipmentNumber || `#${s.id}`}
                      </span>{" "}
                      <Badge color={meta.color}>{meta.label}</Badge>
                      {origin ? <div className="kship-sub">{origin}</div> : null}
                    </div>
                    <div className="kship-col-date">
                      <div>{formatDateGt(shipmentDate(s))}</div>
                      <div className="kship-sub">
                        {s.sentAt ? "Fecha de envío" : "Creado (aún no enviado)"}
                        {s.receivedAt ? ` · recibido ${formatDateGt(s.receivedAt)}` : ""}
                      </div>
                    </div>
                    <div className="kship-col-qty">
                      <div className="kship-qty">
                        {pieces} pieza{pieces === 1 ? "" : "s"}
                      </div>
                      <div className="kship-sub">
                        {shipmentLines(s).length} línea{shipmentLines(s).length === 1 ? "" : "s"}
                        {hasReceipt ? ` · ${received} recibida${received === 1 ? "" : "s"}` : ""}
                      </div>
                      {hasReceipt && (
                        <div className="kship-qty-bar" title={`${pct}% recibido`}>
                          <span className={received < pieces ? "is-short" : ""} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="kship-row-actions">
                      <Button size="sm" color="secondary" outline onClick={() => toggleExpanded(s.id)}>
                        {isOpen ? "Ocultar" : "Ver"}
                      </Button>
                      <Button size="sm" color="primary" outline onClick={() => doPdf([s])} title="Imprimir o guardar como PDF">
                        PDF
                      </Button>
                      <Button size="sm" color="success" outline onClick={() => doExcel([s])} title="Descargar en Excel">
                        Excel
                      </Button>
                    </div>
                  </div>
                  {isOpen && <ShipmentDetail shipment={s} />}
                </div>
              );
            })}
          </div>
        </>
      )}
      {!loading && visible.length > 0 && selected.size > 0 && selectedVisible.length < selected.size && (
        <div className="kship-sub mt-2">
          {selected.size - selectedVisible.length} envío(s) marcado(s) quedaron fuera por los filtros y no se incluyen.
        </div>
      )}
    </div>
  );
}

export default KioskShipmentsTab;
