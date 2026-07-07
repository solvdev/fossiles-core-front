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
  Spinner,
  Table,
} from "reactstrap";
import { getLocations } from "services/locationService";
import { restoreKioskPosSale } from "services/kioskPosService";
import { showError, showSuccess } from "utils/notificationHelper";

const emptyItem = () => ({
  productId: "",
  colorId: "",
  size: "",
  quantity: "1",
  unitPrice: "",
  lineTotal: "",
});

const emptyForm = () => ({
  saleNumber: "",
  kioskLocationId: "",
  saleDate: "",
  soldAt: "",
  customerTaxId: "CF",
  customerName: "",
  paymentMethod: "EFECTIVO",
  amountReceived: "",
  cashAmount: "",
  cardAmount: "",
  cardAuthNumber: "",
  cardLast4: "",
  subtotal: "",
  discountAmount: "0",
  totalAmount: "",
  depositSlipNumber: "",
  createTaxInvoiceDraft: true,
  felStatus: "",
  felUuid: "",
  felSerie: "",
  felNumero: "",
  felCertifiedAt: "",
  items: [emptyItem()],
});

const numOrNull = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

function KioskSaleRestoreModal({ isOpen, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm);
  const [kiosks, setKiosks] = useState([]);
  const [loadingKiosks, setLoadingKiosks] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyForm());
    setError("");
    setLoadingKiosks(true);
    getLocations()
      .then((rows) => {
        const list = (rows || []).filter(
          (loc) => String(loc.categoria || "").toUpperCase() === "KIOSKO"
        );
        setKiosks(list);
      })
      .catch(() => setKiosks([]))
      .finally(() => setLoadingKiosks(false));
  }, [isOpen]);

  const patchForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const patchItem = (index, patch) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  };

  const removeItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length <= 1 ? prev.items : prev.items.filter((_, i) => i !== index),
    }));
  };

  const computedSubtotal = useMemo(
    () =>
      form.items.reduce((sum, row) => {
        const lineTotal = numOrNull(row.lineTotal);
        if (lineTotal != null) return sum + lineTotal;
        const qty = numOrNull(row.quantity) || 0;
        const unit = numOrNull(row.unitPrice) || 0;
        return sum + qty * unit;
      }, 0),
    [form.items]
  );

  const buildPayload = () => {
    const items = form.items
      .map((row) => ({
        productId: numOrNull(row.productId),
        colorId: numOrNull(row.colorId),
        size: String(row.size || "").trim() || null,
        quantity: numOrNull(row.quantity),
        unitPrice: numOrNull(row.unitPrice),
        lineTotal: numOrNull(row.lineTotal),
      }))
      .filter((row) => row.productId && row.quantity);

    if (!items.length) {
      throw new Error("Agrega al menos un producto con ID y cantidad.");
    }
    if (!String(form.saleNumber || "").trim()) {
      throw new Error("El número de venta es obligatorio.");
    }
    if (!form.kioskLocationId) {
      throw new Error("Selecciona el kiosko.");
    }

    const payload = {
      saleNumber: String(form.saleNumber).trim(),
      kioskLocationId: Number(form.kioskLocationId),
      saleDate: form.saleDate || undefined,
      soldAt: form.soldAt ? form.soldAt.replace("T", "T") : undefined,
      customerTaxId: String(form.customerTaxId || "CF").trim() || "CF",
      customerName: String(form.customerName || "").trim() || null,
      paymentMethod: form.paymentMethod || "EFECTIVO",
      amountReceived: numOrNull(form.amountReceived),
      cashAmount: numOrNull(form.cashAmount),
      cardAmount: numOrNull(form.cardAmount),
      cardAuthNumber: String(form.cardAuthNumber || "").trim() || null,
      cardLast4: String(form.cardLast4 || "").trim() || null,
      depositSlipNumber: String(form.depositSlipNumber || "").trim() || null,
      subtotal: numOrNull(form.subtotal) ?? computedSubtotal,
      discountAmount: numOrNull(form.discountAmount) ?? 0,
      totalAmount: numOrNull(form.totalAmount),
      createTaxInvoiceDraft: Boolean(form.createTaxInvoiceDraft),
      items,
    };

    if (payload.totalAmount == null) {
      payload.totalAmount = Math.max(0, payload.subtotal - (payload.discountAmount || 0));
    }

    const felUuid = String(form.felUuid || "").trim();
    if (felUuid) {
      payload.felUuid = felUuid;
      payload.felSerie = String(form.felSerie || "").trim() || null;
      payload.felNumero = String(form.felNumero || "").trim() || null;
      payload.felStatus = String(form.felStatus || "CERTIFIED").trim() || "CERTIFIED";
      payload.felCertifiedAt = form.felCertifiedAt || undefined;
    }

    return payload;
  };

  const handleSubmit = async () => {
    try {
      setSaving(true);
      setError("");
      const payload = buildPayload();
      const confirmed = window.confirm(
        `¿Restaurar la venta ${payload.saleNumber}?\n\nNo moverá inventario.`
      );
      if (!confirmed) return;

      const restored = await restoreKioskPosSale(payload);
      showSuccess(`Venta ${restored?.saleNumber || payload.saleNumber} restaurada.`);
      if (onSuccess) onSuccess(restored);
      onClose();
    } catch (err) {
      const msg = err.message || "No se pudo restaurar la venta.";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} size="lg" backdrop="static">
      <ModalHeader toggle={onClose}>Restaurar venta POS eliminada</ModalHeader>
      <ModalBody>
        <Alert color="warning" className="py-2">
          Recrea la venta con el <strong>mismo número</strong>. No descuenta inventario ni exige caja abierta.
        </Alert>
        {error && <Alert color="danger">{error}</Alert>}

        <Row>
          <Col md="6">
            <FormGroup>
              <Label>No. venta *</Label>
              <Input
                value={form.saleNumber}
                onChange={(e) => patchForm({ saleNumber: e.target.value })}
                placeholder="POS-20260407-0015"
              />
            </FormGroup>
          </Col>
          <Col md="6">
            <FormGroup>
              <Label>Kiosko *</Label>
              <Input
                type="select"
                value={form.kioskLocationId}
                onChange={(e) => patchForm({ kioskLocationId: e.target.value })}
                disabled={loadingKiosks}
              >
                <option value="">Seleccionar...</option>
                {kiosks.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name || k.code || k.id}
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Fecha venta</Label>
              <Input
                type="date"
                value={form.saleDate}
                onChange={(e) => patchForm({ saleDate: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Fecha/hora vendida</Label>
              <Input
                type="datetime-local"
                value={form.soldAt}
                onChange={(e) => patchForm({ soldAt: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Pago</Label>
              <Input
                type="select"
                value={form.paymentMethod}
                onChange={(e) => patchForm({ paymentMethod: e.target.value })}
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="MIXTO">Mixto</option>
              </Input>
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>NIT</Label>
              <Input
                value={form.customerTaxId}
                onChange={(e) => patchForm({ customerTaxId: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="8">
            <FormGroup>
              <Label>Cliente</Label>
              <Input
                value={form.customerName}
                onChange={(e) => patchForm({ customerName: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Subtotal</Label>
              <Input
                type="number"
                step="0.01"
                value={form.subtotal}
                placeholder={computedSubtotal.toFixed(2)}
                onChange={(e) => patchForm({ subtotal: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Descuento</Label>
              <Input
                type="number"
                step="0.01"
                value={form.discountAmount}
                onChange={(e) => patchForm({ discountAmount: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Total *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.totalAmount}
                onChange={(e) => patchForm({ totalAmount: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Efectivo recibido</Label>
              <Input
                type="number"
                step="0.01"
                value={form.amountReceived}
                onChange={(e) => patchForm({ amountReceived: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Boleta depósito</Label>
              <Input
                value={form.depositSlipNumber}
                onChange={(e) => patchForm({ depositSlipNumber: e.target.value })}
              />
            </FormGroup>
          </Col>
          <Col md="4" className="d-flex align-items-end">
            <FormGroup check className="mb-3">
              <Label check>
                <Input
                  type="checkbox"
                  checked={Boolean(form.createTaxInvoiceDraft)}
                  onChange={(e) => patchForm({ createTaxInvoiceDraft: e.target.checked })}
                />{" "}
                Crear borrador tax_invoice
              </Label>
            </FormGroup>
          </Col>
        </Row>

        <h6 className="mt-2">Productos</h6>
        <Table responsive size="sm" bordered>
          <thead>
            <tr>
              <th>Producto ID</th>
              <th>Color ID</th>
              <th>Talla</th>
              <th>Cant.</th>
              <th>P. unit.</th>
              <th>Total línea</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {form.items.map((row, index) => (
              <tr key={`restore-item-${index}`}>
                <td>
                  <Input
                    bsSize="sm"
                    value={row.productId}
                    onChange={(e) => patchItem(index, { productId: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    bsSize="sm"
                    value={row.colorId}
                    onChange={(e) => patchItem(index, { colorId: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    bsSize="sm"
                    value={row.size}
                    onChange={(e) => patchItem(index, { size: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    bsSize="sm"
                    value={row.quantity}
                    onChange={(e) => patchItem(index, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    bsSize="sm"
                    value={row.unitPrice}
                    onChange={(e) => patchItem(index, { unitPrice: e.target.value })}
                  />
                </td>
                <td>
                  <Input
                    bsSize="sm"
                    value={row.lineTotal}
                    onChange={(e) => patchItem(index, { lineTotal: e.target.value })}
                  />
                </td>
                <td className="text-center">
                  <Button close onClick={() => removeItem(index)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Button color="secondary" outline size="sm" onClick={addItem}>
          + Agregar línea
        </Button>

        <h6 className="mt-4">FEL existente (opcional)</h6>
        <Row>
          <Col md="6">
            <FormGroup>
              <Label>UUID</Label>
              <Input value={form.felUuid} onChange={(e) => patchForm({ felUuid: e.target.value })} />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Serie</Label>
              <Input value={form.felSerie} onChange={(e) => patchForm({ felSerie: e.target.value })} />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Número</Label>
              <Input value={form.felNumero} onChange={(e) => patchForm({ felNumero: e.target.value })} />
            </FormGroup>
          </Col>
        </Row>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={saving}>
          {saving ? <Spinner size="sm" /> : "Restaurar venta"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default KioskSaleRestoreModal;
