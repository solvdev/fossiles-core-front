import React, { useState } from "react";
import {
  Card, CardHeader, CardBody, Button, Input, Label, FormGroup, Alert, Table, Badge,
} from "reactstrap";
import { planTasksWindow } from "services/taskService";
import { getTodayYmdGuatemala, isWeekendYmd } from "utils/dateTimeHelper";
import { showSuccess, showError } from "utils/notificationHelper";

/**
 * Cola del día: el usuario elige el ORDEN en que se reparten las órdenes y PARA QUÉ DÍA;
 * el sistema decide a qué mesa va cada tarea.
 *
 * Lo que no se marca entra igual, detrás de lo marcado: el reparto toma todas las tareas
 * pendientes y lo único que viaja desde aquí es el mapa de prioridades.
 *
 * No hay selector de mesa a propósito. Dejar que la eligieran era lo que causaba el
 * conflicto entre los operarios y el auxiliar de producción.
 */
export default function DayQueuePanel({ marcadas, onQuitar, onLimpiar, onDistribuido }) {
  const [dia, setDia] = useState(getTodayYmdGuatemala());
  const [horizonte, setHorizonte] = useState(2);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const finDeSemana = isWeekendYmd(dia);

  const distribuir = async () => {
    if (!dia) {
      showError("Elija el día que va a producirse.");
      return;
    }
    if (finDeSemana) {
      showError("Sábado y domingo no se produce: elija un día hábil.");
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const prioridades = {};
      // Arranca en 2 porque 0 y 1 son cupos reservados de venta en línea y kiosko, y se
      // corta en 99: el backend descarta en silencio lo que salga de ese rango.
      marcadas.forEach((o, idx) => { prioridades[String(o.id)] = Math.min(idx + 2, 99); });

      const r = await planTasksWindow(dia, horizonte, prioridades);
      setResultado(r);
      showSuccess(r?.message || "Distribución completada.");
      if (onDistribuido) await onDistribuido();
    } catch (err) {
      showError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card style={{ border: "1px solid #b8daff" }}>
      <CardHeader style={{ backgroundColor: "#eaf4ff", padding: "8px 16px" }}>
        <strong style={{ fontSize: 14 }}>Cola del día ({marcadas.length})</strong>
        <small className="text-muted d-block">
          Usted elige el orden y el día. La mesa la elige el sistema.
        </small>
      </CardHeader>
      <CardBody className="py-2">
        <FormGroup>
          <Label><small>Día de producción</small></Label>
          <Input
            type="date"
            bsSize="sm"
            value={dia}
            onChange={(e) => setDia(e.target.value)}
          />
          {finDeSemana && (
            <small className="text-danger">Sábado y domingo no se produce.</small>
          )}
        </FormGroup>

        <FormGroup>
          <Label><small>Días hacia adelante que puede usar</small></Label>
          <Input
            type="select"
            bsSize="sm"
            value={horizonte}
            onChange={(e) => setHorizonte(Number(e.target.value))}
          >
            <option value={1}>Solo ese día</option>
            <option value={2}>Ese día y el siguiente</option>
            <option value={5}>Hasta cinco días</option>
          </Input>
        </FormGroup>

        {marcadas.length === 0 ? (
          <Alert color="light" className="py-2 mb-2">
            Marque órdenes en el listado de la izquierda para que se repartan primero.
            El resto se distribuye igual, detrás, en el orden que ya tiene.
          </Alert>
        ) : (
          <>
            <Table size="sm" className="mb-2">
              <tbody>
                {marcadas.map((o, idx) => (
                  <tr key={o.id}>
                    <td style={{ width: 28 }}><Badge color="secondary">{idx + 1}</Badge></td>
                    <td><small>{o.code}</small></td>
                    <td className="text-right">
                      <Button
                        color="link" size="sm" className="p-0 text-danger"
                        onClick={() => onQuitar(o.id)}
                      >
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Button color="link" size="sm" className="p-0 mb-2" onClick={onLimpiar}>
              Limpiar la cola
            </Button>
          </>
        )}

        <Button
          color="primary"
          block
          disabled={enviando || finDeSemana}
          onClick={distribuir}
        >
          {enviando ? "Distribuyendo…" : "Distribuir el día"}
        </Button>

        {resultado && (
          <div className="mt-3">
            <div className="d-flex justify-content-between">
              <small className="text-muted">Colocadas</small>
              <strong>{resultado.placedTasks} de {resultado.selectedTasks}</strong>
            </div>
            {resultado.notPlacedTasks > 0 && (
              <>
                <Alert color="warning" className="py-2 mt-2 mb-1">
                  <strong>{resultado.notPlacedTasks} no cupo/cupieron.</strong>
                </Alert>
                <Table size="sm" responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Tarea</th>
                      <th>Horas</th>
                      <th>Se iría al</th>
                      <th>Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.notPlaced.map((t) => (
                      <tr key={t.taskId}>
                        <td><small>{t.taskCode}</small></td>
                        <td><small>{t.hours}</small></td>
                        <td><small>{t.nextDayCandidate || "—"}</small></td>
                        <td>
                          <small className="text-muted">{t.reason}</small>
                          {t.keepsDesk != null && (
                            <Badge color="info" className="ml-1">Mesa {t.keepsDesk}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
