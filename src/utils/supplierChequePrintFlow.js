import { getChequePrintData, markChequesPrinted } from "services/supplierPaymentService";
import { openPayrollPrintWindow } from "./payrollPrintHtml";
import { buildSupplierChequesHtml, sameChequePaper } from "./supplierChequePrintHtml";

/**
 * Imprime los cheques de los pagos indicados y, si el navegador abrió la ventana de impresión, los marca como
 * impresos. Devuelve la lista de pagos actualizada. Lanza un Error con un mensaje para el usuario si algo falla.
 */
export async function printSupplierCheques(ids) {
  const items = await getChequePrintData(ids);
  if (items.length === 0) {
    throw new Error("No hay cheques para imprimir.");
  }
  if (!sameChequePaper(items)) {
    throw new Error("Los cheques elegidos usan formatos de distinto tamaño. Imprímalos por separado.");
  }
  if (!openPayrollPrintWindow(buildSupplierChequesHtml(items))) {
    throw new Error("El navegador bloqueó la ventana de impresión. Permita las ventanas emergentes e intente de nuevo.");
  }
  return markChequesPrinted(items.map((item) => item.paymentId));
}
