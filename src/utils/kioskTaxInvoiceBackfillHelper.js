import { getLocations } from "services/locationService";
import { getMyKioskSales } from "services/kioskPosService";
import {
  backfillKioskSaleTaxInvoices,
  countMissingKioskSaleTaxInvoices,
  createDraftTaxInvoiceFromKioskSale,
} from "services/taxInvoiceService";

const isEndpointMissing = (err) => {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("static resource")
    || msg.includes("not found")
    || msg.includes("404")
    || msg.includes("no se pudo contar")
    || msg.includes("no se pudieron generar")
  );
};

const saleMissingTaxInvoice = (sale) => {
  if (String(sale?.status || "").toUpperCase() === "VOID") return false;
  if (sale?.invoice?.id) return false;
  if (sale?.invoiceId) return false;
  return true;
};

const loadKioskSales = async ({ kioskLocationId, fromDate, toDate }) => {
  if (kioskLocationId) {
    const rows = await getMyKioskSales(fromDate, toDate, kioskLocationId);
    return Array.isArray(rows) ? rows : [];
  }

  const locations = await getLocations();
  const kiosks = (locations || []).filter(
    (loc) => String(loc.categoria || "").toUpperCase() === "KIOSKO"
  );
  const batches = await Promise.all(
    kiosks.map((kiosk) => getMyKioskSales(fromDate, toDate, kiosk.id))
  );
  return batches.flatMap((rows) => (Array.isArray(rows) ? rows : []));
};

const buildClientPreview = (missing, dryRun, extra = {}) => ({
  dryRun,
  candidates: missing.length,
  created: 0,
  skipped: 0,
  failed: 0,
  errors: [],
  samples: missing.slice(0, 50).map((sale) => ({
    saleId: sale.id,
    saleNumber: sale.saleNumber,
    internalNumber: sale.internalNumber || sale.invoice?.internalNumber || null,
    status: sale.invoice?.status || sale.felStatus || null,
    message: dryRun ? "Pendiente de crear borrador" : extra.message || "—",
  })),
  clientSideFallback: true,
  ...extra,
});

export const countMissingKioskSaleTaxInvoicesWithFallback = async (params = {}) => {
  try {
    return await countMissingKioskSaleTaxInvoices(params);
  } catch (err) {
    if (!isEndpointMissing(err)) throw err;
    const sales = await loadKioskSales(params);
    const missing = sales.filter(saleMissingTaxInvoice);
    return buildClientPreview(missing, true);
  }
};

export const backfillKioskSaleTaxInvoicesWithFallback = async (params = {}) => {
  try {
    return await backfillKioskSaleTaxInvoices(params);
  } catch (err) {
    if (!isEndpointMissing(err)) throw err;
  }

  const sales = await loadKioskSales(params);
  const missing = sales.filter(saleMissingTaxInvoice);
  let created = 0;
  let failed = 0;
  const errors = [];
  const samples = [];

  for (const sale of missing) {
    try {
      const invoice = await createDraftTaxInvoiceFromKioskSale(sale.id);
      created += 1;
      if (samples.length < 50) {
        samples.push({
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          invoiceId: invoice?.id,
          internalNumber: invoice?.internalNumber,
          status: invoice?.status,
          message: "Borrador creado (fallback)",
        });
      }
    } catch (draftErr) {
      failed += 1;
      const line = `Venta ${sale.saleNumber || sale.id}: ${draftErr.message || "Error"}`;
      if (errors.length < 100) errors.push(line);
      if (samples.length < 50) {
        samples.push({
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          message: draftErr.message || "Error",
        });
      }
      if (isEndpointMissing(draftErr) && created === 0 && failed === 1) {
        throw new Error(
          "El servidor aún no tiene los endpoints de backfill. Despliega la última versión de fossiles-core-back."
        );
      }
    }
  }

  return {
    dryRun: false,
    candidates: missing.length,
    created,
    skipped: 0,
    failed,
    errors,
    samples,
    clientSideFallback: true,
  };
};
