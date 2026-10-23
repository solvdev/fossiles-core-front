/**
 * Orden de colores en las hojas de producción: Negro, Café, Tostado y Whisky siempre primero,
 * en ese orden; después cualquier otro color, alfabético.
 *
 * Se compara sin tildes ni mayúsculas, y por la primera palabra: «Café medio acabado» va con
 * Café (después de «Café» a secas) y «Negro mate» con Negro.
 */
const COLOR_PRIORITY = [
  ["negro", "negra"],
  ["cafe"],
  ["tostado"],
  ["whisky", "whiskey"],
];

export function normalizeColorName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

/** 0..3 si es uno de los colores prioritarios (o una variante suya), 4 si no. */
export function colorRank(name) {
  const norm = normalizeColorName(name);
  const first = norm.split(/\s+/)[0];
  const idx = COLOR_PRIORITY.findIndex((keys) => keys.includes(first));
  return idx >= 0 ? idx : COLOR_PRIORITY.length;
}

/** Comparador para `sort`: prioridad, luego el color exacto antes que sus variantes, luego alfabético. */
export function compareColorNames(a, b) {
  const ra = colorRank(a);
  const rb = colorRank(b);
  if (ra !== rb) return ra - rb;
  const na = normalizeColorName(a);
  const nb = normalizeColorName(b);
  const ea = na.split(/\s+/).length === 1;
  const eb = nb.split(/\s+/).length === 1;
  if (ra < COLOR_PRIORITY.length && ea !== eb) return ea ? -1 : 1;
  return String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base" });
}
