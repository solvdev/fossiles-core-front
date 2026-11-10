/**
 * Orden de colores en las hojas de producción: Negro, Café, Tostado y Whisky siempre primero,
 * en ese orden; después cualquier otro color, alfabético.
 *
 * Se compara sin tildes ni mayúsculas, y por la primera palabra: «Café medio acabado» va con
 * Café (después de «Café» a secas), «NEGRO/CAFE» con Negro y «TOSTADO/CAFE» con Tostado.
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

/** Palabras del color: separa por espacios y por «/» (NEGRO/CAFE, AZUL / DUNA). */
const words = (name) => normalizeColorName(name).split(/[\s/,]+/).filter(Boolean);

/** 0..3 si es uno de los colores prioritarios (o una variante suya), 4 si no. */
export function colorRank(name) {
  const first = words(name)[0];
  const idx = COLOR_PRIORITY.findIndex((keys) => keys.includes(first));
  return idx >= 0 ? idx : COLOR_PRIORITY.length;
}

/** Comparador para `sort`: prioridad, luego el color exacto antes que sus variantes, luego alfabético. */
export function compareColorNames(a, b) {
  const ra = colorRank(a);
  const rb = colorRank(b);
  if (ra !== rb) return ra - rb;
  const ea = words(a).length === 1;
  const eb = words(b).length === 1;
  if (ra < COLOR_PRIORITY.length && ea !== eb) return ea ? -1 : 1;
  return String(a || "").localeCompare(String(b || ""), "es", { sensitivity: "base" });
}
