import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Table,
} from "reactstrap";
import {
  createProductionOrderPartialRelease,
  generatePartialReleaseShipment,
  updatePartialRelease,
} from "services/productionOrderService";
import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import {
  applyDraftLineIncluded,
  applyDraftSizeIncluded,
  buildPartialReleaseLinesPayload,
  countDraftTotalUnits,
  draftLinesForReviewFromRelease,
  initDraftLinesFromAvailability,
  initDraftLinesFromRelease,
  maxDraftLineQuantity,
  sumPartialReleaseLineQuantity,
} from "utils/partialReleaseHelper";
import {
  classifyPrepareOrder,
  getDefaultShipmentDocumentDate,
} from "utils/prepareShipmentsOrderHelper";
import { getLocations } from "services/locationService";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { showError, showSuccess } from "utils/notificationHelper";

/**
 * Modal por envío parcial: selección explícita de líneas (incluir sí/no) y cantidades.
 * mode: edit | review-generate
 */
function PartialReleaseEditorModal({
  isOpen,
  toggle,
  order,
  release = null,
  availabilityRows = [],
  mode = "edit",
  onSaved,
  onGenerated,
}) {
  const orderId = order?.id;
  const orderType = order?.orderType;
  const prepareKind = classifyPrepareOrder(order);
  const requiresKiosk = prepareKind === "OPCK" || prepareKind === "OPK";
  const cincho = isCinchoOrderType(orderType);
  const readOnly = mode === "review-generate";

  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [lineFilter, setLineFilter] = useState("");
  const [locationId, setLocationId] = useState("");
  const [kiosks, setKiosks] = useState([]);

  useEffect(() => {
    if (!isOpen || !requiresKiosk) return;
    setLocationId("");
    getLocations()
      .then((locs) => {
        const rows = (locs || []).filter((loc) => {
          const cat = String(loc.category || loc.locationCategory || "").toUpperCase();
          return cat.includes("KIOSKO") || cat === "KIOSK";
        });
        setKiosks(rows.length ? rows : locs || []);
      })
      .catch(() => setKiosks([]));
  }, [isOpen, requiresKiosk]);

  const kioskOptions = useMemo(
    () =>
      (kiosks || []).map((k) => ({
        value: String(k.id),
        label: `${k.code ? `${k.code} — ` : ""}${k.name || ""}`.trim(),
        searchText: `${k.code || ""} ${k.name || ""} ${k.category || ""}`,
      })),
    [kiosks]
  );

  useEffect(() => {
    if (!isOpen) return;
    setLineFilter("");
    if (readOnly && release) {
      setLabel(release.label || "");
      setNotes(release.notes || "");
      setDraftLines(draftLinesForReviewFromRelease(release, orderType));
      return;
    }
    setLabel(release?.label || "");
    setNotes(release?.notes || "");
    if (release?.id) {
      setDraftLines(initDraftLinesFromRelease(release, orderType, availabilityRows));
    } else {
      setDraftLines(initDraftLinesFromAvailability(availabilityRows, orderType));
    }
    // Solo reiniciar al abrir o cambiar de parcial; no cuando availabilityRows se refresca en background.
  }, [isOpen, release?.id, orderType, readOnly]); // eslint-disable-line

  const titleLabel = release?.label || label || "nuevo";
  const modalTitle = readOnly
    ? `Revisar envío — ${titleLabel}`
    : release
      ? `Envío parcial — ${release.label || `Parcial ${release.sequence || ""}`}`
      : "Nuevo envío parcial";

  const totalUnits = useMemo(
    () => countDraftTotalUnits(draftLines, orderType),
    [draftLines, orderType]
  );

  const filteredLines = useMemo(() => {
    const q = String(lineFilter || "").trim().toLowerCase();
    if (!q) return draftLines;
    return draftLines.filter((row) => {
      const text = `${row.productCode || ""} ${row.productName || ""} ${row.colorName || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [draftLines, lineFilter]);

  const patchLineQty = (itemId, field, value, sizeKey) => {
    setDraftLines((prev) =>
      prev.map((row) => {
        if (row.productionOrderItemId !== itemId) return row;
        if (sizeKey != null) {
          const sizes = { ...row.sizes, [sizeKey]: value };
          const included = Object.values(sizes).some((q) => Number(q) > 0);
          return { ...row, sizes, included };
        }
        const qty = Math.max(0, value);
        return { ...row, [field]: qty, included: qty > 0 };
      })
    );
  };

  const toggleRowIncluded = (row, checked) => {
    setDraftLines((prev) =>
      prev.map((r) =>
        r.productionOrderItemId === row.productionOrderItemId
          ? applyDraftLineIncluded(r, checked, orderType)
          : r
      )
    );
  };

  const toggleSizeIncluded = (row, sizeKey, checked) => {
    setDraftLines((prev) =>
      prev.map((r) =>
        r.productionOrderItemId === row.productionOrderItemId
          ? applyDraftSizeIncluded(r, sizeKey, checked)
          : r
      )
    );
  };

  const persistRelease = async (confirm) => {
    if (!orderId) return;
    const lines = buildPartialReleaseLinesPayload(draftLines, orderType);
    if (!lines.length) {
      showError("Marque al menos un producto e indique cantidad mayor a cero.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: label.trim() || undefined,
        notes: notes.trim() || undefined,
        status: confirm ? "CONFIRMED" : "DRAFT",
        lines,
      };
      if (release?.id) {
        await updatePartialRelease(release.id, payload);
        showSuccess(confirm ? "Envío parcial confirmado" : "Borrador guardado");
      } else {
        await createProductionOrderPartialRelease(orderId, payload);
        showSuccess(confirm ? "Envío parcial creado y confirmado" : "Envío parcial en borrador");
      }
      toggle();
      if (onSaved) await onSaved();
    } catch (err) {
      showError(err.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateShipment = async () => {
    if (!release?.id) return;
    if (requiresKiosk && !locationId) {
      showError("Seleccione el kiosko destino para este envío.");
      return;
    }
    setSaving(true);
    try {
      const created = await generatePartialReleaseShipment(release.id, {
        destinationAddress: order.customerAddress || order.customerName || "Kiosko",
        documentDate: getDefaultShipmentDocumentDate(order),
        locationId: locationId ? Number(locationId) : undefined,
        notes: notes.trim() || undefined,
      });
      showSuccess(
        `Envío ${created.shipmentNumber || created.id} generado (confirmado). Use Listo / Enviar cuando deba salir de bodega.`
      );
      toggle();
      if (onGenerated) await onGenerated(created);
      else if (onSaved) await onSaved();
    } catch (err) {
      showError(err.message || "No se pudo generar el envío");
    } finally {
      setSaving(false);
    }
  };

  const renderCinchoIncludeCell = (row) => {
    const sizeKeys = row.orderedSizes
      ? Object.keys(row.orderedSizes)
      : row.sizes
        ? Object.keys(row.sizes)
        : [];
    if (!sizeKeys.length) {
      return <span className="text-muted">—</span>;
    }
    return (
      <div className="d-flex flex-wrap">
        {sizeKeys.map((size) => {
          const maxQty = maxDraftLineQuantity(row, size) ?? 0;
          const pendingForSize =
            row.pendingSizes?.[size] != null ? Number(row.pendingSizes[size]) : 0;
          const qty = Number(row.sizes?.[size] ?? 0);
          const sizeIncluded = qty > 0;
          if (readOnly) {
            if (!sizeIncluded) return null;
            return (
              <div key={size} className="mr-3 mb-1">
                <small>
                  T{size}: <strong>{qty}</strong>
                </small>
              </div>
            );
          }
          return (
            <div key={size} className="mr-2 mb-2" style={{ minWidth: 100 }}>
              <div className="custom-control custom-checkbox mb-1">
                <input
                  type="checkbox"
                  className="custom-control-input"
                  id={`size-inc-${row.productionOrderItemId}-${size}`}
                  checked={sizeIncluded}
                  disabled={maxQty <= 0}
                  onChange={(e) => toggleSizeIncluded(row, size, e.target.checked)}
                />
                <label
                  className="custom-control-label"
                  htmlFor={`size-inc-${row.productionOrderItemId}-${size}`}
                >
                  <small>
                    T{size}
                    <span className="text-muted"> (pdte {pendingForSize})</span>
                  </small>
                </label>
              </div>
              {sizeIncluded && (
                <Input
                  type="number"
                  min={0}
                  max={maxQty || undefined}
                  bsSize="sm"
                  value={qty}
                  onChange={(e) =>
                    patchLineQty(
                      row.productionOrderItemId,
                      null,
                      Math.max(0, parseInt(e.target.value, 10) || 0),
                      size
                    )
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>{modalTitle}</ModalHeader>
      <ModalBody>
        {readOnly ? (
          <Alert color="info" className="py-2">
            {prepareKind === "OPK" ? (
              <>
                Paso 1: <strong>Generar envío</strong> crea el documento confirmado (sin stock ni salida de bodega).
                Paso 2: use <strong>Enviar</strong> en la fila del parcial o en la tabla inferior.
              </>
            ) : (
              <>Revise los productos que saldrán en este envío. Al confirmar se creará el documento de envío.</>
            )}
            {requiresKiosk && (
              <span className="d-block mt-1">
                Indique el <strong>kiosko destino</strong> antes de generar.
              </span>
            )}
          </Alert>
        ) : (
          <Alert color="light" className="py-2 small mb-3">
            Marque <strong>Incluir</strong> en cada producto de este envío. Al marcar, se sugiere todo lo
            pendiente; puede bajar la cantidad. Deje sin marcar lo que no va en esta entrega.
          </Alert>
        )}

        {readOnly && requiresKiosk && (
          <FormGroup className="mb-3">
            <Label>
              <strong>Kiosko destino</strong>
            </Label>
            <FilterableSelect
              value={locationId}
              onChange={setLocationId}
              options={kioskOptions}
              placeholder="Buscar kiosko…"
              emptyLabel="— Seleccione kiosko —"
            />
          </FormGroup>
        )}

        {!readOnly && (
          <Row>
            <Col md={6}>
              <FormGroup>
                <Label>Etiqueta del envío</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Parcial 1"
                />
              </FormGroup>
            </Col>
            <Col md={6}>
              <FormGroup>
                <Label>Notas</Label>
                <Input
                  type="textarea"
                  rows={1}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormGroup>
            </Col>
          </Row>
        )}

        {!readOnly && (
          <FormGroup className="mb-3">
            <Label>Buscar producto</Label>
            <Input
              type="search"
              bsSize="sm"
              value={lineFilter}
              onChange={(e) => setLineFilter(e.target.value)}
              placeholder="Ej: hebilla, cuero..."
            />
          </FormGroup>
        )}

        <Table size="sm" bordered responsive>
          <thead>
            <tr>
              {!readOnly && <th style={{ width: 70 }}>Incluir</th>}
              <th>Producto</th>
              <th>Color</th>
              {!readOnly && (
                <>
                  <th>Pedido</th>
                  <th>Pendiente</th>
                </>
              )}
              <th>{cincho ? "Tallas / cant." : "Cantidad"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 4 : 6} className="text-muted text-center">
                  Sin líneas para mostrar.
                </td>
              </tr>
            ) : (
              filteredLines.map((row) => {
                const pending = Number(row.pendingTotal) || 0;
                const maxQty = maxDraftLineQuantity(row);
                return (
                  <tr
                    key={row.productionOrderItemId}
                    className={row.included ? "" : "text-muted"}
                  >
                    {!readOnly && (
                      <td className="align-middle">
                        {cincho && row.orderedSizes ? (
                          <span className="small text-muted">por talla →</span>
                        ) : (
                          <div className="custom-control custom-checkbox">
                            <input
                              type="checkbox"
                              className="custom-control-input"
                              id={`inc-${row.productionOrderItemId}`}
                              checked={!!row.included}
                              disabled={(maxQty ?? 0) <= 0 && !cincho}
                              onChange={(e) => toggleRowIncluded(row, e.target.checked)}
                            />
                            <label
                              className="custom-control-label"
                              htmlFor={`inc-${row.productionOrderItemId}`}
                            />
                          </div>
                        )}
                      </td>
                    )}
                    <td>
                      <div>{row.productCode}</div>
                      <small className="text-muted">{row.productName}</small>
                    </td>
                    <td>{row.colorName || "—"}</td>
                    {!readOnly && (
                      <>
                        <td>{row.orderedTotal ?? "—"}</td>
                        <td>{row.pendingTotal ?? "—"}</td>
                      </>
                    )}
                    <td>
                      {cincho && (row.orderedSizes || row.sizes) ? (
                        renderCinchoIncludeCell(row)
                      ) : readOnly ? (
                        <strong>{sumPartialReleaseLineQuantity(row, orderType)}</strong>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          max={maxQty ?? undefined}
                          bsSize="sm"
                          disabled={!row.included}
                          value={row.quantity ?? 0}
                          onChange={(e) =>
                            patchLineQty(
                              row.productionOrderItemId,
                              "quantity",
                              Math.max(0, parseInt(e.target.value, 10) || 0)
                            )
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>

        <small className="text-muted">
          Total en este envío: <strong>{totalUnits}</strong> unidad(es)
          {totalUnits <= 0 && !readOnly ? " — marque productos con cantidad mayor a cero." : null}
        </small>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        {readOnly ? (
          <Button color="success" onClick={handleGenerateShipment} disabled={saving}>
            {saving ? "Generando…" : "Generar envío"}
          </Button>
        ) : (
          <>
            <Button color="primary" outline onClick={() => persistRelease(false)} disabled={saving}>
              {saving ? "Guardando…" : "Guardar borrador"}
            </Button>
            <Button color="primary" onClick={() => persistRelease(true)} disabled={saving}>
              {saving ? "Guardando…" : "Confirmar envío parcial"}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

export default PartialReleaseEditorModal;
