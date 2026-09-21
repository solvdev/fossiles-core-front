/**
 * Jornada del centro de producción: lunes a viernes, 07:00–17:00, con almuerzo
 * de 13:00 a 14:00. Nueve horas efectivas al día.
 *
 * El sistema antes solo conocía el almuerzo, así que una tarea de 5 h iniciada a
 * las 14:00 daba entrega "hoy a las 19:00", dos horas después de que la gente se
 * fue, y su tiempo real se calculaba restando fechas: de las 14:00 del lunes a
 * las 09:00 del martes salían 19 horas cuando el trabajo fueron 5.
 *
 * Estas constantes tienen un espejo en el backend
 * (`infrastructure/util/ProductionShift.java`). Si cambia el horario hay que
 * tocar los dos.
 */
export const SHIFT_START_MINUTES = 7 * 60;
export const SHIFT_END_MINUTES = 17 * 60;
export const LUNCH_START_MINUTES = 13 * 60;
export const LUNCH_END_MINUTES = 14 * 60;

/** Tramos trabajables de un día laboral, en minutos desde medianoche. */
const WORK_WINDOWS = [
  [SHIFT_START_MINUTES, LUNCH_START_MINUTES],
  [LUNCH_END_MINUTES, SHIFT_END_MINUTES],
];

/** Minutos efectivos de una jornada completa (540 = 9 h). */
export const WORK_MINUTES_PER_DAY = WORK_WINDOWS.reduce((s, [a, b]) => s + (b - a), 0);

/**
 * Tope de días recorridos: protege de fechas corruptas que harían un bucle largo.
 * `addWorkingTime` lo multiplica porque puede dar varias vueltas por día (saltar el
 * fin de semana, abrir la jornada, saltar el almuerzo) antes de consumir tiempo.
 */
const MAX_DIAS = 400;

function aFecha(valor) {
  if (valor == null) return null;
  const d = valor instanceof Date ? new Date(valor.getTime()) : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sábado y domingo no son jornada. Mismo criterio que el planificador del backend. */
export function esDiaLaboral(fecha) {
  const dia = fecha.getDay();
  return dia !== 0 && dia !== 6;
}

function minutosDelDia(fecha) {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

function irAInicioDeJornada(cursor) {
  cursor.setDate(cursor.getDate() + 1);
  cursor.setHours(0, SHIFT_START_MINUTES, 0, 0);
}

/**
 * Formatea duración de producción desde horas decimales.
 * ≥ 60 min → horas (`1h`, `1h 30m`); &lt; 60 min → solo minutos (`45 min`).
 */
export function formatProductionDuration(hours) {
  const totalMin = Math.round(Number(hours) * 60);
  if (!Number.isFinite(totalMin)) return "—";
  if (totalMin <= 0) return "0 min";
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Suma horas de trabajo a un inicio respetando la jornada: salta el almuerzo, el
 * cierre a las 17:00 y el fin de semana.
 *
 * Ejemplo: martes 14:00 + 5 h → miércoles 10:00, porque solo quedan 3 h de ese
 * día y las 2 restantes caen al siguiente desde las 07:00.
 */
export function addWorkingTime(startDate, hours) {
  const cursor = aFecha(startDate);
  if (!cursor) return null;

  let restante = Math.round(Number(hours) * 60);
  if (!Number.isFinite(restante) || restante <= 0) return cursor;

  let vueltas = 0;
  while (restante > 0 && vueltas++ < MAX_DIAS * 4) {
    if (!esDiaLaboral(cursor)) {
      irAInicioDeJornada(cursor);
      continue;
    }

    const minuto = minutosDelDia(cursor);

    if (minuto < SHIFT_START_MINUTES) {
      cursor.setHours(0, SHIFT_START_MINUTES, 0, 0);
      continue;
    }
    if (minuto >= LUNCH_START_MINUTES && minuto < LUNCH_END_MINUTES) {
      cursor.setHours(0, LUNCH_END_MINUTES, 0, 0);
      continue;
    }
    if (minuto >= SHIFT_END_MINUTES) {
      irAInicioDeJornada(cursor);
      continue;
    }

    const finDelTramo = minuto < LUNCH_START_MINUTES ? LUNCH_START_MINUTES : SHIFT_END_MINUTES;
    const disponible = finDelTramo - minuto;

    if (restante <= disponible) {
      cursor.setTime(cursor.getTime() + restante * 60000);
      restante = 0;
    } else {
      restante -= disponible;
      cursor.setHours(0, finDelTramo, 0, 0);
    }
  }

  return cursor;
}

/**
 * Minutos de jornada transcurridos entre dos momentos: suma lo que cae dentro de
 * los tramos trabajables y descarta noches, almuerzos y fines de semana.
 *
 * Es la operación inversa de {@link addWorkingTime} y la que da el tiempo real de
 * una tarea a partir de su inicio y su fin, sin necesidad de registrar nada más.
 *
 * Ojo: mide de punta a punta. Una tarea que queda abierta sin que nadie la trabaje
 * suma igual, porque no se guardan tramos de trabajo. Y no hay estado de pausa:
 * devolver la tarea a PENDING borra la hora de inicio, así que lo hecho antes se
 * pierde en vez de sumarse.
 */
export function workingMinutesBetween(start, end) {
  const desde = aFecha(start);
  const hasta = aFecha(end);
  if (!desde || !hasta || hasta <= desde) return 0;

  let totalMs = 0;
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  let vueltas = 0;

  while (cursor <= hasta && vueltas++ < MAX_DIAS) {
    if (esDiaLaboral(cursor)) {
      for (const [ini, fin] of WORK_WINDOWS) {
        const tramoIni = new Date(cursor);
        tramoIni.setHours(0, ini, 0, 0);
        const tramoFin = new Date(cursor);
        tramoFin.setHours(0, fin, 0, 0);

        const a = desde > tramoIni ? desde : tramoIni;
        const b = hasta < tramoFin ? hasta : tramoFin;
        // Se acumulan milisegundos y se convierte una sola vez al final: redondear
        // tramo a tramo desviaba el total respecto al espejo de Java.
        if (b > a) totalMs += b - a;
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return Math.floor(totalMs / 60000);
}
