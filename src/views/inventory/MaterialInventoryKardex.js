import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "reactstrap";
import Select from "react-select";
import KardexPanel from "components/kardex/KardexPanel";
import { getMaterialKardex, getMaterialKardexByMovementType } from "services/inventoryService";
import { getMaterials } from "services/materialService";
import { normalizeKardexRows } from "utils/kardexModel";
import { showError } from "utils/notificationHelper";

const QUICK = [
  { type: "ENTRY", label: "Todas las entradas" },
  { type: "EXIT", label: "Todas las salidas" },
  { type: "ADJUSTMENT", label: "Todos los ajustes" },
];

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderRadius: 8,
    borderColor: state.isFocused ? "#0b6e71" : "#d9e1e8",
    boxShadow: "none",
    "&:hover": { borderColor: "#0b6e71" },
  }),
  menu: (base) => ({ ...base, zIndex: 5 }),
};

/**
 * Kardex de materiales: elige un material y ve cada entrada, salida y su saldo.
 * Dentro del modal de un material (`lockedMaterialId`) no hay selector.
 */
function MaterialInventoryKardex({
  lockedMaterialId,
  lockedMaterialLabel,
  embedded = false,
  /** Sin título duplicado (por ejemplo dentro de un modal que ya muestra el material). */
  embeddedCompact = false,
} = {}) {
  const materialLocked =
    lockedMaterialId !== undefined && lockedMaterialId !== null && String(lockedMaterialId).trim() !== "";

  const [materials, setMaterials] = useState([]);
  const [selected, setSelected] = useState(null);
  const [typeOnly, setTypeOnly] = useState("");
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const materialId = materialLocked ? String(lockedMaterialId) : selected ? String(selected.value) : "";

  useEffect(() => {
    if (materialLocked) return;
    (async () => {
      try {
        setMaterials((await getMaterials()) || []);
      } catch (err) {
        showError(err.message || "No se pudieron cargar los materiales.");
      }
    })();
  }, [materialLocked]);

  const load = useCallback(async () => {
    if (!materialId && !typeOnly) {
      setRaw(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      let data = [];
      if (materialId) data = await getMaterialKardex(materialId);
      else data = await getMaterialKardexByMovementType(typeOnly);
      setRaw(data || []);
    } catch (err) {
      setRaw(null);
      setError(err.message || "No se pudo cargar el kardex del material.");
    } finally {
      setLoading(false);
    }
  }, [materialId, typeOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (raw === null ? null : normalizeKardexRows(raw)), [raw]);

  const options = useMemo(
    () => materials.map((m) => ({ value: m.id, label: `${m.sku || ""} — ${m.name || ""}`.replace(/^ — /, "") })),
    [materials]
  );

  const toolbar = materialLocked ? null : (
    <div className="kdx-filters">
      <div className="kdx-field kdx-grow" style={{ maxWidth: 520 }}>
        <label htmlFor="kdx-material">Material</label>
        <Select
          inputId="kdx-material"
          isClearable
          isSearchable
          placeholder="Busca por SKU o nombre…"
          noOptionsMessage={() => "Sin resultados"}
          options={options}
          value={selected}
          onChange={(v) => {
            setSelected(v);
            if (v) setTypeOnly("");
          }}
          styles={selectStyles}
        />
      </div>
    </div>
  );

  const banner =
    !materialId && typeOnly ? (
      <div className="kdx-banner">
        <span>
          Mostrando <strong>{QUICK.find((q) => q.type === typeOnly)?.label.toLowerCase()}</strong> de todos los
          materiales.
        </span>
        <Button color="link" className="rpt-clear" onClick={() => setTypeOnly("")}>
          Quitar
        </Button>
      </div>
    ) : null;

  const start = (
    <div className="kdx-start">
      <h5>Elige un material para ver su kardex</h5>
      <p className="mb-0">
        Verás cada entrada y salida con el saldo que quedó. También puedes ver un tipo de movimiento de todos los
        materiales:
      </p>
      <div className="kdx-quick">
        {QUICK.map((q) => (
          <button key={q.type} type="button" onClick={() => setTypeOnly(q.type)}>
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <KardexPanel
      title={materialLocked && lockedMaterialLabel ? `Kardex — ${lockedMaterialLabel}` : "Kardex de materiales"}
      subtitle="Cada entrada y salida de un material, con el saldo que quedó. Las salidas se valoran por FIFO: se consume primero el lote más antiguo."
      rows={rows}
      loading={loading}
      error={error}
      onRetry={load}
      toolbar={toolbar}
      banner={banner}
      start={start}
      showItem={!materialLocked && !materialId}
      itemKind="material"
      itemLabel="Material"
      embedded={embedded}
      compact={embeddedCompact}
      fileName="kardex_material"
    />
  );
}

export default MaterialInventoryKardex;
