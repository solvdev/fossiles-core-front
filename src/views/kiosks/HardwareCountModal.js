import React, { useEffect, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { HARDWARE_CONDITION_OPTIONS, normalizeHardwareCondition } from "utils/productCinchoHelper";

const counterStyle = {
  width: 72,
  padding: "6px 8px",
  fontSize: 14,
  textAlign: "right",
  border: "1px solid #d1d5db",
  borderRadius: 6,
};

const normalizeQty = (value) => {
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function QtyCounterInput({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      step="1"
      inputMode="numeric"
      value={value}
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const next = e.target.value;
        if (next === "" || /^\d+$/.test(next)) {
          onChange(next);
        }
      }}
      onBlur={() => {
        onChange(String(normalizeQty(value)));
      }}
      style={counterStyle}
    />
  );
}

function HardwareCountModal({
  isOpen,
  toggle,
  productLabel,
  locationKey,
  initialCounts,
  onApply,
  disabled,
}) {
  const [nuevoDraft, setNuevoDraft] = useState("0");
  const [viejoDraft, setViejoDraft] = useState("0");

  useEffect(() => {
    if (!isOpen) return;
    const source = initialCounts || {};
    setNuevoDraft(String(normalizeQty(source.NUEVO)));
    setViejoDraft(String(normalizeQty(source.VIEJO)));
  }, [isOpen, initialCounts, locationKey]);

  const nuevo = normalizeQty(nuevoDraft);
  const viejo = normalizeQty(viejoDraft);
  const total = nuevo + viejo;

  const handleApply = () => {
    onApply({
      locationKey,
      hardwareCounts: {
        NUEVO: nuevo,
        VIEJO: viejo,
      },
      total,
    });
  };

  const nuevoLabel = HARDWARE_CONDITION_OPTIONS.find((o) => o.value === "NUEVO")?.label || "Herraje nuevo";
  const viejoLabel = HARDWARE_CONDITION_OPTIONS.find((o) => o.value === "VIEJO")?.label || "Herraje viejo";

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered size="sm">
      <ModalHeader toggle={toggle}>
        Conteo {locationKey} — {productLabel || "Producto"}
      </ModalHeader>
      <ModalBody>
        <div className="d-flex flex-column" style={{ gap: 14 }}>
          <div className="d-flex align-items-center justify-content-between">
            <span style={{ fontWeight: 600 }}>{nuevoLabel}</span>
            <QtyCounterInput value={nuevoDraft} onChange={setNuevoDraft} disabled={disabled} />
          </div>
          <div className="d-flex align-items-center justify-content-between">
            <span style={{ fontWeight: 600 }}>{viejoLabel}</span>
            <QtyCounterInput value={viejoDraft} onChange={setViejoDraft} disabled={disabled} />
          </div>
          <div className="d-flex align-items-center justify-content-between pt-2 border-top">
            <span style={{ fontWeight: 700 }}>Total ubicación</span>
            <strong>{total}</strong>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline size="sm" onClick={toggle}>Cancelar</Button>
        <Button color="primary" size="sm" onClick={handleApply} disabled={disabled}>
          Aplicar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default HardwareCountModal;

export const buildHardwareLocationCounts = (prev, locationKey, hardwareCounts) => {
  const loc = String(locationKey || "").trim().toUpperCase();
  const next = { ...(prev || {}) };
  const cleaned = {};
  Object.entries(hardwareCounts || {}).forEach(([key, value]) => {
    const hw = normalizeHardwareCondition(key);
    if (!hw) return;
    const qty = Math.max(0, Number(value || 0));
    if (qty > 0) cleaned[hw] = qty;
  });
  if (Object.keys(cleaned).length) {
    next[loc] = cleaned;
  } else {
    delete next[loc];
  }
  return next;
};

export const sumHardwareLocationCounts = (hardwareLocationCounts) => {
  if (!hardwareLocationCounts) return 0;
  return Object.values(hardwareLocationCounts).reduce((sum, locMap) => {
    if (!locMap) return sum;
    return sum + Object.values(locMap).reduce((s, n) => s + Number(n || 0), 0);
  }, 0);
};

export const syncCountsFromHardware = (counts, hardwareLocationCounts) => {
  const next = { ...(counts || {}) };
  Object.entries(hardwareLocationCounts || {}).forEach(([loc, hwMap]) => {
    const total = Object.values(hwMap || {}).reduce((s, n) => s + Number(n || 0), 0);
    next[loc] = total;
  });
  return next;
};
