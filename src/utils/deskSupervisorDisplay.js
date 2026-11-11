/**
 * Mesa especial (maquila) de la lista que manda el back en `desks-count.specialDesks`.
 * @param {number|string|null|undefined} deskNumber
 * @param {{ desk: number, name?: string, kind?: string }[]|null|undefined} specialDesks
 */
export function findSpecialDesk(deskNumber, specialDesks) {
  const d = Number(deskNumber);
  if (!Number.isFinite(d) || !Array.isArray(specialDesks)) return null;
  return specialDesks.find((s) => Number(s?.desk) === d) || null;
}

/** Nombre corto de la mesa especial, p. ej. «Maquila». */
export function specialDeskName(special) {
  const name = special?.name != null ? String(special.name).trim() : "";
  return name || "Maquila";
}

/**
 * Mesas que se ven en el tablero: las de planta 1..N y después las especiales (maquila).
 * @param {number} numDesks
 * @param {{ desk: number }[]|null|undefined} specialDesks
 * @returns {number[]}
 */
export function deskNumbersWithSpecial(numDesks, specialDesks) {
  const n = Math.max(0, Math.floor(Number(numDesks) || 0));
  const out = Array.from({ length: n }, (_, i) => i + 1);
  (Array.isArray(specialDesks) ? specialDesks : [])
    .map((s) => Number(s?.desk))
    .filter((d) => Number.isFinite(d) && d > n)
    .sort((a, b) => a - b)
    .forEach((d) => {
      if (!out.includes(d)) out.push(d);
    });
  return out;
}

/**
 * @param {number|string|null|undefined} deskNumber
 * @param {Record<number|string, string>|null|undefined} supervisorByDesk mapa mesa -> nombre (trim)
 * @param {{ desk: number, name?: string }[]|null|undefined} [specialDesks] mesas de maquila
 * @returns {string} ej. "Mesa 3", "Mesa 3 (Ana López)" o "Mesa 12 · Maquila (Juan)"
 */
export function deskDisplayLabel(deskNumber, supervisorByDesk, specialDesks) {
  const d = Number(deskNumber);
  if (!Number.isFinite(d) || d < 1) return "";
  const raw = supervisorByDesk?.[d] ?? supervisorByDesk?.[String(d)];
  const name = raw != null ? String(raw).trim() : "";
  const special = findSpecialDesk(d, specialDesks);
  const base = special ? `Mesa ${d} · ${specialDeskName(special)}` : `Mesa ${d}`;
  if (name) return `${base} (${name})`;
  return base;
}

/**
 * @param {number[]} sortedDesks
 * @param {Record<number|string, string>|null|undefined} supervisorByDesk
 */
export function mesasListWithSupervisors(sortedDesks, supervisorByDesk) {
  if (!sortedDesks || sortedDesks.length === 0) return "";
  return sortedDesks
    .map((desk) => {
      const d = Number(desk);
      const raw = supervisorByDesk?.[d] ?? supervisorByDesk?.[String(d)];
      const name = raw != null ? String(raw).trim() : "";
      return name ? `${d} (${name})` : String(d);
    })
    .join(", ");
}

/**
 * Leyenda compacta para impresión: Mesa 1 — Juan · Mesa 2 — …
 * @param {Record<number|string, string>|null|undefined} supervisorByDesk
 * @param {number} numDesks
 */
/**
 * Nombre de encargado para una mesa: API de boleta o mapa ya cargado en pantalla.
 * @param {object|null|undefined} ticket
 * @param {Record<number|string, string>|null|undefined} supervisorByDesk
 */
export function resolveDeskSupervisorNameForTicket(ticket, supervisorByDesk) {
  if (!ticket) return "";
  const fromApi = ticket.deskSupervisorName ?? ticket.desk_supervisor_name;
  if (fromApi != null && String(fromApi).trim()) return String(fromApi).trim();
  if (ticket.desk == null || !supervisorByDesk) return "";
  const raw = supervisorByDesk[ticket.desk] ?? supervisorByDesk[String(ticket.desk)];
  return raw != null ? String(raw).trim() : "";
}

export function buildDeskSupervisorLegendLine(supervisorByDesk, numDesks, specialDesks) {
  const n = Math.max(1, Math.min(Number(numDesks) || 1, 32));
  const parts = [];
  deskNumbersWithSpecial(n, specialDesks).forEach((d) => {
    const raw = supervisorByDesk?.[d] ?? supervisorByDesk?.[String(d)];
    const name = raw != null ? String(raw).trim() : "";
    const special = findSpecialDesk(d, specialDesks);
    const label = special ? `Mesa ${d} (${specialDeskName(special)})` : `Mesa ${d}`;
    parts.push(name ? `${label} — ${name}` : `${label} —`);
  });
  return parts.join(" · ");
}
