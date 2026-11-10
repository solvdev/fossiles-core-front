import React, { useMemo, useState } from "react";
import { Card, CardBody, Table, Badge, Button, Input, Label, FormGroup, Alert, Row, Col } from "reactstrap";
import { formatProductionDuration } from "utils/productionTimeHelper";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";

const INITIAL_VISIBLE = 30;
const LOAD_MORE_STEP = 30;

/** Días hábiles transcurridos desde la fecha programada. Sábado y domingo no cuentan. */
function diasHabilesDesde(ymd) {
  if (!ymd) return null;
  const desde = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  const hoy = new Date(`${getTodayYmdGuatemala()}T00:00:00`);
  if (Number.isNaN(desde.getTime()) || hoy <= desde) return 0;
  let dias = 0;
  const cursor = new Date(desde);
  while (cursor < hoy) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) dias += 1;
  }
  return dias;
}

function formatFecha(ymd) {
  if (!ymd) return "—";
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function productosDe(task) {
  const items = task.items || [];
  if (!items.length) return task.productCode || "—";
  const codigos = items.map((i) => i.productCode).filter(Boolean);
  if (!codigos.length) return "—";
  return codigos.length > 2
    ? `${codigos.slice(0, 2).join(", ")} +${codigos.length - 2} más`
    : codigos.join(", ");
}

/**
 * Tareas que se empezaron un día anterior y siguen abiertas.
 *
 * A las 17:00 la gente se va y lo que quedó en IN_PROGRESS se arrastra. El backlog de
 * "Pendientes" filtra `status = 'PENDING'` en igualdad estricta, así que estas tareas no
 * salían en ninguna pantalla del Organizador: son las que el auxiliar no encuentra.
 *
 * No llevan botón de reprogramar a propósito: una tarea ya empezada se termina donde está.
 * Casi todas conservan su mesa —solo se limpia al completarse o al pasar a bodega—, pero
 * puede venir nula si se redujo el número de mesas. El encargado se deriva de la mesa y la
 * fecha, y hoy solo se materializa en la boleta impresa.
 */
export default function UnfinishedTasks({ unfinished, loading, onReload }) {
  const [filtro, setFiltro] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return unfinished;
    return unfinished.filter((t) => {
      const texto = [
        t.code,
        t.productionOrderCode,
        t.productCode,
        t.productName,
        ...(t.items || []).map((i) => `${i.productCode || ""} ${i.productName || ""}`),
      ].join(" ").toLowerCase();
      return texto.includes(q);
    });
  }, [unfinished, filtro]);

  const visibles = filtradas.slice(0, visibleCount);
  const restantes = Math.max(0, filtradas.length - visibleCount);

  return (
    <Card style={{ border: "1px solid #e0e0e0" }}>
      <CardBody>
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <h5 className="mb-1">Tareas no terminadas</h5>
            <p className="text-muted mb-0" style={{ fontSize: 13 }}>
              Se empezaron un día anterior y siguen abiertas. Casi todas conservan su
              mesa, así que son lo primero que se retoma.
            </p>
          </div>
          <Button color="info" size="sm" outline onClick={onReload} disabled={loading}>
            {loading ? "Cargando…" : "Actualizar"}
          </Button>
        </div>

        {unfinished.length === 0 && !loading ? (
          <Alert color="success" className="py-2 mb-0">
            No hay tareas abiertas de días anteriores.
          </Alert>
        ) : (
          <>
            <Row className="mb-2">
              <Col md="6">
                <FormGroup className="mb-0">
                  <Label><small>Buscar por tarea, OP o producto</small></Label>
                  <Input
                    bsSize="sm"
                    value={filtro}
                    placeholder="Ej. TK-03367, OPK-16…"
                    onChange={(e) => {
                      setFiltro(e.target.value);
                      setVisibleCount(INITIAL_VISIBLE);
                    }}
                  />
                </FormGroup>
              </Col>
            </Row>

            <small className="text-muted d-block mb-2">
              Mostrando {Math.min(visibleCount, filtradas.length)} de {filtradas.length}
              {filtradas.length !== unfinished.length ? ` (filtro / ${unfinished.length})` : ""}
            </small>

            <Table responsive size="sm">
              <thead className="text-primary">
                <tr>
                  <th>Tarea</th>
                  <th>OP</th>
                  <th>Productos</th>
                  <th>Mesa</th>
                  <th>Programada</th>
                  <th>Abierta</th>
                  <th>Estimado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((t) => {
                  const dias = diasHabilesDesde(t.scheduledDate);
                  return (
                    <tr key={t.id}>
                      <td>
                        <Badge
                          color="light"
                          className="text-dark border"
                          style={{ fontWeight: 600, fontSize: 11 }}
                        >
                          {t.code}
                        </Badge>
                      </td>
                      <td><small>{t.productionOrderCode || "—"}</small></td>
                      <td><small>{productosDe(t)}</small></td>
                      <td>
                        {t.desk ? (
                          <Badge color="info">Mesa {t.desk}</Badge>
                        ) : (
                          <small className="text-muted">Sin mesa</small>
                        )}
                      </td>
                      <td><small>{formatFecha(t.scheduledDate)}</small></td>
                      <td>
                        {dias > 0 ? (
                          <Badge color={dias > 3 ? "danger" : "warning"}>
                            {dias} día{dias === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <small className="text-muted">—</small>
                        )}
                      </td>
                      <td>
                        {/* formatProductionDuration recibe HORAS, no minutos. */}
                        <small>
                          {t.estimatedHours ? formatProductionDuration(t.estimatedHours) : "—"}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>

            {restantes > 0 && (
              <div className="text-center">
                <Button
                  color="secondary"
                  size="sm"
                  outline
                  onClick={() => setVisibleCount((v) => v + LOAD_MORE_STEP)}
                >
                  Cargar {Math.min(LOAD_MORE_STEP, restantes)} más
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
