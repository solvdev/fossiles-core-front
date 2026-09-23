import React, { useMemo, useState } from "react";
import {
  Card, CardHeader, CardBody, Button, Input, Label, FormGroup, Alert, Table, Badge,
} from "reactstrap";
import { planTasksWindow } from "services/taskService";
import DatePickerField from "components/common/DatePickerField";
import { exportRowsToCsv } from "utils/reportExportHelper";
import { formatDateGt, getTodayYmdGuatemala, isWeekendYmd } from "utils/dateTimeHelper";
import { contar, concordar } from "utils/textHelper";
import { showSuccess, showError } from "utils/notificationHelper";

/** Fecha en formato de aquí; formatDateGt devuelve «-» si no hay, y eso no dice nada. */
const diaLegible = (valor) => (valor ? formatDateGt(valor) : "sin fecha");

const CABECERAS_NO_CUPO = [
  { label: "Tarea", value: "taskCode" },
  { label: "Horas", value: "hours" },
  { label: "Se iria al", value: "nextDayCandidate" },
  { label: "Motivo", value: "reason" },
];

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
  const [verNoCupo, setVerNoCupo] = useState(false);

  const finDeSemana = isWeekendYmd(dia);

  /** Las que no cupieron, agrupadas por el día al que se irían: una línea por día, no por tarea. */
  const resumenNoCupo = useMemo(() => {
    const porDia = new Map();
    (resultado?.notPlaced || []).forEach((t) => {
      const clave = t.nextDayCandidate || "";
      const g = porDia.get(clave) || { clave, dia: diaLegible(clave), cuantas: 0, horas: 0 };
      g.cuantas += 1;
      g.horas += Number(t.hours) || 0;
      porDia.set(clave, g);
    });
    // Se ordena por la fecha cruda (yyyy-mm-dd), no por la legible: dd/mm/yyyy ordenaria
    // por dia del mes y pondria el 01/10 antes que el 24/09.
    return [...porDia.values()].sort((a, b) => String(a.clave).localeCompare(String(b.clave)));
  }, [resultado]);

  const descargarNoCupo = () => {
    const filas = (resultado?.notPlaced || []).map((t) => ({
      taskCode: t.taskCode || "",
      hours: t.hours ?? "",
      nextDayCandidate: t.nextDayCandidate || "",
      reason: t.reason || "",
    }));
    if (!filas.length) {
      showError("No hay nada que descargar.");
      return;
    }
    exportRowsToCsv(`no_cupieron_${dia}`, CABECERAS_NO_CUPO, filas);
  };

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
    // Cada reparto arranca con el detalle plegado: si quedara abierto del anterior, el
    // resultado nuevo aparecería enterrado bajo la lista larga.
    setVerNoCupo(false);
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
          {/* Sin `soloHabiles`: el aviso de fin de semana de abajo se conserva para que quien
              llegue con un sábado guardado entienda por qué no puede repartir, en vez de
              encontrarse el día simplemente ausente del calendario. */}
          <DatePickerField value={dia} onChange={setDia} />
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
            {/* Las frenadas por troquel no salen en «Colocadas X de Y»: nunca llegaron a
                competir por mesa, así que no están en selectedTasks ni en notPlaced. Sin
                esta línea el reparto se ve perfecto y las tareas simplemente no aparecen
                en el tablero, sin nada que explique por qué. */}
            {resultado.dieCutBlockedTasks > 0 && (
              <Alert color="info" className="py-2 mt-2 mb-1">
                <strong>{contar(resultado.dieCutBlockedTasks, "tarea")}</strong>
                {concordar(resultado.dieCutBlockedTasks, " se quedó", " se quedaron")} fuera por
                falta de corte. Están en «Por troquelar».
              </Alert>
            )}
            {resultado.notPlacedTasks > 0 && (
              <>
                <Alert color="warning" className="py-2 mt-2 mb-1">
                  <strong>{contar(resultado.notPlacedTasks, "tarea")}</strong>
                  {concordar(resultado.notPlacedTasks, " no cupo", " no cupieron")} en el día.
                  {/* El resumen por día es lo accionable: un reparto puede dejar mil tareas
                      fuera y casi siempre se van todas al mismo día. Ese dato cabe en una
                      línea; la lista tarea por tarea son mil filas que dicen lo mismo. */}
                  {resumenNoCupo.length > 0 && (
                    <div className="mt-1">
                      {resumenNoCupo.map((g) => (
                        <div key={g.clave}>
                          <small>
                            <strong>{g.cuantas}</strong> {concordar(g.cuantas, "pasa", "pasan")} al <strong>{g.dia}</strong>
                            {g.horas > 0 && ` · ${g.horas.toFixed(1)} h en total`}
                          </small>
                        </div>
                      ))}
                      <small className="text-muted">
                        Con más días de horizonte o más mesas activas entran en el reparto.
                      </small>
                    </div>
                  )}
                </Alert>
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <Button color="link" size="sm" className="p-0"
                    onClick={() => setVerNoCupo((v) => !v)}>
                    {verNoCupo ? "Ocultar el detalle" : `Ver una por una (${resultado.notPlacedTasks})`}
                  </Button>
                  <Button color="link" size="sm" className="p-0" onClick={descargarNoCupo}>
                    Descargar CSV
                  </Button>
                </div>
                {/* Con scroll propio y alto fijo: sin esto, mil filas estiran la página entera
                    y el resto del Organizador queda a un scroll de distancia. */}
                {verNoCupo && (
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
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
                            <td><small>{diaLegible(t.nextDayCandidate)}</small></td>
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
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
