import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "reactstrap";

function PosAdminKioskPicker({ kiosks, selectedKioskId, selectedLabel, onSelect }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filteredKiosks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = Array.isArray(kiosks) ? kiosks : [];
    if (!normalizedQuery) return rows;
    return rows.filter((kiosk) => {
      const text = `${kiosk.kioskName || ""} ${kiosk.kioskCode || ""}`.toLowerCase();
      return text.includes(normalizedQuery);
    });
  }, [kiosks, query]);

  const handleToggle = () => {
    setOpen((prev) => {
      if (prev) setQuery("");
      return !prev;
    });
  };

  const handleSelect = (kioskId) => {
    onSelect(String(kioskId));
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="kiosk-pos-kiosk-picker" ref={wrapperRef}>
      <button
        type="button"
        className="kiosk-pos-kiosk-picker-toggle"
        onClick={handleToggle}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="kiosk-pos-kiosk-picker-label">{selectedLabel || "Kiosko"}</span>
        <span className="kiosk-pos-kiosk-picker-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="kiosk-pos-kiosk-picker-menu" role="listbox">
          <Input
            className="kiosk-pos-kiosk-picker-search"
            placeholder="Buscar kiosko..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
                setQuery("");
              }
            }}
          />
          <div className="kiosk-pos-kiosk-picker-list">
            {filteredKiosks.length === 0 ? (
              <div className="kiosk-pos-kiosk-picker-empty">Sin coincidencias</div>
            ) : (
              filteredKiosks.map((kiosk) => (
                <button
                  key={`picker-kiosk-${kiosk.kioskId}`}
                  type="button"
                  role="option"
                  aria-selected={String(kiosk.kioskId) === String(selectedKioskId)}
                  className={`kiosk-pos-kiosk-picker-item${
                    String(kiosk.kioskId) === String(selectedKioskId) ? " active" : ""
                  }`}
                  onClick={() => handleSelect(kiosk.kioskId)}
                >
                  {kiosk.kioskName}
                  {kiosk.kioskCode ? ` (${kiosk.kioskCode})` : ""}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PosAdminKioskPicker;
