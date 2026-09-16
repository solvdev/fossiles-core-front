import React from "react";
import { productBrandStyle } from "utils/productBrandHelper";
import { kioskDimensionDisplayLabel } from "utils/kioskStockDimensionHelper";
import {
  extractStockBrand,
  isSyntheticHardware,
  normalizeCinchoAudience,
} from "utils/productCinchoHelper";

const AUDIENCE_STYLES = {
  NINO: { bg: "#1D4ED8", fg: "#FFFFFF", accent: "#93C5FD", short: "NI" },
  DAMA: { bg: "#9D174D", fg: "#FFFFFF", accent: "#F9A8D4", short: "DA" },
};

const FALLBACK_STYLE = { bg: "#334155", fg: "#FFFFFF", accent: "#94A3B8", short: "·" };

function chipStyle(palette, { compact } = {}) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    background: palette.bg,
    color: palette.fg,
    borderRadius: 4,
    padding: compact ? "1px 6px 1px 4px" : "2px 8px 2px 5px",
    fontSize: compact ? 10 : 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    lineHeight: 1.35,
    whiteSpace: "nowrap",
    verticalAlign: "middle",
    border: `1px solid ${palette.bg}`,
    fontFamily: "inherit",
    appearance: "none",
    WebkitAppearance: "none",
  };
}

function Mark({ palette }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: 3,
        background: palette.accent,
        color: palette.bg,
        fontSize: 8,
        fontWeight: 800,
        letterSpacing: 0,
        flexShrink: 0,
      }}
    >
      {palette.short}
    </span>
  );
}

function resolvePalette(value) {
  const brand = extractStockBrand(value);
  const brandStyle = productBrandStyle(brand);
  if (brandStyle) return brandStyle;
  const audience = normalizeCinchoAudience(value);
  if (audience && AUDIENCE_STYLES[audience]) return AUDIENCE_STYLES[audience];
  if (isSyntheticHardware(value)) {
    return { bg: "#6D28D9", fg: "#FFFFFF", accent: "#DDD6FE", short: "S" };
  }
  return FALLBACK_STYLE;
}

export function ProductBrandBadge({ value, entreCueros = false, className = "" }) {
  const label = kioskDimensionDisplayLabel(value, { entreCueros });
  if (!label || label === "—") return null;
  const palette = resolvePalette(value);
  return (
    <span className={className} style={chipStyle(palette, { compact: true })} title={label}>
      <Mark palette={palette} />
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
  const palette = value ? resolvePalette(value) : { bg: "#1F2937", fg: "#FFFFFF", accent: "#E5E7EB", short: "•" };
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...chipStyle(palette),
        opacity: disabled ? 0.45 : 1,
        boxShadow: active ? `0 0 0 2px #fff, 0 0 0 4px ${palette.bg}` : "none",
        cursor: disabled ? "not-allowed" : "pointer",
        margin: 0,
      }}
    >
      {value ? <Mark palette={palette} /> : null}
      {label}
    </button>
  );
}
