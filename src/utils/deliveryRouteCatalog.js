/** Catálogo estático — Clasificación de rutas LF (CA / CB / CC). Código: R{NN}0{NN} */

const stripDiacritics = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

export const normalizeRouteText = (value) =>
  stripDiacritics(String(value || "").trim()).toUpperCase().replace(/\s+/g, " ");

export function buildRouteLocationCode(routeNumber, locationNumber) {
  const route = Number(routeNumber);
  const loc = Number(locationNumber);
  if (!Number.isFinite(route) || route < 1 || !Number.isFinite(loc) || loc < 1) return "";
  return `R${String(route).padStart(2, "0")}0${String(loc).padStart(2, "0")}`;
}

const LOCATION_ENTRIES = [
  { regionCode: "CA", routeNumber: 1, locationNumber: 1, label: "Zacapa", aliases: ["ZACAPA"] },
  { regionCode: "CA", routeNumber: 1, locationNumber: 2, label: "Teculután", aliases: ["TECUULTAN", "TECUUTLAN"] },
  { regionCode: "CA", routeNumber: 1, locationNumber: 3, label: "Chiquimula", aliases: ["CHIQUIMULA"] },
  { regionCode: "CA", routeNumber: 1, locationNumber: 4, label: "Esquipulas", aliases: ["ESQUIPULAS"] },
  { regionCode: "CA", routeNumber: 2, locationNumber: 1, label: "Izabal", aliases: ["IZABAL"] },
  { regionCode: "CA", routeNumber: 2, locationNumber: 2, label: "Puerto Barrios", aliases: ["PUERTO BARRIOS", "BARRIOS"] },
  { regionCode: "CA", routeNumber: 2, locationNumber: 3, label: "Petén", aliases: ["PETEN", "FLORES"] },
  { regionCode: "CA", routeNumber: 3, locationNumber: 1, label: "Jalapa", aliases: ["JALAPA"] },
  { regionCode: "CA", routeNumber: 3, locationNumber: 2, label: "Jutiapa", aliases: ["JUTIAPA"] },
  { regionCode: "CA", routeNumber: 3, locationNumber: 3, label: "Santa Rosa", aliases: ["SANTA ROSA", "CUILAPA"] },
  { regionCode: "CA", routeNumber: 4, locationNumber: 1, label: "Cobán", aliases: ["COBAN"] },
  { regionCode: "CA", routeNumber: 4, locationNumber: 2, label: "Progreso", aliases: ["PROGRESO"] },
  { regionCode: "CA", routeNumber: 4, locationNumber: 3, label: "Alta Verapaz", aliases: ["ALTA VERAPAZ"] },
  { regionCode: "CA", routeNumber: 4, locationNumber: 4, label: "Baja Verapaz", aliases: ["BAJA VERAPAZ", "SALAMA"] },
  { regionCode: "CB", routeNumber: 5, locationNumber: 1, label: "Escuintla", aliases: ["ESCUINTLA"] },
  { regionCode: "CB", routeNumber: 5, locationNumber: 2, label: "Patulul", aliases: ["PATULUL"] },
  { regionCode: "CB", routeNumber: 5, locationNumber: 3, label: "Amatitlán", aliases: ["AMATITLAN"] },
  { regionCode: "CB", routeNumber: 5, locationNumber: 4, label: "Santa Lucía Cotz.", aliases: ["SANTA LUCIA COTZ", "COTZUMALGUAPA", "COTZ"] },
  { regionCode: "CB", routeNumber: 5, locationNumber: 5, label: "Tiquisate", aliases: ["TIQUISATE"] },
  { regionCode: "CB", routeNumber: 5, locationNumber: 6, label: "Suchitepéquez", aliases: ["SUCHITEPEQUEZ"] },
  { regionCode: "CB", routeNumber: 6, locationNumber: 1, label: "Coatepeque", aliases: ["COATEPEQUE"] },
  { regionCode: "CB", routeNumber: 6, locationNumber: 2, label: "Retalhuleu", aliases: ["RETALHULEU"] },
  { regionCode: "CB", routeNumber: 6, locationNumber: 3, label: "Malacatán", aliases: ["MALACATAN"] },
  { regionCode: "CB", routeNumber: 6, locationNumber: 4, label: "Mazatenango", aliases: ["MAZATENANGO"] },
  { regionCode: "CB", routeNumber: 7, locationNumber: 1, label: "Chimaltenango", aliases: ["CHIMALTENANGO"] },
  { regionCode: "CB", routeNumber: 7, locationNumber: 2, label: "Quiché", aliases: ["QUICHE", "SANTA CRUZ DEL QUICHE"] },
  { regionCode: "CB", routeNumber: 7, locationNumber: 3, label: "Sololá", aliases: ["SOLOLA"] },
  { regionCode: "CB", routeNumber: 7, locationNumber: 4, label: "Tecpán", aliases: ["TECPAN"] },
  { regionCode: "CB", routeNumber: 8, locationNumber: 1, label: "San Marcos", aliases: ["SAN MARCOS"] },
  { regionCode: "CB", routeNumber: 8, locationNumber: 2, label: "Huehuetenango", aliases: ["HUEHUETENANGO"] },
  { regionCode: "CB", routeNumber: 8, locationNumber: 3, label: "Quetzaltenango", aliases: ["QUETZALTENANGO", "XELA"] },
  { regionCode: "CB", routeNumber: 8, locationNumber: 4, label: "Totonicapán", aliases: ["TOTONICAPAN"] },
  { regionCode: "CC", routeNumber: 9, locationNumber: 1, label: "Ciudad", aliases: ["CIUDAD", "GUATEMALA", "GUATEMALA CITY", "CAPITAL"] },
  { regionCode: "CC", routeNumber: 9, locationNumber: 2, label: "Villa Nueva", aliases: ["VILLA NUEVA"] },
  { regionCode: "CC", routeNumber: 9, locationNumber: 3, label: "Mixco", aliases: ["MIXCO"] },
  { regionCode: "CC", routeNumber: 9, locationNumber: 4, label: "Puerto San José", aliases: ["PUERTO SAN JOSE", "SAN JOSE"] },
  { regionCode: "CC", routeNumber: 9, locationNumber: 5, label: "Sacatepéquez", aliases: ["SACATEPEQUEZ", "ANTIGUA", "LA ANTIGUA"] },
  { regionCode: "CC", routeNumber: 10, locationNumber: 1, label: "Otros clientes", aliases: ["OTROS", "OTROS CLIENTES"] },
];

const REGIONS = [
  { code: "CA", label: "Región CA" },
  { code: "CB", label: "Región CB" },
  { code: "CC", label: "Región CC" },
];

const BY_CODE = new Map();
LOCATION_ENTRIES.forEach((entry) => {
  const code = buildRouteLocationCode(entry.routeNumber, entry.locationNumber);
  BY_CODE.set(code, { ...entry, code });
});

export function listRegions() {
  return REGIONS.map((r) => ({ ...r }));
}

export function listRoutes(regionCode) {
  const region = String(regionCode || "").trim().toUpperCase();
  const routes = new Map();
  LOCATION_ENTRIES.filter((e) => e.regionCode === region).forEach((e) => {
    if (!routes.has(e.routeNumber)) {
      routes.set(e.routeNumber, { routeNumber: e.routeNumber, regionCode: e.regionCode });
    }
  });
  return Array.from(routes.values()).sort((a, b) => a.routeNumber - b.routeNumber);
}

export function listLocations(routeNumber) {
  const route = Number(routeNumber);
  return LOCATION_ENTRIES.filter((e) => e.routeNumber === route)
    .map((e) => {
      const code = buildRouteLocationCode(e.routeNumber, e.locationNumber);
      return { code, label: e.label, locationNumber: e.locationNumber, routeNumber: e.routeNumber, regionCode: e.regionCode };
    })
    .sort((a, b) => a.locationNumber - b.locationNumber);
}

export function parseRouteLocationCode(code) {
  const raw = String(code || "").trim().toUpperCase();
  if (!raw) return null;
  const entry = BY_CODE.get(raw);
  if (entry) {
    return {
      code: raw,
      regionCode: entry.regionCode,
      routeNumber: entry.routeNumber,
      locationNumber: entry.locationNumber,
      label: entry.label,
    };
  }
  const match = raw.match(/^R(\d{2})0(\d{2})$/);
  if (!match) return null;
  const routeNumber = parseInt(match[1], 10);
  const locationNumber = parseInt(match[2], 10);
  const found = LOCATION_ENTRIES.find(
    (e) => e.routeNumber === routeNumber && e.locationNumber === locationNumber
  );
  return {
    code: raw,
    regionCode: found?.regionCode || null,
    routeNumber,
    locationNumber,
    label: found?.label || raw,
  };
}

export function isValidRouteLocationCode(code) {
  return BY_CODE.has(String(code || "").trim().toUpperCase());
}

export function getRouteCatalogTree() {
  return REGIONS.map((region) => ({
    code: region.code,
    label: region.label,
    routes: listRoutes(region.code).map((route) => ({
      routeNumber: route.routeNumber,
      locations: listLocations(route.routeNumber),
    })),
  }));
}

export function suggestRouteLocationCode(address, name) {
  const haystack = normalizeRouteText(`${name || ""} ${address || ""}`);
  if (!haystack) return null;

  let best = null;
  let bestScore = 0;

  LOCATION_ENTRIES.forEach((entry) => {
    const code = buildRouteLocationCode(entry.routeNumber, entry.locationNumber);
    const terms = [entry.label, ...(entry.aliases || [])].map(normalizeRouteText);
    terms.forEach((term) => {
      if (!term || term.length < 3) return;
      if (haystack.includes(term) && term.length > bestScore) {
        bestScore = term.length;
        best = { code, label: entry.label, regionCode: entry.regionCode, routeNumber: entry.routeNumber };
      }
    });
  });

  return best;
}

export function getRegionLabel(regionCode) {
  return REGIONS.find((r) => r.code === String(regionCode || "").toUpperCase())?.label || regionCode || "—";
}

export function groupAccountRowsByRoute(rows) {
  const groups = new Map();

  (rows || []).forEach((row) => {
    const parsed = parseRouteLocationCode(row.routeLocationCode);
    const regionCode = parsed?.regionCode || "NONE";
    const routeNumber = parsed?.routeNumber ?? 999;
    const key = `${regionCode}-${routeNumber}`;
    if (!groups.has(key)) {
      groups.set(key, {
        regionCode,
        routeNumber: parsed?.routeNumber ?? null,
        regionLabel: regionCode === "NONE" ? "Sin ruta" : getRegionLabel(regionCode),
        routeLabel: parsed ? `Ruta ${parsed.routeNumber}` : "Sin ruta",
        rows: [],
        totalDue: 0,
        totalCredit: 0,
        withDebt: 0,
      });
    }
    const g = groups.get(key);
    g.rows.push(row);
    const due = Number(row.balanceDue) || 0;
    const credit = Number(row.creditBalance) || 0;
    g.totalDue += due;
    g.totalCredit += credit;
    if (due > 0) g.withDebt += 1;
  });

  const order = { CA: 1, CB: 2, CC: 3, NONE: 99 };
  return Array.from(groups.values()).sort((a, b) => {
    const ra = order[a.regionCode] ?? 50;
    const rb = order[b.regionCode] ?? 50;
    if (ra !== rb) return ra - rb;
    return (a.routeNumber ?? 999) - (b.routeNumber ?? 999);
  });
}

export function summarizeByRegion(rows) {
  const totals = { CA: { due: 0, credit: 0, count: 0 }, CB: { due: 0, credit: 0, count: 0 }, CC: { due: 0, credit: 0, count: 0 }, NONE: { due: 0, credit: 0, count: 0 } };
  (rows || []).forEach((row) => {
    const region = parseRouteLocationCode(row.routeLocationCode)?.regionCode || "NONE";
    const bucket = totals[region] || totals.NONE;
    bucket.due += Number(row.balanceDue) || 0;
    bucket.credit += Number(row.creditBalance) || 0;
    bucket.count += 1;
  });
  return totals;
}
