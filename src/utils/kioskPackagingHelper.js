export function isPackagingProductCode(code) {
  return String(code || "").trim().toUpperCase().startsWith("SUM");
}
