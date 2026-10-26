/**
 * Monto en letras para cheques y vouchers, como en los formatos actuales:
 * "SIETE MIL DOSCIENTOS QUETZALES EXACTOS" o "MIL SETECIENTOS VEINTIOCHO QUETZALES CON 40/100".
 * Trabaja en centavos enteros para no arrastrar errores de punto flotante.
 */

const UNITS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TEENS = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const TWENTIES = ["VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const TENS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function belowHundred(n) {
  if (n < 10) return UNITS[n];
  if (n < 20) return TEENS[n - 10];
  if (n < 30) return TWENTIES[n - 20];
  const unit = n % 10;
  return unit ? `${TENS[Math.floor(n / 10)]} Y ${UNITS[unit]}` : TENS[Math.floor(n / 10)];
}

function belowThousand(n) {
  if (n === 100) return "CIEN";
  const hundred = HUNDREDS[Math.floor(n / 100)];
  const rest = belowHundred(n % 100);
  return [hundred, rest].filter(Boolean).join(" ");
}

/** "UNO" se apocopa delante de un sustantivo: VEINTIUN MIL, CIENTO UN QUETZALES. */
const apocope = (words) => words.replace(/UNO$/, "UN");

export function integerToWords(value) {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return "CERO";
  const millions = Math.floor(n / 1000000);
  const thousands = Math.floor((n % 1000000) / 1000);
  const rest = n % 1000;
  const parts = [];
  if (millions > 0) {
    parts.push(millions === 1 ? "UN MILLON" : `${apocope(integerToWords(millions))} MILLONES`);
  }
  if (thousands > 0) {
    parts.push(thousands === 1 ? "MIL" : `${apocope(belowThousand(thousands))} MIL`);
  }
  if (rest > 0) {
    parts.push(belowThousand(rest));
  }
  return parts.join(" ");
}

export function amountInWordsQ(amount) {
  const totalCents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(totalCents) || totalCents < 0) return "";
  const whole = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const exactMillions = whole >= 1000000 && whole % 1000000 === 0;
  const words = apocope(integerToWords(whole)) + (exactMillions ? " DE" : "");
  const currency = whole === 1 ? "QUETZAL" : "QUETZALES";
  if (cents === 0) {
    return `${words} ${currency} ${whole === 1 ? "EXACTO" : "EXACTOS"}`;
  }
  return `${words} ${currency} CON ${String(cents).padStart(2, "0")}/100`;
}
