/** Helpers de Contabilidad > Rentas: kioscos y otras (oficina, bodega, otro). */

export const RENT_TYPE = { KIOSK: "KIOSK", OTHER: "OTHER" };

export const OTHER_CATEGORIES = [
  { key: "OFICINA", label: "Oficina" },
  { key: "BODEGA", label: "Bodega" },
  { key: "OTRO", label: "Otro" },
];

export const TYPE_FILTERS = [
  { key: "ALL", label: "Todas" },
  { key: "KIOSK", label: "Kioscos" },
  { key: "OTHER", label: "Otras" },
];

export const TYPE_LABEL = {
  KIOSK: "Kiosco",
  OFICINA: "Oficina",
  BODEGA: "Bodega",
  OTRO: "Otro",
};

export const EMPTY_OTHER_FORM = {
  name: "",
  category: "OFICINA",
  description: "",
  landlordName: "",
  monthlyAmount: "",
  paymentDay: "",
  contractStart: "",
  contractEnd: "",
  note: "",
};

export const rentTypeOf = (row) => (row?.rentType === RENT_TYPE.OTHER ? RENT_TYPE.OTHER : RENT_TYPE.KIOSK);

export const isOtherRent = (row) => rentTypeOf(row) === RENT_TYPE.OTHER;

export const rowKey = (row) => (isOtherRent(row) ? `other-${row.rentId}` : `kiosk-${row.locationId}`);

export const typeBadgeLabel = (row) => (isOtherRent(row) ? TYPE_LABEL[row.category] || TYPE_LABEL.OTRO : TYPE_LABEL.KIOSK);

export const typeBadgeKey = (row) => (isOtherRent(row) ? row.category || "OTRO" : "KIOSK");

export const matchesTypeFilter = (row, typeFilter) => {
  if (!typeFilter || typeFilter === "ALL") return true;
  return rentTypeOf(row) === typeFilter;
};

export const otherFormFromRow = (row) => ({
  name: row?.name || "",
  category: OTHER_CATEGORIES.some((c) => c.key === row?.category) ? row.category : "OFICINA",
  description: row?.description || "",
  landlordName: row?.landlordName || "",
  monthlyAmount: row?.monthlyRent ?? "",
  paymentDay: row?.paymentDay || "",
  contractStart: row?.contractStart || "",
  contractEnd: row?.contractEnd || "",
  note: row?.note || "",
});

export function validateOtherRentForm(form) {
  if (!(form.name || "").trim()) return "Indique el nombre de la renta.";
  if (!OTHER_CATEGORIES.some((c) => c.key === form.category)) return "Indique el tipo de renta.";
  const amount = Number(form.monthlyAmount);
  if (form.monthlyAmount === "" || form.monthlyAmount == null || !Number.isFinite(amount) || amount < 0) {
    return "Indique el monto mensual.";
  }
  const day = Number(form.paymentDay);
  if (!Number.isInteger(day) || day < 1 || day > 31) return "El día de pago debe estar entre 1 y 31.";
  if (!form.contractStart || !form.contractEnd) return "Indique desde cuándo y hasta cuándo dura el contrato.";
  if (form.contractEnd < form.contractStart) return "«Contrato hasta» no puede ser anterior a «Contrato desde».";
  return null;
}

export function buildOtherRentPayload(form) {
  return {
    name: form.name.trim(),
    description: (form.description || "").trim() || null,
    category: form.category,
    landlordName: (form.landlordName || "").trim() || null,
    monthlyAmount: Number(form.monthlyAmount),
    paymentDay: Number(form.paymentDay),
    contractStart: form.contractStart || null,
    contractEnd: form.contractEnd || null,
    note: (form.note || "").trim() || null,
  };
}

export function importTypeLabel(rentType) {
  if (rentType === RENT_TYPE.OTHER) return "Otra";
  if (rentType === RENT_TYPE.KIOSK) return "Kiosco";
  return null;
}

/** Texto de una fila de error o cambio del import, con tipo e ID si el back los manda. */
export function importRowCaption(item) {
  const bits = [];
  if (item.row != null) bits.push(`Fila ${item.row}`);
  if (item.name) bits.push(item.name);
  const type = importTypeLabel(item.rentType);
  if (type) bits.push(type);
  if (item.rentId != null) bits.push(`ID ${item.rentId}`);
  return bits.join(" · ");
}

export function importChangeKey(change, index) {
  if (change.locationId != null) return `kiosk-${change.locationId}`;
  if (change.rentId != null) return `other-${change.rentId}`;
  return `row-${change.row ?? index}`;
}
