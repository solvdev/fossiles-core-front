import React, { useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Table } from "reactstrap";
import {
  applySupplierCodes,
  downloadSupplierCodesTemplate,
  previewSupplierCodes,
} from "services/supplierService";
import { Kbd, useHotkeys } from "hooks/useKeyboard";

const STATUS = {
  OK: { color: "success", label: "Coincide" },
  SIN_CAMBIO: { color: "secondary", label: "Ya lo tiene" },
  REVISAR: { color: "warning", label: "Revisar" },
  NUEVO: { color: "info", label: "Nuevo" },
  ERROR: { color: "danger", label: "Error" },
};

const CREATE = "create";
const SKIP = "skip";

/**
 * Proveedores › Cargar códigos: sube el Excel con los códigos del sistema anterior, muestra la revisión y aplica.
 * Cada fila «Revisar» o «Nuevo» se decide en su lista: un proveedor, crearlo u omitir la fila.
 */
function SupplierCodesImport({ isOpen, toggle, onApplied, suppliers = [] }) {
  const [preview, setPreview] = useState(null);
  const [choice, setChoice] = useState({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const reset = () => {
    setPreview(null);
    setChoice({});
    setFilter("all");
    setError("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    reset();
    toggle();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await previewSupplierCodes(file);
      const initial = {};
      data.rows.forEach((r) => {
        if (r.status === "ERROR" || r.status === "SIN_CAMBIO") initial[r.row] = SKIP;
        else if (r.status === "NUEVO") initial[r.row] = CREATE;
        else initial[r.row] = String(r.supplierId);
      });
      setChoice(initial);
      setPreview(data);
    } catch (err) {
      setError(err.message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const rows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r) => filter === "all" || (r.status !== "OK" && r.status !== "SIN_CAMBIO"));
  }, [preview, filter]);

  // Un mismo proveedor no puede quedar en dos filas.
  const duplicated = useMemo(() => {
    const seen = {};
    const dup = new Set();
    Object.entries(choice).forEach(([row, value]) => {
      if (value === SKIP || value === CREATE) return;
      if (seen[value]) {
        dup.add(Number(row));
        dup.add(Number(seen[value]));
      } else seen[value] = row;
    });
    return dup;
  }, [choice]);

  const toApply = preview
    ? preview.rows.filter((r) => choice[r.row] && choice[r.row] !== SKIP && r.status !== "ERROR")
    : [];

  const apply = async () => {
    if (!preview || loading || duplicated.size > 0 || toApply.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const items = toApply.map((r) =>
        choice[r.row] === CREATE
          ? { row: r.row, code: r.code, create: true, name: r.name, nit: r.nit, phone: r.phone }
          : { row: r.row, code: r.code, supplierId: Number(choice[r.row]), create: false }
      );
      const res = await applySupplierCodes(items);
      setResult(res);
      setPreview(null);
      onApplied?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useHotkeys({ "ctrl+enter": () => apply() }, { enabled: isOpen });

  const options = (r) => {
    const ids = new Set((r.candidates || []).map((c) => c.id));
    const others = suppliers.filter((s) => !ids.has(s.id));
    return (
      <Input
        type="select"
        bsSize="sm"
        aria-label={`Proveedor para ${r.code}`}
        value={choice[r.row] || SKIP}
        onChange={(e) => setChoice({ ...choice, [r.row]: e.target.value })}
        invalid={duplicated.has(r.row)}
      >
        {(r.candidates || []).map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
            {c.code ? ` (hoy ${c.code})` : ""}
          </option>
        ))}
        <option value={CREATE}>Crear proveedor nuevo con este nombre</option>
        <option value={SKIP}>Omitir esta fila</option>
        {others.length > 0 && (
          <optgroup label="Otro proveedor">
            {others.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
                {s.code ? ` (hoy ${s.code})` : ""}
              </option>
            ))}
          </optgroup>
        )}
      </Input>
    );
  };

  const counts = preview?.counts || {};

  return (
    <Modal isOpen={isOpen} toggle={close} size="xl">
      <ModalHeader toggle={close}>Cargar códigos del sistema anterior</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        {result && (
          <Alert color="success">
            Listo: {result.updated} proveedor(es) con código nuevo, {result.created} creado(s), {result.unchanged} ya lo tenían.
            {result.recoded?.length > 0 && (
              <div className="mt-2">
                Estos tenían uno de esos códigos y no venían en el archivo; quedaron con el siguiente libre:
                <ul className="mb-0">
                  {result.recoded.map((r) => (
                    <li key={r.id}>
                      {r.name}: {r.oldCode} → <strong>{r.newCode}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Alert>
        )}
        <div className="d-flex flex-wrap align-items-end" style={{ gap: 16 }}>
          <div>
            <div className="small text-muted mb-1">1. Bajar la plantilla y llenarla con código, nombre y NIT.</div>
            <Button color="primary" outline size="sm" onClick={() => downloadSupplierCodesTemplate().catch((e) => setError(e.message))}>
              Bajar plantilla
            </Button>
          </div>
          <div>
            <div className="small text-muted mb-1">2. Subirla para revisar (no cambia nada todavía).</div>
            <Input innerRef={fileRef} type="file" accept=".xlsx,.xls" onChange={onFile} disabled={loading} autoFocus />
          </div>
          {preview && (
            <div className="ml-auto">
              <Input type="select" bsSize="sm" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Mostrar">
                <option value="all">Todas las filas ({preview.readRows})</option>
                <option value="review">Solo las que hay que revisar</option>
              </Input>
            </div>
          )}
        </div>
        {loading && <p className="mt-3">Revisando…</p>}
        {preview && (
          <>
            <div className="mt-3 small">
              {counts.OK || 0} coinciden · {counts.SIN_CAMBIO || 0} ya lo tienen · {counts.REVISAR || 0} por revisar ·{" "}
              {counts.NUEVO || 0} nuevos · {counts.ERROR || 0} con error (no se aplican)
            </div>
            <div style={{ maxHeight: "55vh", overflowY: "auto" }} className="mt-2">
              <Table size="sm" responsive>
                <thead className="text-primary">
                  <tr>
                    <th>Fila</th>
                    <th>Código</th>
                    <th>Nombre en el Excel</th>
                    <th>NIT</th>
                    <th style={{ minWidth: 280 }}>Proveedor en Fossiles</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row}>
                      <td className="text-muted">{r.row}</td>
                      <td style={{ fontFamily: "ui-monospace, Consolas, monospace", fontWeight: 600 }}>{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.nit || "—"}</td>
                      <td>
                        {r.status === "ERROR" ? (
                          "—"
                        ) : r.status === "OK" || r.status === "SIN_CAMBIO" ? (
                          <>
                            {r.supplierName}
                            {r.currentCode && r.currentCode !== r.code && (
                              <div className="small text-muted">hoy {r.currentCode}</div>
                            )}
                          </>
                        ) : (
                          options(r)
                        )}
                        {duplicated.has(r.row) && <div className="text-danger small">Ese proveedor ya está en otra fila.</div>}
                      </td>
                      <td>
                        <Badge color={STATUS[r.status]?.color || "secondary"}>{STATUS[r.status]?.label || r.status}</Badge>
                        <div className="small text-muted">{r.message}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter className="d-flex justify-content-between">
        <span className="kbd-bar">
          <span><Kbd>Tab</Kbd> moverse</span>
          <span><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> aplicar</span>
          <span><Kbd>Esc</Kbd> cerrar</span>
        </span>
        <span>
          <Button color="secondary" onClick={close} className="mr-2">
            Cerrar
          </Button>
          <Button color="primary" onClick={apply} disabled={!preview || loading || duplicated.size > 0 || toApply.length === 0}>
            Aplicar códigos ({toApply.length})
          </Button>
        </span>
      </ModalFooter>
    </Modal>
  );
}

export default SupplierCodesImport;
