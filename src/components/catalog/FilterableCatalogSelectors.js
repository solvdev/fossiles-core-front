import React, { useRef, useState } from "react";
import { Input } from "reactstrap";
import { AnchoredDropdownMenu } from "components/common/AnchoredDropdownMenu";

function useClickOutside(ref, onClose) {
  React.useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, onClose]);
}

function FilterableDropdown({ anchorRef, open, filtered, emptyLabel, renderItem, onSelect, minWidth, maxHeight }) {
  return (
    <AnchoredDropdownMenu
      anchorRef={anchorRef}
      open={open}
      minWidth={minWidth}
      maxHeight={maxHeight}
    >
      {filtered.length === 0 ? (
        <div style={{ padding: 8, color: "#999", fontSize: 12 }}>{emptyLabel}</div>
      ) : (
        filtered.map((item) => (
          <div
            key={item.key}
            style={{
              padding: "8px 12px",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1.35,
              background: item.selected ? "#e3f2fd" : "transparent",
            }}
            onMouseDown={() => onSelect(item.value)}
          >
            {renderItem(item.value)}
          </div>
        ))
      )}
    </AnchoredDropdownMenu>
  );
}

export function ProductSelector({
  products = [],
  value,
  onChange,
  placeholder = "Buscar producto...",
  renderOptionExtra,
  disabled = false,
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const numericValue = value != null && value !== "" ? Number(value) : null;
  const selected = products.find((p) => Number(p.id) === numericValue);

  const filtered = products
    .filter(
      (p) =>
        (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.code || "").toLowerCase().includes(search.toLowerCase())
    )
    .slice(0, 40)
    .map((p) => ({
      key: p.id,
      value: p,
      selected: Number(p.id) === numericValue,
    }));

  useClickOutside(ref, () => setOpen(false));

  const displayValue = open
    ? search
    : selected
      ? `${selected.code || ""} — ${selected.name || ""}`.trim()
      : "";

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 220 }}>
      <Input
        type="text"
        placeholder={placeholder}
        value={displayValue}
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setSearch("");
        }}
        bsSize="sm"
      />
      <FilterableDropdown
        anchorRef={ref}
        open={open && !disabled}
        filtered={filtered}
        emptyLabel="Sin resultados"
        minWidth={320}
        maxHeight={320}
        onSelect={(product) => {
          onChange(product);
          setOpen(false);
          setSearch("");
        }}
        renderItem={(p) => (
          <>
            <strong>{p.code}</strong> — {p.name}
            {renderOptionExtra ? (
              renderOptionExtra(p)
            ) : p.salePrice != null ? (
              <span style={{ float: "right", color: "#666" }}>
                Q{parseFloat(p.salePrice).toFixed(2)}
              </span>
            ) : null}
          </>
        )}
      />
    </div>
  );
}

export function ColorSelector({
  colors = [],
  value,
  onChange,
  placeholder = "Buscar color...",
  disabled = false,
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const numericValue = value != null && value !== "" ? Number(value) : null;
  const selected = colors.find((c) => Number(c.id) === numericValue);

  const filtered = colors
    .filter((c) => (c.name || "").toLowerCase().includes(search.toLowerCase()))
    .slice(0, 40)
    .map((c) => ({
      key: c.id,
      value: c,
      selected: Number(c.id) === numericValue,
    }));

  useClickOutside(ref, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 140 }}>
      <Input
        type="text"
        placeholder={placeholder}
        value={open ? search : selected ? selected.name : ""}
        disabled={disabled}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setSearch("");
        }}
        bsSize="sm"
      />
      <FilterableDropdown
        anchorRef={ref}
        open={open && !disabled}
        filtered={[
          ...(!search.trim()
            ? [{ key: "none", value: null, selected: numericValue == null }]
            : []),
          ...filtered,
        ]}
        emptyLabel="Sin resultados"
        minWidth={200}
        maxHeight={260}
        onSelect={(color) => {
          onChange(color);
          setOpen(false);
          setSearch("");
        }}
        renderItem={(c) => (c ? c.name : "— Sin color —")}
      />
    </div>
  );
}
