import React from "react";
import { Input } from "reactstrap";
import {
  STOCK_DIMENSION_KIND,
  catalogDimensionOptions,
  isEntreCuerosLocation,
  isHerrajeDimension,
  kioskDimensionDisplayLabel,
  sameStockDimension,
  stockDimensionKind,
} from "utils/kioskStockDimensionHelper";

function KioskInventoryDimensionSelect({
  locationId,
  product,
  value,
  onChange,
  disabled = false,
}) {
  const kind = stockDimensionKind(locationId, product);
  const entreCueros = isEntreCuerosLocation(locationId);
  if (kind === STOCK_DIMENSION_KIND.NONE) {
    return <span className="text-muted small">—</span>;
  }

  const options = catalogDimensionOptions(kind);
  const current = kind === STOCK_DIMENSION_KIND.HERRAJE ? (value || "NUEVO") : (value || "");
  if (current && !isHerrajeDimension(current) && !options.some((opt) => sameStockDimension(opt.value, current))) {
    options.unshift({
      value: current,
      label: kioskDimensionDisplayLabel(current, { entreCueros }),
    });
  }

  return (
    <Input
      type="select"
      bsSize="sm"
      value={entreCueros && isHerrajeDimension(current) ? "" : current}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || "")}
    >
      {kind === STOCK_DIMENSION_KIND.HERRAJE ? null : <option value="">Variante…</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Input>
  );
}

export default KioskInventoryDimensionSelect;
