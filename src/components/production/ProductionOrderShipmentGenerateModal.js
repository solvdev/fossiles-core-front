import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Spinner,
  Table,
} from "reactstrap";
import {
  confirmShipmentDraft,
} from "services/productDistributionService";
import { getCustomerById, updateCustomer } from "services/customerService";
import {
  createProductionOrderShipment,
  generateProductionOrderShipment,
  getProductionOrderById,
  updateProductionOrder,
} from "services/productionOrderService";
import { getLocations } from "services/locationService";
import { showError, showSuccess } from "utils/notificationHelper";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { formatDateGt } from "utils/dateTimeHelper";
import {
  buildDefaultDestinationFromOrder,
  buildDestinationFromForm,
  buildProductionOrderUpdatePayload,
  buildShipmentProductsFromOrderItems,
  classifyPrepareOrder,
  initShipmentGenerateForm,
  isLuisFelipeVendorFlow,
  mapPackingItemsForApi,
  mergeOrderWithShipmentForm,
} from "utils/prepareShipmentsOrderHelper";

function ProductionOrderShipmentGenerateModal({ isOpen, toggle, order, onGenerated }) {
  const [orderDetail, setOrderDetail] = useState(order);
  const [form, setForm] = useState(() => initShipmentGenerateForm(order));
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [kiosks, setKiosks] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const activeOrder = orderDetail || order;
  const kind = classifyPrepareOrder(activeOrder);
  const luisFelipeFlow = isLuisFelipeVendorFlow(activeOrder?.orderType, activeOrder?.sellerName);
  /** Cliente, costo envío y fecha: solo OPC/OPV Luis Felipe (no OPI ni OPCK). */
  const showLfReviewSection = luisFelipeFlow;
  const showOpcDestinationOnly = kind === "OPC" && !showLfReviewSection;
  const requiresKioskDestination =
    (kind === "OPCK" || kind === "OPK") && !luisFelipeFlow;

  const applyFormFromOrder = useCallback((o) => {
    setForm(initShipmentGenerateForm(o));
  }, []);

  const refreshOrder = useCallback(async () => {
    if (!order?.id) return;
    try {
      const fresh = await getProductionOrderById(order.id);
      setOrderDetail(fresh);
      applyFormFromOrder(fresh);
    } catch (_err) {
      setOrderDetail(order);
      applyFormFromOrder(order);
    }
  }, [order, applyFormFromOrder]);

  useEffect(() => {
    if (!isOpen || !order?.id) return;
    setOrderDetail(order);
    applyFormFromOrder(order);
    refreshOrder();
    setLocationId("");
    setNotes("");
    setError("");
    getLocations()
      .then((locs) => {
        const rows = (locs || []).filter((loc) => {
          const cat = String(loc.category || loc.locationCategory || "").toUpperCase();
          return cat.includes("KIOSKO") || cat === "KIOSK";
        });
        setKiosks(rows.length ? rows : locs || []);
      })
      .catch(() => setKiosks([]));
  }, [isOpen, order, refreshOrder, applyFormFromOrder]);

  const patchForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const persistLinkedCustomer = async (o, f) => {
    if (!o?.customerId) return;
    try {
      const existing = await getCustomerById(o.customerId);
      await updateCustomer(o.customerId, {
        name: String(f.customerName || "").trim() || existing.name,
        address: String(f.customerAddress || "").trim() || existing.address,
        phone: String(f.customerPhone || "").trim() || existing.phone,
        nit: String(f.customerTaxId || "").trim() || existing.nit,
        email: existing.email || null,
        status: existing.status || "ACTIVE",
      });
    } catch (err) {
      throw new Error(err.message || "No se pudo actualizar el cliente");
    }
  };

  const persistOrderBeforeGenerate = async () => {
    const payload = buildProductionOrderUpdatePayload(activeOrder, form);
    const updated = await updateProductionOrder(activeOrder.id, payload);
    await persistLinkedCustomer(activeOrder, form);
    const merged = mergeOrderWithShipmentForm(updated, form);
    setOrderDetail(merged);
    return merged;
  };

  const handleGenerate = async () => {
    if (!activeOrder?.id) return;
    setGenerating(true);
    setError("");
    try {
      const dest = showLfReviewSection
        ? buildDestinationFromForm(form)
        : showOpcDestinationOnly
          ? String(form.destination || "").trim() || buildDefaultDestinationFromOrder(activeOrder)
          : "";
      if (kind === "OPC" && !dest) {
        setError("Indique destino o dirección de entrega.");
        return;
      }

      const orderForGenerate = showLfReviewSection
        ? await persistOrderBeforeGenerate()
        : activeOrder;
      const packingFromOrder = mapPackingItemsForApi(orderForGenerate.packingItems);

      if (kind === "OPC") {
        const payload = {
          destinationAddress: dest,
          notes: notes.trim() || undefined,
          documentDate: form.documentDate || undefined,
        };
        if (locationId) payload.locationId = Number(locationId);
        if (luisFelipeFlow && packingFromOrder.length > 0) {
          payload.packingItems = packingFromOrder;
        }
        const created = await generateProductionOrderShipment(orderForGenerate.id, payload);
        showSuccess(`Envío ${created.shipmentNumber || created.id} generado`);
        if (onGenerated) onGenerated(created, orderForGenerate);
        return;
      }

      if (kind === "OPI") {
        const products = buildShipmentProductsFromOrderItems(orderForGenerate);
        if (products.length === 0) {
          setError("La orden no tiene productos con cantidad.");
          return;
        }
        const draft = await createProductionOrderShipment(orderForGenerate.id, {
          destinationAddress: dest || undefined,
          notes: notes.trim() || undefined,
          documentDate: form.documentDate || undefined,
          products,
          packingItems: packingFromOrder,
        });
        const confirmed = await confirmShipmentDraft(draft.id);
        showSuccess(`Envío ${confirmed.shipmentNumber || confirmed.id} generado (OPI)`);
        if (onGenerated) onGenerated(confirmed, orderForGenerate);
        return;
      }

      if (kind === "OPCK") {
        if (requiresKioskDestination && !locationId) {
          setError("OPCK requiere seleccionar kiosko destino.");
          return;
        }
        const products = buildShipmentProductsFromOrderItems(orderForGenerate);
        if (products.length === 0) {
          setError("La orden no tiene productos con cantidad.");
          return;
        }
        const draft = await createProductionOrderShipment(orderForGenerate.id, {
          ...(locationId ? { locationId: Number(locationId) } : {}),
          notes: notes.trim() || undefined,
          documentDate: form.documentDate || undefined,
          products,
          packingItems: packingFromOrder,
        });
        const confirmed = await confirmShipmentDraft(draft.id);
        showSuccess(`Envío ${confirmed.shipmentNumber || confirmed.id} generado (OPCK)`);
        if (onGenerated) onGenerated(confirmed, orderForGenerate);
        return;
      }

      if (kind === "OPK") {
        if (luisFelipeFlow) {
          const orderForGenerate = await persistOrderBeforeGenerate();
          const dest = buildDestinationFromForm(form);
          if (!dest) {
            setError("Indique destino o dirección de entrega.");
            return;
          }
          const products = buildShipmentProductsFromOrderItems(orderForGenerate);
          if (products.length === 0) {
            setError("La orden no tiene productos con cantidad.");
            return;
          }
          const packingFromOrder = mapPackingItemsForApi(orderForGenerate.packingItems);
          const draft = await createProductionOrderShipment(orderForGenerate.id, {
            destinationAddress: dest,
            notes: notes.trim() || undefined,
            documentDate: form.documentDate || undefined,
            products,
            ...(packingFromOrder.length > 0 ? { packingItems: packingFromOrder } : {}),
            ...(locationId ? { locationId: Number(locationId) } : {}),
          });
          const confirmed = await confirmShipmentDraft(draft.id);
          showSuccess(
            `Envío ${confirmed.shipmentNumber || confirmed.id} generado (confirmado). Use Listo / Enviar cuando deba salir de bodega.`
          );
          if (onGenerated) onGenerated(confirmed, orderForGenerate);
          return;
        }
        if (requiresKioskDestination && !locationId) {
          setError("OPK requiere seleccionar kiosko destino.");
          return;
        }
        const products = buildShipmentProductsFromOrderItems(orderForGenerate);
        if (products.length === 0) {
          setError("La orden no tiene productos con cantidad.");
          return;
        }
        const draft = await createProductionOrderShipment(orderForGenerate.id, {
          locationId: Number(locationId),
          notes: notes.trim() || undefined,
          documentDate: form.documentDate || undefined,
          products,
          packingItems: packingFromOrder,
        });
        const confirmed = await confirmShipmentDraft(draft.id);
        showSuccess(
          `Envío ${confirmed.shipmentNumber || confirmed.id} generado (confirmado). Use Listo / Enviar cuando deba salir de bodega.`
        );
        if (onGenerated) onGenerated(confirmed, orderForGenerate);
        return;
      }

      setError("Tipo de orden no soportado para generar envío desde aquí.");
    } catch (err) {
      const msg = err.message || "No se pudo generar el envío";
      setError(msg);
      showError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const kioskOptions = useMemo(
    () =>
      (kiosks || []).map((k) => ({
        value: String(k.id),
        label: `${k.code ? `${k.code} — ` : ""}${k.name || ""}`.trim(),
        searchText: `${k.code || ""} ${k.name || ""} ${k.category || ""}`,
      })),
    [kiosks]
  );

  if (!kind || kind === "OPV") {
    return null;
  }

  const packingItems = Array.isArray(activeOrder?.packingItems) ? activeOrder.packingItems : [];
  const previewDateLabel = form.documentDate ? formatDateGt(form.documentDate) : "—";

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Generar envío — {activeOrder?.code} ({kind})
      </ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        {kind === "OPC" && luisFelipeFlow && (
          <Alert color="info" className="py-2">
            Formato Luis Felipe: documento {activeOrder?.vendorShipmentNumber || "ENVP"}; registro físico con sufijo
            -ENV-.
          </Alert>
        )}
        {kind === "OPCK" && (
          <Alert color="warning" className="py-2">
            OPCK: impresión como distribución. Debe indicar kiosko destino.
          </Alert>
        )}
        {kind === "OPK" && (
          <Alert color="warning" className="py-2">
            OPK: <strong>Generar envío</strong> deja el documento <strong>confirmado</strong> (sin salir de bodega ni validar stock).
            Use <strong>Listo / Enviar</strong> en Preparar envíos cuando deba ir a tránsito.
            Para solo parte de la orden, use <strong>Liberaciones parciales</strong>.
            Este modal genera un envío con <strong>todos</strong> los productos de la OP.
          </Alert>
        )}
        {kind === "OPI" && (
          <Alert color="light" className="py-2">
            OPI: documento interno. Solo seleccione kiosko/notas si aplica; sin datos de cliente ni costo de envío aquí.
          </Alert>
        )}

        {showLfReviewSection && (
        <div className="border rounded p-3 mb-3 bg-light">
          <h6 className="text-primary mb-3">Revisión del envío (Luis Felipe)</h6>
          <Row form>
            <Col md="4">
              <FormGroup>
                <Label>
                  <strong>Fecha en documento</strong>
                </Label>
                <Input
                  type="date"
                  value={form.documentDate}
                  onChange={(e) => patchForm({ documentDate: e.target.value })}
                />
                <small className="text-muted">Por defecto: hoy ({previewDateLabel})</small>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>
                  <strong>Costo de envío (Q)</strong>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shippingCost}
                  onChange={(e) => patchForm({ shippingCost: e.target.value })}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>
                  <strong>NIT / CF</strong>
                </Label>
                <Input
                  value={form.customerTaxId}
                  onChange={(e) => patchForm({ customerTaxId: e.target.value })}
                  placeholder="CF"
                />
              </FormGroup>
            </Col>
          </Row>
          <Row form>
            <Col md="6">
              <FormGroup>
                <Label>
                  <strong>Cliente</strong>
                </Label>
                <Input
                  value={form.customerName}
                  onChange={(e) => patchForm({ customerName: e.target.value })}
                  placeholder="Nombre del cliente"
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>
                  <strong>Teléfono</strong>
                </Label>
                <Input
                  value={form.customerPhone}
                  onChange={(e) => patchForm({ customerPhone: e.target.value })}
                  placeholder="Teléfono de contacto"
                />
              </FormGroup>
            </Col>
          </Row>
          <Row form>
            <Col md="12">
              <FormGroup className="mb-0">
                <Label>
                  <strong>Dirección</strong>
                </Label>
                <Input
                  type="textarea"
                  rows={2}
                  value={form.customerAddress}
                  onChange={(e) => {
                    const customerAddress = e.target.value;
                    patchForm({
                      customerAddress,
                      destination: buildDestinationFromForm({
                        ...form,
                        customerAddress,
                      }),
                    });
                  }}
                  placeholder="Dirección de entrega"
                />
              </FormGroup>
            </Col>
          </Row>
        </div>
        )}

        {showOpcDestinationOnly && (
          <FormGroup>
            <Label>
              <strong>Destino / dirección</strong>
            </Label>
            <Input
              type="textarea"
              rows={2}
              value={form.destination}
              onChange={(e) => patchForm({ destination: e.target.value })}
              placeholder={buildDefaultDestinationFromOrder(activeOrder) || "Dirección o lugar de entrega"}
            />
          </FormGroup>
        )}

        {(requiresKioskDestination) && (
          <FormGroup>
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
        {showLfReviewSection && (
          <FormGroup>
            <Label>
              <strong>Destino / dirección (envío)</strong>
            </Label>
            <Input
              type="textarea"
              rows={2}
              value={form.destination}
              onChange={(e) => patchForm({ destination: e.target.value })}
              placeholder={buildDefaultDestinationFromOrder(activeOrder) || "Dirección o lugar de entrega"}
            />
            <small className="text-muted">
              Se guardará en el envío como destino. Puede ajustarla aparte de la dirección del cliente.
            </small>
          </FormGroup>
        )}
        {kind === "OPC" && (
          <FormGroup>
            <Label>Kiosko (opcional)</Label>
            <FilterableSelect
              value={locationId}
              onChange={setLocationId}
              options={kioskOptions}
              placeholder="Buscar kiosko…"
              emptyLabel="— Sin kiosko —"
            />
          </FormGroup>
        )}
        <FormGroup>
          <Label>Notas adicionales</Label>
          <Input type="textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormGroup>
        {showLfReviewSection && packingItems.length > 0 && (
          <Table size="sm" bordered responsive>
            <thead>
              <tr>
                <th>Empaque</th>
                <th>Cant.</th>
                <th>P.Unit.</th>
              </tr>
            </thead>
            <tbody>
              {packingItems.map((item, idx) => (
                <tr key={`${item.materialId}-${idx}`}>
                  <td>{item.materialName || item.materialCode || `SUM-${item.materialId}`}</td>
                  <td>{item.quantity}</td>
                  <td>{Number(item.unitPrice || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle}>
          Cerrar
        </Button>
        <Button color="success" onClick={handleGenerate} disabled={generating}>
          {generating ? <Spinner size="sm" /> : "Generar envío"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function canGenerateShipmentForOrder(order) {
  const kind = classifyPrepareOrder(order);
  return kind === "OPC" || kind === "OPI" || kind === "OPCK" || kind === "OPK";
}

export default ProductionOrderShipmentGenerateModal;
