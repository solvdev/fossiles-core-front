/**
 * Cuenta y sustantivo concordados: «1 producto», «3 productos».
 *
 * Evita el «producto(s)» que aparecía en los avisos, que además de leerse mal obliga al
 * lector a resolver el plural por su cuenta.
 *
 * @param {number} n
 * @param {string} singular
 * @param {string} [plural] solo para los que no hacen el plural con «s» (mes → meses)
 */
export const contar = (n, singular, plural) =>
  `${n} ${n === 1 ? singular : plural || `${singular}s`}`;

/** Concuerda el verbo con la cuenta: `verbo(2, "pasa", "pasan")` → «pasan». */
export const concordar = (n, singular, plural) => (n === 1 ? singular : plural);
