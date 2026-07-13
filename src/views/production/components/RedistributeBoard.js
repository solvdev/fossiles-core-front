import React, { useState, useMemo, useCallback } from "react";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Row, Col, Badge, Input, Label, FormGroup, Alert } from "reactstrap";
import { isWeekendYmd } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";

/**
 * Tablero de mesas con drag & drop (extraído de TasksByTable para compartirlo
 * con el Organizador de Tareas). Columna "Sin asignar" + una por mesa; al soltar
 * llama onMove({taskItemId, targetDesk, targetDate}).
 */

export const DroppableColumn = React.memo(function DroppableColumn({ id, header, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        width: 260,
        minWidth: 260,
        border: `1px solid ${isOver ? "#ffc107" : "#e0e0e0"}`,
        borderRadius: 8,
        background: isOver ? "#fff8e1" : "#fafafa",
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>
        {header}
        <Badge color="light" className="ml-2 text-dark">{count}</Badge>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
});

export const DraggableCard = React.memo(function DraggableCard({ id, title, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = {
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 10,
    cursor: isDragging ? "grabbing" : "grab",
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    boxShadow: isDragging ? "0 10px 20px rgba(0,0,0,0.15)" : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} title={title} {...listeners} {...attributes}>
      {children}
    </div>
  );
});

export default function RedistributeBoard({
  tasks,
  numDesks,
  date,
  setDate,
  onMove,
  deskTitleFor,
  introText,
}) {
  const [activeItemId, setActiveItemId] = useState(null);
  /** Mesa elegida en el selector manual por taskItemId (alternativa a arrastrar). */
  const [manualDeskByItem, setManualDeskByItem] = useState({});
  const [assigningItemId, setAssigningItemId] = useState(null);

  const activeTasks = useMemo(() => (tasks || []).filter((t) => t && t.status !== "CANCELLED" && t.status !== "COMPLETED"), [tasks]);

  const items = useMemo(() => {
    const out = [];
    activeTasks.forEach((t) => {
      (t.items || []).forEach((it) => {
        if (!it?.id) return;
        out.push({
          taskId: t.id,
          taskCode: t.code,
          productionOrderCode: t.productionOrderCode,
          taskStatus: t.status,
          desk: t.desk || null,
          scheduledDate: t.scheduledDate || null,
          taskItemId: it.id,
          productCode: it.productCode,
          productName: it.productName,
          colorName: it.colorName,
          quantity: it.quantity,
          estimatedHours: it.estimatedHours,
        });
      });
    });
    return out;
  }, [activeTasks]);

  const containers = useMemo(() => {
    const list = [{ id: "unassigned", title: "Sin asignar" }];
    for (let d = 1; d <= (numDesks || 12); d++) {
      const title = typeof deskTitleFor === "function" ? deskTitleFor(d) : `Mesa ${d}`;
      list.push({ id: `desk-${d}`, title, desk: d });
    }
    return list;
  }, [numDesks, deskTitleFor]);

  const itemsByContainer = useMemo(() => {
    const map = {};
    containers.forEach((c) => { map[c.id] = []; });
    items.forEach((it) => {
      const key = it.desk ? `desk-${it.desk}` : "unassigned";
      const isSameDate = !date || String(it.scheduledDate || "") === String(date || "");
      // Ítems sin fecha (tareas recién creadas en el organizador) siempre visibles en "Sin asignar".
      const dateless = key === "unassigned" && !it.scheduledDate;
      if (!isSameDate && !dateless) return;
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (a.productionOrderCode || "").localeCompare(b.productionOrderCode || "") || (a.productCode || "").localeCompare(b.productCode || ""));
    });
    return map;
  }, [items, containers, date]);

  const findContainerForTaskItem = useCallback((taskItemId) => {
    const it = items.find((x) => String(x.taskItemId) === String(taskItemId));
    if (!it) return "unassigned";
    return it.desk ? `desk-${it.desk}` : "unassigned";
  }, [items]);

  const handleDragStart = useCallback((event) => {
    const id = event?.active?.id;
    if (!id) return;
    setActiveItemId(id);
  }, []);

  const handleDragEnd = useCallback(async (event) => {
    setActiveItemId(null);
    const activeId = event?.active?.id;
    const overId = event?.over?.id;
    if (!activeId || !overId) return;

    const taskItemId = String(activeId).startsWith("item-") ? Number(String(activeId).slice(5)) : null;
    if (!taskItemId) return;

    const from = findContainerForTaskItem(taskItemId);
    const to = String(overId);
    if (from === to) return;

    const targetDesk = to.startsWith("desk-") ? Number(to.slice(5)) : null;
    // Sin mesa: igual mantener la fecha del tablero para que los ítems queden en "Sin asignar" de ese día.
    const targetDate = date || null;
    if (targetDesk && isWeekendYmd(targetDate)) {
      showError("Solo se trabaja de lunes a viernes: elige una fecha entre semana antes de asignar mesa.");
      return;
    }
    await onMove({ taskItemId, targetDesk, targetDate });
  }, [date, findContainerForTaskItem, onMove]);

  /**
   * Asignar/cambiar mesa sin arrastrar: elige mesa en el desplegable de la tarjeta y confirma.
   * Mueve las unidades completas de esa línea (no divide la cantidad); "Sin mesa" la regresa
   * a la columna de no asignadas.
   */
  const handleManualAssign = useCallback(async (taskItemId) => {
    const raw = manualDeskByItem[taskItemId];
    const targetDesk = raw ? Number(raw) : null;
    const targetDate = date || null;
    if (targetDesk && isWeekendYmd(targetDate)) {
      showError("Solo se trabaja de lunes a viernes: elige una fecha entre semana antes de asignar mesa.");
      return;
    }
    setAssigningItemId(taskItemId);
    try {
      await onMove({ taskItemId, targetDesk, targetDate });
      setManualDeskByItem((prev) => {
        const next = { ...prev };
        delete next[taskItemId];
        return next;
      });
    } finally {
      setAssigningItemId(null);
    }
  }, [manualDeskByItem, date, onMove]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    const rawId = String(activeItemId).startsWith("item-") ? Number(String(activeItemId).slice(5)) : null;
    if (!rawId) return null;
    return items.find((x) => Number(x.taskItemId) === rawId) || null;
  }, [activeItemId, items]);

  return (
    <div>
      <Alert color="warning" className="mb-3">
        {introText || (
          <>
            <strong>Redistribuir (manual)</strong>: mueve productos entre mesas para la fecha seleccionada. Esto no es el cronograma automático.
          </>
        )}
      </Alert>
      <Row className="mb-3">
        <Col md="3">
          <FormGroup className="mb-0">
            <Label><small>Fecha</small></Label>
            <Input type="date" bsSize="sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormGroup>
        </Col>
        <Col className="d-flex align-items-end">
          {activeItem?.taskItemId && <small className="text-muted">Moviendo item #{activeItem.taskItemId}…</small>}
        </Col>
      </Row>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ display: "flex", gap: 12, minWidth: 900 }}>
            {containers.map((c) => (
              <DroppableColumn
                key={c.id}
                id={c.id}
                header={c.title}
                count={(itemsByContainer[c.id] || []).length}
              >
                {(itemsByContainer[c.id] || []).map((it) => (
                  <div key={it.taskItemId}>
                    <DraggableCard
                      id={`item-${it.taskItemId}`}
                      title={`Task ${it.taskCode} / OP ${it.productionOrderCode}`}
                    >
                        <div style={{ fontSize: 12 }}>
                          <Badge color="info" className="mr-1">{it.productionOrderCode}</Badge>
                          <Badge color="dark">{it.taskCode}</Badge>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <strong>{it.productCode}</strong> {it.productName}
                          {it.colorName && <span className="text-muted"> · {it.colorName}</span>}
                        </div>
                        <div className="text-muted" style={{ fontSize: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                          <span>{it.quantity} uds</span>
                          <span>{Math.round((it.estimatedHours || 0) * 60)} min</span>
                        </div>
                    </DraggableCard>
                    <div className="d-flex" style={{ gap: 4, marginTop: 4 }}>
                      <Input
                        type="select"
                        bsSize="sm"
                        value={manualDeskByItem[it.taskItemId] ?? (it.desk ? String(it.desk) : "")}
                        onChange={(e) => setManualDeskByItem((prev) => ({ ...prev, [it.taskItemId]: e.target.value }))}
                        style={{ fontSize: 12 }}
                      >
                        <option value="">Sin mesa</option>
                        {Array.from({ length: numDesks || 12 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>Mesa {d}</option>
                        ))}
                      </Input>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        style={{ fontSize: 12, whiteSpace: "nowrap" }}
                        disabled={
                          assigningItemId === it.taskItemId
                          || String(manualDeskByItem[it.taskItemId] ?? (it.desk ? String(it.desk) : "")) === String(it.desk || "")
                        }
                        onClick={() => handleManualAssign(it.taskItemId)}
                        title="Cambia la mesa de esta tarea sin arrastrar. Mueve las uds. completas de esta línea."
                      >
                        {assigningItemId === it.taskItemId ? "…" : it.desk ? "Cambiar mesa" : "Asignar"}
                      </button>
                    </div>
                  </div>
                ))}
                {(itemsByContainer[c.id] || []).length === 0 && (
                  <div className="text-muted" style={{ fontSize: 12 }}>Arrastra aquí.</div>
                )}
              </DroppableColumn>
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeItem ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 10,
                width: 240,
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ fontSize: 12 }}>
                <Badge color="info" className="mr-1">{activeItem.productionOrderCode}</Badge>
                <Badge color="dark">{activeItem.taskCode}</Badge>
              </div>
              <div style={{ marginTop: 6 }}>
                <strong>{activeItem.productCode}</strong> {activeItem.productName}
                {activeItem.colorName && <span className="text-muted"> · {activeItem.colorName}</span>}
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{activeItem.quantity} uds</span>
                <span>{Math.round((activeItem.estimatedHours || 0) * 60)} min</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
