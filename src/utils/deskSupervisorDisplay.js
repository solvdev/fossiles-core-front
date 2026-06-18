/**
 * @param {number|string|null|undefined} deskNumber
 * @param {Record<number|string, string>|null|undefined} supervisorByDesk mapa mesa -> nombre (trim)
 * @returns {string} ej. "Mesa 3" o "Mesa 3 (Ana López)"
 */
export function deskDisplayLabel(deskNumber, supervisorByDesk) {
  const d = Number(deskNumber);
  if (!Number.isFinite(d) || d < 1) return "";
  const raw = supervisorByDesk?.[d] ?? supervisorByDesk?.[String(d)];
  const name = raw != null ? String(raw).trim() : "";
  if (name) return `Mesa ${d} (${name})`;
  return `Mesa ${d}`;
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

export function buildDeskSupervisorLegendLine(supervisorByDesk, numDesks) {
  const n = Math.max(1, Math.min(Number(numDesks) || 1, 32));
  const parts = [];
  for (let d = 1; d <= n; d++) {
    const raw = supervisorByDesk?.[d] ?? supervisorByDesk?.[String(d)];
    const name = raw != null ? String(raw).trim() : "";
    parts.push(name ? `Mesa ${d} — ${name}` : `Mesa ${d} —`);
  }
  return parts.join(" · ");
}
