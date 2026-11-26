import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  Label,
  FormGroup,
  Input,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Row,
  Col,
} from "reactstrap";
import {
  getSupplierById,
  createSupplier,
  updateSupplier,
  getNextSupplierCode,
  normalizeSupplierCode,
} from "services/supplierService";
import { enterMovesNext, Kbd } from "hooks/useKeyboard";

const EMPTY = {
  code: "",
  name: "",
  nit: "",
  phone: "",
  email: "",
  address: "",
  status: "active",
  payeeName: "",
  creditDays: "30",
};

function SuppliersForm({ supplierId, isOpen, toggle, onSuccess, suppliers = [] }) {
  const [formData, setFormData] = useState(EMPTY);
  const [suggestedCode, setSuggestedCode] = useState("");
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setError("");
    if (supplierId) {
      loadSupplier(supplierId);
    } else {
      setFormData(EMPTY);
      getNextSupplierCode()
        .then((code) => {
          setSuggestedCode(code);
          setFormData((prev) => (prev.code ? prev : { ...prev, code }));
        })
        .catch(() => setSuggestedCode(""));
    }
    // El foco va al nombre: el código ya viene puesto.
    const t = setTimeout(() => nameRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [isOpen, supplierId]);

  const loadSupplier = async (id) => {
    try {
      setLoading(true);
      const supplier = await getSupplierById(id);
      setSuggestedCode("");
      setFormData({
        code: supplier.code || "",
        name: supplier.name || "",
        nit: supplier.nit || "",
        phone: supplier.phone || "",
        email: supplier.email || "",
        address: supplier.address || "",
        status: supplier.status || "active",
        payeeName: supplier.payeeName || "",
        creditDays: String(supplier.creditDays ?? 30),
      });
    } catch (err) {
      setError(err.message || "Error al cargar el proveedor");
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => setFormData({ ...formData, [field]: e.target.value });

  const codeProblem = (raw) => {
    if (!raw.trim()) return "";
    const code = normalizeSupplierCode(raw);
    if (!code) return "Use PV seguido de números, por ejemplo PV013.";
    const holder = suppliers.find((s) => s.code === code && s.id !== supplierId);
    return holder ? `${code} ya es de ${holder.name}.` : "";
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.nit.trim()) newErrors.nit = "El NIT es requerido";
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "El email no es válido";
    }
    const codeError = codeProblem(formData.code);
    if (codeError) newErrors.code = codeError;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      setError("");
      const days = Number(formData.creditDays);
      const payload = {
        ...formData,
        code: normalizeSupplierCode(formData.code) || (supplierId ? undefined : ""),
        creditDays: Number.isInteger(days) && days >= 0 ? days : 30,
      };
      if (supplierId) {
        await updateSupplier(supplierId, payload);
      } else {
        await createSupplier(payload);
      }
      onSuccess();
      toggle();
      setFormData(EMPTY);
    } catch (err) {
      setError(err.message || "Error al guardar el proveedor");
    } finally {
      setLoading(false);
    }
  };

  const normalizedCode = normalizeSupplierCode(formData.code);

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {supplierId ? "Editar Proveedor" : "Nuevo Proveedor"}
      </ModalHeader>
      <form onSubmit={handleSubmit} onKeyDown={enterMovesNext}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row>
            <Col md="3">
              <FormGroup>
                <Label for="sup-code">Código</Label>
                <Input
                  id="sup-code"
                  type="text"
                  maxLength={10}
                  value={formData.code}
                  onChange={set("code")}
                  onBlur={() => normalizedCode && setFormData((prev) => ({ ...prev, code: normalizedCode }))}
                  invalid={!!errors.code}
                  autoComplete="off"
                  style={{ fontFamily: "ui-monospace, Consolas, monospace", fontWeight: 600 }}
                />
                {errors.code ? (
                  <div className="text-danger small">{errors.code}</div>
                ) : (
                  <small className="text-muted">
                    {!supplierId && formData.code === suggestedCode && suggestedCode
                      ? "Siguiente disponible"
                      : "Ej.: PV013 o 13"}
                  </small>
                )}
              </FormGroup>
            </Col>
            <Col md="9">
              <FormGroup>
                <Label for="sup-name">Nombre *</Label>
                <Input id="sup-name" innerRef={nameRef} type="text" value={formData.name} onChange={set("name")} invalid={!!errors.name} />
                {errors.name && <div className="text-danger small">{errors.name}</div>}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label for="sup-nit">NIT *</Label>
                <Input id="sup-nit" type="text" value={formData.nit} onChange={set("nit")} invalid={!!errors.nit} />
                {errors.nit && <div className="text-danger small">{errors.nit}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label for="sup-phone">Teléfono</Label>
                <Input id="sup-phone" type="text" value={formData.phone} onChange={set("phone")} />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label for="sup-email">Email</Label>
                <Input id="sup-email" type="email" value={formData.email} onChange={set("email")} invalid={!!errors.email} />
                {errors.email && <div className="text-danger small">{errors.email}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label for="sup-status">Estado</Label>
                <Input id="sup-status" type="select" value={formData.status} onChange={set("status")}>
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <FormGroup>
            <Label for="sup-address">Dirección</Label>
            <Input id="sup-address" type="textarea" rows="2" value={formData.address} onChange={set("address")} />
          </FormGroup>
          <Row>
            <Col md="8">
              <FormGroup>
                <Label for="sup-payee">Cheque a nombre de</Label>
                <Input
                  id="sup-payee"
                  type="text"
                  maxLength={200}
                  placeholder="Si es distinto del nombre del proveedor"
                  value={formData.payeeName}
                  onChange={set("payeeName")}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label for="sup-days">Días de crédito</Label>
                <Input id="sup-days" type="number" min="0" max="365" value={formData.creditDays} onChange={set("creditDays")} />
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter className="d-flex justify-content-between">
          <span className="kbd-bar">
            <span><Kbd>Enter</Kbd> siguiente campo</span>
            <span><Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> guardar</span>
            <span><Kbd>Esc</Kbd> cerrar</span>
          </span>
          <span>
            <Button color="secondary" onClick={toggle} disabled={loading} className="mr-2">
              Cancelar
            </Button>
            <Button color="primary" type="submit" disabled={loading}>
              {loading ? "Guardando..." : supplierId ? "Actualizar" : "Crear"}
            </Button>
          </span>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default SuppliersForm;
