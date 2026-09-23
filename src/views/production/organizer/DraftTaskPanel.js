import React from "react";
import {
  Card, CardBody, CardHeader, CardTitle, Table, Badge, Button, Progress,
  Input, FormGroup, Label, Row, Col,
} from "reactstrap";
import DatePickerField from "components/common/DatePickerField";
import { MAX_HOURS_PER_DESK, MAX_HOURS_PER_TASK_HARD_CAP } from "utils/taskHoursHelper";
import { isWeekendYmd } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";

function hoursLabel(hours) {
  const minutes = Math.round((hours || 0) * 60);
  return minutes >= 60
    ? `${(hours || 0).toFixed(2)} h`
    : `${minutes} min`;
}

/**
 * Tarea borrador (carrito): líneas agregadas desde el buscador de OPs,
 * barra de cupo de 4 horas (OPL / extras no cuentan) y creación de la tarea.
 */
export default function DraftTaskPanel({
  lines,
  baseHours,
  totalHours,
  baseOrder,
  overCapacity,
  overIdeal,
  onRemove,
  onClear,
  onCreate,
  creating,
  scheduledDate,
  setScheduledDate,
  observations,
  setObservations,
}) {
  const capacityPct = Math.min((baseHours / MAX_HOURS_PER_TASK_HARD_CAP) * 100, 100);
  const idealMarkerPct = (MAX_HOURS_PER_DESK / MAX_HOURS_PER_TASK_HARD_CAP) * 100;
  const capacityColor = overCapacity ? "danger" : overIdeal ? "warning" : "success";
  const extraHours = Math.max(totalHours - baseHours, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle tag="h5" className="mb-0">
          Tarea borrador
          {baseOrder && (
            <Badge color="info" className="ml-2">{baseOrder.code}</Badge>
          )}
        </CardTitle>
        <small className="text-muted">
          Ideal {MAX_HOURS_PER_DESK}h por tarea, máximo {MAX_HOURS_PER_TASK_HARD_CAP}h. Las OPL no cuentan contra el cupo.
        </small>
      </CardHeader>
      <CardBody>
        <div className="mb-1 d-flex justify-content-between">
          <small>
            Carga base: <strong>{baseHours.toFixed(2)} h</strong> / ideal {MAX_HOURS_PER_DESK} h · máx {MAX_HOURS_PER_TASK_HARD_CAP} h
          </small>
          {extraHours > 0 && (
            <small className="text-muted">+ {extraHours.toFixed(2)} h OPL (sin cupo)</small>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <Progress color={capacityColor} value={capacityPct} className="mb-3" style={{ height: 10 }} />
          <div
            title={`Ideal: ${MAX_HOURS_PER_DESK} h`}
            style={{
              position: "absolute",
              left: `${idealMarkerPct}%`,
              top: 0,
              bottom: 12,
              width: 2,
              background: "rgba(0,0,0,0.35)",
            }}
          />
        </div>
        {overCapacity ? (
          <div className="text-danger mb-2" style={{ fontSize: 12 }}>
            La carga base (solo OP) excede el máximo de {MAX_HOURS_PER_TASK_HARD_CAP}h. Quite productos de OP.
          </div>
        ) : overIdeal ? (
          <div className="text-warning mb-2" style={{ fontSize: 12 }}>
            Por encima de lo ideal ({MAX_HOURS_PER_DESK}h) pero dentro del máximo permitido ({MAX_HOURS_PER_TASK_HARD_CAP}h).
          </div>
        ) : null}

        {lines.length === 0 ? (
          <div className="text-muted text-center py-4" style={{ fontSize: 13 }}>
            Todavía no hay productos. Búscalos a la izquierda y presiona “Agregar”.
          </div>
        ) : (
          <Table size="sm" responsive className="mb-3">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-center">Uds</th>
                <th className="text-center">Tiempo</th>
                <th className="text-center">Cupo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.productionOrderItemId} style={(l.daySaleExtra || l.onlineSale) ? { background: "#f1f8e9" } : undefined}>
                  <td>
                    <div style={{ fontSize: 12 }}>
                      <Badge color="light" className="text-dark mr-1">{l.productionOrderCode}</Badge>
                    </div>
                    <strong>{l.productCode}</strong> {l.productName}
                    {l.colorName && <span className="text-muted"> · {l.colorName}</span>}
                    {l.quantity < l.remainingQuantity && (
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        Parcial: {l.quantity} de {l.remainingQuantity} restantes
                      </div>
                    )}
                  </td>
                  <td className="text-center">{l.quantity}</td>
                  <td className="text-center" style={{ whiteSpace: "nowrap" }}>{hoursLabel(l.hours)}</td>
                  <td className="text-center">
                    {l.onlineSale || l.daySaleExtra ? (
                      <Badge color="success" title="OPL: no cuenta contra el cupo de mesa" style={{ fontSize: 10 }}>
                        Sin cupo
                      </Badge>
                    ) : (
                      <span className="text-muted">Base</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Button close title="Quitar" onClick={() => onRemove(l.productionOrderItemId)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <Row>
          <Col md="12">
            <FormGroup>
              {/* No hay selector de mesa a propósito: el humano elige qué y cuándo, el
                  sistema elige dónde. Dejar elegir mesa aquí es lo que causaba el
                  conflicto entre los operarios y el auxiliar. */}
              <Label><small>Día de trabajo</small></Label>
              {/* El calendario ya no deja elegir fin de semana, pero la guarda se queda:
                  protege de un valor que llegue por otro camino. */}
              <DatePickerField
                value={scheduledDate}
                soloHabiles
                onChange={(v) => {
                  if (isWeekendYmd(v)) {
                    showError("Solo se trabaja de lunes a viernes: elige una fecha entre semana.");
                    return;
                  }
                  setScheduledDate(v);
                }}
              />
            </FormGroup>
          </Col>
        </Row>
        <FormGroup>
          <Label><small>Observaciones (opcional)</small></Label>
          <Input
            type="textarea"
            bsSize="sm"
            rows={2}
            maxLength={500}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
          />
        </FormGroup>

        <div className="d-flex justify-content-between">
          <Button size="sm" color="secondary" outline onClick={onClear} disabled={lines.length === 0 || creating}>
            Vaciar
          </Button>
          <Button
            size="sm"
            color="success"
            disabled={lines.length === 0 || overCapacity || creating}
            onClick={onCreate}
          >
            {creating ? "Creando…" : "Crear tarea"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
