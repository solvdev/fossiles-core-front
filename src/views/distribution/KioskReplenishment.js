import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import { Link, useNavigate } from "react-router-dom";
import CreateStandaloneKioskShipmentModal from "components/distribution/CreateStandaloneKioskShipmentModal";
import ReplenishmentProductionModal, {
  groupShortagesForProduction,
} from "components/distribution/ReplenishmentProductionModal";
import {
  createReplenishmentDistribution,
  getKioskReplenishmentSuggestion,
} from "services/kioskReplenishmentService";
import { showError, showSuccess } from "utils/notificationHelper";
import "./distributionContrast.css";
import "./KioskReplenishment.css";

const WINDOW_OPTIONS = [30, 60, 90];

const lineKey = (line) =>
  `${line.productId}|${line.colorId ?? ""}|${line.size || ""}|${line.hardwareCondition || ""}`;

const todayIso = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

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
 * envíos recientes, propone qué mandar según la categoría A/B/C y el stock de bodega, y el usuario la ajusta.
 * Con eso se crea UNA distribución de reposición con un envío confirmado por kiosco (sale de bodega al usar Enviar
 * en Preparar envíos). Lo que falta en bodega queda como envío pendiente de producción y como OPK sugerida, que se
 * guarda solo desde Órdenes de producción.
 */
function KioskReplenishment() {
  const navigate = useNavigate();
  const [windowDays, setWindowDays] = useState(60);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [edits, setEdits] = useState({});
  const [creating, setCreating] = useState(false);
  const [createdDistribution, setCreatedDistribution] = useState(null);
  const [extras, setExtras] = useState({});
  const [distDate, setDistDate] = useState(todayIso);
  const [distDescription, setDistDescription] = useState("");
  const [modalKiosk, setModalKiosk] = useState(null);
  const [productionOpen, setProductionOpen] = useState(false);
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
      setExtras({});
      setCreatedDistribution(null);
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
  const inputsLocked = creating || (loading && !!data) || !!createdDistribution;

  /** Números de envío creados por kiosco en la distribución de reposición. */
  const createdByKiosk = useMemo(() => {
    const out = {};
    (createdDistribution?.shipments || []).forEach((s) => {
      if (s.locationId == null) return;
      out[s.locationId] = [...(out[s.locationId] || []), s.shipmentNumber || s.id];
    });
    return out;
  }, [createdDistribution]);

  const quantityOf = useCallback(
    (kiosk, line) => {
      const edited = edits[kiosk.locationId]?.[lineKey(line)];
      return edited === undefined ? line.suggested : edited;
    },
    [edits]
  );

  const linesToSend = useCallback(
    (kiosk) => [
      ...(kiosk.lines || []).map((line) => ({ line, quantity: Number(quantityOf(kiosk, line)) || 0 })),
      ...(extras[kiosk.locationId] || []).map((x) => ({ line: x, quantity: Number(x.quantity) || 0, extra: true })),
    ].filter(({ quantity }) => quantity > 0),
    [quantityOf, extras]
  );

  /** Líneas que el usuario cambió respecto a la sugerencia, más las que agregó a mano. */
  const adjustmentsOf = useCallback(
    (kiosk) =>
      (kiosk.lines || []).filter((line) => (Number(quantityOf(kiosk, line)) || 0) !== (Number(line.suggested) || 0))
        .length + (extras[kiosk.locationId] || []).length,
    [quantityOf, extras]
  );

  const totals = useMemo(() => {
    let units = 0;
    let shipments = 0;
    let shortage = 0;
    kiosks.forEach((k) => {
      if (!selected[k.locationId] || createdDistribution) return;
      const qty = linesToSend(k).reduce((sum, x) => sum + x.quantity, 0);
      if (qty > 0) {
        units += qty;
        shipments += 1;
      }
      shortage += Number(k.totalShortage) || 0;
    });
    return { units, shipments, shortage };
  }, [kiosks, selected, createdDistribution, linesToSend]);

  const setQuantity = (kiosk, line, value) => {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    setEdits((prev) => ({
      ...prev,
      [kiosk.locationId]: { ...(prev[kiosk.locationId] || {}), [lineKey(line)]: n },
    }));
  };

  const notesFor = () => `Reposición automática (venta de ${data?.windowDays || windowDays} días)`;

  /** Líneas del kiosco para la distribución: lo que se manda, lo que sugirió el cálculo y el faltante. */
  const toPayloadLines = (kiosk) => [
    ...(kiosk.lines || [])
      .map((line) => ({
        productId: line.productId,
        colorId: line.colorId ?? null,
        size: line.size || "",
        hardwareCondition: line.hardwareCondition || null,
        quantity: Number(quantityOf(kiosk, line)) || 0,
        suggestedQuantity: Number(line.suggested) || 0,
        shortage: Number(line.shortage) || 0,
      }))
      .filter((l) => l.quantity > 0 || l.shortage > 0),
    ...(extras[kiosk.locationId] || [])
      .map((x) => ({
        productId: x.productId,
        colorId: x.colorId ?? null,
        size: x.size || "",
        hardwareCondition: x.hardwareCondition || null,
        quantity: Number(x.quantity) || 0,
        suggestedQuantity: null,
        shortage: 0,
      }))
      .filter((l) => l.quantity > 0),
  ];

  const pendingKiosks = useMemo(
    () =>
      kiosks.filter(
        (k) =>
          selected[k.locationId]
          && !createdDistribution
          && (linesToSend(k).length > 0 || (Number(k.totalShortage) || 0) > 0)
      ),
    [kiosks, selected, createdDistribution, linesToSend]
  );

  const openReplenishmentKiosks = useMemo(
    () => kiosks.filter((k) => (k.openReplenishmentDistributions || []).length > 0),
    [kiosks]
  );

  const requestCreate = () => {
    if (pendingKiosks.length === 0) {
      showError("No hay kioscos marcados con unidades para enviar");
      return;
    }
    if (!distDescription) setDistDescription(notesFor());
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
    try {
      const distribution = await createReplenishmentDistribution({
        windowDays: data?.windowDays || windowDays,
        distributionDate: distDate || undefined,
        description: distDescription.trim() || notesFor(),
        kiosks: targets.map((kiosk) => ({
          locationId: kiosk.locationId,
          notes: notesFor(),
          lines: toPayloadLines(kiosk),
        })),
      });
      setCreatedDistribution(distribution);
      showSuccess(
        `Distribución ${distribution.distributionNumber} creada con ${distribution.shipmentCount ?? targets.length} envío(s). Use Enviar en Preparar envíos cuando salgan de bodega.`
      );
    } catch (err) {
      showError(`No se creó la distribución: ${err.message || "error desconocido"}`);
    } finally {
      setCreating(false);
    }
  };

  const applyModalLines = (kiosk, lines) => {
    const suggestionKeys = new Set((kiosk.lines || []).map(lineKey));
    const byKey = new Map((lines || []).map((l) => [lineKey(l), l]));
    setEdits((prev) => {
      const next = { ...(prev[kiosk.locationId] || {}) };
      (kiosk.lines || []).forEach((l) => {
        const match = byKey.get(lineKey(l));
        next[lineKey(l)] = match ? Math.max(0, Math.floor(Number(match.quantity) || 0)) : 0;
      });
      return { ...prev, [kiosk.locationId]: next };
    });
    setExtras((prev) => ({
      ...prev,
      [kiosk.locationId]: (lines || []).filter((l) => !suggestionKeys.has(lineKey(l))),
    }));
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
    <Alert color="danger" className="kr-alert-danger d-flex justify-content-between align-items-center flex-wrap mb-3">
      <span>{loadError}</span>
      <Button color="danger" outline size="sm" className="mt-2 mt-sm-0" onClick={load} disabled={loading}>
        Reintentar
      </Button>
    </Alert>
  ) : null;

  return (
    <div className="content kr-page dist-contrast">
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
                  {showTable && createdDistribution ? (
                    <Alert color="success" className="kr-alert-success d-flex justify-content-between align-items-center flex-wrap">
                      <span>
                        Se creó la distribución de reposición{" "}
                        <strong>{createdDistribution.distributionNumber}</strong> con{" "}
                        {createdDistribution.shipmentCount ?? (createdDistribution.shipments || []).length} envío(s).
                        {productionUnits > 0
                          ? " Lo que falta en bodega quedó como envío pendiente de producción."
                          : ""}
                      </span>
                      <span className="d-flex flex-wrap mt-2 mt-sm-0">
                        <Link className="btn btn-sm kr-btn-outline-ok mr-2" to={`/admin/product-distributions/${createdDistribution.id}`}>
                          Ver distribución
                        </Link>
                        <Link className="btn btn-sm kr-btn-outline-ok" to="/admin/prepare-shipments">
                          Preparar envíos
                        </Link>
                      </span>
                    </Alert>
                  ) : null}
                  {showTable && !createdDistribution && openReplenishmentKiosks.length > 0 ? (
                    <Alert color="warning" className="kr-alert-warn small">
                      {openReplenishmentKiosks.length} kiosco(s) ya tienen una reposición sin despachar (
                      {[...new Set(openReplenishmentKiosks.flatMap((k) => k.openReplenishmentDistributions))].join(", ")}
                      ). Lo que va en camino ya se descontó de la sugerencia.
                    </Alert>
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
                                const createdNumbers = createdByKiosk[kiosk.locationId] || [];
                                const shipmentNumber = createdNumbers.length > 0 ? createdNumbers.join(", ") : null;
                                const openDists = kiosk.openReplenishmentDistributions || [];
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
                                          <span className="kr-status kr-status-ok ml-2">
                                            Envío {shipmentNumber}
                                          </span>
                                        ) : null}
                                        {!shipmentNumber && openDists.length > 0 ? (
                                          <span
                                            className="kr-status kr-status-warn ml-2"
                                            title={`Reposición sin despachar: ${openDists.join(", ")}`}
                                          >
                                            Reposición pendiente
                                          </span>
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
                                            {!createdDistribution ? (
                                              <DropdownItem
                                                disabled={inputsLocked}
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
                                              {(extras[kiosk.locationId] || []).length > 0 ? (
                                                <span>
                                                  Agregados a mano: {(extras[kiosk.locationId] || []).length}
                                                </span>
                                              ) : null}
                                            </div>
                                            <KioskLinesTable
                                              kiosk={kiosk}
                                              quantityOf={quantityOf}
                                              onChange={setQuantity}
                                              readOnly={inputsLocked}
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
            {pendingKiosks.length} kiosco(s) · {totals.units} unidades
            {totals.shortage > 0 ? ` · faltan ${totals.shortage} en bodega` : ""}
          </div>
          <div className="kr-sticky-actions">
            <Button
              color="secondary"
              outline
              onClick={() => setProductionOpen(true)}
              disabled={productionUnits === 0 || creating}
              title="Lo que no alcanza en bodega: se sugiere como OPK y se guarda en Órdenes de producción"
            >
              <i className="nc-icon nc-settings mr-1" />OPK sugerida ({productionUnits})
            </Button>
            <Button
              color="primary"
              onClick={requestCreate}
              disabled={creating || !!createdDistribution || pendingKiosks.length === 0}
            >
              {creating ? <Spinner size="sm" /> : <><i className="nc-icon nc-check-2 mr-1" />Crear distribución…</>}
            </Button>
          </div>
        </div>
      ) : null}

      <Modal isOpen={confirmOpen} toggle={() => !creating && setConfirmOpen(false)} size="lg" className="kr-modal dist-contrast">
        <ModalHeader toggle={() => !creating && setConfirmOpen(false)}>
          Crear distribución de reposición
        </ModalHeader>
        <ModalBody>
          <Row>
            <Col sm="5">
              <label htmlFor="kr-dist-date" className="kr-field-label">Fecha de distribución</label>
              <Input
                id="kr-dist-date"
                type="date"
                value={distDate}
                onChange={(e) => setDistDate(e.target.value)}
                disabled={creating}
              />
            </Col>
            <Col sm="7" className="mt-2 mt-sm-0">
              <label htmlFor="kr-dist-desc" className="kr-field-label">Descripción</label>
              <Input
                id="kr-dist-desc"
                value={distDescription}
                onChange={(e) => setDistDescription(e.target.value)}
                disabled={creating}
              />
            </Col>
          </Row>
          <Table size="sm" className="mt-3 mb-2 kr-confirm-table">
            <thead>
              <tr>
                <th>Kiosco</th>
                <th className="text-right">Líneas</th>
                <th className="text-right">Unidades</th>
                <th className="text-right">Falta</th>
                <th className="text-right">Ajustes</th>
              </tr>
            </thead>
            <tbody>
              {pendingKiosks.map((kiosk) => {
                const send = linesToSend(kiosk);
                const units = send.reduce((sum, x) => sum + x.quantity, 0);
                const adjustments = adjustmentsOf(kiosk);
                return (
                  <tr key={kiosk.locationId}>
                    <td>{kiosk.name}</td>
                    <td className="text-right">{send.length}</td>
                    <td className="text-right">{units}</td>
                    <td className={`text-right${kiosk.totalShortage > 0 ? " text-danger" : ""}`}>
                      {kiosk.totalShortage || 0}
                    </td>
                    <td className="text-right">{adjustments || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th>{pendingKiosks.length} kiosco(s)</th>
                <th />
                <th className="text-right">{totals.units}</th>
                <th className="text-right">{totals.shortage}</th>
                <th />
              </tr>
            </tfoot>
          </Table>
          <p className="small mb-0 kr-confirm-note">
            Se crea <strong>una distribución</strong> con un envío confirmado por kiosco, todo o nada. Cada envío toma
            el siguiente número de su kiosco. Lo que falta en bodega queda como envío pendiente de producción en la
            misma distribución. El inventario sale de bodega al usar <strong>Enviar</strong> en Preparar envíos.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setConfirmOpen(false)} disabled={creating}>
            Volver a ajustar
          </Button>
          <Button color="primary" onClick={createSelected} disabled={creating}>
            {creating ? <Spinner size="sm" /> : "Crear distribución"}
          </Button>
        </ModalFooter>
      </Modal>

      <ReplenishmentProductionModal
        isOpen={productionOpen}
        toggle={() => setProductionOpen(false)}
        kiosks={selectedKiosks}
        windowDays={data?.windowDays || windowDays}
        distribution={createdDistribution}
        onOpenOrder={(prefill) => navigate("/admin/production-orders", { state: { prefillOrder: prefill } })}
      />

      <CreateStandaloneKioskShipmentModal
        isOpen={!!modalKiosk}
        toggle={() => setModalKiosk(null)}
        initialLocationId={modalKiosk?.locationId}
        initialLines={modalLines}
        initialNotes={modalKiosk ? notesFor() : undefined}
        onSubmitLines={(lines) => {
          if (modalKiosk) applyModalLines(modalKiosk, lines);
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
