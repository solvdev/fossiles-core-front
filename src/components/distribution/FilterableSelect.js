import React, { useEffect, useRef, useState } from "react";
import { Input } from "reactstrap";
import { AnchoredDropdownMenu } from "components/common/AnchoredDropdownMenu";

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const handleClick = (e) => {
      const target = e.target;
      if (ref.current && ref.current.contains(target)) return;
      // El menú se renderiza en portal (fuera del ref); no cerrar al elegir opción.
      if (target?.closest?.("[data-anchored-dropdown-menu='true']")) return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [ref, onClose]);
}

/**
 * Select con búsqueda por texto (label / searchText).
 * @param {{ value: string, label: React.ReactNode, searchText?: string }[]} options
 * @param {(query: string) => void} [onSearchChange] — búsqueda remota (debounce en el padre)
 * @param {number} [maxVisibleOptions]
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
  onSearchChange,
  maxVisibleOptions = 300,
  loading = false,
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const stringValue = value != null && value !== "" ? String(value) : "";
  const selected = options.find((o) => String(o.value) === stringValue);
  const remoteSearch = typeof onSearchChange === "function";

  const filtered = remoteSearch
    ? options
    : options
        .filter((o) => {
          const hay = String(o.searchText ?? o.label ?? "").toLowerCase();
          return hay.includes(search.toLowerCase());
        })
        .slice(0, Math.max(1, Number(maxVisibleOptions) || 300));

  useClickOutside(ref, () => setOpen(false));

  const displayValue = open
    ? search
    : selected
      ? String(selected.label)
      : stringValue
        ? stringValue
        : "";

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
          const next = e.target.value;
          setSearch(next);
          if (!open) setOpen(true);
          if (remoteSearch) onSearchChange(next);
        }}
        onFocus={() => {
          if (disabled) return;
          setOpen(true);
          setSearch("");
          if (remoteSearch) onSearchChange("");
        }}
      />
      <AnchoredDropdownMenu anchorRef={ref} open={open && !disabled} minWidth={220} maxHeight={280}>
        {allowEmpty && (
          <div
            style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "#666" }}
            onMouseDown={(e) => {
              e.preventDefault();
              pick("");
            }}
          >
            {emptyLabel}
          </div>
        )}
        {loading ? (
          <div style={{ padding: 8, color: "#999", fontSize: 12 }}>Buscando…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 8, color: "#999", fontSize: 12 }}>Sin resultados</div>
        ) : (
          filtered.map((o) => (
            <div
              key={o.value}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 13,
                lineHeight: 1.35,
                background: String(o.value) === stringValue ? "#e3f2fd" : "transparent",
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o.value);
              }}
            >
              {o.label}
            </div>
          ))
        )}
      </AnchoredDropdownMenu>
    </div>
  );
}

export default FilterableSelect;
