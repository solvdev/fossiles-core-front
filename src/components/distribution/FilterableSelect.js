import React, { useEffect, useRef, useState } from "react";
import { Input } from "reactstrap";

const dropdownStyle = {
  position: "absolute",
  zIndex: 1050,
  background: "#fff",
  border: "1px solid #ddd",
  borderRadius: 4,
  maxHeight: 260,
  overflowY: "auto",
  width: "100%",
  minWidth: 180,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, onClose]);
}

/**
 * Select con búsqueda por texto (label / searchText).
 * @param {{ value: string, label: React.ReactNode, searchText?: string }[]} options
 */
export function FilterableSelect({
  value,
  onChange,
  options = [],
  placeholder = "Buscar...",
  disabled = false,
  allowEmpty = true,
  emptyLabel = "— Sin selección —",
  bsSize,
  inputClassName,
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const stringValue = value != null && value !== "" ? String(value) : "";
  const selected = options.find((o) => String(o.value) === stringValue);

  const filtered = options
    .filter((o) => {
      const hay = String(o.searchText ?? o.label ?? "").toLowerCase();
      return hay.includes(search.toLowerCase());
    })
    .slice(0, 80);

  useClickOutside(ref, () => setOpen(false));

  const displayValue = open ? search : selected ? String(selected.label) : "";

  const pick = (next) => {
    onChange(next != null && next !== "" ? String(next) : "");
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Input
        type="text"
        placeholder={placeholder}
        value={displayValue}
        disabled={disabled}
        bsSize={bsSize}
        className={inputClassName}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setSearch("");
        }}
      />
      {open && !disabled && (
        <div style={dropdownStyle}>
          {allowEmpty && (
            <div
              style={{ padding: "6px 10px", cursor: "pointer", fontSize: 13, color: "#666" }}
              onMouseDown={() => pick("")}
            >
              {emptyLabel}
            </div>
          )}
          {filtered.length === 0 ? (
            <div style={{ padding: 8, color: "#999", fontSize: 12 }}>Sin resultados</div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.value}
                style={{
                  padding: "6px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                  background: String(o.value) === stringValue ? "#e3f2fd" : "transparent",
                }}
                onMouseDown={() => pick(o.value)}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default FilterableSelect;
