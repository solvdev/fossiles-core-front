import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
} from "reactstrap";
import {
  completeKioskSimpleReturn,
  lookupKioskSale,
} from "services/kioskExchangeService";
import { getKioscoConteoHistorial, registrarKioscoDevolucionDeposito } from "services/kioscoInventoryService";
import { filterVisibleKioskStockRows } from "utils/productCinchoHelper";
import {
  buildKioskReturnSlipPrintHtml,
  openExchangeSlipPrintWindow,
} from "utils/kioskExchangeSlipPrint";
import {
  formatCurrency,
  formatQty,
  posVariantNeedsSizePick,
  posVariantSizeEntries,
  sortPosSizeKeys,
} from "../pos/posUtils";

const RETURN_TYPE_CLIENT = "CLIENT";
const RETURN_TYPE_DEPOSIT = "DEPOSIT";

const stockRowKey = (row) => `${row.productId}-${row.colorId || ""}`;

function SimpleReturnWizard({ isOpen, onClose, kioskLocationId, physicalCountId, onCompleted }) {
  const [returnType, setReturnType] = useState(RETURN_TYPE_DEPOSIT);
  const [step, setStep] = useState(1);
  const [saleQuery, setSaleQuery] = useState("");
  const [sale, setSale] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [returnedQty, setReturnedQty] = useState("1");
  const [apto, setApto] = useState("true");
  const [reason, setReason] = useState("");
  const [observations, setObservations] = useState("");
  const [physicalSlipNumber, setPhysicalSlipNumber] = useState("");
  const [stockRows, setStockRows] = useState([]);
  const [stockSearch, setStockSearch] = useState("");
  const [selectedStockKey, setSelectedStockKey] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [lineQty, setLineQty] = useState("1");
  const [depositLines, setDepositLines] = useState([]);
  const [linkedCountId, setLinkedCountId] = useState("");
  const [draftCounts, setDraftCounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetState = () => {
    setReturnType(RETURN_TYPE_DEPOSIT);
    setStep(1);
    setSaleQuery("");
    setSale(null);
    setSelectedItemId("");
    setReturnedQty("1");
    setApto("true");
    setReason("");
    setObservations("");
    setPhysicalSlipNumber("");
    setStockRows([]);
    setStockSearch("");
    setSelectedStockKey("");
    setSelectedSize("");
    setLineQty("1");
    setDepositLines([]);
    setLinkedCountId(physicalCountId ? String(physicalCountId) : "");
    setDraftCounts([]);
    setError("");
  };

  useEffect(() => {
    if (!isOpen || !kioskLocationId) return;
    void getKioscoConteoHistorial(kioskLocationId)
      .then((rows) => {
        const openCounts = (Array.isArray(rows) ? rows : []).filter((row) => {
          const status = String(row.status || "").toUpperCase();
          return status === "DRAFT" || status === "CONTADO";
        });
        setDraftCounts(openCounts);
        if (physicalCountId) {
          setLinkedCountId(String(physicalCountId));
        } else if (openCounts.length === 1) {
          setLinkedCountId(String(openCounts[0].id));
        }
      })
      .catch(() => setDraftCounts([]));
  }, [isOpen, kioskLocationId, physicalCountId]);

  useEffect(() => {
    if (!isOpen) return;
    resetState();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || returnType !== RETURN_TYPE_DEPOSIT || !kioskLocationId) return;
    void loadStock();
  }, [isOpen, returnType, kioskLocationId]);

  const selectedItem = useMemo(
    () => (sale?.items || []).find((item) => String(item.id) === String(selectedItemId)),
    [sale, selectedItemId]
  );

  const availableStock = useMemo(
    () => (stockRows || []).filter((row) => Number(row.currentStock || 0) > 0),
    [stockRows]
  );

  const filteredStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    if (!q) return availableStock;
    return availableStock.filter((row) => {
      const text = `${row.productCode || ""} ${row.productName || ""} ${row.colorName || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [availableStock, stockSearch]);

  const selectedStockRow = useMemo(
    () => availableStock.find((row) => stockRowKey(row) === selectedStockKey),
    [availableStock, selectedStockKey]
  );

  const sizeOptions = useMemo(() => {
    if (!selectedStockRow) return [];
    return posVariantSizeEntries({ sizes: selectedStockRow.sizes });
  }, [selectedStockRow]);

  const maxLineQty = useMemo(() => {
    if (!selectedStockRow) return 0;
    if (posVariantNeedsSizePick(selectedStockRow) && selectedSize) {
      const entry = sizeOptions.find((item) => item.size === selectedSize);
      return Number(entry?.quantity || 0);
    }
    return Number(selectedStockRow.currentStock || 0);
  }, [selectedStockRow, selectedSize, sizeOptions]);

  const loadStock = async () => {
    try {
      setLoading(true);
      const rows = await getKioscoStock(kioskLocationId);
      setStockRows(filterVisibleKioskStockRows(Array.isArray(rows) ? rows : []));
    } catch (err) {
      setError(err.message || "No se pudo cargar el inventario del kiosko.");
    } finally {
      setLoading(false);
    }
  };

  const handleLookupSale = async () => {
    setError("");
    if (!saleQuery.trim()) {
      setError("Indica el número de venta POS.");
      return;
    }
    try {
      setLoading(true);
      const result = await lookupKioskSale(saleQuery.trim(), kioskLocationId);
      setSale(result);
      setSelectedItemId(result?.items?.length === 1 ? String(result.items[0].id) : "");
      setStep(3);
    } catch (err) {
      setError(err.message || "No se encontró la venta.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddDepositLine = () => {
    setError("");
    if (!selectedStockRow) {
      setError("Selecciona un producto del inventario del kiosko.");
      return;
    }
    if (posVariantNeedsSizePick(selectedStockRow) && !selectedSize) {
      setError("Selecciona la talla a devolver.");
      return;
    }
    const qty = Math.max(1, Number(lineQty || 1));
    if (qty > maxLineQty) {
      setError(`Cantidad máxima disponible: ${formatQty(maxLineQty)}`);
      return;
    }
    const lineKey = `${stockRowKey(selectedStockRow)}:${selectedSize || ""}`;
    const existing = depositLines.find((line) => line.lineKey === lineKey);
    if (existing) {
      setError("Esa combinación producto/color/talla ya está en la lista.");
      return;
    }
    setDepositLines((prev) => [
      ...prev,
      {
        lineKey,
        productId: selectedStockRow.productId,
        colorId: selectedStockRow.colorId,
        productCode: selectedStockRow.productCode,
        productName: selectedStockRow.productName,
        colorName: selectedStockRow.colorName,
        size: selectedSize || null,
        quantity: qty,
        maxQty: maxLineQty,
      },
    ]);
    setSelectedStockKey("");
    setSelectedSize("");
    setLineQty("1");
  };

  const handleRemoveDepositLine = (lineKey) => {
    setDepositLines((prev) => prev.filter((line) => line.lineKey !== lineKey));
  };

  const resolvedPhysicalCountId = linkedCountId ? Number(linkedCountId) : null;

  const renderCountSelector = () => {
    if (draftCounts.length === 0) {
      return (
        <p className="text-muted" style={{ fontSize: 13 }}>
          No hay conteo físico abierto. La devolución a bodega contará por fecha del movimiento.
        </p>
      );
    }
    return (
      <FormGroup>
        <Label>Conteo físico (Salidas del corte)</Label>
        <Input
          type="select"
          value={linkedCountId}
          onChange={(e) => setLinkedCountId(e.target.value)}
        >
          <option value="">Sin asociar — solo por fecha</option>
          {draftCounts.map((count) => (
            <option key={count.id} value={String(count.id)}>
              {count.periodFrom} → {count.periodTo} ({count.status || "DRAFT"})
            </option>
          ))}
        </Input>
      </FormGroup>
    );
  };

  const handleSubmitClient = async () => {
    setError("");
    if (!selectedItem) {
      setError("Selecciona la línea devuelta.");
      return;
    }
    if (!reason.trim()) {
      setError("Indica el motivo de la devolución.");
      return;
    }
    if (!physicalSlipNumber.trim()) {
      setError("Indica el número de boleta de devolución física.");
      return;
    }
    try {
      setLoading(true);
      const slip = await completeKioskSimpleReturn({
        kioskLocationId,
        originalSaleId: sale.id,
        originalSaleItemId: selectedItem.id,
        returnedQuantity: Number(returnedQty || 1),
        apto: apto === "true",
        physicalSlipNumber: physicalSlipNumber.trim(),
        reason: reason.trim(),
        observations: observations.trim() || null,
        physicalCountId: resolvedPhysicalCountId,
      });
      openExchangeSlipPrintWindow(buildKioskReturnSlipPrintHtml(slip));
      onCompleted?.(slip);
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo registrar la devolución.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitDeposit = async () => {
    setError("");
    if (depositLines.length === 0) {
      setError("Agrega al menos un producto a devolver.");
      return;
    }
    if (!physicalSlipNumber.trim()) {
      setError("Indica el número de boleta física de respaldo.");
      return;
    }
    if (!reason.trim()) {
      setError("Indica el motivo de la devolución a bodega.");
      return;
    }
    try {
      setLoading(true);
      const slipNo = physicalSlipNumber.trim();
      const reasonText = reason.trim();
      for (const line of depositLines) {
        await registrarKioscoDevolucionDeposito(kioskLocationId, {
          productId: line.productId,
          colorId: line.colorId || null,
          quantity: line.quantity,
          sizeKey: line.size || null,
          physicalSlipNumber: slipNo,
          reason: reasonText,
          physicalCountId: resolvedPhysicalCountId,
        });
      }
      onCompleted?.();
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo registrar la devolución a bodega.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinueFromType = () => {
    setError("");
    if (returnType === RETURN_TYPE_CLIENT) {
      setStep(2);
      return;
    }
    setStep(2);
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} size="lg">
      <ModalHeader toggle={onClose}>Nueva devolución</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}

        {step === 1 && (
          <>
            <FormGroup>
              <Label>Tipo de devolución</Label>
              <Input
                type="select"
                value={returnType}
                onChange={(e) => {
                  setReturnType(e.target.value);
                  setStep(1);
                  setSale(null);
                  setDepositLines([]);
                }}
              >
                <option value={RETURN_TYPE_DEPOSIT}>Devolución a bodega (desde inventario kiosko)</option>
                <option value={RETURN_TYPE_CLIENT}>Devolución de cliente (con venta POS)</option>
              </Input>
            </FormGroup>
            <p className="text-muted" style={{ fontSize: 13 }}>
              {returnType === RETURN_TYPE_DEPOSIT
                ? "Registra la salida de productos del kiosko hacia bodega. No requiere número de venta: eliges del stock actual (color, talla y cantidad) y anotas la boleta física de respaldo."
                : "Devolución ligada a una venta POS original. El producto vuelve al inventario del kiosko si es apto para reventa."}
            </p>
          </>
        )}

        {step === 2 && returnType === RETURN_TYPE_CLIENT && (
          <>
            <Label>Número de venta original (POS)</Label>
            <div className="d-flex">
              <Input
                value={saleQuery}
                onChange={(e) => setSaleQuery(e.target.value)}
                placeholder="Ej: POS-2026-0042"
                className="mr-2"
              />
              <Button color="primary" onClick={() => void handleLookupSale()} disabled={loading}>
                Buscar
              </Button>
            </div>
          </>
        )}

        {step === 3 && returnType === RETURN_TYPE_CLIENT && sale && (
          <>
            <p className="text-muted">Venta {sale.saleNumber} · {sale.saleDate}</p>
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th />
                  <th>Código</th>
                  <th>Artículo</th>
                  <th>Cant.</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Input
                        type="radio"
                        name="return-line-simple"
                        checked={String(selectedItemId) === String(item.id)}
                        onChange={() => {
                          setSelectedItemId(String(item.id));
                          setReturnedQty(String(item.quantity || 1));
                        }}
                      />
                    </td>
                    <td>{item.productCode}</td>
                    <td>{item.productName}</td>
                    <td>{formatQty(item.quantity)}</td>
                    <td>{formatCurrency(item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <FormGroup className="mt-2" style={{ maxWidth: 180 }}>
              <Label>Cantidad devuelta</Label>
              <Input type="number" min="1" step="1" value={returnedQty} onChange={(e) => setReturnedQty(e.target.value)} />
            </FormGroup>
            <FormGroup>
              <Label>¿Producto apto para reventa?</Label>
              <Input type="select" value={apto} onChange={(e) => setApto(e.target.value)}>
                <option value="true">Sí — queda en inventario del kiosko</option>
                <option value="false">No — merma</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Número de boleta de devolución (física)</Label>
              <Input value={physicalSlipNumber} onChange={(e) => setPhysicalSlipNumber(e.target.value)} placeholder="Ej: BD-0042" />
            </FormGroup>
            <FormGroup>
              <Label>Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormGroup>
            <FormGroup>
              <Label>Observaciones</Label>
              <Input type="textarea" value={observations} onChange={(e) => setObservations(e.target.value)} />
            </FormGroup>
            {renderCountSelector()}
          </>
        )}

        {step === 2 && returnType === RETURN_TYPE_DEPOSIT && (
          <>
            <FormGroup>
              <Label>Buscar en inventario del kiosko</Label>
              <Input value={stockSearch} onChange={(e) => setStockSearch(e.target.value)} placeholder="Código, nombre o color" />
            </FormGroup>
            <FormGroup>
              <Label>Producto / color</Label>
              <Input
                type="select"
                value={selectedStockKey}
                onChange={(e) => {
                  setSelectedStockKey(e.target.value);
                  setSelectedSize("");
                  setLineQty("1");
                }}
              >
                <option value="">— Seleccionar —</option>
                {filteredStock.map((row) => (
                  <option key={stockRowKey(row)} value={stockRowKey(row)}>
                    {row.productCode} · {row.productName} · {row.colorName || "Sin color"} · Disp. {formatQty(row.currentStock)}
                  </option>
                ))}
              </Input>
            </FormGroup>
            {selectedStockRow && posVariantNeedsSizePick(selectedStockRow) && (
              <FormGroup>
                <Label>Talla</Label>
                <Input type="select" value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                  <option value="">— Seleccionar talla —</option>
                  {sortPosSizeKeys(sizeOptions.map((item) => item.size)).map((size) => {
                    const entry = sizeOptions.find((item) => item.size === size);
                    return (
                      <option key={size} value={size}>
                        {size} · Disp. {formatQty(entry?.quantity || 0)}
                      </option>
                    );
                  })}
                </Input>
              </FormGroup>
            )}
            <FormGroup style={{ maxWidth: 180 }}>
              <Label>Cantidad a devolver</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={lineQty}
                onChange={(e) => setLineQty(e.target.value)}
                disabled={!selectedStockRow}
              />
              {selectedStockRow && (
                <small className="text-muted">Máximo: {formatQty(maxLineQty)}</small>
              )}
            </FormGroup>
            <Button color="secondary" outline size="sm" onClick={handleAddDepositLine} disabled={!selectedStockRow}>
              Agregar línea
            </Button>

            {depositLines.length > 0 && (
              <Table responsive size="sm" className="mt-3 mb-0">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Color</th>
                    <th>Talla</th>
                    <th>Cant.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {depositLines.map((line) => (
                    <tr key={line.lineKey}>
                      <td>{line.productCode} {line.productName}</td>
                      <td>{line.colorName || "—"}</td>
                      <td>{line.size || "—"}</td>
                      <td>{formatQty(line.quantity)}</td>
                      <td className="text-right">
                        <Button color="link" size="sm" className="text-danger p-0" onClick={() => handleRemoveDepositLine(line.lineKey)}>
                          Quitar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            <hr />
            <FormGroup>
              <Label>Número de boleta física (respaldo)</Label>
              <Input value={physicalSlipNumber} onChange={(e) => setPhysicalSlipNumber(e.target.value)} placeholder="Ej: BD-0042" />
            </FormGroup>
            <FormGroup>
              <Label>Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormGroup>
            {renderCountSelector()}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {step === 1 && (
          <Button color="primary" onClick={handleContinueFromType}>
            Continuar
          </Button>
        )}
        {step === 2 && returnType === RETURN_TYPE_CLIENT && (
          <Button color="secondary" outline onClick={() => setStep(1)} disabled={loading}>
            Atrás
          </Button>
        )}
        {step === 2 && returnType === RETURN_TYPE_DEPOSIT && (
          <>
            <Button color="secondary" outline onClick={() => setStep(1)} disabled={loading}>
              Atrás
            </Button>
            <Button color="success" onClick={() => void handleSubmitDeposit()} disabled={loading || depositLines.length === 0}>
              {loading ? "Guardando..." : "Registrar devolución a bodega"}
            </Button>
          </>
        )}
        {step === 3 && returnType === RETURN_TYPE_CLIENT && (
          <>
            <Button color="secondary" outline onClick={() => setStep(2)} disabled={loading}>
              Atrás
            </Button>
            <Button color="success" onClick={() => void handleSubmitClient()} disabled={loading}>
              {loading ? "Guardando..." : "Registrar devolución"}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

export default SimpleReturnWizard;
