import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Collapse,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
  UncontrolledDropdown,
} from "reactstrap";
import CreateStandaloneKioskShipmentModal from "components/distribution/CreateStandaloneKioskShipmentModal";
import ReplenishmentProductionModal, {
  groupShortagesForProduction,
} from "components/distribution/ReplenishmentProductionModal";
import { getKioskReplenishmentSuggestion } from "services/kioskReplenishmentService";
import { createStandaloneKioskShipment } from "services/productDistributionService";
import { showError, showSuccess } from "utils/notificationHelper";
import "./KioskReplenishment.css";

const WINDOW_OPTIONS = [30, 60, 90];

const lineKey = (line) =>
  `${line.productId}|${line.colorId ?? ""}|${line.size || ""}|${line.hardwareCondition || ""}`;

const fmtRate = (value) => {
  const n = Number(value) || 0;
  return n === 0 ? "—" : n.toFixed(2);
};

const variantLine = (line) => {
  const parts = [];
  if (line.colorName) parts.push(line.colorName);
  if (line.size) parts.push(line.size);
  if (line.hardwareCondition && line.hardwareCondition !== "NUEVO") {
    parts.push(line.hardwareCondition);
  }
  return parts.join(" · ");
};

/**
 * Reposición de kioscos (RF-INV-05): el sistema calcula mínimo y máximo por línea con la venta del kiosco y sus
 * envíos recientes, propone qué mandar según la categoría A/B/C y el stock de bodega, y el usuario confirma.
 * Los envíos se crean como envíos directos a kiosko confirmados (salen de bodega al usar Enviar en Preparar Envíos).
 */
function KioskReplenishment() {
  const [windowDays, setWindowDays] = useState(60);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [edits, setEdits] = useState({});
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState({});
  const [modalKiosk, setModalKiosk] = useState(null);
  const [productionOpen, setProductionOpen] = useState(false);
  const [productionOrders, setProductionOrders] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyShortage, setOnlyShortage] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getKioskReplenishmentSuggestion({ windowDays });
      setData(result);
      setEdits({});
      setCreated({});
      setProductionOrders([]);
      // Categoría C no recibe envíos automáticos: queda sin marcar; se puede incluir a mano.
      const initial = {};
      (result.kiosks || []).forEach((k) => {
        initial[k.locationId] = k.category !== "C" && (k.totalSuggested > 0 || k.totalShortage > 0);
      });
      setSelected(initial);
    } catch (err) {
      const message = err.message || "No se pudo calcular la reposición";
      setLoadError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    load();
  }, [load]);

  const kiosks = useMemo(() => data?.kiosks || [], [data]);
  const inputsLocked = creating || (loading && !!data);

  const quantityOf = useCallback(
    (kiosk, line) => {
      const edited = edits[kiosk.locationId]?.[lineKey(line)];
      return edited === undefined ? line.suggested : edited;
    },
    [edits]
  );

  const linesToSend = useCallback(
    (kiosk) =>
      (kiosk.lines || [])
        .map((line) => ({ line, quantity: Number(quantityOf(kiosk, line)) || 0 }))
        .filter(({ quantity }) => quantity > 0),
    [quantityOf]
  );

  const totals = useMemo(() => {
    let units = 0;
    let shipments = 0;
    let shortage = 0;
    kiosks.forEach((k) => {
      if (!selected[k.locationId] || created[k.locationId]) return;
      const qty = linesToSend(k).reduce((sum, x) => sum + x.quantity, 0);
      if (qty > 0) {
        units += qty;
        shipments += 1;
      }
      shortage += Number(k.totalShortage) || 0;
    });
    return { units, shipments, shortage };
  }, [kiosks, selected, created, linesToSend]);

  const setQuantity = (kiosk, line, value) => {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    setEdits((prev) => ({
      ...prev,
      [kiosk.locationId]: { ...(prev[kiosk.locationId] || {}), [lineKey(line)]: n },
    }));
  };

  const notesFor = () => `Reposición automática (venta de ${data?.windowDays || windowDays} días)`;

  const toPayloadLines = (kiosk) =>
    linesToSend(kiosk).map(({ line, quantity }) => ({
      productId: line.productId,
      colorId: line.colorId ?? null,
      size: line.size || "",
      hardwareCondition: line.hardwareCondition || null,
      quantity,
    }));

  const pendingKiosks = useMemo(
    () =>
      kiosks.filter(
        (k) => selected[k.locationId] && !created[k.locationId] && linesToSend(k).length > 0
      ),
    [kiosks, selected, created, linesToSend]
  );

  const requestCreate = () => {
    if (pendingKiosks.length === 0) {
      showError("No hay kioscos marcados con unidades para enviar");
      return;
    }
    setConfirmOpen(true);
  };

  const createSelected = async () => {
    const targets = pendingKiosks;
    if (targets.length === 0) {
      showError("No hay kioscos marcados con unidades para enviar");
      setConfirmOpen(false);
      return;
    }
    setConfirmOpen(false);
    setCreating(true);
    const done = {};
    const failed = [];
    for (const kiosk of targets) {
      try {
        const shipment = await createStandaloneKioskShipment({
          locationId: kiosk.locationId,
          notes: notesFor(),
          products: toPayloadLines(kiosk),
          confirmOnly: true,
        });
        done[kiosk.locationId] = shipment.shipmentNumber || shipment.id;
      } catch (err) {
        failed.push(`${kiosk.name}: ${err.message}`);
      }
    }
    setCreated((prev) => ({ ...prev, ...done }));
    setCreating(false);
    if (Object.keys(done).length > 0) {
      showSuccess(
        `${Object.keys(done).length} envío(s) creados y confirmados. Use Enviar en Preparar Envíos cuando salgan de bodega.`
      );
    }
    if (failed.length > 0) {
      showError(`No se pudieron crear: ${failed.join(" · ")}`);
    }
  };

  const selectedKiosks = useMemo(() => kiosks.filter((k) => selected[k.locationId]), [kiosks, selected]);

  const productionUnits = useMemo(() => {
    const { opk, opc } = groupShortagesForProduction(selectedKiosks);
    return [...opk, ...opc].reduce((sum, r) => sum + r.quantity, 0);
  }, [selectedKiosks]);

  const modalLines = useMemo(() => {
    if (!modalKiosk) return [];
    return linesToSend(modalKiosk).map(({ line, quantity }) => ({ ...line, quantity }));
  }, [modalKiosk, linesToSend]);

  const visibleKiosks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kiosks.filter((k) => {
      if (q && !(k.name || "").toLowerCase().includes(q)) return false;
      if (categoryFilter && k.category !== categoryFilter) return false;
      if (onlyShortage && !(k.totalShortage > 0)) return false;
      if (onlySelected && !selected[k.locationId]) return false;
      return true;
    });
  }, [kiosks, search, categoryFilter, onlyShortage, onlySelected, selected]);

  const hiddenMarkedCount = useMemo(
    () =>
      kiosks.filter(
        (k) => selected[k.locationId] && !visibleKiosks.some((v) => v.locationId === k.locationId)
      ).length,
    [kiosks, selected, visibleKiosks]
  );

  const filterActive = Boolean(search.trim() || categoryFilter || onlyShortage || onlySelected);
  const showTable = data && kiosks.length > 0;
  const showEmpty = data && kiosks.length === 0 && !loadError;
  const showFirstSpinner = loading && !data;

  const errorBanner = loadError ? (
    <Alert color="danger" className="d-flex justify-content-between align-items-center flex-wrap mb-3">
      <span>{loadError}</span>
      <Button color="danger" outline size="sm" className="mt-2 mt-sm-0" onClick={load} disabled={loading}>
        Reintentar
      </Button>
    </Alert>
  ) : null;

  return (
    <div className="content kr-page">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex justify-content-between align-items-start flex-wrap">
                <div>
                  <CardTitle tag="h4">Reposición de kioscos</CardTitle>
                  <p className="kr-subtitle">Revisa, ajusta y confirma la propuesta de envío.</p>
                  <Button
                    color="link"
                    className="kr-how-btn mt-1"
                    onClick={() => setShowRules((open) => !open)}
                    aria-expanded={showRules}
                  >
                    ¿Cómo se calcula?
                  </Button>
                </div>
                <div className="d-flex align-items-center mt-2 mt-md-0">
                  <span className="small text-muted mr-2">Venta de los últimos</span>
                  <Input
                    type="select"
                    bsSize="sm"
                    value={windowDays}
                    onChange={(e) => setWindowDays(Number(e.target.value))}
                    style={{ width: 90 }}
                    className="mr-2"
                    aria-label="Ventana de venta"
                  >
                    {WINDOW_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d} días</option>
                    ))}
                  </Input>
                  <Button color="secondary" outline size="sm" onClick={load} disabled={loading}>
                    {loading ? <Spinner size="sm" /> : <><i className="nc-icon nc-refresh-69 mr-1" />Recalcular</>}
                  </Button>
                </div>
              </div>
              <Collapse isOpen={showRules} className="kr-rules-collapse mt-2">
                <Alert color="light" className="small mb-0 kr-rules">
                  <strong>A</strong>: se rellena hasta el máximo aunque tenga stock ·{" "}
                  <strong>B</strong>: se repone si está bajo el mínimo o si es de alta venta / artículo base ·{" "}
                  <strong>C</strong>: solo hasta el mínimo y no se marca por defecto. Con poco stock en bodega se
                  atiende primero A, luego B y C. Solo se reponen productos que el kiosco vendió en el periodo y, por
                  envío, no más de su venta de una semana (A 100%, B 80%, C 60%); lo que no entra queda para el
                  siguiente envío. Lo demás se agrega a mano con «Revisar y agregar». Los kioscos sin categoría en
                  Finanzas se clasifican por su venta.
                </Alert>
              </Collapse>
            </CardHeader>
            <CardBody>
              {showFirstSpinner ? (
                <div className="text-center py-5"><Spinner /></div>
              ) : (
                <>
                  {errorBanner}
                  {showEmpty ? (
                    <p className="text-muted mb-0">No hay kioscos activos para analizar.</p>
                  ) : null}
                  {showTable ? (
                    <>
                      <div className="kr-tiles">
                        <div className="kr-tile">
                          <span className="kr-tile-label">Envíos marcados</span>
                          <span className="kr-tile-value">{totals.shipments}</span>
                        </div>
                        <div className="kr-tile">
                          <span className="kr-tile-label">Unidades a enviar</span>
                          <span className="kr-tile-value">{totals.units}</span>
                        </div>
                        <div className="kr-tile">
                          <span className="kr-tile-label">Faltan en bodega</span>
                          <span className={`kr-tile-value${totals.shortage > 0 ? " is-danger" : ""}`}>
                            {totals.shortage}
                          </span>
                        </div>
                      </div>
                      <p className="kr-tile-hint">
                        Totales de todos los kioscos marcados
                        {data?.since ? ` · Ventas desde ${data.since}` : ""}
                        {hiddenMarkedCount > 0
                          ? ` · incluye ${hiddenMarkedCount} oculto(s) por el filtro`
                          : ""}
                        .
                      </p>

                      <div className="kr-toolbar">
                        <Input
                          className="kr-search"
                          placeholder="Buscar kiosco"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          aria-label="Buscar kiosco"
                        />
                        <Input
                          type="select"
                          className="kr-cat-filter"
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          aria-label="Filtrar por categoría"
                        >
                          <option value="">Todas</option>
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                        </Input>
                        <Button
                          color="secondary"
                          outline={!onlyShortage}
                          size="sm"
                          aria-pressed={onlyShortage}
                          onClick={() => setOnlyShortage((v) => !v)}
                        >
                          Solo con faltantes
                        </Button>
                        <Button
                          color="secondary"
                          outline={!onlySelected}
                          size="sm"
                          aria-pressed={onlySelected}
                          onClick={() => setOnlySelected((v) => !v)}
                        >
                          Solo marcados
                        </Button>
                        {productionOrders.length > 0 ? (
                          <span className="kr-tag kr-tag-prod">Producción: {productionOrders.join(", ")}</span>
                        ) : null}
                      </div>

                      {visibleKiosks.length === 0 ? (
                        <p className="text-muted mb-0">
                          {filterActive
                            ? "Ningún kiosco coincide con el filtro."
                            : "No hay kioscos activos para analizar."}
                        </p>
                      ) : (
                        <div className={`kr-table-wrap${loading && data ? " is-busy" : ""}`}>
                          {loading && data ? (
                            <div className="kr-busy-overlay" role="status" aria-label="Recalculando">
                              <Spinner />
                            </div>
                          ) : null}
                          <Table className="mb-0 kr-kiosk-table">
                            <thead>
                              <tr>
                                <th style={{ width: 36 }} />
                                <th>Kiosco</th>
                                <th>Categoría</th>
                                <th className="text-right">A enviar</th>
                                <th className="text-right">Falta</th>
                                <th style={{ width: 52 }} />
                              </tr>
                            </thead>
                            <tbody>
                              {visibleKiosks.map((kiosk) => {
                                const sendLines = linesToSend(kiosk);
                                const units = sendLines.reduce((sum, x) => sum + x.quantity, 0);
                                const isOpen = expanded === kiosk.locationId;
                                const shipmentNumber = created[kiosk.locationId];
                                return (
                                  <React.Fragment key={kiosk.locationId}>
                                    <tr className={isOpen ? "kr-row-open" : undefined}>
                                      <td>
                                        <Input
                                          type="checkbox"
                                          className="position-static m-0"
                                          aria-label={`Seleccionar ${kiosk.name}`}
                                          checked={!!selected[kiosk.locationId]}
                                          disabled={
                                            inputsLocked
                                            || !!shipmentNumber
                                            || (units === 0 && !(kiosk.totalShortage > 0))
                                          }
                                          onChange={(e) =>
                                            setSelected((prev) => ({
                                              ...prev,
                                              [kiosk.locationId]: e.target.checked,
                                            }))
                                          }
                                        />
                                      </td>
                                      <td>
                                        <strong>{kiosk.name}</strong>
                                        {kiosk.code ? (
                                          <span className="text-muted small ml-1">{kiosk.code}</span>
                                        ) : null}
                                        {shipmentNumber ? (
                                          <Badge color="success" className="ml-2">
                                            Envío {shipmentNumber}
                                          </Badge>
                                        ) : null}
                                      </td>
                                      <td>
                                        <span className="kr-cat-chip">{kiosk.category}</span>
                                        {kiosk.categorySource === "CALCULADA" ? (
                                          <span
                                            className="kr-calc-mark"
                                            title="Sin categoría en Finanzas; calculada por venta"
                                          >
                                            *
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="text-right">
                                        <span className="kr-qty-send">{units}</span>
                                      </td>
                                      <td
                                        className={`text-right${kiosk.totalShortage > 0 ? " text-danger" : ""}`}
                                      >
                                        {kiosk.totalShortage || 0}
                                      </td>
                                      <td className="text-right">
                                        <UncontrolledDropdown>
                                          <DropdownToggle
                                            color="link"
                                            className="kr-row-menu-toggle"
                                            aria-label={`Acciones de ${kiosk.name}`}
                                          >
                                            ⋯
                                          </DropdownToggle>
                                          <DropdownMenu
                                            right
                                            container="body"
                                            modifiers={{
                                              preventOverflow: { boundariesElement: "viewport" },
                                              flip: { boundariesElement: "viewport" },
                                            }}
                                          >
                                            {!shipmentNumber ? (
                                              <DropdownItem
                                                disabled={units === 0}
                                                onClick={() => setModalKiosk(kiosk)}
                                              >
                                                Revisar y agregar
                                              </DropdownItem>
                                            ) : null}
                                            <DropdownItem
                                              onClick={() => setExpanded(isOpen ? null : kiosk.locationId)}
                                            >
                                              {isOpen ? "Ocultar" : "Detalle"}
                                            </DropdownItem>
                                          </DropdownMenu>
                                        </UncontrolledDropdown>
                                      </td>
                                    </tr>
                                    {isOpen ? (
                                      <tr>
                                        <td colSpan={6} className="p-0">
                                          <div className="kr-detail">
                                            <div className="kr-detail-meta">
                                              <span>Vendido: {Number(kiosk.unitsSold || 0)}</span>
                                              <span title="Venta de una semana × factor de la categoría">
                                                Tope por envío: {kiosk.weeklyBudget || 0}
                                              </span>
                                              <span title="Pide la regla pero no entra en el tope">
                                                Siguiente envío: {kiosk.totalDeferred || 0}
                                              </span>
                                            </div>
                                            <KioskLinesTable
                                              kiosk={kiosk}
                                              quantityOf={quantityOf}
                                              onChange={setQuantity}
                                              readOnly={!!shipmentNumber || inputsLocked}
                                            />
                                          </div>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </Table>
                        </div>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {showTable ? (
        <div className="kr-sticky-bar">
          <div className="kr-sticky-summary">
            {totals.shipments} envío(s) · {totals.units} unidades
            {totals.shortage > 0 ? ` · faltan ${totals.shortage} en bodega` : ""}
          </div>
          <div className="kr-sticky-actions">
            <Button
              color="secondary"
              outline
              onClick={() => setProductionOpen(true)}
              disabled={productionUnits === 0 || productionOrders.length > 0 || creating}
              title="Mandar a producción lo que no alcanza en bodega para los kioscos marcados"
            >
              <i className="nc-icon nc-settings mr-1" />Producir faltantes ({productionUnits})
            </Button>
            <Button
              color="primary"
              onClick={requestCreate}
              disabled={creating || totals.shipments === 0}
            >
              {creating ? <Spinner size="sm" /> : <><i className="nc-icon nc-check-2 mr-1" />Confirmar y crear envíos</>}
            </Button>
          </div>
        </div>
      ) : null}

      <Modal isOpen={confirmOpen} toggle={() => !creating && setConfirmOpen(false)}>
        <ModalHeader toggle={() => !creating && setConfirmOpen(false)}>Confirmar envíos</ModalHeader>
        <ModalBody>
          <p className="mb-0">
            Se crearán <strong>{pendingKiosks.length}</strong> envío(s) con{" "}
            <strong>{totals.units}</strong> unidades
            {totals.shortage > 0 ? (
              <>
                {" "}
                (<span className="text-danger">{totals.shortage} faltan en bodega</span>)
              </>
            ) : null}
            .
          </p>
          <ul className="kr-confirm-list">
            {pendingKiosks.map((kiosk) => {
              const units = linesToSend(kiosk).reduce((sum, x) => sum + x.quantity, 0);
              return (
                <li key={kiosk.locationId}>
                  <span>{kiosk.name}</span>
                  <span>
                    {units} u.
                    {kiosk.totalShortage > 0 ? (
                      <span className="text-danger ml-2">faltan {kiosk.totalShortage}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setConfirmOpen(false)} disabled={creating}>
            Cancelar
          </Button>
          <Button color="primary" onClick={createSelected} disabled={creating}>
            {creating ? <Spinner size="sm" /> : "Confirmar"}
          </Button>
        </ModalFooter>
      </Modal>

      <ReplenishmentProductionModal
        isOpen={productionOpen}
        toggle={() => setProductionOpen(false)}
        kiosks={selectedKiosks}
        windowDays={data?.windowDays || windowDays}
        onCreated={(codes) => setProductionOrders(codes)}
      />

      <CreateStandaloneKioskShipmentModal
        isOpen={!!modalKiosk}
        toggle={() => setModalKiosk(null)}
        initialLocationId={modalKiosk?.locationId}
        initialLines={modalLines}
        initialNotes={modalKiosk ? notesFor() : undefined}
        onCreated={(shipment) => {
          if (!modalKiosk) return;
          setCreated((prev) => ({
            ...prev,
            [modalKiosk.locationId]: shipment?.shipmentNumber || shipment?.id || true,
          }));
        }}
      />
    </div>
  );
}

function KioskLinesTable({ kiosk, quantityOf, onChange, readOnly }) {
  if (!kiosk.lines || kiosk.lines.length === 0) {
    return <p className="kr-empty-lines">Este kiosco no necesita reposición con su venta actual.</p>;
  }
  return (
    <Table className="mb-0 kr-lines">
      <thead>
        <tr>
          <th>Producto</th>
          <th className="text-right" title="Existencia en el kiosco">Stock</th>
          <th className="text-right" title="Envíos aún sin recibir">En camino</th>
          <th
            className="text-right kr-col-range"
            title="Mínimo y máximo de la regla. El tooltip de cada fila incluye la venta por día."
          >
            Mín–máx
          </th>
          <th className="text-right" title="Lo que pide la regla de la categoría">Pide</th>
          <th className="text-right" style={{ width: 110 }}>Enviar</th>
          <th className="kr-col-motivo">Motivo</th>
        </tr>
      </thead>
      <tbody>
        {kiosk.lines.map((line) => {
          const qty = quantityOf(kiosk, line);
          const variant = variantLine(line);
          const rangeTitle = `mín ${line.min} – máx ${line.max} · x día ${fmtRate(line.dailyRate)}`;
          return (
            <tr key={lineKey(line)} className={line.deferred > 0 && !line.suggested ? "text-muted" : undefined}>
              <td>
                <div className="kr-product-name">
                  <strong>{line.productCode}</strong> {line.productName}
                </div>
                {variant ? <div className="kr-product-variant">{variant}</div> : null}
              </td>
              <td className="text-right">{line.stock}</td>
              <td className="text-right">{line.inTransit || "—"}</td>
              <td className="text-right kr-col-range" title={rangeTitle}>
                {line.min}–{line.max}
              </td>
              <td className="text-right" title={rangeTitle}>{line.need}</td>
              <td>
                <div className="kr-enviar-cell">
                  {line.shortage > 0 ? (
                    <i
                      className="nc-icon nc-alert-circle-i kr-line-icon is-danger"
                      title={`faltan ${line.shortage}`}
                      aria-label={`faltan ${line.shortage}`}
                    />
                  ) : null}
                  {line.deferred > 0 ? (
                    <i
                      className="nc-icon nc-watch-time kr-line-icon is-muted"
                      title={`siguiente envío ${line.deferred}`}
                      aria-label={`siguiente envío ${line.deferred}`}
                    />
                  ) : null}
                  <Input
                    type="number"
                    min={0}
                    value={qty}
                    disabled={readOnly}
                    onChange={(e) => onChange(kiosk, line, e.target.value)}
                    className="kr-qty-input"
                    aria-label={`Enviar ${line.productCode}`}
                  />
                </div>
              </td>
              <td className="kr-col-motivo">
                {line.reason}
                {line.topSeller ? <span className="kr-tag">Alta venta</span> : null}
                {line.base ? <span className="kr-tag">Base</span> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default KioskReplenishment;
