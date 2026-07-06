import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import {
  addKioscoNotificationRecipient,
  cerrarKioscoConteo,
  getKioscoConteoHistorial,
  getKioscoConteoReport,
  getKioscoNotificationRecipients,
  removeKioscoNotificationRecipient,
  revisarKioscoConteo,
  saveKioscoConteoItems,
  startKioscoConteo,
} from "services/kioscoInventoryService";
import { formatDateGt, formatDateTimeGt } from "utils/dateTimeHelper";
import { exportConteoToExcel, exportConteoToPdf } from "utils/kioscoConteoExport";
import { PRODUCT_AUDIENCE_OPTIONS, productMatchesAudienceFilter } from "utils/productAudienceHelper";
import {
  CINCHO_FILTER_OPTIONS,
  hasAssignedProductColor,
  productMatchesCinchoFilter,
  productMatchesSearchFilter,
  resolveSizesSummary,
} from "utils/productCinchoHelper";
import { showError, showSuccess } from "utils/notificationHelper";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
const PRODUCT_INFO_COLS = 3;

/** Diferencia absoluta minima (unidades) para considerar una discrepancia relevante. Debe reflejar
 * KioscoInventoryCountService.DIFF_ALERT_THRESHOLD en el backend. */
const DIFF_ALERT_THRESHOLD = 3;

const KARDEX_COLUMNS = [
  { key: "inventarioInicial", label: "Ini.", title: "Inventario Inicial" },
  { key: "comprasAjustes", label: "Comp.", title: "Compras / Ajustes" },
  { key: "anulacionCompras", label: "A.C.", title: "Anulación Compras" },
  { key: "entradas", label: "Ent.", title: "Entradas (distribución)" },
  { key: "ventas", label: "Vtas.", title: "Ventas" },
  { key: "anulacionVenta", label: "A.V.", title: "Anulación Venta" },
  { key: "salida", label: "Sal.", title: "Salida" },
  { key: "inventarioFinal", label: "Fin.", title: "Inventario Final (sistema)" },
];

const rowKey = (row) => `${row.productId}-${row.colorId || ""}`;

const rowTotal = (counts) => COUNT_LOCATION_KEYS.reduce((s, k) => s + Number(counts[k] || 0), 0);
const rowDiff = (row, counts) => row.inventarioFinal - rowTotal(counts);

const sumFilteredRows = (rows) => {
  const totalCounts = {};
  COUNT_LOCATION_KEYS.forEach((k) => {
    totalCounts[k] = rows.reduce((s, r) => s + Number((r.counts || {})[k] || 0), 0);
  });
  const sumField = (key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
  const total = rows.reduce((s, r) => s + Number(r.total || 0), 0);
  return {
    inventarioInicial: sumField("inventarioInicial"),
    comprasAjustes: sumField("comprasAjustes"),
    anulacionCompras: sumField("anulacionCompras"),
    entradas: sumField("entradas"),
    ventas: sumField("ventas"),
    anulacionVenta: sumField("anulacionVenta"),
    salida: sumField("salida"),
    inventarioFinal: sumField("inventarioFinal"),
    counts: totalCounts,
    total,
    diferencia: sumField("diferencia"),
  };
};

const fmt = (v) => formatDateGt(v, { month: "short" });
const fmtDt = (v) => (v ? formatDateTimeGt(v) : null);

// ─── Celda de conteo editable ─────────────────────────────────────────────────
function CountCell({ value, onChange, disabled }) {
  return (
    <input
      type="number"
      min="0"
      step="1"
      value={value ?? 0}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      disabled={disabled}
      style={{
        width: 48,
        padding: "2px 4px",
        fontSize: 12,
        textAlign: "right",
        border: "1px solid #d1d5db",
        borderRadius: 4,
        background: disabled ? "#f3f4f6" : value > 0 ? "#f0fdf4" : "#fff",
      }}
    />
  );
}

// ─── Fila de datos ────────────────────────────────────────────────────────────
function DataRow({ row, showKardex, counts, onCountChange, disabled }) {
  const total = rowTotal(counts);
  const diferencia = rowDiff(row, counts);
  const isAlert = Math.abs(diferencia) >= DIFF_ALERT_THRESHOLD;
  return (
    <tr>
      <td style={{ fontSize: 12 }}>
        <span style={{ fontWeight: 500 }}>{row.productCode}</span>
        <span style={{ color: "#6b7280" }}> {row.productName}</span>
      </td>
      <td style={{ fontSize: 12, color: "#6b7280" }}>{row.colorName || "—"}</td>
      <td style={{ fontSize: 11, color: "#374151", whiteSpace: "nowrap" }}>
        {resolveSizesSummary(row) || "—"}
      </td>
      {showKardex && KARDEX_COLUMNS.map((col) => (
        <td key={col.key} className="text-right" style={{ fontSize: 11, color: col.key === "inventarioFinal" ? "#111" : "#6b7280" }}>
          {row[col.key]}
        </td>
      ))}
      {COUNT_LOCATION_KEYS.map((locKey) => (
        <td key={locKey} style={{ padding: "2px 4px" }}>
          <CountCell value={counts[locKey]} onChange={(v) => onCountChange(locKey, v)} disabled={disabled} />
        </td>
      ))}
      <td className="text-right" style={{ fontWeight: 600, fontSize: 12 }}>{total}</td>
      <td className="text-right" style={{
        fontWeight: 700,
        fontSize: 12,
        color: diferencia === 0 ? "#16a34a" : "#dc2626",
        background: isAlert ? "#fef2f2" : undefined,
      }}>
        {diferencia !== 0 && <span style={{ marginRight: 2 }}>{diferencia > 0 ? "▲" : "▼"}</span>}
        {diferencia}
      </td>
    </tr>
  );
}

// ─── Fila de subtotal / total ─────────────────────────────────────────────────
function SummaryRow({ label, row, showKardex, bg = "#f3f4f6", textColor = "#111", bold = false }) {
  const style = { background: bg, fontSize: 11, fontWeight: bold ? 700 : 600, color: textColor };
  return (
    <tr style={style}>
      <td colSpan={PRODUCT_INFO_COLS} style={style}>{label}</td>
      {showKardex && KARDEX_COLUMNS.map((col) => (
        <td key={col.key} className="text-right" style={style}>{row[col.key]}</td>
      ))}
      {COUNT_LOCATION_KEYS.map((k) => (
        <td key={k} className="text-right" style={style}>{(row.counts || {})[k] ?? 0}</td>
      ))}
      <td className="text-right" style={style}>{row.total}</td>
      <td className="text-right" style={{
        ...style,
        color: (row.diferencia ?? 0) !== 0 ? "#dc2626" : "#16a34a",
      }}>
        {row.diferencia}
      </td>
    </tr>
  );
}

// ─── Grupo de categoría colapsable ────────────────────────────────────────────
function CategoryGroup({ category, showKardex, editedCounts, onCountChange, disabled }) {
  const [collapsed, setCollapsed] = useState(false);
  const hasDiff = category.rows.some((r) => rowDiff(r, editedCounts[rowKey(r)] || r.counts || {}) !== 0);

  return (
    <>
      <tr
        style={{ background: "#e5e7eb", cursor: "pointer", userSelect: "none" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <td
          colSpan={PRODUCT_INFO_COLS + (showKardex ? KARDEX_COLUMNS.length : 0) + COUNT_LOCATION_KEYS.length + 2}
          style={{ fontWeight: 700, fontSize: 12, padding: "5px 8px" }}
        >
          <span style={{ marginRight: 6 }}>{collapsed ? "▶" : "▼"}</span>
          {category.categoryName}
          <span style={{ marginLeft: 8, fontWeight: 400, color: "#6b7280", fontSize: 11 }}>
            {category.rows.length} producto{category.rows.length !== 1 ? "s" : ""}
          </span>
          {hasDiff && (
            <Badge color="danger" style={{ marginLeft: 8, fontSize: 10 }}>Diferencias</Badge>
          )}
        </td>
      </tr>
      {!collapsed && (
        <>
          {category.rows.map((row) => {
            const rKey = rowKey(row);
            const counts = editedCounts[rKey] || row.counts || {};
            return (
              <DataRow
                key={rKey}
                row={row}
                showKardex={showKardex}
                counts={counts}
                onCountChange={(locKey, v) => onCountChange(rKey, locKey, v)}
                disabled={disabled}
              />
            );
          })}
          <SummaryRow
            label={`Subtotal — ${category.categoryName}`}
            row={category.subtotal}
            showKardex={showKardex}
          />
        </>
      )}
    </>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
function KioskInventoryCountReport({ locationId }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedCounts, setEditedCounts] = useState({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [showReviewBox, setShowReviewBox] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [cinchoFilter, setCinchoFilter] = useState("");
  const [showKardex, setShowKardex] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showRecipientsModal, setShowRecipientsModal] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [newRecipient, setNewRecipient] = useState({ name: "", email: "" });
  const [savingRecipient, setSavingRecipient] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredCategories = useMemo(() => {
    if (!report?.categories) return [];
    return report.categories
      .map((category) => {
        const rows = category.rows.filter(
          (row) =>
            hasAssignedProductColor(row)
            && productMatchesSearchFilter(row, debouncedSearch)
            && productMatchesAudienceFilter(row, audienceFilter)
            && productMatchesCinchoFilter(row, cinchoFilter)
        );
        if (rows.length === 0) return null;
        return { ...category, rows, subtotal: sumFilteredRows(rows) };
      })
      .filter(Boolean);
  }, [report, debouncedSearch, audienceFilter, cinchoFilter]);

  const filteredTotalGeneral = useMemo(() => {
    const allRows = filteredCategories.flatMap((c) => c.rows);
    if (allRows.length === 0) return null;
    const rowsWithLiveTotals = allRows.map((row) => {
      const counts = editedCounts[rowKey(row)] || row.counts || {};
      const total = rowTotal(counts);
      return {
        ...row,
        counts,
        total,
        diferencia: rowDiff(row, counts),
      };
    });
    return sumFilteredRows(rowsWithLiveTotals);
  }, [filteredCategories, editedCounts]);

  const loadHistorial = useCallback(async (locId) => {
    if (!locId) {
      setHistorial([]);
      return;
    }
    try {
      setLoadingHistorial(true);
      const data = await getKioscoConteoHistorial(Number(locId));
      setHistorial(data || []);
    } catch {
      setHistorial([]);
    } finally {
      setLoadingHistorial(false);
    }
  }, []);

  useEffect(() => {
    void loadHistorial(locationId);
    setReport(null);
    setEditedCounts({});
  }, [locationId, loadHistorial]);

  const openReport = (data) => {
    setReport(data);
    setEditedCounts({});
    setReviewNotes(data.notes || "");
    setShowReviewBox(false);
  };

  const handleOpen = async () => {
    if (!locationId || !from || !to) {
      showError("Selecciona un kiosko y un rango de fechas.");
      return;
    }
    try {
      setLoading(true);
      const data = await startKioscoConteo(Number(locationId), from, to);
      openReport(data);
      await loadHistorial(locationId);
    } catch (err) {
      showError(err.message || "No se pudo abrir el conteo físico.");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSession = async (countId) => {
    try {
      setLoading(true);
      const data = await getKioscoConteoReport(countId);
      openReport(data);
    } catch (err) {
      showError(err.message || "No se pudo cargar el conteo.");
    } finally {
      setLoading(false);
    }
  };

  const handleCountChange = (rKey, locKey, value) => {
    setEditedCounts((prev) => {
      const existingRow = prev[rKey];
      const baseRow = report?.categories
        .flatMap((c) => c.rows)
        .find((r) => rowKey(r) === rKey);
      const baseCounts = baseRow?.counts || {};
      return {
        ...prev,
        [rKey]: { ...baseCounts, ...(existingRow || {}), [locKey]: value },
      };
    });
  };

  const handleSave = async () => {
    if (!report) return;
    const dirtyKeys = Object.keys(editedCounts);
    if (dirtyKeys.length === 0) {
      showError("No hay cambios de conteo para guardar.");
      return;
    }
    const allRows = report.categories.flatMap((c) => c.rows);
    const items = dirtyKeys
      .map((key) => allRows.find((r) => rowKey(r) === key))
      .filter(Boolean)
      .map((row) => ({
        productId: row.productId,
        colorId: row.colorId || null,
        counts: editedCounts[rowKey(row)],
      }));
    try {
      setSaving(true);
      const data = await saveKioscoConteoItems(report.id, items);
      setReport(data);
      setEditedCounts({});
      await loadHistorial(locationId);
      showSuccess("Conteo guardado correctamente.");
    } catch (err) {
      showError(err.message || "No se pudo guardar el conteo.");
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async () => {
    try {
      setSaving(true);
      const data = await revisarKioscoConteo(report.id, reviewNotes);
      setReport(data);
      setShowReviewBox(false);
      await loadHistorial(locationId);
      showSuccess("Conteo marcado como revisado.");
    } catch (err) {
      showError(err.message || "No se pudo marcar el conteo como revisado.");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!report) return;
    const pendingDiff = pendingRows.some((r) => Math.abs(rowDiff(r, editedCounts[rowKey(r)] || r.counts || {})) >= DIFF_ALERT_THRESHOLD);
    if (pendingDiff) {
      const confirmed = window.confirm(
        "Este conteo aún tiene diferencias sin resolver. Los ajustes deben registrarse manualmente en " +
        "Inventario y movimientos (con motivo) antes de cerrar. ¿Deseas cerrar de todos modos?"
      );
      if (!confirmed) return;
    } else if (!window.confirm("¿Cerrar este conteo? Ya no podrá editarse.")) {
      return;
    }
    try {
      setClosing(true);
      const data = await cerrarKioscoConteo(report.id);
      setReport(data);
      setEditedCounts({});
      await loadHistorial(locationId);
      showSuccess("Conteo cerrado correctamente.");
    } catch (err) {
      showError(err.message || "No se pudo cerrar el conteo.");
    } finally {
      setClosing(false);
    }
  };

  const loadRecipients = useCallback(async () => {
    try {
      setLoadingRecipients(true);
      const data = await getKioscoNotificationRecipients();
      setRecipients(data || []);
    } catch (err) {
      showError(err.message || "No se pudieron cargar los destinatarios.");
    } finally {
      setLoadingRecipients(false);
    }
  }, []);

  const handleOpenRecipients = () => {
    setShowRecipientsModal(true);
    void loadRecipients();
  };

  const handleAddRecipient = async () => {
    if (!newRecipient.name.trim() || !newRecipient.email.trim()) {
      showError("Nombre y correo son obligatorios.");
      return;
    }
    try {
      setSavingRecipient(true);
      await addKioscoNotificationRecipient(newRecipient);
      setNewRecipient({ name: "", email: "" });
      await loadRecipients();
      showSuccess("Destinatario agregado.");
    } catch (err) {
      showError(err.message || "No se pudo agregar el destinatario.");
    } finally {
      setSavingRecipient(false);
    }
  };

  const handleRemoveRecipient = async (id) => {
    if (!window.confirm("¿Eliminar este destinatario de las alertas?")) return;
    try {
      await removeKioscoNotificationRecipient(id);
      await loadRecipients();
    } catch (err) {
      showError(err.message || "No se pudo eliminar el destinatario.");
    }
  };

  const totalCols = PRODUCT_INFO_COLS + (showKardex ? KARDEX_COLUMNS.length : 0) + COUNT_LOCATION_KEYS.length + 2;
  const isClosed = report?.status === "CERRADO";
  const pendingRows = filteredCategories.flatMap((c) => c.rows);
  const alertRows = pendingRows.filter(
    (r) => Math.abs(rowDiff(r, editedCounts[rowKey(r)] || r.counts || {})) >= DIFF_ALERT_THRESHOLD
  );
  const showDiffBanner = report?.status === "REVISADO" && alertRows.length > 0;

  return (
    <div>
      {/* ── Controles de apertura ── */}
      <Row className="mb-3">
        <Col md="3">
          <FormGroup>
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormGroup>
        </Col>
        <Col md="3">
          <FormGroup>
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormGroup>
        </Col>
        <Col md="3" className="d-flex align-items-end">
          <Button color="primary" onClick={() => void handleOpen()} disabled={loading}>
            {loading ? <><Spinner size="sm" className="mr-1" /> Abriendo...</> : "Abrir conteo"}
          </Button>
        </Col>
      </Row>

      {/* ── Historial de sesiones ── */}
      {locationId && (
        <div style={{ marginBottom: 20 }}>
          <div className="d-flex align-items-center justify-content-between mb-2">
            <strong style={{ fontSize: 13 }}>Sesiones de conteo existentes</strong>
            <div className="d-flex align-items-center" style={{ gap: 12 }}>
              <Button
                color="link"
                size="sm"
                style={{ padding: 0, fontSize: 12 }}
                onClick={handleOpenRecipients}
              >
                ✉ Destinatarios de alertas
              </Button>
              <Button
                color="link"
                size="sm"
                style={{ padding: 0, fontSize: 12 }}
                onClick={() => void loadHistorial(locationId)}
                disabled={loadingHistorial}
              >
                {loadingHistorial ? <Spinner size="sm" /> : "↺ Actualizar"}
              </Button>
            </div>
          </div>
          {loadingHistorial ? (
            <div className="text-center py-2"><Spinner size="sm" /> Cargando historial...</div>
          ) : historial.length === 0 ? (
            <Alert color="light" className="border mb-0" style={{ fontSize: 12 }}>
              No hay sesiones registradas para este kiosko. Crea la primera con el formulario de arriba.
            </Alert>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <Table size="sm" bordered responsive style={{ fontSize: 12, marginBottom: 0 }}>
                <thead style={{ background: "#f3f4f6" }}>
                  <tr>
                    <th>Período</th>
                    <th>Estado</th>
                    <th>Generado por</th>
                    <th>Fecha creación</th>
                    <th>Revisado por</th>
                    <th>Notas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {historial.map((s) => {
                    const isActive = report && report.id === s.id;
                    const hasPendingDiff = s.status === "REVISADO" && (s.maxAbsDiff ?? 0) >= DIFF_ALERT_THRESHOLD;
                    return (
                      <tr
                        key={s.id}
                        style={{
                          background: isActive ? "#eff6ff" : undefined,
                          boxShadow: hasPendingDiff ? "inset 3px 0 0 #f97316" : undefined,
                        }}
                      >
                        <td style={{ whiteSpace: "nowrap", fontWeight: isActive ? 700 : 400 }}>
                          {fmt(s.periodFrom)} — {fmt(s.periodTo)}
                        </td>
                        <td>
                          <Badge
                            color={s.status === "CERRADO" ? "secondary" : s.status === "REVISADO" ? "success" : "warning"}
                            style={{ fontSize: 10 }}
                          >
                            {s.status === "CERRADO" ? "🔒 Cerrado" : s.status === "REVISADO" ? "✓ Revisado" : "Borrador"}
                          </Badge>
                          {hasPendingDiff && (
                            <Badge color="danger" style={{ fontSize: 10, marginLeft: 4 }} title="Diferencia sin resolver">
                              Dif. {s.maxAbsDiff}
                            </Badge>
                          )}
                        </td>
                        <td>{s.generatedByName || "—"}</td>
                        <td style={{ whiteSpace: "nowrap", color: "#6b7280" }}>
                          {s.generatedAt ? fmtDt(s.generatedAt) : "—"}
                        </td>
                        <td>{s.reviewedByName || "—"}</td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#6b7280" }}>
                          {s.notes || "—"}
                        </td>
                        <td>
                          <Button
                            color={isActive ? "primary" : "secondary"}
                            size="sm"
                            outline={!isActive}
                            onClick={() => !isActive && void handleLoadSession(s.id)}
                            disabled={loading || isActive}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {isActive ? "Abierto" : "Cargar"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </div>
      )}

      {!report ? (
        <Alert color="light" className="border">
          {locationId
            ? <>Selecciona el rango de fechas y presiona <strong>Abrir conteo</strong> para crear uno nuevo, o carga uno existente de arriba.</>
            : <>Selecciona un kiosko en la pestaña de inventario para ver y gestionar los conteos.</>}
        </Alert>
      ) : (
        <>
          {/* ── Cabecera informativa ── */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px 24px",
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 14,
            alignItems: "center",
          }}>
            <Badge
              color={isClosed ? "secondary" : report.status === "REVISADO" ? "success" : "warning"}
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              {isClosed ? "🔒 Cerrado" : report.status === "REVISADO" ? "✓ Revisado" : "Borrador"}
            </Badge>
            <span style={{ fontSize: 12, color: "#374151" }}>
              <strong>{report.periodFrom ? fmt(report.periodFrom) : "—"}</strong>
              {" — "}
              <strong>{report.periodTo ? fmt(report.periodTo) : "—"}</strong>
            </span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              Generado por <strong style={{ color: "#111" }}>{report.generatedByName || "—"}</strong>
              {report.generatedAt && <> el {fmtDt(report.generatedAt)}</>}
            </span>
            {(report.status === "REVISADO" || isClosed) && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Revisado por <strong style={{ color: "#111" }}>{report.reviewedByName || "—"}</strong>
                {report.reviewedAt && <> el {fmtDt(report.reviewedAt)}</>}
              </span>
            )}
            {isClosed && (
              <span style={{ fontSize: 12, color: "#6b7280" }}>
                Cerrado por <strong style={{ color: "#111" }}>{report.closedByName || "—"}</strong>
                {report.closedAt && <> el {fmtDt(report.closedAt)}</>}
              </span>
            )}
          </div>

          {showDiffBanner && (
            <Alert color="danger" className="mb-3" style={{ fontSize: 12 }}>
              <strong>⚠ {alertRows.length} producto{alertRows.length !== 1 ? "s" : ""} con diferencia ≥ {DIFF_ALERT_THRESHOLD} unidades.</strong>{" "}
              Registra el ajuste manual (con motivo) en <strong>Inventario y movimientos</strong> antes de cerrar el conteo.
              Si no se resuelve en 2 días desde la revisión, se notificará automáticamente por correo a contabilidad y logística.
            </Alert>
          )}

          {report.notes && !showReviewBox && (
            <Alert color="warning" className="mb-3" style={{ fontSize: 12 }}>
              <strong>Áreas para corregir:</strong> {report.notes}
            </Alert>
          )}

          {/* ── Filtros ── */}
          <Row className="mb-3">
            <Col md="4">
              <FormGroup className="mb-0">
                <Label style={{ fontSize: 12 }}>Buscar producto</Label>
                <Input
                  type="search"
                  placeholder="Código o nombre..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="8">
              <Label style={{ fontSize: 12 }}>Filtros</Label>
              <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                <Button
                  size="sm"
                  color={audienceFilter === "" ? "primary" : "light"}
                  onClick={() => setAudienceFilter("")}
                >
                  Cat. SX: Todas
                </Button>
                {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    color={audienceFilter === opt.value ? "primary" : "light"}
                    onClick={() => setAudienceFilter(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
                <span style={{ width: 1, background: "#d1d5db", margin: "0 4px" }} />
                {CINCHO_FILTER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value || "all"}
                    size="sm"
                    color={cinchoFilter === opt.value ? "info" : "light"}
                    onClick={() => setCinchoFilter(opt.value)}
                  >
                    {opt.label === "Todos" ? "Cinchos: Todos" : opt.label}
                  </Button>
                ))}
              </div>
            </Col>
          </Row>

          {/* ── Barra de acciones ── */}
          <Row className="mb-3">
            <Col>
              <div className="d-flex flex-wrap" style={{ gap: 8 }}>
                {!isClosed && (
                  <>
                    <Button color="success" size="sm" onClick={() => void handleSave()} disabled={saving}>
                      {saving ? <Spinner size="sm" /> : "💾 Guardar conteo"}
                    </Button>
                    <Button color="info" size="sm" outline onClick={() => setShowReviewBox((v) => !v)} disabled={saving}>
                      ✔ Marcar como revisado
                    </Button>
                  </>
                )}
                {report.status === "REVISADO" && (
                  <Button color="danger" size="sm" outline onClick={() => void handleClose()} disabled={closing}>
                    {closing ? <Spinner size="sm" /> : "🔒 Cerrar conteo"}
                  </Button>
                )}
                <ButtonGroup size="sm">
                  <Button color="secondary" outline onClick={() => exportConteoToExcel(report, { showKardex })}>
                    ⬇ Excel
                  </Button>
                  <Button color="secondary" outline onClick={() => exportConteoToPdf(report, { showKardex })}>
                    🖨 PDF / Imprimir
                  </Button>
                </ButtonGroup>
                <Button
                  color="light"
                  size="sm"
                  style={{ border: "1px solid #d1d5db" }}
                  onClick={() => setShowKardex((v) => !v)}
                  title="Mostrar u ocultar las columnas del Kardex del sistema"
                >
                  {showKardex ? "Ocultar Kardex" : "Mostrar Kardex"}
                </Button>
              </div>
            </Col>
          </Row>

          {isClosed && (
            <Alert color="secondary" className="mb-3" style={{ fontSize: 12 }}>
              Este conteo está cerrado y es de solo lectura. Puedes exportarlo, pero no editarlo.
            </Alert>
          )}

          {/* ── Panel de revisión ── */}
          {showReviewBox && (
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <FormGroup className="mb-2">
                <Label style={{ fontWeight: 600, fontSize: 13 }}>Notas / áreas para corregir</Label>
                <Input
                  type="textarea"
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                />
              </FormGroup>
              <Button color="info" size="sm" onClick={() => void handleReview()} disabled={saving}>
                {saving ? <Spinner size="sm" /> : "Confirmar revisión"}
              </Button>
              <Button color="link" size="sm" onClick={() => setShowReviewBox(false)}>Cancelar</Button>
            </div>
          )}

          {/* ── Tabla principal ── */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                {/* Fila de grupos */}
                <tr style={{ background: "#f3f4f6" }}>
                  <th colSpan={PRODUCT_INFO_COLS} style={thStyle}>Producto</th>
                  {showKardex && (
                    <th colSpan={KARDEX_COLUMNS.length} style={{ ...thStyle, background: "#e0e7ff", textAlign: "center" }}>
                      Kardex sistema
                    </th>
                  )}
                  <th colSpan={COUNT_LOCATION_KEYS.length} style={{ ...thStyle, background: "#dcfce7", textAlign: "center" }}>
                    Conteo físico por ubicación
                  </th>
                  <th style={{ ...thStyle, background: "#fef9c3", textAlign: "center" }}>Total</th>
                  <th style={{ ...thStyle, background: "#fee2e2", textAlign: "center" }}>Dif.</th>
                </tr>
                {/* Fila de columnas */}
                <tr style={{ background: "#f9fafb" }}>
                  <th style={thStyle}>Producto / Código</th>
                  <th style={thStyle}>Color</th>
                  <th style={thStyle}>Tallas</th>
                  {showKardex && KARDEX_COLUMNS.map((col) => (
                    <th key={col.key} style={{ ...thStyle, background: "#eef2ff" }} title={col.title}>{col.label}</th>
                  ))}
                  {COUNT_LOCATION_KEYS.map((k) => (
                    <th key={k} style={{ ...thStyle, background: "#f0fdf4", textAlign: "center" }}>{k}</th>
                  ))}
                  <th style={{ ...thStyle, background: "#fef9c3", textAlign: "right" }}>Total</th>
                  <th style={{ ...thStyle, background: "#fee2e2", textAlign: "right" }}>Dif.</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={totalCols} style={{ textAlign: "center", padding: 16, color: "#6b7280" }}>
                      No hay productos que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map((category) => (
                    <CategoryGroup
                      key={category.categoryId || "sin-categoria"}
                      category={category}
                      showKardex={showKardex}
                      editedCounts={editedCounts}
                      onCountChange={handleCountChange}
                      disabled={isClosed}
                    />
                  ))
                )}
              </tbody>
              {filteredTotalGeneral && filteredCategories.length > 0 && (
                <tfoot style={{ position: "sticky", bottom: 0, zIndex: 2 }}>
                  <SummaryRow
                    label={`TOTAL GENERAL (${filteredCategories.flatMap((c) => c.rows).length} productos visibles)`}
                    row={filteredTotalGeneral}
                    showKardex={showKardex}
                    bg="#1f2937"
                    textColor="#fff"
                    bold
                  />
                </tfoot>
              )}
            </table>
          </div>

          {/* ── Leyenda ── */}
          <div style={{ marginTop: 10, fontSize: 11, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span><span style={{ color: "#16a34a", fontWeight: 700 }}>▲ 0</span> Sin diferencia</span>
            <span><span style={{ color: "#dc2626", fontWeight: 700 }}>▲/▼ n</span> Sistema vs. físico</span>
            <span style={{ background: "#fef2f2", padding: "1px 4px" }}>Fondo rojo: diferencia ≥ {DIFF_ALERT_THRESHOLD} unidades</span>
            <span>Haz clic en el nombre de categoría para colapsar/expandir</span>
            {!showKardex && <span>Kardex oculto — actívalo con el botón "Mostrar Kardex"</span>}
          </div>
        </>
      )}

      {/* ── Modal de destinatarios de alertas ── */}
      <Modal isOpen={showRecipientsModal} toggle={() => setShowRecipientsModal(false)}>
        <ModalHeader toggle={() => setShowRecipientsModal(false)}>Destinatarios de alertas de diferencias</ModalHeader>
        <ModalBody>
          <p style={{ fontSize: 12, color: "#6b7280" }}>
            Si un conteo revisado sigue con diferencias ≥ {DIFF_ALERT_THRESHOLD} unidades pasados 2 días,
            se envía un correo automático a estos destinatarios (contabilidad, logística, etc.).
          </p>
          <Row className="mb-2">
            <Col md="5">
              <Input
                placeholder="Nombre"
                value={newRecipient.name}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, name: e.target.value }))}
              />
            </Col>
            <Col md="5">
              <Input
                placeholder="Correo"
                type="email"
                value={newRecipient.email}
                onChange={(e) => setNewRecipient((prev) => ({ ...prev, email: e.target.value }))}
              />
            </Col>
            <Col md="2">
              <Button color="primary" block onClick={() => void handleAddRecipient()} disabled={savingRecipient}>
                {savingRecipient ? <Spinner size="sm" /> : "Agregar"}
              </Button>
            </Col>
          </Row>
          {loadingRecipients ? (
            <div className="text-center py-3"><Spinner size="sm" /> Cargando destinatarios...</div>
          ) : recipients.length === 0 ? (
            <Alert color="light" className="border mb-0" style={{ fontSize: 12 }}>
              No hay destinatarios configurados todavía.
            </Alert>
          ) : (
            <Table size="sm" bordered style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      <Button color="link" size="sm" style={{ padding: 0, color: "#dc2626" }} onClick={() => void handleRemoveRecipient(r.id)}>
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowRecipientsModal(false)}>Cerrar</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

const thStyle = {
  border: "1px solid #e5e7eb",
  padding: "4px 6px",
  fontWeight: 700,
  fontSize: 11,
  whiteSpace: "nowrap",
};

export default KioskInventoryCountReport;
