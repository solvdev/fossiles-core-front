import React from "react";
import { extractBrandFromText, productBrandStyle } from "utils/productBrandHelper";
import { kioskDimensionDisplayLabel } from "utils/kioskStockDimensionHelper";
import {
  extractStockBrand,
  isSyntheticHardware,
  normalizeCinchoAudience,
} from "utils/productCinchoHelper";
import "./ProductBrandBadge.css";

const CLASS_BY_KEY = {
  LACOSTE: "kiosk-brand-chip--lacoste",
  LEVIS: "kiosk-brand-chip--levis",
  NAUTICA: "kiosk-brand-chip--nautica",
  "TOMMY HILFIGER": "kiosk-brand-chip--tommy",
  ABERCROMBIE: "kiosk-brand-chip--abercrombie",
  NINO: "kiosk-brand-chip--nino",
  DAMA: "kiosk-brand-chip--dama",
  SINTETICO: "kiosk-brand-chip--sintetico",
};

const MARK_BY_KEY = {
  LACOSTE: "LC",
  LEVIS: "LV",
  NAUTICA: "NA",
  "TOMMY HILFIGER": "TH",
  ABERCROMBIE: "AB",
  NINO: "NI",
  DAMA: "DA",
  SINTETICO: "S",
};

export function resolveBrandChipKey(value) {
  const brand = extractStockBrand(value) || extractBrandFromText(value);
  if (brand) return brand;
  const audience = normalizeCinchoAudience(value);
  if (audience) return audience;
  if (isSyntheticHardware(value)) return "SINTETICO";
  return "";
}

function chipClassName(key, { active, button } = {}) {
  return [
    "kiosk-brand-chip",
    CLASS_BY_KEY[key] || "",
    active ? "is-active" : "",
    button ? "is-button" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function ProductBrandBadge({ value, entreCueros = false, className = "" }) {
  const label = kioskDimensionDisplayLabel(value, { entreCueros });
  if (!label || label === "—") return null;
  const key = resolveBrandChipKey(value);
  const mark = MARK_BY_KEY[key] || productBrandStyle(key)?.short || "·";
  return (
    <span className={`${chipClassName(key)} ${className}`.trim()} title={label}>
      <span className="kiosk-brand-chip__mark" aria-hidden>
        {mark}
      </span>
      {label}
    </span>
  );
}

export function ProductBrandFilterChip({
  value,
  label,
  active,
  onClick,
  disabled = false,
}) {
  const key = value ? resolveBrandChipKey(value) || value : "";
  const mark = key ? MARK_BY_KEY[key] || productBrandStyle(key)?.short : "";
  return (
    <button
      type="button"
      className={chipClassName(key, { active, button: true })}
      disabled={disabled}
      onClick={onClick}
    >
      {mark ? (
        <span className="kiosk-brand-chip__mark" aria-hidden>
          {mark}
        </span>
      ) : null}
      {label}
    </button>
  );
}
