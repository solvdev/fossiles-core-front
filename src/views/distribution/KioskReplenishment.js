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
  Input,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import CreateStandaloneKioskShipmentModal from "components/distribution/CreateStandaloneKioskShipmentModal";
import { getKioskReplenishmentSuggestion } from "services/kioskReplenishmentService";
import { createStandaloneKioskShipment } from "services/productDistributionService";
import { showError, showSuccess } from "utils/notificationHelper";

const WINDOW_OPTIONS = [30, 60, 90];

const CATEGORY_COLOR = { A: "success", B: "info", C: "secondary" };

const lineKey = (line) =>
  `${line.productId}|${line.colorId ?? ""}|${line.size || ""}|${line.hardwareCondition || ""}`;

const fmtRate = (value) => {
  const n = Number(value) || 0;
  return n === 0 ? "—" : n.toFixed(2);
};

/**
 * Reposición de kioscos (RF-INV-05): el sistema calcula mínimo y máximo por línea con la venta del kiosco y sus
 * envíos recientes, propone qué mandar según la categoría A/B/C y el stock de bodega, y el usuario confirma.
 * Los envíos se crean como envíos directos a kiosko confirmados (salen de bodega al usar Enviar en Preparar Envíos).
 */
function KioskReplenishment() {
  const [windowDays, setWindowDays] = useState(60);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [edits, setEdits] = useState({});
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState({});
  const [modalKiosk, setModalKiosk] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getKioskReplenishmentSuggestion({ windowDays });
      setData(result);
      setEdits({});
      setCreated({});
      // Categoría C no recibe envíos automáticos: queda sin marcar; se puede incluir a mano.
      const initial = {};
      (result.kiosks || []).forEach((k) => {
        initial[k.locationId] = k.category !== "C" && k.totalSuggested > 0;
      });
      setSelected(initial);
    } catch (err) {
      showError(err.message || "No se pudo calcular la reposición");
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    load();
  }, [load]);

  const kiosks = useMemo(() => data?.kiosks || [], [data]);

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
    kiosks.forEach((k) => {
      if (!selected[k.locationId] || created[k.locationId]) return;
      const qty = linesToSend(k).reduce((sum, x) => sum + x.quantity, 0);
      if (qty > 0) {
        units += qty;
        shipments += 1;
      }
    });
    return { units, shipments };
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

  const createSelected = async () => {
    const targets = kiosks.filter(
      (k) => selected[k.locationId] && !created[k.locationId] && linesToSend(k).length > 0
    );
    if (targets.length === 0) {
      showError("No hay kioscos marcados con unidades para enviar");
      return;
    }
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

  const modalLines = useMemo(() => {
    if (!modalKiosk) return [];
    return linesToSend(modalKiosk).map(({ line, quantity }) => ({ ...line, quantity }));
  }, [modalKiosk, linesToSend]);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex justify-content-between align-items-center flex-wrap">
                <div>
                  <CardTitle tag="h4" className="mb-1">Reposición de kioscos</CardTitle>
                  <p className="text-muted mb-0">
                    El sistema calcula mínimo y máximo de cada producto con la venta del kiosco y lo que ya va en
                    camino, y propone qué enviar según su categoría. Revisa, ajusta y confirma.
                  </p>
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
                  >
                    {WINDOW_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d} días</option>
                    ))}
                  </Input>
                  <Button color="info" size="sm" onClick={load} disabled={loading}>
                    {loading ? <Spinner size="sm" /> : <><i className="nc-icon nc-refresh-69 mr-1" />Recalcular</>}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <Alert color="light" className="small mb-3">
                <strong>A</strong>: se rellena hasta el máximo aunque tenga stock ·{" "}
                <strong>B</strong>: se repone si está bajo el mínimo o si es de alta venta / artículo base ·{" "}
                <strong>C</strong>: solo hasta el mínimo y no se marca por defecto. Con poco stock en bodega se
                atiende primero A, luego B y C. Solo se reponen productos que el kiosco vendió en el periodo y, por
                envío, no más de su venta de una semana (A 100%, B 80%, C 60%); lo que no entra queda para el
                siguiente envío. Lo demás se agrega a mano con «Revisar y agregar». Los kioscos sin categoría en
                Finanzas se clasifican por su venta.
              </Alert>

              {loading && !data ? (
                <div className="text-center py-5"><Spinner /></div>
              ) : kiosks.length === 0 ? (
                <p className="text-muted mb-0">No hay kioscos activos para analizar.</p>
              ) : (
                <>
                  <div className="d-flex justify-content-between align-items-center flex-wrap mb-2">
                    <div className="small text-muted">
                      Ventas desde {data?.since} · {totals.shipments} envío(s) marcados, {totals.units} unidades
                      {data?.totalShortage > 0 ? (
                        <span className="text-danger ml-2">
                          · {data.totalShortage} unidades no alcanzan en bodega
                        </span>
                      ) : null}
                    </div>
                    <Button
                      color="success"
                      size="sm"
                      onClick={createSelected}
                      disabled={creating || totals.shipments === 0}
                    >
                      {creating ? <Spinner size="sm" /> : <><i className="nc-icon nc-check-2 mr-1" />Confirmar y crear envíos</>}
                    </Button>
                  </div>

                  <Table responsive size="sm" className="mb-0">
                    <thead className="text-primary">
                      <tr>
                        <th style={{ width: 36 }} />
                        <th>Kiosco</th>
                        <th>Categoría</th>
                        <th className="text-right">Vendido</th>
                        <th className="text-right" title="Venta de una semana × factor de la categoría">Tope por envío</th>
                        <th className="text-right">A enviar</th>
                        <th className="text-right">Falta en bodega</th>
                        <th className="text-right" title="Pide la regla pero no entra en el tope">Siguiente envío</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {kiosks.map((kiosk) => {
                        const sendLines = linesToSend(kiosk);
                        const units = sendLines.reduce((sum, x) => sum + x.quantity, 0);
                        const isOpen = expanded === kiosk.locationId;
                        const shipmentNumber = created[kiosk.locationId];
                        return (
                          <React.Fragment key={kiosk.locationId}>
                            <tr style={{ backgroundColor: isOpen ? "#f8fbff" : "transparent" }}>
                              <td>
                                <Input
                                  type="checkbox"
                                  className="position-static m-0"
                                  checked={!!selected[kiosk.locationId]}
                                  disabled={!!shipmentNumber || units === 0}
                                  onChange={(e) =>
                                    setSelected((prev) => ({ ...prev, [kiosk.locationId]: e.target.checked }))
                                  }
                                />
                              </td>
                              <td>
                                <strong>{kiosk.name}</strong>
                                {kiosk.code ? <span className="text-muted small ml-1">{kiosk.code}</span> : null}
                              </td>
                              <td>
                                <Badge color={CATEGORY_COLOR[kiosk.category] || "secondary"}>{kiosk.category}</Badge>
                                {kiosk.categorySource === "CALCULADA" ? (
                                  <span className="small text-muted ml-1" title="Sin categoría en Finanzas; calculada por venta">
                                    calculada
                                  </span>
                                ) : null}
                              </td>
                              <td className="text-right">{Number(kiosk.unitsSold || 0)}</td>
                              <td className="text-right">{kiosk.weeklyBudget || 0}</td>
                              <td className="text-right"><strong>{units}</strong></td>
                              <td className={`text-right ${kiosk.totalShortage > 0 ? "text-danger" : "text-muted"}`}>
                                {kiosk.totalShortage || 0}
                              </td>
                              <td className="text-right text-muted">{kiosk.totalDeferred || 0}</td>
                              <td className="text-right text-nowrap">
                                {shipmentNumber ? (
                                  <Badge color="success">Envío {shipmentNumber}</Badge>
                                ) : (
                                  <Button
                                    color="primary"
                                    size="sm"
                                    outline
                                    className="mr-1"
                                    disabled={units === 0}
                                    onClick={() => setModalKiosk(kiosk)}
                                    title="Abrir el envío precargado para agregar o quitar productos"
                                  >
                                    Revisar y agregar
                                  </Button>
                                )}
                                <Button
                                  color="link"
                                  size="sm"
                                  className="p-0 ml-1"
                                  onClick={() => setExpanded(isOpen ? null : kiosk.locationId)}
                                >
                                  {isOpen ? "Ocultar" : "Detalle"}
                                </Button>
                              </td>
                            </tr>
                            {isOpen ? (
                              <tr>
                                <td colSpan={9} className="p-0">
                                  <KioskLinesTable
                                    kiosk={kiosk}
                                    quantityOf={quantityOf}
                                    onChange={setQuantity}
                                    readOnly={!!shipmentNumber}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </Table>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

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
    return <p className="text-muted small m-3">Este kiosco no necesita reposición con su venta actual.</p>;
  }
  return (
    <Table size="sm" className="mb-0 small" style={{ backgroundColor: "#fbfcfe" }}>
      <thead>
        <tr>
          <th>Producto</th>
          <th>Color</th>
          <th>Talla</th>
          <th>Herraje</th>
          <th className="text-right" title="Existencia en el kiosco">Stock</th>
          <th className="text-right" title="Envíos aún sin recibir">En camino</th>
          <th className="text-right" title="Venta neta en la ventana">Vendido</th>
          <th className="text-right" title="Venta por día">x día</th>
          <th className="text-right">Mín</th>
          <th className="text-right">Máx</th>
          <th className="text-right" title="Lo que pide la regla de la categoría">Pide</th>
          <th className="text-right" style={{ width: 90 }}>Enviar</th>
          <th>Motivo</th>
        </tr>
      </thead>
      <tbody>
        {kiosk.lines.map((line) => {
          const qty = quantityOf(kiosk, line);
          return (
            <tr key={lineKey(line)} className={line.deferred > 0 && !line.suggested ? "text-muted" : undefined}>
              <td>
                <strong>{line.productCode}</strong> {line.productName}
              </td>
              <td>{line.colorName || "—"}</td>
              <td>{line.size || "—"}</td>
              <td>{line.hardwareCondition && line.hardwareCondition !== "NUEVO" ? line.hardwareCondition : "—"}</td>
              <td className="text-right">{line.stock}</td>
              <td className="text-right">{line.inTransit || "—"}</td>
              <td className="text-right">{Number(line.sold || 0)}</td>
              <td className="text-right">{fmtRate(line.dailyRate)}</td>
              <td className="text-right">{line.min}</td>
              <td className="text-right">{line.max}</td>
              <td className="text-right">{line.need}</td>
              <td className="text-right">
                <Input
                  type="number"
                  bsSize="sm"
                  min={0}
                  value={qty}
                  disabled={readOnly}
                  onChange={(e) => onChange(kiosk, line, e.target.value)}
                  className="text-right"
                />
                {line.shortage > 0 ? (
                  <div className="text-danger" title="No alcanza en Bodega PT + Devoluciones">
                    faltan {line.shortage}
                  </div>
                ) : null}
                {line.deferred > 0 ? (
                  <div title="No entra en el tope de este envío">siguiente envío {line.deferred}</div>
                ) : null}
              </td>
              <td>
                {line.reason}
                {line.topSeller ? <Badge color="warning" className="ml-1">Alta venta</Badge> : null}
                {line.base ? <Badge color="primary" className="ml-1">Base</Badge> : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default KioskReplenishment;
