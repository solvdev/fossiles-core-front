import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Label,
  Row,
  Spinner,
  Table,
  Nav,
  NavItem,
  NavLink,
} from "reactstrap";
import {
  createKioskPosSale,
  createKioskPromotion,
  getKioskPosContext,
  getKioskPromotions,
  getKioskProductAvailability,
  getKioskCustomerByTaxId,
  getMyKioskReport,
  getMyKioskSales,
} from "services/kioskPosService";
import "./KioskSales.css";

const formatCurrency = (value) => `Q ${Number(value || 0).toFixed(2)}`;
const formatQty = (value) => Number(value || 0).toFixed(2);
const lineKeyFor = (productId, colorId) => `${productId}:${colorId || "none"}`;
const resolveImageUrl = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }
  const apiBase = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
  try {
    const origin = new URL(apiBase).origin;
    return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
  } catch {
    return value;
  }
};
const normalizeNit = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
const isValidGuatemalaNit = (rawNit) => {
  const nit = normalizeNit(rawNit);
  if (!nit || nit === "CF") return true;
  if (nit.length < 2) return false;
  const body = nit.slice(0, -1);
  const verifier = nit.slice(-1);
  if (!/^\d+$/.test(body) || !/^[0-9K]$/.test(verifier)) return false;
  let factor = body.length + 1;
  let total = 0;
  for (const char of body) {
    total += Number(char) * factor;
    factor -= 1;
  }
  const modulus = (11 - (total % 11)) % 11;
  const expected = modulus === 10 ? "K" : String(modulus);
  return verifier === expected;
};

function KioskSales() {
  const [activeTab, setActiveTab] = useState("POS");
  const [context, setContext] = useState(null);
  const [selectedKioskId, setSelectedKioskId] = useState("");
  const [cart, setCart] = useState([]);
  const [sales, setSales] = useState([]);
  const [myReport, setMyReport] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("CF");
  const [customerName, setCustomerName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [notes, setNotes] = useState("");
  const [comments, setComments] = useState("");
  const [availabilityKey, setAvailabilityKey] = useState("");
  const [availabilityRows, setAvailabilityRows] = useState([]);
  const [promoForm, setPromoForm] = useState({
    name: "",
    description: "",
    discountType: "PERCENT",
    discountValue: "",
    startDate: "",
    endDate: "",
    active: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const loadInitial = async (kioskIdOverride) => {
    try {
      setLoading(true);
      setError("");
      const kioskLocationId = kioskIdOverride || selectedKioskId || undefined;
      const [ctx, kioskSales, kioskReport, promoRows] = await Promise.all([
        getKioskPosContext(kioskLocationId),
        getMyKioskSales(undefined, undefined, kioskLocationId),
        getMyKioskReport(undefined, undefined, kioskLocationId),
        getKioskPromotions(true),
      ]);
      setContext(ctx || null);
      if (ctx?.kioskId) {
        setSelectedKioskId(String(ctx.kioskId));
      }
      setSales(Array.isArray(kioskSales) ? kioskSales : []);
      setMyReport(kioskReport || null);
      setPromotions(Array.isArray(promoRows) ? promoRows : []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la pantalla POS.");
    } finally {
      setLoading(false);
    }
  };

  const handleTaxIdBlur = async () => {
    const nit = normalizeNit(customerTaxId);
    if (!nit || nit === "CF") {
      setCustomerTaxId("CF");
      return;
    }
    if (!isValidGuatemalaNit(nit)) {
      setError("El NIT ingresado no es válido en Guatemala.");
      return;
    }
    try {
      const profile = await getKioskCustomerByTaxId(nit);
      if (profile) {
        setCustomerName(profile.customerName || "");
        setAddress(profile.address || "");
        setPhone(profile.phone || "");
        setEmail(profile.email || "");
      }
      setCustomerTaxId(nit);
    } catch (err) {
      setError(err.message || "No se pudo consultar el cliente por NIT.");
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  const handleKioskChange = async (nextKioskId) => {
    setSelectedKioskId(nextKioskId);
    setCart([]);
    setAvailabilityKey("");
    setAvailabilityRows([]);
    await loadInitial(nextKioskId || undefined);
  };

  const addToCart = (inventoryItem) => {
    const key = lineKeyFor(inventoryItem.productId, inventoryItem.colorId);
    setCart((prev) => {
      const existing = prev.find((line) => line.key === key);
      if (existing) {
        return prev.map((line) =>
          line.key === key
            ? {
                ...line,
                quantity: Number(line.quantity || 0) + 1,
              }
            : line
        );
      }
      return [
        ...prev,
        {
          key,
          productId: inventoryItem.productId,
          productCode: inventoryItem.productCode,
          productName: inventoryItem.productName,
          colorId: inventoryItem.colorId,
          colorName: inventoryItem.colorName,
          availableQty: Number(inventoryItem.quantity || 0),
          quantity: 1,
          unitPrice: Number(inventoryItem.suggestedUnitPrice || 0),
        },
      ];
    });
  };

  const updateCartLine = (key, patch) => {
    setCart((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  };

  const removeCartLine = (key) => {
    setCart((prev) => prev.filter((line) => line.key !== key));
  };

  const cartTotals = useMemo(() => {
    return cart.reduce(
      (acc, line) => {
        const qty = Number(line.quantity || 0);
        const price = Number(line.unitPrice || 0);
        acc.items += qty;
        acc.total += qty * price;
        return acc;
      },
      { items: 0, total: 0 }
    );
  }, [cart]);

  const applyReportFilters = async () => {
    try {
      setLoading(true);
      setError("");
      const [kioskSales, kioskReport] = await Promise.all([
        getMyKioskSales(startDate || undefined, endDate || undefined, selectedKioskId || undefined),
        getMyKioskReport(startDate || undefined, endDate || undefined, selectedKioskId || undefined),
      ]);
      setSales(Array.isArray(kioskSales) ? kioskSales : []);
      setMyReport(kioskReport || null);
    } catch (err) {
      setError(err.message || "No se pudieron filtrar los reportes.");
    } finally {
      setLoading(false);
    }
  };

  const submitSale = async () => {
    if (cart.length === 0) {
      setError("Agrega al menos un producto al carrito.");
      return;
    }
    const normalizedTaxId = normalizeNit(customerTaxId || "CF");
    if (normalizedTaxId !== "CF" && !isValidGuatemalaNit(normalizedTaxId)) {
      setError("El NIT ingresado no es válido.");
      return;
    }
    for (const line of cart) {
      const qty = Number(line.quantity || 0);
      const price = Number(line.unitPrice || 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError(`Cantidad inválida para ${line.productName}.`);
        return;
      }
      if (qty > Number(line.availableQty || 0)) {
        setError(
          `La cantidad de ${line.productName} supera el stock disponible del kiosko (${formatQty(
            line.availableQty
          )}).`
        );
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        setError(`Precio inválido para ${line.productName}.`);
        return;
      }
    }
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      await createKioskPosSale({
        kioskLocationId: selectedKioskId ? Number(selectedKioskId) : null,
        customerTaxId: normalizedTaxId || "CF",
        customerName: customerName || null,
        address: address || null,
        phone: phone || null,
        email: email || null,
        paymentMethod: paymentMethod || "EFECTIVO",
        notes: notes || null,
        comments: comments || null,
        promotionId: selectedPromotionId ? Number(selectedPromotionId) : null,
        saleDate: today,
        items: cart.map((line) => ({
          productId: line.productId,
          colorId: line.colorId || null,
          quantity: Number(line.quantity || 0),
          unitPrice: Number(line.unitPrice || 0),
        })),
      });

      setCart([]);
      setCustomerTaxId("CF");
      setCustomerName("");
      setAddress("");
      setPhone("");
      setEmail("");
      setNotes("");
      setComments("");
      setSelectedPromotionId("");
      setSuccess("Venta registrada. El inventario del kiosko fue actualizado.");
      await loadInitial();
    } catch (err) {
      setError(err.message || "No se pudo registrar la venta.");
    } finally {
      setSaving(false);
    }
  };

  const checkAvailability = async () => {
    if (!availabilityKey) {
      setError("Selecciona un producto para consultar disponibilidad.");
      return;
    }
    const [productIdRaw, colorIdRaw] = availabilityKey.split(":");
    try {
      setAvailabilityLoading(true);
      setError("");
      const rows = await getKioskProductAvailability(
        Number(productIdRaw),
        colorIdRaw === "none" ? null : Number(colorIdRaw),
        selectedKioskId ? Number(selectedKioskId) : null
      );
      setAvailabilityRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "No se pudo consultar disponibilidad.");
      setAvailabilityRows([]);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const createPromotion = async () => {
    try {
      if (!promoForm.name.trim()) {
        setError("El nombre de la promoción es obligatorio.");
        return;
      }
      if (Number(promoForm.discountValue || 0) <= 0) {
        setError("El valor de descuento debe ser mayor a cero.");
        return;
      }
      await createKioskPromotion({
        name: promoForm.name,
        description: promoForm.description,
        discountType: promoForm.discountType,
        discountValue: Number(promoForm.discountValue),
        startDate: promoForm.startDate || null,
        endDate: promoForm.endDate || null,
        active: Boolean(promoForm.active),
      });
      setPromoForm({
        name: "",
        description: "",
        discountType: "PERCENT",
        discountValue: "",
        startDate: "",
        endDate: "",
        active: true,
      });
      setSuccess("Promoción creada correctamente.");
      await loadInitial(selectedKioskId || undefined);
    } catch (err) {
      setError(err.message || "No se pudo crear la promoción.");
    }
  };

  const filteredInventory = useMemo(() => {
    const query = String(productSearch || "").trim().toLowerCase();
    if (!query) return context?.inventory || [];
    return (context?.inventory || []).filter((item) => {
      const text = `${item.productCode || ""} ${item.productName || ""} ${item.colorName || ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [context, productSearch]);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h3">Punto de Venta Kiosko (POS)</CardTitle>
              {context && (
                <p className="text-muted mb-0">
                  Usuario: <strong>{context.fullName || context.username}</strong> | Kiosko:{" "}
                  <strong>{context.kioskName}</strong>
                </p>
              )}
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}
              {loading && (
                <div className="text-center py-3">
                  <Spinner /> Cargando POS...
                </div>
              )}

              {!loading && context && (
                <>
                  <Nav tabs className="kiosk-pos-tabs mb-3">
                    <NavItem>
                      <NavLink
                        href="#"
                        className={activeTab === "POS" ? "active" : ""}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveTab("POS");
                        }}
                      >
                        POS
                      </NavLink>
                    </NavItem>
                    <NavItem>
                      <NavLink
                        href="#"
                        className={activeTab === "REPORTS" ? "active" : ""}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveTab("REPORTS");
                        }}
                      >
                        Reportes de ventas
                      </NavLink>
                    </NavItem>
                    {Boolean(context?.admin) && (
                      <NavItem>
                        <NavLink
                          href="#"
                          className={activeTab === "PROMOS" ? "active" : ""}
                          onClick={(e) => {
                            e.preventDefault();
                            setActiveTab("PROMOS");
                          }}
                        >
                          Promociones
                        </NavLink>
                      </NavItem>
                    )}
                  </Nav>

                  {Boolean(context?.admin) && Array.isArray(context?.kiosks) && context.kiosks.length > 0 && (
                    <Row className="mb-3">
                      <Col md="6" lg="4">
                        <Label className="kiosk-pos-label">Kiosko (modo administrador)</Label>
                        <Input
                          className="kiosk-pos-input-lg"
                          type="select"
                          value={selectedKioskId}
                          onChange={(event) => void handleKioskChange(event.target.value)}
                        >
                          {context.kiosks.map((kiosk) => (
                            <option key={`admin-kiosk-${kiosk.kioskId}`} value={String(kiosk.kioskId)}>
                              {kiosk.kioskName} {kiosk.kioskCode ? `(${kiosk.kioskCode})` : ""}
                            </option>
                          ))}
                        </Input>
                      </Col>
                    </Row>
                  )}
                  {activeTab === "POS" && (
                    <>
                  <Row>
                    <Col lg="7">
                      <Card className="kiosk-pos-block">
                        <CardHeader>
                          <CardTitle tag="h5">Inventario disponible en kiosko</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Row className="mb-2">
                            <Col md="12">
                              <Input
                                className="kiosk-pos-input-lg"
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder="Filtrar producto por código, nombre o color"
                              />
                            </Col>
                          </Row>
                          {(!context.inventory || context.inventory.length === 0) && (
                            <Alert color="warning" className="mb-0">
                              Este kiosko no tiene inventario disponible.
                            </Alert>
                          )}
                          <div className="kiosk-pos-inventory-grid">
                            {filteredInventory.map((item) => (
                              <button
                                key={lineKeyFor(item.productId, item.colorId)}
                                type="button"
                                className="kiosk-pos-inventory-btn"
                                onClick={() => addToCart(item)}
                              >
                                {resolveImageUrl(item.productImageUrl) ? (
                                  <img
                                    src={resolveImageUrl(item.productImageUrl)}
                                    alt={item.productName}
                                    className="kiosk-pos-product-image"
                                  />
                                ) : null}
                                <div className="kiosk-pos-item-name">
                                  {item.productCode} - {item.productName}
                                </div>
                                <div className="kiosk-pos-item-sub">
                                  {item.colorName || "Sin color"} | Stock: {formatQty(item.quantity)}
                                </div>
                                <div className="kiosk-pos-item-price">
                                  Precio sugerido: {formatCurrency(item.suggestedUnitPrice)}
                                </div>
                              </button>
                            ))}
                          </div>
                        </CardBody>
                      </Card>
                    </Col>

                    <Col lg="5">
                      <Card className="kiosk-pos-block">
                        <CardHeader>
                          <CardTitle tag="h5">Venta actual</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Row>
                            <Col md="12">
                              <Label className="kiosk-pos-label">NIT / CF</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                value={customerTaxId}
                                onChange={(e) => setCustomerTaxId(e.target.value)}
                                onBlur={handleTaxIdBlur}
                                placeholder="CF o NIT"
                              />
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Cliente (opcional)</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                value={customerName}
                                onChange={(e) => setCustomerName(e.target.value)}
                                placeholder="Nombre cliente"
                              />
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Dirección</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                value={address}
                                onChange={(e) => setAddress(e.target.value)}
                                placeholder="Dirección"
                              />
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Teléfono</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                placeholder="Teléfono"
                              />
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Correo</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Correo electrónico"
                              />
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Forma de pago</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                type="select"
                                value={paymentMethod}
                                onChange={(e) => setPaymentMethod(e.target.value)}
                              >
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="TARJETA">Tarjeta</option>
                              </Input>
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Promoción</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                type="select"
                                value={selectedPromotionId}
                                onChange={(e) => setSelectedPromotionId(e.target.value)}
                              >
                                <option value="">Sin promoción</option>
                                {promotions.map((promo) => (
                                  <option key={`promo-${promo.id}`} value={String(promo.id)}>
                                    {promo.name} - {promo.discountType === "PERCENT" ? `${promo.discountValue}%` : formatCurrency(promo.discountValue)}
                                  </option>
                                ))}
                              </Input>
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Notas</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Notas de la venta"
                              />
                            </Col>
                            <Col md="12" className="mt-2">
                              <Label className="kiosk-pos-label">Comentarios</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                                placeholder="Comentarios adicionales"
                              />
                            </Col>
                          </Row>

                          <div className="kiosk-pos-cart-wrap mt-3">
                            {cart.length === 0 && (
                              <p className="text-muted mb-0">Carrito vacío. Toca productos para agregarlos.</p>
                            )}
                            {cart.map((line) => (
                              <div key={line.key} className="kiosk-pos-cart-line">
                                <div>
                                  <div className="kiosk-pos-item-name">
                                    {line.productCode} - {line.productName}
                                  </div>
                                  <div className="kiosk-pos-item-sub">{line.colorName || "Sin color"}</div>
                                </div>
                                <div className="kiosk-pos-line-actions">
                                  <Input
                                    className="kiosk-pos-input-lg kiosk-pos-qty"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateCartLine(line.key, {
                                        quantity: Number(e.target.value || 0),
                                      })
                                    }
                                  />
                                  <Input
                                    className="kiosk-pos-input-lg kiosk-pos-price"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={line.unitPrice}
                                    onChange={(e) =>
                                      updateCartLine(line.key, {
                                        unitPrice: Number(e.target.value || 0),
                                      })
                                    }
                                  />
                                  <Button
                                    color="danger"
                                    className="kiosk-pos-btn-lg"
                                    onClick={() => removeCartLine(line.key)}
                                  >
                                    Quitar
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="kiosk-pos-total mt-3">
                            <Badge color="primary" pill>
                              Items: {formatQty(cartTotals.items)}
                            </Badge>
                            <Badge color="success" pill>
                              Total: {formatCurrency(cartTotals.total)}
                            </Badge>
                          </div>

                          <Button
                            color="success"
                            block
                            className="kiosk-pos-btn-main mt-3"
                            onClick={submitSale}
                            disabled={saving || cart.length === 0}
                          >
                            {saving ? "Guardando venta..." : "Registrar venta y rebajar inventario"}
                          </Button>
                        </CardBody>
                      </Card>
                    </Col>
                  </Row>

                  <Row>
                    <Col md="12">
                      <Card className="kiosk-pos-block">
                        <CardHeader>
                          <CardTitle tag="h5">Disponibilidad en otros kioskos</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Row>
                            <Col md="6">
                              <Label className="kiosk-pos-label">Producto / color</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                type="select"
                                value={availabilityKey}
                                onChange={(e) => setAvailabilityKey(e.target.value)}
                              >
                                <option value="">Selecciona producto</option>
                                {(context.inventory || []).map((item) => (
                                  <option
                                    key={`opt-${lineKeyFor(item.productId, item.colorId)}`}
                                    value={lineKeyFor(item.productId, item.colorId)}
                                  >
                                    {item.productCode} - {item.productName} ({item.colorName || "Sin color"})
                                  </option>
                                ))}
                              </Input>
                            </Col>
                            <Col md="3" className="d-flex align-items-end mt-2 mt-md-0">
                              <Button
                                color="info"
                                className="kiosk-pos-btn-lg"
                                onClick={checkAvailability}
                                disabled={availabilityLoading}
                              >
                                {availabilityLoading ? "Consultando..." : "Consultar otros kioskos"}
                              </Button>
                            </Col>
                          </Row>

                          {availabilityRows.length > 0 && (
                            <Table responsive className="mt-3">
                              <thead className="text-primary">
                                <tr>
                                  <th>Kiosko</th>
                                  <th>Código</th>
                                  <th>Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {availabilityRows.map((row) => (
                                  <tr key={`av-${row.kioskId}`}>
                                    <td>{row.kioskName}</td>
                                    <td>{row.kioskCode || "-"}</td>
                                    <td>
                                      <Badge color={row.available ? "success" : "danger"}>
                                        {row.available ? "Disponible" : "No disponible"}
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          )}
                        </CardBody>
                      </Card>
                    </Col>
                  </Row>
                    </>
                  )}

                  {activeTab === "REPORTS" && (
                  <Row>
                    <Col md="12">
                      <Card className="kiosk-pos-block">
                        <CardHeader>
                          <CardTitle tag="h5">Reportes de ventas</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Row>
                            <Col md="3">
                              <Label className="kiosk-pos-label">Inicio</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                              />
                            </Col>
                            <Col md="3">
                              <Label className="kiosk-pos-label">Fin</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                              />
                            </Col>
                            <Col md="3" className="d-flex align-items-end mt-2 mt-md-0">
                              <Button color="primary" className="kiosk-pos-btn-lg" onClick={applyReportFilters}>
                                Aplicar filtro
                              </Button>
                            </Col>
                          </Row>

                          <Row className="mt-3">
                            <Col md="12">
                              <Card body className="kiosk-pos-report-card">
                                <h6 className="mb-2">Mi kiosko</h6>
                                <div>Ventas: <strong>{myReport?.salesCount || 0}</strong></div>
                                <div>Total unidades: <strong>{formatQty(myReport?.totalItems || 0)}</strong></div>
                                <div>Total monto: <strong>{formatCurrency(myReport?.totalAmount || 0)}</strong></div>
                              </Card>
                            </Col>
                          </Row>

                          <Table responsive className="mt-3">
                            <thead className="text-primary">
                              <tr>
                                <th>Fecha</th>
                                <th>No. Venta</th>
                                <th>Cliente</th>
                                <th>Items</th>
                                <th>Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(sales || []).map((sale) => (
                                <tr key={sale.id}>
                                  <td>{sale.soldAt ? String(sale.soldAt).replace("T", " ").slice(0, 16) : "-"}</td>
                                  <td>{sale.saleNumber}</td>
                                  <td>{sale.customerName || "Consumidor final"}</td>
                                  <td>{formatQty(sale.totalItems)}</td>
                                  <td>{formatCurrency(sale.totalAmount)}</td>
                                </tr>
                              ))}
                              {(!sales || sales.length === 0) && (
                                <tr>
                                  <td colSpan="5" className="text-center text-muted">
                                    No hay ventas para el filtro seleccionado.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </Table>

                        </CardBody>
                      </Card>
                    </Col>
                  </Row>
                  )}
                  {activeTab === "PROMOS" && Boolean(context?.admin) && (
                    <Row>
                      <Col md="12">
                        <Card className="kiosk-pos-block">
                          <CardHeader>
                            <CardTitle tag="h5">Promociones configurables</CardTitle>
                          </CardHeader>
                          <CardBody>
                            <Row>
                              <Col md="4">
                                <Label className="kiosk-pos-label">Nombre</Label>
                                <Input
                                  className="kiosk-pos-input-lg"
                                  value={promoForm.name}
                                  onChange={(e) => setPromoForm((prev) => ({ ...prev, name: e.target.value }))}
                                  placeholder="Nombre promoción"
                                />
                              </Col>
                              <Col md="4">
                                <Label className="kiosk-pos-label">Tipo</Label>
                                <Input
                                  className="kiosk-pos-input-lg"
                                  type="select"
                                  value={promoForm.discountType}
                                  onChange={(e) => setPromoForm((prev) => ({ ...prev, discountType: e.target.value }))}
                                >
                                  <option value="PERCENT">Porcentaje (%)</option>
                                  <option value="FIXED">Monto fijo (Q)</option>
                                </Input>
                              </Col>
                              <Col md="4">
                                <Label className="kiosk-pos-label">Valor descuento</Label>
                                <Input
                                  className="kiosk-pos-input-lg"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={promoForm.discountValue}
                                  onChange={(e) => setPromoForm((prev) => ({ ...prev, discountValue: e.target.value }))}
                                />
                              </Col>
                            </Row>
                            <Row className="mt-2">
                              <Col md="4">
                                <Label className="kiosk-pos-label">Inicio</Label>
                                <Input
                                  className="kiosk-pos-input-lg"
                                  type="date"
                                  value={promoForm.startDate}
                                  onChange={(e) => setPromoForm((prev) => ({ ...prev, startDate: e.target.value }))}
                                />
                              </Col>
                              <Col md="4">
                                <Label className="kiosk-pos-label">Fin</Label>
                                <Input
                                  className="kiosk-pos-input-lg"
                                  type="date"
                                  value={promoForm.endDate}
                                  onChange={(e) => setPromoForm((prev) => ({ ...prev, endDate: e.target.value }))}
                                />
                              </Col>
                              <Col md="4">
                                <Label className="kiosk-pos-label">Descripción</Label>
                                <Input
                                  className="kiosk-pos-input-lg"
                                  value={promoForm.description}
                                  onChange={(e) => setPromoForm((prev) => ({ ...prev, description: e.target.value }))}
                                  placeholder="Descripción"
                                />
                              </Col>
                            </Row>
                            <Button color="primary" className="kiosk-pos-btn-main mt-3" onClick={createPromotion}>
                              Crear promoción
                            </Button>
                            <Table responsive className="mt-3">
                              <thead className="text-primary">
                                <tr>
                                  <th>Nombre</th>
                                  <th>Tipo</th>
                                  <th>Valor</th>
                                  <th>Vigencia</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(promotions || []).map((promo) => (
                                  <tr key={`tbl-promo-${promo.id}`}>
                                    <td>{promo.name}</td>
                                    <td>{promo.discountType === "PERCENT" ? "Porcentaje" : "Monto fijo"}</td>
                                    <td>{promo.discountType === "PERCENT" ? `${promo.discountValue}%` : formatCurrency(promo.discountValue)}</td>
                                    <td>
                                      {(promo.startDate || "-")} - {(promo.endDate || "-")}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </CardBody>
                        </Card>
                      </Col>
                    </Row>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskSales;

