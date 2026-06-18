import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Col,
  Spinner,
  Table,
} from "reactstrap";
import { getCustomerById, updateCustomer } from "services/customerService";
import {
  generatePartialReleaseShipment,
  generateProductionOrderShipment,
  getProductionOrderById,
  getProductionOrderShipments,
  updateProductionOrder,
} from "services/productionOrderService";
import { getLocations } from "services/locationService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatDateGt } from "utils/dateTimeHelper";
import { isLuisFelipeVendorFlow } from "utils/luisFelipeVendorHelper";
import {
  buildDefaultDestinationFromOrder,
  buildDestinationFromForm,
  buildProductionOrderUpdatePayload,
  initShipmentGenerateForm,
  mapPackingItemsForApi,
  mergeOrderWithShipmentForm,
} from "utils/prepareShipmentsOrderHelper";
import { isOpcShipmentEligible } from "utils/opcShipmentHelper";

function OpcGenerateShipmentModal({ isOpen, toggle, order, partialRelease, onGenerated }) {
  const [orderDetail, setOrderDetail] = useState(order);
  const [form, setForm] = useState(() => initShipmentGenerateForm(order));
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [kiosks, setKiosks] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const activeOrder = orderDetail || order;
  const eligible = isOpcShipmentEligible(activeOrder);
  const luisFelipeFlow = isLuisFelipeVendorFlow(activeOrder?.orderType, activeOrder?.sellerName);

  const loadShipments = useCallback(async () => {
    if (!activeOrder?.id) return;
    setLoadingShipments(true);
    try {
      const data = await getProductionOrderShipments(activeOrder.id);
      setShipments(data || []);
    } catch (_err) {
      setShipments([]);
    } finally {
      setLoadingShipments(false);
    }
  }, [activeOrder?.id]);

  const refreshOrder = useCallback(async () => {
    if (!order?.id) return;
    try {
      const fresh = await getProductionOrderById(order.id);
      setOrderDetail(fresh);
      setForm(initShipmentGenerateForm(fresh));
    } catch (_err) {
      setOrderDetail(order);
      setForm(initShipmentGenerateForm(order));
    }
  }, [order]);

  useEffect(() => {
    if (!isOpen || !order?.id) return;
    setOrderDetail(order);
    refreshOrder();
    setLocationId("");
    setNotes("");
    setError("");
    loadShipments();
    getLocations()
      .then((locs) => {
        const rows = (locs || []).filter((loc) => {
          const cat = String(loc.category || loc.locationCategory || "").toUpperCase();
          return cat.includes("KIOSKO") || cat === "KIOSK";
        });
        setKiosks(rows.length ? rows : locs || []);
      })
      .catch(() => setKiosks([]));
  }, [isOpen, order, loadShipments, refreshOrder]);

  const persistOrderBeforeGenerate = async () => {
    const payload = buildProductionOrderUpdatePayload(activeOrder, form);
    const updated = await updateProductionOrder(activeOrder.id, payload);
    if (activeOrder?.customerId) {
      const existing = await getCustomerById(activeOrder.customerId);
      await updateCustomer(activeOrder.customerId, {
        name: String(form.customerName || "").trim() || existing.name,
        address: String(form.customerAddress || "").trim() || existing.address,
        phone: String(form.customerPhone || "").trim() || existing.phone,
        nit: String(form.customerTaxId || "").trim() || existing.nit,
        email: existing.email || null,
        status: existing.status || "ACTIVE",
      });
    }
    const merged = mergeOrderWithShipmentForm(updated, form);
    setOrderDetail(merged);
    return merged;
  };

  const handleGenerate = async () => {
    const dest = luisFelipeFlow
      ? buildDestinationFromForm(form)
      : String(form.destination || "").trim() || buildDefaultDestinationFromOrder(activeOrder);
    if (!dest) {
      setError("Indique destino o dirección.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const orderForGenerate =
        luisFelipeFlow && !partialRelease?.id
          ? await persistOrderBeforeGenerate()
          : activeOrder;
      const payload = {
        destinationAddress: dest,
        notes: notes.trim() || undefined,
        documentDate: form.documentDate || undefined,
      };
      if (locationId) {
        payload.locationId = Number(locationId);
      }
      const packingFromOrder = mapPackingItemsForApi(orderForGenerate.packingItems);
      if (luisFelipeFlow && packingFromOrder.length > 0) {
        payload.packingItems = packingFromOrder;
      }
      const created = partialRelease?.id
        ? await generatePartialReleaseShipment(partialRelease.id, payload)
        : await generateProductionOrderShipment(orderForGenerate.id, payload);
      showSuccess(
        `Envío ${created.shipmentNumber || created.id} generado${partialRelease?.label ? ` (${partialRelease.label})` : ""}`
      );
      await refreshOrder();
      await loadShipments();
      if (onGenerated) onGenerated(created);
    } catch (err) {
      const msg = err.message || "No se pudo generar el envío";
      const hint =
        msg.includes("ENVP") || msg.includes("envío con ese número")
          ? " El ENVP de esta orden puede estar en uso por otra OP; cierre el modal, vuelva a abrirlo y genere de nuevo (el sistema asignará el siguiente libre)."
          : "";
      setError(msg + hint);
      showError(msg);
      await refreshOrder();
    } finally {
      setGenerating(false);
    }
  };

  if (!eligible) {
    return null;
  }

  const packingItems = Array.isArray(activeOrder?.packingItems) ? activeOrder.packingItems : [];
  const patchForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const previewDateLabel = form.documentDate ? formatDateGt(form.documentDate) : "—";

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Generar envío — {activeOrder?.code}
        {partialRelease?.label ? ` · ${partialRelease.label}` : ""}
      </ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        {partialRelease && (
          <Alert color="info" className="py-2">
            Envío solo con las cantidades del parcial <strong>{partialRelease.label}</strong> (secuencia{" "}
            {partialRelease.sequence}).
          </Alert>
        )}
        {luisFelipeFlow && (
          <Alert color="info" className="py-2">
            <strong>Formato Luis Felipe (OPV):</strong> envío{" "}
            {activeOrder?.vendorShipmentNumber ? (
              <code>{activeOrder.vendorShipmentNumber}</code>
            ) : (
              "ENVP (se asignará al generar)"
            )}
            {activeOrder?.customerName ? ` — ${activeOrder.customerName}` : ""}
          </Alert>
        )}
        {luisFelipeFlow && (
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
                <small className="text-muted">Vista previa: {previewDateLabel}</small>
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
                      destination: buildDestinationFromForm({ ...form, customerAddress }),
                    });
                  }}
                />
              </FormGroup>
            </Col>
          </Row>
        </div>
        )}
        {luisFelipeFlow && packingItems.length > 0 && (
          <Table size="sm" bordered responsive className="mb-3">
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
        <FormGroup>
          <Label for="opc-ship-dest">
            <strong>{luisFelipeFlow ? "Destino / dirección (envío)" : "Destino / dirección"}</strong>
          </Label>
          <Input
            id="opc-ship-dest"
            type="textarea"
            rows={2}
            value={form.destination}
            onChange={(e) => patchForm({ destination: e.target.value })}
            placeholder="Dirección o lugar de entrega"
          />
        </FormGroup>
        <FormGroup>
          <Label for="opc-ship-kiosk">Kiosko (opcional)</Label>
          <Input
            id="opc-ship-kiosk"
            type="select"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">— Sin kiosko (solo dirección) —</option>
            {kiosks.map((k) => (
              <option key={k.id} value={k.id}>
                {k.code ? `${k.code} — ` : ""}
                {k.name}
              </option>
            ))}
          </Input>
          <small className="text-muted">
            Con kiosko: numeración ENV del kiosko y tránsito a inventario del kiosko al enviar.
            {luisFelipeFlow &&
              " Sin kiosko: documento ENVP de la OP; registro de envío ENVP-#####-ENV-00001 (único en sistema)."}
          </small>
        </FormGroup>
        <FormGroup>
          <Label for="opc-ship-notes">Notas adicionales</Label>
          <Input
            id="opc-ship-notes"
            type="textarea"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormGroup>
        <hr />
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0 text-muted">Envíos de esta OP</h6>
          <Link to="/prepare-shipments" className="small" onClick={toggle}>
            Ir a Preparar envíos
          </Link>
        </div>
        {loadingShipments ? (
          <Spinner size="sm" color="primary" />
        ) : shipments.length === 0 ? (
          <p className="text-muted small mb-0">Aún no hay envíos generados.</p>
        ) : (
          <Table size="sm" bordered responsive className="mb-0">
            <thead>
              <tr>
                <th>Número</th>
                <th>Destino</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id}>
                  <td>{s.shipmentNumber}</td>
                  <td>{s.locationName || "—"}</td>
                  <td>{s.status}</td>
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

export default OpcGenerateShipmentModal;
