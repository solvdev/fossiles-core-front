import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import { getProductionOrderById, updateProductionOrderItemPrices } from "services/productionOrderService";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  applyOpvPricesToOrderItems,
  buildOpvItemPricesOnlyPayload,
  buildOpvPrintPriceIndex,
  expandOrderItemsForOpvPriceLines,
  mergeOrderWithLocalItemPrices,
  orderItemsHaveBrand,
} from "utils/prepareShipmentsOrderHelper";

function OpvShipmentPriceReviewModal({
  isOpen,
  toggle,
  orderId,
  productCatalogById = {},
  confirmLabel = "Guardar e imprimir",
  forPrint = false,
  onSaved,
}) {
  const [order, setOrder] = useState(null);
  const [priceByLineId, setPriceByLineId] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError("");
    try {
      const fresh = await getProductionOrderById(orderId);
      setOrder(fresh);
      const initial = {};
      expandOrderItemsForOpvPriceLines(fresh, productCatalogById).forEach((line) => {
        initial[line.lineId] = String(line.unitPrice ?? 0);
      });
      setPriceByLineId(initial);
    } catch (err) {
      setError(err.message || "No se pudo cargar la orden");
    } finally {
      setLoading(false);
    }
  }, [orderId, productCatalogById]);

  useEffect(() => {
    if (!isOpen || !orderId) return;
    load();
  }, [isOpen, orderId, load]);

  const displayLines = useMemo(() => {
    if (!order) return [];
    return expandOrderItemsForOpvPriceLines(order, productCatalogById);
  }, [order, productCatalogById]);

  const showBrand = useMemo(() => orderItemsHaveBrand(order?.items), [order]);

  const patchPrice = (lineId, value) => {
    setPriceByLineId((prev) => ({ ...prev, [lineId]: value }));
  };

  const handleSave = async () => {
    if (!order?.id) return;
    setSaving(true);
    setError("");
    try {
      const itemsWithPrices = applyOpvPricesToOrderItems(order, priceByLineId);
      const payload = buildOpvItemPricesOnlyPayload(order, itemsWithPrices);
      let updated = null;
      let persisted = false;
      try {
        updated = await updateProductionOrderItemPrices(order.id, payload);
        persisted = true;
      } catch (persistErr) {
        // Permite imprimir con precios de pantalla aunque falle el API/migración.
        const msg = persistErr.message || "No se pudieron persistir los precios";
        setError(msg);
        showError(`${msg}. Se usarán los precios editados para la impresión.`);
        updated = order;
      }
      const merged = mergeOrderWithLocalItemPrices(updated, itemsWithPrices);
      merged._printPriceIndex = buildOpvPrintPriceIndex(displayLines, priceByLineId);
      if (persisted) {
        showSuccess("Precios guardados (orden, envío e impresión/CxC)");
      }
      if (onSaved) onSaved(merged, { print: Boolean(forPrint) });
      toggle();
    } catch (err) {
      const msg = err.message || "No se pudieron guardar los precios";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  const previewTotal = useMemo(() => {
    let sum = 0;
    displayLines.forEach((line) => {
      const price = Number(priceByLineId[line.lineId]);
      const unit = Number.isFinite(price) && price >= 0 ? price : line.unitPrice;
      sum += unit * (Number(line.quantity) || 0);
    });
    const shipping = Number(order?.shippingCost) || 0;
    return { net: sum, total: sum + shipping, shipping };
  }, [displayLines, priceByLineId, order]);

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        Editar precios — {order?.code || order?.vendorShipmentNumber || "OP"}
      </ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        <Alert color="info" className="py-2">
          Puede editar precios aunque el envío ya exista. En cinchos fije precios por talla (ej. 46/48 vs niño).
          Se guardan en la orden, se sincronizan al envío e impactan impresión y cargo al cliente.
        </Alert>
        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : displayLines.length === 0 ? (
          <Alert color="warning" className="mb-0">
            La orden no tiene líneas con cantidad para facturar.
          </Alert>
        ) : (
          <Table responsive bordered size="sm" className="mb-2">
            <thead className="text-primary">
              <tr>
                <th>Código</th>
                <th>Producto</th>
                {showBrand && <th>Marca</th>}
                <th>Color</th>
                <th>Talla</th>
                <th className="text-center">Cant.</th>
                <th style={{ width: 120 }}>P. unitario (Q)</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {displayLines.map((line) => {
                const raw = priceByLineId[line.lineId];
                const unit = Number.isFinite(Number(raw)) ? Number(raw) : line.unitPrice;
                const sub = unit * (Number(line.quantity) || 0);
                return (
                  <tr key={line.lineId}>
                    <td>{line.productCode || "—"}</td>
                    <td>{line.productName || "—"}</td>
                    {showBrand && <td>{line.brandName || "—"}</td>}
                    <td>{line.colorName || "—"}</td>
                    <td>{line.size || "—"}</td>
                    <td className="text-center">{line.quantity}</td>
                    <td>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        bsSize="sm"
                        value={priceByLineId[line.lineId] ?? ""}
                        onChange={(e) => patchPrice(line.lineId, e.target.value)}
                      />
                    </td>
                    <td className="text-right">Q. {sub.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {!loading && displayLines.length > 0 && (
          <div className="text-right text-muted small">
            Subtotal artículos: <strong>Q. {previewTotal.net.toFixed(2)}</strong>
            {previewTotal.shipping > 0 && (
              <>
                {" "}
                · Envío: Q. {previewTotal.shipping.toFixed(2)} · Total:{" "}
                <strong>Q. {previewTotal.total.toFixed(2)}</strong>
              </>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="success" onClick={handleSave} disabled={saving || loading || !displayLines.length}>
          {saving ? <Spinner size="sm" /> : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default OpvShipmentPriceReviewModal;
