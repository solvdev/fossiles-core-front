import React, { useMemo, useState } from "react";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { createProductionOrder } from "services/productionOrderService";
import { showError, showSuccess } from "utils/notificationHelper";

/**
 * Agrupa lo que no alcanza en bodega para los kioscos marcados y lo manda a producción como se hace a mano:
 * OPK (NORMAL, KIOSCOS) para productos sin talla y OPC (CINCHOS_FOSSILES, KIOSCOS) para cinchos por talla.
 */
export function groupShortagesForProduction(kiosks) {
  const opk = new Map();
  const opc = new Map();
  (kiosks || []).forEach((kiosk) => {
    (kiosk.lines || []).forEach((line) => {
      const qty = Number(line.shortage) || 0;
      if (qty <= 0) return;
      const key = `${line.productId}|${line.colorId ?? ""}`;
      const target = line.size ? opc : opk;
      const row = target.get(key) || {
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        colorId: line.colorId ?? null,
        colorName: line.colorName,
        quantity: 0,
        sizes: {},
        kiosks: new Set(),
      };
      row.quantity += qty;
      if (line.size) row.sizes[line.size] = (row.sizes[line.size] || 0) + qty;
      row.kiosks.add(kiosk.name);
      target.set(key, row);
    });
  });
  const sortRows = (rows) =>
    rows.sort((a, b) => b.quantity - a.quantity || String(a.productCode).localeCompare(String(b.productCode)));
  return { opk: sortRows([...opk.values()]), opc: sortRows([...opc.values()]) };
}

const sizesLabel = (sizes) =>
  Object.keys(sizes)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((size) => `${size}:${sizes[size]}`)
    .join("  ");

function ReplenishmentProductionModal({ isOpen, toggle, kiosks, windowDays, onCreated }) {
  const [saving, setSaving] = useState(false);
  const groups = useMemo(() => groupShortagesForProduction(kiosks), [kiosks]);
  const opkUnits = groups.opk.reduce((sum, r) => sum + r.quantity, 0);
  const opcUnits = groups.opc.reduce((sum, r) => sum + r.quantity, 0);
  const kioskCount = (kiosks || []).filter((k) => (k.totalShortage || 0) > 0).length;
  const observations = `Reposición automática de kioscos: faltante en bodega de ${kioskCount} kiosco(s), venta de ${windowDays} días.`;

  const create = async () => {
    setSaving(true);
    const codes = [];
    try {
      if (groups.opk.length > 0) {
        const order = await createProductionOrder({
          orderType: "NORMAL",
          kioskOrder: true,
          customerName: "KIOSCOS",
          status: "PENDING",
          observations,
          items: groups.opk.map((r) => ({ productId: r.productId, colorId: r.colorId, quantity: r.quantity })),
        });
        codes.push(order?.code || "OPK");
      }
      if (groups.opc.length > 0) {
        const order = await createProductionOrder({
          orderType: "CINCHOS_FOSSILES",
          customerName: "KIOSCOS",
          status: "PENDING",
          observations,
          items: groups.opc.map((r) => ({ productId: r.productId, colorId: r.colorId, sizes: r.sizes })),
        });
        codes.push(order?.code || "OPC");
      }
      showSuccess(`Órdenes creadas: ${codes.join(", ")}`);
      toggle();
      if (onCreated) onCreated(codes);
    } catch (err) {
      showError(
        `${codes.length > 0 ? `Se creó ${codes.join(", ")}, pero falló la siguiente: ` : ""}${err.message ||
          "No se pudo crear la orden de producción"}`
      );
      if (codes.length > 0 && onCreated) onCreated(codes);
    } finally {
      setSaving(false);
    }
  };

  const renderRows = (rows, withSizes) =>
    rows.map((r) => (
      <tr key={`${r.productId}|${r.colorId ?? ""}`}>
        <td>
          <strong>{r.productCode}</strong> {r.productName}
        </td>
        <td>{r.colorName || "—"}</td>
        {withSizes ? <td className="text-nowrap">{sizesLabel(r.sizes)}</td> : null}
        <td className="text-right">{r.quantity}</td>
        <td className="small text-muted">{r.kiosks.size} kiosco(s)</td>
      </tr>
    ));

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>Producir faltantes de reposición</ModalHeader>
      <ModalBody>
        {groups.opk.length === 0 && groups.opc.length === 0 ? (
          <p className="text-muted mb-0">Los kioscos marcados no tienen faltante en bodega.</p>
        ) : (
          <>
            <Alert color="info" className="py-2 small">
              Lo que no alcanza en Bodega PT + Devoluciones para los kioscos marcados. Se crean en PENDIENTE para
              revisarlas en Producción antes de iniciar.
            </Alert>
            {groups.opk.length > 0 ? (
              <>
                <h6 className="mt-2">OPK · KIOSCOS — {groups.opk.length} producto(s), {opkUnits} unidades</h6>
                <Table size="sm" className="small">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Color</th>
                      <th className="text-right">Unidades</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{renderRows(groups.opk, false)}</tbody>
                </Table>
              </>
            ) : null}
            {groups.opc.length > 0 ? (
              <>
                <h6 className="mt-3">OPC cinchos · KIOSCOS — {groups.opc.length} producto(s), {opcUnits} unidades</h6>
                <Table size="sm" className="small">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Color</th>
                      <th>Tallas</th>
                      <th className="text-right">Unidades</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{renderRows(groups.opc, true)}</tbody>
                </Table>
              </>
            ) : null}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button
          color="primary"
          onClick={create}
          disabled={saving || (groups.opk.length === 0 && groups.opc.length === 0)}
        >
          {saving ? <Spinner size="sm" /> : "Crear órdenes de producción"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ReplenishmentProductionModal;
