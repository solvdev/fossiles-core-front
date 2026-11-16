import React, { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { applyCountImport, previewCountImport } from "services/kioskCountCalendarService";
import { parseLiquidationSheets } from "utils/kioskLiquidationSheetParser";
import { formatDmy } from "utils/kioskCountDateHelper";
import { showError, showSuccess } from "utils/notificationHelper";

/**
 * Carga el Excel «Liquidaciones por semana» de contabilidad: se lee en el navegador, se muestra qué se entendió y qué
 * no, y solo al confirmar se guarda. El Excel manda sobre lo que ya tenga el sistema.
 */
export default function KioskCountImportModal({ onClose, onDone }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setPreview(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheets = workbook.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: true }),
      }));
      const result = parseLiquidationSheets(sheets);
      if (!result.rows.length) {
        throw new Error("No encontré filas de inventario en el archivo. ¿Es el Excel de liquidaciones por semana?");
      }
      setParsed(result);
      setPreview(await previewCountImport(result.rows));
    } catch (error) {
      showError(error.message || "No se pudo leer el archivo.");
      setFileName("");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    try {
      const result = await applyCountImport(parsed.rows);
      showSuccess(`Cargado: ${result.history} conteos y ${result.liquidations} liquidaciones.`);
      onDone(result);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen toggle={onClose} centered size="lg" className="kcc-modal">
      <ModalHeader toggle={onClose}>Cargar historial del Excel de liquidaciones</ModalHeader>
      <ModalBody>
        <p className="kcc-muted">
          Sube el Excel «Liquidaciones por semana» (hojas de Anita y Gaby). Se cargan los <strong>conteos ya hechos</strong>{" "}
          (el «al» de cada período), que el calendario usa como último conteo de cada kiosco, y las{" "}
          <strong>liquidaciones</strong> con quién de contabilidad las revisa y sus facturas verdes. Si algo ya estaba en el
          sistema, manda el Excel.
        </p>
        <label className="kcc-file">
          <input type="file" accept=".xlsx,.xlsm,.xls" onChange={pickFile} disabled={busy} />
          <span>{fileName || "Elegir archivo…"}</span>
        </label>
        {busy && !preview && (
          <div className="kcc-center">
            <Spinner color="primary" />
          </div>
        )}

        {preview && parsed && (
          <div className="kcc-import">
            <div className="kcc-stats kcc-stats-3">
              <div>
                <strong>{preview.matchedRows}</strong>
                <span>conteos que se cargan</span>
              </div>
              <div>
                <strong>{preview.kiosks}</strong>
                <span>kioscos</span>
              </div>
              <div>
                <strong>{preview.withLiquidation}</strong>
                <span>con fecha de liquidación</span>
              </div>
            </div>
            <p className="kcc-muted">
              Conteos del {formatDmy(preview.firstPeriodTo)} al {formatDmy(preview.lastPeriodTo)}.
              {preview.alreadyImported > 0 && ` ${preview.alreadyImported} ya estaban cargados y se actualizan.`}
            </p>

            {preview.unmatched.length > 0 && (
              <div className="kcc-alert kcc-alert-info">
                <strong>Sin kiosco en el sistema (no se cargan):</strong>{" "}
                {preview.unmatched.map((u) => `${u.name} (${u.rows})`).join(", ")}. Suelen ser kioscos cerrados.
              </div>
            )}
            {preview.unmatchedAccountants?.length > 0 && (
              <div className="kcc-alert kcc-alert-info">
                <strong>Contabilidad sin usuario:</strong> {preview.unmatchedAccountants.join(", ")}. Se cargan como texto;
                para asignarlos hay que darles un usuario con rol de contabilidad.
              </div>
            )}
            {preview.conflicts.length > 0 && (
              <div className="kcc-alert kcc-alert-warn">
                <strong>{preview.conflicts.length} conteos con fecha distinta en el sistema.</strong> Manda el Excel:
                <ul>
                  {preview.conflicts.slice(0, 6).map((c) => (
                    <li key={`${c.kiosk}-${c.excelPeriodTo}`}>
                      {c.kiosk}: Excel {formatDmy(c.excelPeriodTo)} · sistema {formatDmy(c.systemPeriodTo)}
                    </li>
                  ))}
                  {preview.conflicts.length > 6 && <li>y {preview.conflicts.length - 6} más…</li>}
                </ul>
              </div>
            )}
            {preview.warnings.length > 0 && (
              <div className="kcc-alert kcc-alert-warn">
                <strong>Revisa el Excel:</strong>
                <ul>
                  {preview.warnings.slice(0, 8).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                  {preview.warnings.length > 8 && <li>y {preview.warnings.length - 8} avisos más…</li>}
                </ul>
              </div>
            )}
            {(parsed.notes.length > 0 || parsed.skipped.length > 0) && (
              <>
                <button type="button" className="kcc-link" onClick={() => setShowNotes((v) => !v)}>
                  {showNotes ? "Ocultar" : "Ver"} {parsed.skipped.length} filas omitidas y {parsed.notes.length} notas
                </button>
                {showNotes && (
                  <ul className="kcc-rules plain kcc-notes">
                    {parsed.skipped.map((s) => (
                      <li key={`${s.sheet}-${s.row}`}>
                        <strong>{s.kiosk}</strong> · fila {s.row} · {s.reason}
                      </li>
                    ))}
                    {parsed.notes.map((n) => (
                      <li key={`${n.sheet}-${n.row}-n`}>{n.text}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Cancelar
        </Button>
        <Button color="primary" disabled={!preview || preview.matchedRows === 0 || busy} onClick={confirm}>
          {busy && preview ? <Spinner size="sm" /> : `Cargar ${preview ? preview.matchedRows : ""} conteos`}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
