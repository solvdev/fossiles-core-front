import React, { useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, ButtonGroup, Card, CardBody, CardHeader, Col, Input, Row, Spinner, Table } from "reactstrap";
import {
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  buildLeatherView,
  exportLeatherDemandExcel,
  fmtFt2,
  fmtInt,
  orderTypesIn,
  printLeatherDemand,
  swatchFor,
} from "utils/leatherDemandReport";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const CARD = { borderRadius: 12, marginBottom: 18 };
const fmtDate = (v) => (v ? String(v).slice(0, 10) : "—");

function Dot({ color, size = 12 }) {
  return (
    <span
      style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        background: swatchFor(color), border: "1px solid rgba(0,0,0,.2)", marginRight: 6, verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

function Kpi({ label, value, unit, hint, tone = "#111827", bg = "#fff" }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 14px", background: bg, height: "100%" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: tone }}>
        {value}{unit && <span style={{ fontSize: 13, fontWeight: 600, marginLeft: 4 }}>{unit}</span>}
      </div>
      {hint && <div style={{ fontSize: 12, color: "#6b7280" }}>{hint}</div>}
    </div>
  );
}

/** Barra entregado (verde) vs falta (ámbar). */
function SplitBar({ delivered, total }) {
  const pct = total > 0 ? Math.min(100, (delivered * 100) / total) : 0;
  return (
    <div style={{ height: 8, borderRadius: 4, background: "#fde68a", overflow: "hidden" }} title={`${pct.toFixed(0)}% entregado`}>
      <div style={{ width: `${pct}%`, height: "100%", background: "#10b981" }} />
    </div>
  );
}

function ColorCard({ color, selected, onClick }) {
  const short = color.shortageFt2 > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left", width: "100%", height: "100%", cursor: "pointer", background: selected ? "#f0fdff" : "#fff",
        border: selected ? "2px solid #51cbce" : "1px solid #e5e7eb", borderRadius: 12, padding: 12,
      }}
    >
      <div className="d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center" style={{ fontWeight: 700, fontSize: 14, minWidth: 0 }}>
          <Dot color={color.colorName} size={14} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{color.colorName}</span>
        </div>
        <span style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap" }}>{fmtInt(color.orders)} OP</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, margin: "6px 0 2px" }}>
        {fmtFt2(color.pendingFt2)} <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>pies² faltan</span>
      </div>
      <SplitBar delivered={color.deliveredFt2} total={color.totalFt2} />
      <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6 }}>
        Pedido {fmtFt2(color.totalFt2)} · Entregado {fmtFt2(color.deliveredFt2)} · {fmtInt(color.pendingUnits)} pzas
      </div>
      <div className="d-flex justify-content-between align-items-center" style={{ fontSize: 12, marginTop: 6 }}>
        <span style={{ color: "#4b5563" }}>Bodega {fmtFt2(color.availableFt2)}</span>
        {short ? (
          <Badge color="danger">Comprar {fmtFt2(color.shortageFt2)}</Badge>
        ) : color.pendingFt2 > 0 ? (
          <Badge color="success">Alcanza</Badge>
        ) : null}
      </div>
      {color.missingRecipeUnits > 0 && (
        <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>{fmtInt(color.missingRecipeUnits)} pzas sin receta</div>
      )}
    </button>
  );
}

function OrderRow({ order, open, onToggle }) {
  const pct = order.totalFt2 > 0 ? ((order.totalFt2 - order.pendingFt2) * 100) / order.totalFt2 : 0;
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: "pointer", background: open ? "#f9fafb" : undefined }}>
        <td style={{ width: 24, color: "#6b7280" }}>{open ? "▾" : "▸"}</td>
        <td>
          <strong>{order.code}</strong>
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {ORDER_TYPE_LABELS[order.orderType] || order.orderType} · {ORDER_STATUS_LABELS[order.status] || order.status}
          </div>
        </td>
        <td style={{ maxWidth: 200 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{order.customerName || "—"}</div>
        </td>
        <td style={{ whiteSpace: "nowrap" }}>{fmtDate(order.deliveryDate)}</td>
        <td>
          <div className="d-flex flex-wrap" style={{ gap: 4 }}>
            {order.colorChips.map((c) => (
              <span
                key={c.key}
                style={{
                  display: "inline-flex", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 999,
                  padding: "1px 8px", fontSize: 12, background: "#fff", whiteSpace: "nowrap",
                }}
              >
                <Dot color={c.colorName} size={10} />
                {c.colorName} <strong style={{ marginLeft: 4 }}>{fmtFt2(c.pendingFt2)}</strong>
                {c.missing && <span style={{ color: "#b45309", marginLeft: 4 }} title="Hay productos sin receta">⚠</span>}
              </span>
            ))}
          </div>
        </td>
        <td className="text-right" style={{ whiteSpace: "nowrap" }}>
          <strong style={{ fontSize: 15 }}>{fmtFt2(order.pendingFt2)}</strong>
          <div style={{ fontSize: 11, color: "#6b7280" }}>de {fmtFt2(order.totalFt2)}</div>
        </td>
        <td style={{ width: 90 }}>
          <SplitBar delivered={order.totalFt2 - order.pendingFt2} total={order.totalFt2} />
          <div style={{ fontSize: 11, color: "#6b7280" }}>{pct.toFixed(0)}% entregado</div>
        </td>
      </tr>
      {open && (
        <tr>
          <td />
          <td colSpan={6} style={{ background: "#f9fafb", paddingTop: 0 }}>
            <Table size="sm" className="mb-2" style={{ background: "#fff" }}>
              <thead>
                <tr style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280" }}>
                  <th>Producto</th><th>Color</th><th>Cuero</th>
                  <th className="text-right">Piezas</th><th className="text-right">Entregadas</th><th className="text-right">Faltan</th>
                  <th className="text-right">pies²/pza</th><th className="text-right">pies² falta</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.itemId}>
                    <td><strong>{l.productCode}</strong> <span style={{ color: "#4b5563" }}>{l.productName}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}><Dot color={l.colorName} size={10} />{l.colorName}</td>
                    <td>{l.missingRecipe ? <Badge color="warning">Sin receta</Badge> : l.materialName}</td>
                    <td className="text-right">{fmtInt(l.units)}</td>
                    <td className="text-right">{fmtInt(l.deliveredUnits)}</td>
                    <td className="text-right"><strong>{fmtInt(l.pendingUnits)}</strong></td>
                    <td className="text-right">{l.ft2PerUnit != null ? fmtFt2(l.ft2PerUnit) : "—"}</td>
                    <td className="text-right"><strong>{fmtFt2(l.pendingFt2)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </td>
        </tr>
      )}
    </>
  );
}

/** Cuero por color de todas las OP activas: cuánto falta entregar, cuánto hay y cuánto pide cada orden. */
export default function LeatherDemandPanel({ data, loading, error, onReload }) {
  const [orderType, setOrderType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [colorKey, setColorKey] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [openOrders, setOpenOrders] = useState(() => new Set());
  const [showMaterials, setShowMaterials] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const ordersRef = useRef(null);
  const load = onReload;

  const view = useMemo(
    () => buildLeatherView(data, { orderType, search, colorKey, onlyPending }),
    [data, orderType, search, colorKey, onlyPending]
  );
  const types = useMemo(() => orderTypesIn(data), [data]);
  const selectedColor = view.colors.find((c) => c.key === colorKey);

  const filtersLabel = [
    orderType !== "ALL" ? `Tipo: ${ORDER_TYPE_LABELS[orderType] || orderType}` : null,
    selectedColor ? `Color: ${selectedColor.colorName}` : null,
    search.trim() ? `Búsqueda: "${search.trim()}"` : null,
    onlyPending ? "Solo lo que falta entregar" : "Incluye lo ya entregado",
  ].filter(Boolean).join(" · ");

  const selectColor = (key) => {
    const next = key === colorKey ? "" : key;
    setColorKey(next);
    if (next) setTimeout(() => ordersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const toggleOrder = (id) => setOpenOrders((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOpen = view.orders.length > 0 && view.orders.every((o) => openOrders.has(o.orderId));

  if (loading && !data) {
    return <div className="text-center py-5"><Spinner color="primary" /><div className="mt-2">Calculando cuero de las órdenes…</div></div>;
  }
  if (error && !data) {
    return <Alert color="danger">{error} <Button size="sm" color="danger" outline className="ml-2" onClick={load}>Reintentar</Button></Alert>;
  }

  const t = view.totals;
  return (
    <div>
      {/* Filtros y reporte */}
      <Card style={CARD}>
        <CardBody style={{ paddingBottom: 8 }}>
          <Row className="align-items-end">
            <Col lg="3" md="4" className="mb-2">
              <small className="text-muted d-block mb-1">Tipo de orden</small>
              <Input type="select" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="ALL">Todas las órdenes activas</option>
                {types.map((tp) => <option key={tp} value={tp}>{ORDER_TYPE_LABELS[tp] || tp}</option>)}
              </Input>
            </Col>
            <Col lg="3" md="4" className="mb-2">
              <small className="text-muted d-block mb-1">Buscar</small>
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="OP, cliente o producto…" />
            </Col>
            <Col lg="3" md="4" className="mb-2">
              <small className="text-muted d-block mb-1">Mostrar</small>
              <ButtonGroup className="d-flex">
                <Button size="sm" color={onlyPending ? "primary" : "secondary"} outline={!onlyPending} onClick={() => setOnlyPending(true)}>
                  Lo que falta
                </Button>
                <Button size="sm" color={!onlyPending ? "primary" : "secondary"} outline={onlyPending} onClick={() => setOnlyPending(false)}>
                  Todo lo pedido
                </Button>
              </ButtonGroup>
            </Col>
            <Col lg="3" md="12" className="mb-2 text-lg-right">
              <Button color="success" className="mr-2 my-0" onClick={() => exportLeatherDemandExcel(view, filtersLabel)} disabled={view.orders.length === 0}>
                <i className="fa fa-file-excel-o mr-1" /> Excel
              </Button>
              <Button color="info" className="mr-2 my-0" onClick={() => printLeatherDemand(view, filtersLabel)} disabled={view.orders.length === 0}>
                <i className="fa fa-print mr-1" /> Imprimir / PDF
              </Button>
              <Button color="secondary" outline className="my-0" onClick={load} disabled={loading} title="Volver a calcular">
                {loading ? <Spinner size="sm" /> : <i className="fa fa-refresh" />}
              </Button>
            </Col>
          </Row>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Órdenes pendientes, en proceso y en QA. «Entregado» = piezas cuyo cuero ya salió a mesa (tarea iniciada o cuero marcado).
            {data?.generatedAt && <> Calculado {formatDateTimeGt(data.generatedAt)}.</>}
            {selectedColor && (
              <Button color="link" size="sm" className="p-0 ml-2" onClick={() => setColorKey("")}>Quitar filtro de color ✕</Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Totales */}
      <Row className="mb-3">
        <Col xl lg="4" sm="6" className="mb-2">
          <Kpi label="Falta entregar" value={fmtFt2(t.pendingFt2)} unit="pies²" tone="#b45309" bg="#fffbeb" hint={`${fmtInt(t.pendingUnits)} piezas`} />
        </Col>
        <Col xl lg="4" sm="6" className="mb-2">
          <Kpi label="Ya entregado" value={fmtFt2(t.deliveredFt2)} unit="pies²" tone="#047857" hint="cuero ya en mesa" />
        </Col>
        <Col xl lg="4" sm="6" className="mb-2">
          <Kpi label="Total pedido" value={fmtFt2(t.totalFt2)} unit="pies²" hint={`${fmtInt(t.orders)} órdenes · ${fmtInt(t.units)} piezas`} />
        </Col>
        <Col xl lg="6" sm="6" className="mb-2">
          <Kpi
            label="Faltaría comprar"
            value={fmtFt2(t.shortageFt2)}
            unit="pies²"
            tone={t.shortageFt2 > 0 ? "#b91c1c" : "#047857"}
            bg={t.shortageFt2 > 0 ? "#fef2f2" : "#fff"}
            hint={t.shortageFt2 > 0 ? "lo que falta menos lo que hay en bodega" : "la bodega cubre lo que falta"}
          />
        </Col>
        <Col xl lg="6" sm="12" className="mb-2">
          <Kpi
            label="Piezas sin receta"
            value={fmtInt(t.missingRecipeUnits)}
            tone={t.missingRecipeUnits > 0 ? "#b45309" : "#047857"}
            hint={t.missingRecipeUnits > 0 ? "no suman pies² (ver abajo)" : "todas con receta"}
          />
        </Col>
      </Row>

      {/* Por color */}
      <Card style={CARD}>
        <CardHeader className="d-flex justify-content-between align-items-center flex-wrap">
          <div>
            <h5 className="mb-0">Cuero por color</h5>
            <small className="text-muted">Toca un color para ver solo sus órdenes.</small>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            <span style={{ display: "inline-block", width: 10, height: 10, background: "#10b981", borderRadius: 2, marginRight: 4 }} />entregado
            <span style={{ display: "inline-block", width: 10, height: 10, background: "#fde68a", borderRadius: 2, margin: "0 4px 0 12px" }} />falta
          </div>
        </CardHeader>
        <CardBody>
          {view.colors.length === 0 ? (
            <Alert color="success" className="mb-0">No hay cuero pendiente con estos filtros.</Alert>
          ) : (
            <Row>
              {view.colors.map((c) => (
                <Col key={c.key} xl="3" lg="4" sm="6" className="mb-3">
                  <ColorCard color={c} selected={c.key === colorKey} onClick={() => selectColor(c.key)} />
                </Col>
              ))}
            </Row>
          )}

          <div className="d-flex flex-wrap" style={{ gap: 8 }}>
            <Button size="sm" color="secondary" outline onClick={() => setShowMaterials((v) => !v)}>
              {showMaterials ? "▾" : "▸"} Por tipo de cuero (para compras) · {view.materials.length}
            </Button>
            {view.missingRecipes.length > 0 && (
              <Button size="sm" color="warning" outline onClick={() => setShowMissing((v) => !v)}>
                {showMissing ? "▾" : "▸"} Productos sin receta · {view.missingRecipes.length}
              </Button>
            )}
          </div>

          {showMaterials && (
            <Table responsive size="sm" hover className="mt-3 mb-0">
              <thead>
                <tr style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280" }}>
                  <th>Cuero</th><th className="text-right">OP</th><th className="text-right">Falta entregar</th>
                  <th className="text-right">Total pedido</th><th className="text-right">En bodega</th><th className="text-right">Faltaría comprar</th>
                </tr>
              </thead>
              <tbody>
                {view.materials.map((m) => (
                  <tr key={m.materialId}>
                    <td><strong>{m.name}</strong> <small className="text-muted">{m.sku}</small></td>
                    <td className="text-right">{fmtInt(m.orders)}</td>
                    <td className="text-right"><strong>{fmtFt2(m.pendingFt2)}</strong></td>
                    <td className="text-right">{fmtFt2(m.totalFt2)}</td>
                    <td className="text-right">{fmtFt2(m.availableFt2)}</td>
                    <td className="text-right">
                      {m.shortageFt2 > 0 ? <Badge color="danger">{fmtFt2(m.shortageFt2)}</Badge> : <span className="text-success">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {showMissing && (
            <>
              <Alert color="warning" className="mt-3 mb-2" style={{ fontSize: 13 }}>
                Estas piezas no suman pies² porque el producto no tiene receta de cuero para ese color. Se arregla en la receta del producto.
              </Alert>
              <Table responsive size="sm" className="mb-0">
                <thead><tr style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280" }}><th>Producto</th><th>Color</th><th className="text-right">Piezas</th></tr></thead>
                <tbody>
                  {view.missingRecipes.map((r) => (
                    <tr key={r.key}>
                      <td><strong>{r.productCode}</strong> {r.productName}</td>
                      <td><Dot color={r.colorName} size={10} />{r.colorName}</td>
                      <td className="text-right">{fmtInt(r.units)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </CardBody>
      </Card>

      {/* Por orden */}
      <div ref={ordersRef} style={{ scrollMarginTop: 80 }} />
      <Card style={CARD}>
        <CardHeader className="d-flex justify-content-between align-items-center flex-wrap">
          <div>
            <h5 className="mb-0">
              Cuero por orden{selectedColor && <> · <Dot color={selectedColor.colorName} />{selectedColor.colorName}</>}
            </h5>
            <small className="text-muted">{fmtInt(view.orders.length)} órdenes, de la entrega más próxima a la más lejana. Toca una para ver sus productos.</small>
          </div>
          {view.orders.length > 0 && (
            <Button size="sm" color="secondary" outline onClick={() => setOpenOrders(allOpen ? new Set() : new Set(view.orders.map((o) => o.orderId)))}>
              {allOpen ? "Cerrar todas" : "Abrir todas"}
            </Button>
          )}
        </CardHeader>
        <CardBody className="pt-0">
          {view.orders.length === 0 ? (
            <Alert color="light" className="mb-0 mt-3">No hay órdenes con estos filtros.</Alert>
          ) : (
            <Table responsive hover size="sm" className="mb-0">
              <thead>
                <tr style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280" }}>
                  <th /><th>Orden</th><th>Cliente</th><th>Entrega</th><th>Colores (pies² que faltan)</th>
                  <th className="text-right">Falta</th><th>Avance</th>
                </tr>
              </thead>
              <tbody>
                {view.orders.map((o) => (
                  <OrderRow key={o.orderId} order={o} open={openOrders.has(o.orderId)} onToggle={() => toggleOrder(o.orderId)} />
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
