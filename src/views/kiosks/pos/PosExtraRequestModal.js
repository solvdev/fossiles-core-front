import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "reactstrap";
import { formatCurrency, parsePosQty } from "./posUtils";

const DESCRIPTION_MAX = 300;

/** Pide la autorización de un complemento extra (monto adicional por pieza) para una línea del carrito. */
function PosExtraRequestModal({ isOpen, line, onClose, onSubmit, submitting = false }) {
  const [pieces, setPieces] = useState("1");
  const [description, setDescription] = useState("");
  const [extraAmount, setExtraAmount] = useState("");

  useEffect(() => {
    if (isOpen) {
      setPieces("1");
      setDescription("");
      setExtraAmount("");
    }
  }, [isOpen, line?.key]);

  const maxPieces = Math.max(1, Math.floor(Number(line?.quantity || 1)));
  const piecesNum = Math.min(Math.max(1, parsePosQty(pieces) || 1), maxPieces);
  const extraNum = Number(extraAmount);
  const validAmount = Number.isFinite(extraNum) && extraNum > 0;
  const canSubmit = !submitting && description.trim().length > 0 && validAmount;

  const preview = useMemo(() => {
    const unit = Number(line?.unitPrice || 0);
    return {
      unitWithExtra: unit + (validAmount ? extraNum : 0),
      extraTotal: validAmount ? extraNum * piecesNum : 0,
    };
  }, [line?.unitPrice, validAmount, extraNum, piecesNum]);

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      pieces: piecesNum,
      description: description.trim(),
      extraAmount: Math.round(extraNum * 100) / 100,
    });
  };

  return (
    <Modal isOpen={isOpen} toggle={submitting ? undefined : onClose} centered>
      <ModalHeader toggle={submitting ? undefined : onClose}>Complemento extra</ModalHeader>
      <ModalBody>
        {line ? (
          <p className="mb-3">
            <strong>{line.productName}</strong>
            <span className="text-muted">
              {" "}· {line.colorName || "Sin color"}
              {line.size ? ` · Talla ${line.size}` : ""}
            </span>
            <br />
            <span className="text-muted small">
              Precio normal {formatCurrency(line.unitPrice)} c/u. El extra se cobra por pieza y no lleva descuento.
              Admin o logística debe autorizarlo antes de cobrar.
            </span>
          </p>
        ) : null}
        <FormGroup>
          <Label>Piezas con complemento (de {maxPieces})</Label>
          <Input
            type="number"
            min="1"
            max={maxPieces}
            step="1"
            inputMode="numeric"
            value={pieces}
            onChange={(e) => setPieces(e.target.value)}
          />
        </FormGroup>
        <FormGroup>
          <Label>Descripción del complemento</Label>
          <Input
            type="textarea"
            rows="3"
            maxLength={DESCRIPTION_MAX}
            placeholder="Ej. Hebilla grabada con iniciales"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <small className="text-muted">{description.length}/{DESCRIPTION_MAX}</small>
        </FormGroup>
        <FormGroup>
          <Label>Monto extra por pieza (Q)</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={extraAmount}
            onChange={(e) => setExtraAmount(e.target.value)}
          />
        </FormGroup>
        {validAmount ? (
          <div className="kiosk-pos-extra-preview">
            Precio con complemento: <strong>{formatCurrency(preview.unitWithExtra)}</strong> c/u
            {" "}· extra total <strong>{formatCurrency(preview.extraTotal)}</strong>
          </div>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button color="primary" onClick={submit} disabled={!canSubmit}>
          {submitting ? "Enviando..." : "Solicitar autorización"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosExtraRequestModal;
