import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  CustomInput,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
} from "reactstrap";
import {
  collectSizeKeysForRows,
  formatSystemSizesText,
  getCinchoTypeLabel,
  sumSizeCounts,
} from "utils/productCinchoHelper";

const inputStyle = {
  width: 64,
  padding: "4px 6px",
  fontSize: 13,
  textAlign: "right",
  border: "1px solid #d1d5db",
  borderRadius: 4,
};

function CinchoCountDetailModal({
  isOpen,
  toggle,
  productRows,
  rowKey,
  editedSizeCounts,
  editedCounts,
  onApply,
  disabled,
}) {
  const [draftByRow, setDraftByRow] = useState({});
  const [applyToBo, setApplyToBo] = useState(true);

  const sizeKeys = useMemo(() => collectSizeKeysForRows(productRows), [productRows]);

  useEffect(() => {
    if (!isOpen || !productRows?.length) return;
    const next = {};
    productRows.forEach((row) => {
      const key = rowKey(row);
      next[key] = {
        ...(row.physicalSizes || {}),
        ...(editedSizeCounts[key] || {}),
      };
    });
    setDraftByRow(next);
    setApplyToBo(true);
  }, [isOpen, productRows, editedSizeCounts, rowKey]);

  if (!productRows?.length) return null;

  const sample = productRows[0];
  const rowSummaries = productRows.map((row) => {
    const key = rowKey(row);
    const sizes = draftByRow[key] || {};
    const sizeTotal = sumSizeCounts(sizes);
    const locationTotal = Object.values(editedCounts[key] || row.counts || {}).reduce(
      (sum, qty) => sum + Number(qty || 0),
      0
    );
    return { key, row, sizes, sizeTotal, locationTotal };
  });

  const handleSizeChange = (rKey, size, rawValue) => {
    const value = rawValue === "" ? 0 : Math.max(0, Number(rawValue) || 0);
    setDraftByRow((prev) => ({
      ...prev,
      [rKey]: { ...(prev[rKey] || {}), [size]: value },
    }));
  };

  const handleApply = () => {
    const cleaned = {};
    rowSummaries.forEach(({ key, sizes }) => {
      const positive = Object.fromEntries(
        Object.entries(sizes).filter(([, qty]) => Number(qty) > 0)
      );
      cleaned[key] = positive;
    });
    onApply(cleaned, applyToBo);
    toggle();
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Conteo por talla — {sample.productCode} {sample.productName}
        <div style={{ fontSize: 12, fontWeight: 400, color: "#6b7280", marginTop: 4 }}>
          {getCinchoTypeLabel(sample.cinchoType)} · {productRows.length} color{productRows.length !== 1 ? "es" : ""}
        </div>
      </ModalHeader>
      <ModalBody>
        <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 12 }}>
          Registra cuántas unidades hay de cada talla por color. El sistema muestra el inventario
          actual como referencia.
        </p>

        {sizeKeys.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Este cincho no tiene tallas registradas en el sistema. Verifica el inventario del kiosko.
          </p>
        ) : (
          productRows.map((row) => {
            const key = rowKey(row);
            const summary = rowSummaries.find((item) => item.key === key);
            const sizes = summary?.sizes || {};
            const systemSizes = row.systemSizes || {};
            return (
              <div key={key} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <strong style={{ fontSize: 13 }}>{row.colorName || `Color #${row.colorId}`}</strong>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>
                    Sistema: {formatSystemSizesText(systemSizes) || "—"}
                  </span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <Table size="sm" bordered responsive className="mb-0">
                    <thead style={{ background: "#f9fafb" }}>
                      <tr>
                        <th style={{ fontSize: 11 }}>Talla</th>
                        {sizeKeys.map((size) => (
                          <th key={size} style={{ fontSize: 11, textAlign: "center" }}>{size}</th>
                        ))}
                        <th style={{ fontSize: 11, textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontSize: 11, color: "#6b7280" }}>Sistema</td>
                        {sizeKeys.map((size) => (
                          <td key={size} style={{ fontSize: 11, textAlign: "center", color: "#6b7280" }}>
                            {systemSizes[size] ?? 0}
                          </td>
                        ))}
                        <td style={{ fontSize: 11, textAlign: "right", color: "#6b7280" }}>
                          {sumSizeCounts(systemSizes)}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ fontSize: 11, fontWeight: 600 }}>Físico</td>
                        {sizeKeys.map((size) => (
                          <td key={size} style={{ padding: "4px 6px", textAlign: "center" }}>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={sizes[size] ?? 0}
                              disabled={disabled}
                              onChange={(e) => handleSizeChange(key, size, e.target.value)}
                              style={inputStyle}
                            />
                          </td>
                        ))}
                        <td style={{ fontSize: 12, textAlign: "right", fontWeight: 700 }}>
                          {summary?.sizeTotal ?? 0}
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
                {summary && summary.sizeTotal !== summary.locationTotal && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>
                    Total por tallas ({summary.sizeTotal}) ≠ total por ubicaciones ({summary.locationTotal}).
                  </div>
                )}
              </div>
            );
          })
        )}

        <CustomInput
          type="checkbox"
          id="cincho-count-apply-bo"
          label="Aplicar total por tallas a la columna BO (bodega) en la grilla principal"
          checked={applyToBo}
          disabled={disabled}
          onChange={(e) => setApplyToBo(e.target.checked)}
        />
        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
          Luego puedes redistribuir unidades entre vitrinas (V1–V7, E) en la tabla principal.
        </div>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle}>Cancelar</Button>
        <Button color="primary" onClick={handleApply} disabled={disabled || sizeKeys.length === 0}>
          Aplicar conteo
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CinchoCountDetailModal;
