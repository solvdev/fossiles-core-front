import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { addTaskItems, getDayPlanOrderItems } from "services/taskService";

const fmt = (n) => (Math.round((n || 0) * 100) / 100).toFixed(2);

/**
 * Agrega productos de la OP base a una tarea abierta (típico: la que se arrastró al día
 * siguiente). Sube el tiempo esperado de la tarea; no hereda ni borra el atraso.
 */
export default function TaskAddItemsModal({ task, onClose, onAdded }) {
  const [items, setItems] = useState(null);
  const [qty, setQty] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!task) return undefined;
    let cancelled = false;
    setItems(null);
    setQty({});
    setError("");
    getDayPlanOrderItems(task.productionOrderId, { size: 200 })
      .then((page) => { if (!cancelled) setItems(page.content || []); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [task]);

  const picked = useMemo(
    () => (items || []).filter((it) => Number(qty[it.productionOrderItemId]) > 0),
    [items, qty]
  );
  const addedHours = picked.reduce((s, it) => s + Number(qty[it.productionOrderItemId]) * it.prdTimePerUnit, 0);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await addTaskItems(task.id, picked.map((it) => ({
        productionOrderItemId: it.productionOrderItemId,
        quantity: Number(qty[it.productionOrderItemId]),
      })));
      onAdded(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={!!task} toggle={saving ? undefined : onClose} size="lg" centered>
      <ModalHeader toggle={saving ? undefined : onClose}>Agregar productos a {task ? task.code : ""}</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        {!items && !error && <div className="text-center py-3"><Spinner /></div>}
        {items && items.length === 0 && <p className="text-muted mb-0">La orden no tiene productos pendientes de asignar.</p>}
        {items && items.length > 0 && (
          <>
            <p className="text-muted">
              Productos de la orden {task.productionOrderCode} que aún no están en ninguna tarea. Las horas que se agregan
              suman al tiempo esperado de la tarea (máximo 5 h base).
            </p>
            <Table size="sm" responsive>
              <thead><tr><th>Producto</th><th>Quedan</th><th>h/unidad</th><th style={{ width: 110 }}>Agregar</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.productionOrderItemId}>
                    <td>{it.productName}{it.colorName ? ` · ${it.colorName}` : ""}</td>
                    <td>{it.remainingQuantity}</td>
                    <td>{fmt(it.prdTimePerUnit)}</td>
                    <td>
                      <Input
                        type="number" min={0} max={it.remainingQuantity} bsSize="sm"
                        value={qty[it.productionOrderItemId] || ""}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(it.remainingQuantity, Math.floor(Number(e.target.value) || 0)));
                          setQty((prev) => ({ ...prev, [it.productionOrderItemId]: v }));
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto text-muted">{picked.length > 0 ? `+${fmt(addedHours)} h` : ""}</span>
        <Button color="secondary" outline onClick={onClose} disabled={saving}>Volver</Button>
        <Button color="primary" onClick={save} disabled={picked.length === 0 || saving}>
          {saving ? <Spinner size="sm" /> : "Agregar a la tarea"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
