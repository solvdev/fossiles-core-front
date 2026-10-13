import React, { useState, useMemo, useCallback } from "react";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  Row, Col, Badge, Input, Label, FormGroup, Alert, Button,
  InputGroup, InputGroupAddon, InputGroupText,
} from "reactstrap";
import DatePickerField from "components/common/DatePickerField";
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
      {/* La cabecera queda fija mientras la columna se desplaza: con la mesa a media altura
          no se sabría a cuál se está arrastrando. */}
      <div
        style={{
          padding: 10,
          borderBottom: "1px solid #eee",
          fontWeight: 700,
          position: "sticky",
          top: 0,
          background: isOver ? "#fff8e1" : "#fafafa",
          borderRadius: "8px 8px 0 0",
          zIndex: 1,
        }}
      >
        {header}
        <Badge color="light" className="ml-2 text-dark">{count}</Badge>
      </div>
      {/* Cada columna se desplaza por dentro. Sin este tope, «Sin asignar» con cientos de
          tarjetas estiraba la fila entera —las columnas de una fila flex crecen hasta la más
          alta— y para ver la mesa 12 había que bajar toda la página primero. */}
      <div
        style={{
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          maxHeight: 560,
          overflowY: "auto",
        }}
      >
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
  /** Fecha de asignación por tarjeta (permite mover a un día rezagado distinto al filtro del tablero). */
  const [manualDateByItem, setManualDateByItem] = useState({});
  const [assigningItemId, setAssigningItemId] = useState(null);
  const [busqueda, setBusqueda] = useState("");

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
    const q = busqueda.trim().toLowerCase();
    containers.forEach((c) => { map[c.id] = []; });
    items.forEach((it) => {
      const key = it.desk ? `desk-${it.desk}` : "unassigned";
      const isSameDate = !date || String(it.scheduledDate || "") === String(date || "");
      // Ítems sin fecha (tareas recién creadas en el organizador) siempre visibles en "Sin asignar".
      const dateless = key === "unassigned" && !it.scheduledDate;
      if (!isSameDate && !dateless) return;
      // El buscador esconde lo que no coincide en vez de resaltarlo: con doce mesas llenas,
      // un resaltado obliga a recorrerlas igual para encontrar el que se pinto.
      if (q) {
        const coincide = [it.taskCode, it.productionOrderCode, it.productCode, it.productName, it.colorName]
          .some((v) => (v || "").toLowerCase().includes(q));
        if (!coincide) return;
      }
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (a.productionOrderCode || "").localeCompare(b.productionOrderCode || "") || (a.productCode || "").localeCompare(b.productCode || ""));
    });
    return map;
  }, [items, containers, date, busqueda]);

  /** Cuántos ítems se están viendo y cuántos hay en total para ese día, con el filtro puesto. */
  const conteoBusqueda = useMemo(() => {
    const visibles = Object.values(itemsByContainer).reduce((n, l) => n + l.length, 0);
    const delDia = items.filter((it) => {
      const key = it.desk ? `desk-${it.desk}` : "unassigned";
      const isSameDate = !date || String(it.scheduledDate || "") === String(date || "");
      return isSameDate || (key === "unassigned" && !it.scheduledDate);
    }).length;
    return { visibles, delDia };
  }, [itemsByContainer, items, date]);

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
   * Asignar/cambiar mesa (+ fecha) sin arrastrar: elige mesa y fecha en la tarjeta.
   * La fecha puede ser un día hábil distinto al filtro del tablero (días rezagados).
   * Mueve las unidades completas de esa línea; "Sin mesa" la regresa a no asignadas.
   */
  const handleManualAssign = useCallback(async (taskItemId) => {
    const it = items.find((x) => Number(x.taskItemId) === Number(taskItemId));
    const raw = manualDeskByItem[taskItemId];
    const targetDesk = raw !== undefined ? (raw ? Number(raw) : null) : (it?.desk || null);
    const targetDate =
      manualDateByItem[taskItemId]
      || it?.scheduledDate
      || date
      || null;
    if (targetDesk && !targetDate) {
      showError("Seleccione la fecha de asignación a la mesa.");
      return;
    }
    if (targetDesk && isWeekendYmd(targetDate)) {
      showError("Solo se trabaja de lunes a viernes: elige una fecha entre semana.");
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
      setManualDateByItem((prev) => {
        const next = { ...prev };
        delete next[taskItemId];
        return next;
      });
      // Si movió a otra fecha, mostrar ese día para que la tarjeta no "desaparezca".
      if (targetDate && setDate && String(targetDate) !== String(date || "")) {
        setDate(String(targetDate).slice(0, 10));
      }
    } finally {
      setAssigningItemId(null);
    }
  }, [manualDeskByItem, manualDateByItem, items, date, setDate, onMove]);

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
            <DatePickerField value={date} onChange={setDate} />
          </FormGroup>
        </Col>
        <Col md="5">
          <FormGroup className="mb-0">
            <Label><small>Buscar en el tablero</small></Label>
            <InputGroup size="sm">
              <InputGroupAddon addonType="prepend">
                <InputGroupText><i className="nc-icon nc-zoom-split" /></InputGroupText>
              </InputGroupAddon>
              <Input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Tarea, OP, producto o color…"
              />
              {busqueda && (
                <InputGroupAddon addonType="append">
                  <Button color="secondary" outline onClick={() => setBusqueda("")} title="Limpiar">×</Button>
                </InputGroupAddon>
              )}
            </InputGroup>
          </FormGroup>
        </Col>
        <Col className="d-flex align-items-end">
          {busqueda ? (
            <small className={conteoBusqueda.visibles === 0 ? "text-danger" : "text-muted"}>
              {conteoBusqueda.visibles === 0
                ? "Nada coincide en esta fecha — pruebe otra fecha o limpie la búsqueda."
                : `Mostrando ${conteoBusqueda.visibles} de ${conteoBusqueda.delDia}`}
            </small>
          ) : (
            activeItem?.taskItemId && <small className="text-muted">Moviendo item #{activeItem.taskItemId}…</small>
          )}
        </Col>
      </Row>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          {/* `flex-start` para que cada columna mida lo suyo: por defecto la fila las estira
              todas a la altura de la más llena, y las mesas vacías quedaban como columnas
              grises de metros de alto. */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
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
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                      {/* Sin `soloHabiles`: aquí se permite a propósito una fecha hábil
                          anterior, para retomar atrasos. */}
                      <DatePickerField
                        value={
                          manualDateByItem[it.taskItemId]
                          ?? (it.scheduledDate ? String(it.scheduledDate).slice(0, 10) : (date || ""))
                        }
                        onChange={(v) => setManualDateByItem((prev) => ({ ...prev, [it.taskItemId]: v }))}
                      />
                      <div className="d-flex" style={{ gap: 4 }}>
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
                          disabled={(() => {
                            if (assigningItemId === it.taskItemId) return true;
                            const chosenDesk = String(
                              manualDeskByItem[it.taskItemId] ?? (it.desk ? String(it.desk) : "")
                            );
                            const currentDesk = String(it.desk || "");
                            const chosenDate = String(
                              manualDateByItem[it.taskItemId]
                              ?? (it.scheduledDate ? String(it.scheduledDate).slice(0, 10) : (date || ""))
                            ).slice(0, 10);
                            const currentDate = String(it.scheduledDate || date || "").slice(0, 10);
                            return chosenDesk === currentDesk && chosenDate === currentDate;
                          })()}
                          onClick={() => handleManualAssign(it.taskItemId)}
                          title="Cambia mesa y/o fecha de esta tarea. Mueve las uds. completas de esta línea."
                        >
                          {assigningItemId === it.taskItemId
                            ? "…"
                            : (it.desk ? "Cambiar" : "Asignar")}
                        </button>
                      </div>
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
