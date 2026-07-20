import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  CustomInput,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
} from "reactstrap";
import {
  CINCHO_COUNT_LOCATION,
  HARDWARE_CONDITION_OPTIONS,
  buildFossLocationSizeDraft,
  collectSizeKeysForRows,
  formatSystemSizesText,
  mergeFossLocationSizeTotals,
  resolveCinchoProductLabel,
  sumSizeCounts,
} from "utils/productCinchoHelper";

const inputStyle = {
  width: 56,
  padding: "4px 4px",
  fontSize: 12,
  textAlign: "right",
  border: "1px solid #d1d5db",
  borderRadius: 4,
};

const vitrineRowStyle = { background: "#f0fdf4" };
const warehouseRowStyle = { background: "#fff7ed" };
const HARDWARE_KEYS = ["NUEVO", "VIEJO"];

function emptyLocationDraft() {
  return {
    [CINCHO_COUNT_LOCATION.VITRINE]: {},
    [CINCHO_COUNT_LOCATION.WAREHOUSE]: {},
  };
}

function emptyHardwareDraft() {
  return {
    NUEVO: emptyLocationDraft(),
    VIEJO: emptyLocationDraft(),
  };
}

function SizeCountRow({ label, rowStyle, sizeKeys, sizes, disabled, onChange, total, bold = false }) {
  return (
    <tr style={rowStyle}>
      <td style={{ fontSize: 11, fontWeight: bold ? 700 : 600 }}>{label}</td>
      {sizeKeys.map((size) => (
        <td key={size} style={{ padding: "4px 4px", textAlign: "center" }}>
          {onChange ? (
            <input
              type="number"
              min="0"
              step="1"
              value={sizes[size] ?? 0}
              disabled={disabled}
              onChange={(e) => onChange(size, e.target.value)}
              style={inputStyle}
            />
          ) : (
            <span style={{ fontSize: 11, color: "#6b7280" }}>{sizes[size] ?? 0}</span>
          )}
        </td>
      ))}
      <td style={{ fontSize: 12, textAlign: "right", fontWeight: bold ? 700 : 600 }}>{total}</td>
    </tr>
  );
}

const pickPositive = (sizes) =>
  Object.fromEntries(Object.entries(sizes || {}).filter(([, qty]) => Number(qty) > 0));

const mergeSizeMaps = (...maps) => {
  const merged = {};
  maps.forEach((map) => {
    Object.entries(map || {}).forEach(([size, qty]) => {
      merged[size] = Number(merged[size] || 0) + Number(qty || 0);
    });
  });
  return merged;
};

const buildHardwareLocationCountsFromDraft = (byHardware) => {
  const out = {};
  HARDWARE_KEYS.forEach((hw) => {
    const draft = byHardware?.[hw] || emptyLocationDraft();
    [CINCHO_COUNT_LOCATION.VITRINE, CINCHO_COUNT_LOCATION.WAREHOUSE].forEach((locKey) => {
      const total = sumSizeCounts(draft[locKey]);
      if (total > 0) {
        if (!out[locKey]) out[locKey] = {};
        out[locKey][hw] = total;
      }
    });
  });
  return Object.keys(out).length ? out : null;
};

function CinchoCountDetailModal({
  isOpen,
  toggle,
  fossMode,
  hardwareSplitEnabled = true,
  productRows,
  rowKey,
  editedSizeCounts,
  editedSizeCountsByLocation,
  editedCounts,
  onApply,
  disabled,
}) {
  const [simpleDraftByRow, setSimpleDraftByRow] = useState({});
  const [fossDraftByRow, setFossDraftByRow] = useState({});
  const [fossDraftByHardware, setFossDraftByHardware] = useState({});
  const [activeHardware, setActiveHardware] = useState("NUEVO");
  const [applyToVitrine, setApplyToVitrine] = useState(true);
  const useFossHardwareSplit = fossMode && hardwareSplitEnabled;

  const sizeKeys = useMemo(() => collectSizeKeysForRows(productRows), [productRows]);

  useEffect(() => {
    if (!isOpen || !productRows?.length) return;
    if (fossMode) {
      if (hardwareSplitEnabled) {
        const nextHardware = {};
        productRows.forEach((row) => {
          const key = rowKey(row);
          nextHardware[key] = {
            NUEVO: buildFossLocationSizeDraft(
              row,
              editedSizeCountsByLocation[key],
              editedSizeCounts[key]
            ),
            VIEJO: emptyLocationDraft(),
          };
        });
        setFossDraftByHardware(nextHardware);
        setActiveHardware("NUEVO");
      } else {
        const next = {};
        productRows.forEach((row) => {
          const key = rowKey(row);
          next[key] = buildFossLocationSizeDraft(
            row,
            editedSizeCountsByLocation[key],
            editedSizeCounts[key]
          );
        });
        setFossDraftByRow(next);
      }
    } else {
      const next = {};
      productRows.forEach((row) => {
        const key = rowKey(row);
        next[key] = {
          ...(row.physicalSizes || {}),
          ...(editedSizeCounts[key] || {}),
        };
      });
      setSimpleDraftByRow(next);
      setApplyToVitrine(true);
    }
  }, [isOpen, productRows, editedSizeCounts, editedSizeCountsByLocation, fossMode, hardwareSplitEnabled, rowKey]);

  if (!productRows?.length) return null;

  const sample = productRows[0];

  const rowSummaries = productRows.map((row) => {
    const key = rowKey(row);
    const counts = editedCounts[key] || row.counts || {};
    const locationTotal = Object.values(counts).reduce((sum, qty) => sum + Number(qty || 0), 0);
    const eCount = Number(counts[CINCHO_COUNT_LOCATION.VITRINE] || 0);
    const boCount = Number(counts[CINCHO_COUNT_LOCATION.WAREHOUSE] || 0);

    if (fossMode) {
      if (useFossHardwareSplit) {
        const byHardware = fossDraftByHardware[key] || emptyHardwareDraft();
        const mergedByLocation = {
          [CINCHO_COUNT_LOCATION.VITRINE]: mergeSizeMaps(
            byHardware.NUEVO?.[CINCHO_COUNT_LOCATION.VITRINE],
            byHardware.VIEJO?.[CINCHO_COUNT_LOCATION.VITRINE]
          ),
          [CINCHO_COUNT_LOCATION.WAREHOUSE]: mergeSizeMaps(
            byHardware.NUEVO?.[CINCHO_COUNT_LOCATION.WAREHOUSE],
            byHardware.VIEJO?.[CINCHO_COUNT_LOCATION.WAREHOUSE]
          ),
        };
        const sizeTotal = sumSizeCounts(mergeFossLocationSizeTotals(mergedByLocation));
        const vitrineTotal = sumSizeCounts(mergedByLocation[CINCHO_COUNT_LOCATION.VITRINE]);
        const warehouseTotal = sumSizeCounts(mergedByLocation[CINCHO_COUNT_LOCATION.WAREHOUSE]);
        return {
          key,
          row,
          byHardware,
          mergedByLocation,
          sizeTotal,
          vitrineTotal,
          warehouseTotal,
          locationTotal,
          eCount,
          boCount,
        };
      }

      const byLocation = fossDraftByRow[key] || emptyLocationDraft();
      const sizeTotal = sumSizeCounts(mergeFossLocationSizeTotals(byLocation));
      const vitrineTotal = sumSizeCounts(byLocation[CINCHO_COUNT_LOCATION.VITRINE]);
      const warehouseTotal = sumSizeCounts(byLocation[CINCHO_COUNT_LOCATION.WAREHOUSE]);
      return {
        key,
        row,
        byLocation,
        sizeTotal,
        vitrineTotal,
        warehouseTotal,
        locationTotal,
        eCount,
        boCount,
      };
    }

    const sizes = simpleDraftByRow[key] || {};
    const sizeTotal = sumSizeCounts(sizes);
    return { key, row, sizes, sizeTotal, locationTotal };
  });

  const handleSimpleSizeChange = (rKey, size, rawValue) => {
    const value = rawValue === "" ? 0 : Math.max(0, Number(rawValue) || 0);
    setSimpleDraftByRow((prev) => ({
      ...prev,
      [rKey]: { ...(prev[rKey] || {}), [size]: value },
    }));
  };

  const handleFossSizeChange = (rKey, hardwareKey, locationKey, size, rawValue) => {
    const value = rawValue === "" ? 0 : Math.max(0, Number(rawValue) || 0);
    setFossDraftByHardware((prev) => {
      const current = prev[rKey] || emptyHardwareDraft();
      const hwDraft = current[hardwareKey] || emptyLocationDraft();
      return {
        ...prev,
        [rKey]: {
          ...current,
          [hardwareKey]: {
            ...hwDraft,
            [locationKey]: { ...(hwDraft[locationKey] || {}), [size]: value },
          },
        },
      };
    });
  };

  const handleFossLegacySizeChange = (rKey, locationKey, size, rawValue) => {
    const value = rawValue === "" ? 0 : Math.max(0, Number(rawValue) || 0);
    setFossDraftByRow((prev) => {
      const current = prev[rKey] || emptyLocationDraft();
      return {
        ...prev,
        [rKey]: {
          ...current,
          [locationKey]: { ...(current[locationKey] || {}), [size]: value },
        },
      };
    });
  };

  const handleApply = () => {
    if (fossMode) {
      const sizeCountsByRowKey = {};
      const sizeCountsByLocationByRowKey = {};
      const hardwareLocationCountsByRowKey = {};
      rowSummaries.forEach((summary) => {
        const { key } = summary;
        if (useFossHardwareSplit) {
          const cleanedLocation = {
            [CINCHO_COUNT_LOCATION.VITRINE]: pickPositive(summary.mergedByLocation[CINCHO_COUNT_LOCATION.VITRINE]),
            [CINCHO_COUNT_LOCATION.WAREHOUSE]: pickPositive(summary.mergedByLocation[CINCHO_COUNT_LOCATION.WAREHOUSE]),
          };
          sizeCountsByLocationByRowKey[key] = cleanedLocation;
          sizeCountsByRowKey[key] = mergeFossLocationSizeTotals(cleanedLocation);
          const hardwareCounts = buildHardwareLocationCountsFromDraft(summary.byHardware);
          if (hardwareCounts) {
            hardwareLocationCountsByRowKey[key] = hardwareCounts;
          }
        } else {
          const cleanedLocation = {
            [CINCHO_COUNT_LOCATION.VITRINE]: pickPositive(summary.byLocation[CINCHO_COUNT_LOCATION.VITRINE]),
            [CINCHO_COUNT_LOCATION.WAREHOUSE]: pickPositive(summary.byLocation[CINCHO_COUNT_LOCATION.WAREHOUSE]),
          };
          sizeCountsByLocationByRowKey[key] = cleanedLocation;
          sizeCountsByRowKey[key] = mergeFossLocationSizeTotals(cleanedLocation);
        }
      });
      onApply({
        fossMode: true,
        sizeCountsByRowKey,
        sizeCountsByLocationByRowKey,
        hardwareLocationCountsByRowKey: useFossHardwareSplit ? hardwareLocationCountsByRowKey : undefined,
      });
    } else {
      const sizeCountsByRowKey = {};
      rowSummaries.forEach(({ key, sizes }) => {
        sizeCountsByRowKey[key] = pickPositive(sizes);
      });
      onApply({ fossMode: false, sizeCountsByRowKey, applyToVitrine });
    }
    toggle();
  };

  const hardwareLabel = (value) =>
    HARDWARE_CONDITION_OPTIONS.find((opt) => opt.value === value)?.label || value;

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Conteo por talla — {sample.productCode} {sample.productName}
        <div style={{ fontSize: 12, fontWeight: 400, color: "#6b7280", marginTop: 4 }}>
          {fossMode
            ? (useFossHardwareSplit
              ? "FOSS · Vitrina (E) y bodega (BO) · herraje NUEVO/VIEJO"
              : "FOSS · Vitrina (E) y bodega (BO)")
            : resolveCinchoProductLabel(sample)}
          {" · "}
          {productRows.length} color{productRows.length !== 1 ? "es" : ""}
        </div>
      </ModalHeader>
      <ModalBody>
        <p style={{ fontSize: 12, color: "#4b5563", marginBottom: 12 }}>
          {fossMode
            ? (useFossHardwareSplit
              ? "Cuenta por herraje, color y talla en vitrina (E) y bodega (BO). Usa las pestañas para separar herraje nuevo y viejo."
              : "Cuenta por color y talla cuántos hay en vitrina (E) y cuántos en bodega (BO). Conteo anterior sin desglose de herraje.")
            : "Registra cuántas unidades hay de cada talla por color. El total se puede aplicar a la vitrina (E)."}
        </p>

        {useFossHardwareSplit && (
          <div className="mb-3">
            <ButtonGroup size="sm">
              {HARDWARE_KEYS.map((hw) => (
                <Button
                  key={hw}
                  color={activeHardware === hw ? "primary" : "secondary"}
                  outline={activeHardware !== hw}
                  onClick={() => setActiveHardware(hw)}
                >
                  {hardwareLabel(hw)}
                </Button>
              ))}
            </ButtonGroup>
          </div>
        )}

        {sizeKeys.length === 0 ? (
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Este cincho no tiene tallas registradas en el sistema. Verifica el inventario del kiosko.
          </p>
        ) : (
          productRows.map((row) => {
            const summary = rowSummaries.find((item) => item.key === rowKey(row));
            const systemSizes = row.systemSizes || {};
            const key = rowKey(row);
            const activeDraft = useFossHardwareSplit
              ? summary?.byHardware?.[activeHardware] || emptyLocationDraft()
              : null;

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
                        <th style={{ fontSize: 11, minWidth: 88 }}>Ubicación</th>
                        {sizeKeys.map((size) => (
                          <th key={size} style={{ fontSize: 11, textAlign: "center" }}>{size}</th>
                        ))}
                        <th style={{ fontSize: 11, textAlign: "right" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <SizeCountRow
                        label="Sistema"
                        sizeKeys={sizeKeys}
                        sizes={systemSizes}
                        total={sumSizeCounts(systemSizes)}
                      />
                      {fossMode ? (
                        useFossHardwareSplit ? (
                        <>
                          <SizeCountRow
                            label={`Vitrina E (${hardwareLabel(activeHardware)})`}
                            rowStyle={vitrineRowStyle}
                            sizeKeys={sizeKeys}
                            sizes={activeDraft?.[CINCHO_COUNT_LOCATION.VITRINE] || {}}
                            disabled={disabled}
                            onChange={(size, value) => handleFossSizeChange(
                              key,
                              activeHardware,
                              CINCHO_COUNT_LOCATION.VITRINE,
                              size,
                              value
                            )}
                            total={sumSizeCounts(activeDraft?.[CINCHO_COUNT_LOCATION.VITRINE])}
                            bold
                          />
                          <SizeCountRow
                            label={`Bodega BO (${hardwareLabel(activeHardware)})`}
                            rowStyle={warehouseRowStyle}
                            sizeKeys={sizeKeys}
                            sizes={activeDraft?.[CINCHO_COUNT_LOCATION.WAREHOUSE] || {}}
                            disabled={disabled}
                            onChange={(size, value) => handleFossSizeChange(
                              key,
                              activeHardware,
                              CINCHO_COUNT_LOCATION.WAREHOUSE,
                              size,
                              value
                            )}
                            total={sumSizeCounts(activeDraft?.[CINCHO_COUNT_LOCATION.WAREHOUSE])}
                            bold
                          />
                          <SizeCountRow
                            label="Total físico (ambos herrajes)"
                            sizeKeys={sizeKeys}
                            sizes={mergeFossLocationSizeTotals(summary?.mergedByLocation)}
                            total={summary?.sizeTotal ?? 0}
                            bold
                          />
                        </>
                        ) : (
                        <>
                          <SizeCountRow
                            label="Vitrina E"
                            rowStyle={vitrineRowStyle}
                            sizeKeys={sizeKeys}
                            sizes={summary?.byLocation?.[CINCHO_COUNT_LOCATION.VITRINE] || {}}
                            disabled={disabled}
                            onChange={(size, value) => handleFossLegacySizeChange(
                              key,
                              CINCHO_COUNT_LOCATION.VITRINE,
                              size,
                              value
                            )}
                            total={summary?.vitrineTotal ?? 0}
                            bold
                          />
                          <SizeCountRow
                            label="Bodega BO"
                            rowStyle={warehouseRowStyle}
                            sizeKeys={sizeKeys}
                            sizes={summary?.byLocation?.[CINCHO_COUNT_LOCATION.WAREHOUSE] || {}}
                            disabled={disabled}
                            onChange={(size, value) => handleFossLegacySizeChange(
                              key,
                              CINCHO_COUNT_LOCATION.WAREHOUSE,
                              size,
                              value
                            )}
                            total={summary?.warehouseTotal ?? 0}
                            bold
                          />
                          <SizeCountRow
                            label="Total físico"
                            sizeKeys={sizeKeys}
                            sizes={mergeFossLocationSizeTotals(summary?.byLocation)}
                            total={summary?.sizeTotal ?? 0}
                            bold
                          />
                        </>
                        )
                      ) : (
                        <SizeCountRow
                          label="Físico"
                          sizeKeys={sizeKeys}
                          sizes={summary?.sizes || {}}
                          disabled={disabled}
                          onChange={(size, value) => handleSimpleSizeChange(key, size, value)}
                          total={summary?.sizeTotal ?? 0}
                          bold
                        />
                      )}
                    </tbody>
                  </Table>
                </div>
                {fossMode && summary && (
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>
                    Grilla principal: E={summary.eCount}, BO={summary.boCount}
                    {summary.sizeTotal !== summary.locationTotal && (
                      <span style={{ color: "#b45309", marginLeft: 8 }}>
                        · Total tallas ({summary.sizeTotal}) ≠ ubicaciones ({summary.locationTotal})
                      </span>
                    )}
                  </div>
                )}
                {!fossMode && summary && summary.sizeTotal !== summary.locationTotal && (
                  <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>
                    Total por tallas ({summary.sizeTotal}) ≠ total por ubicaciones ({summary.locationTotal}).
                  </div>
                )}
              </div>
            );
          })
        )}

        {!fossMode && (
          <>
            <CustomInput
              type="checkbox"
              id="cincho-count-apply-e"
              label="Aplicar total por tallas a la columna E (vitrina) en la grilla principal"
              checked={applyToVitrine}
              disabled={disabled}
              onChange={(e) => setApplyToVitrine(e.target.checked)}
            />
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
              Luego puedes ajustar otras vitrinas (V1–V7) o bodega (BO) en la tabla principal.
            </div>
          </>
        )}
        {fossMode && useFossHardwareSplit && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
            Al aplicar, las columnas E y BO se actualizan con el total por color y se guarda el desglose NUEVO/VIEJO por ubicación.
          </div>
        )}
        {fossMode && !useFossHardwareSplit && (
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
            Al aplicar, las columnas E y BO de la grilla se actualizan con estos totales por color.
          </div>
        )}
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
