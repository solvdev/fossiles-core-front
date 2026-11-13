import React, { useState, useEffect } from "react";
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
import { getEmployeeById, createEmployee, updateEmployee } from "services/employeeService";
import { getDepartments } from "services/departmentService";
import { getCostCenters } from "services/costCenterService";
import { getOperationalUnits } from "services/operationalUnitService";
import { getUsers } from "services/userService";
import { useAuth } from "contexts/AuthContext";

const plain = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/** Misma regla que el backend: Producción (o un código con PRODUC) cobra el 5 y el 20; los demás, el 15 y a fin de mes. */
const payGroupForDepartment = (department) =>
  department && (plain(department.name).includes("PRODUCCI") || plain(department.code).includes("PRODUC"))
    ? "PLANTA"
    : "ADMINISTRACION";
const NOTHING_LOADED = { bonification: "", terminationDate: "" };

function EmployeesForm({ employeeId, isOpen, toggle, onSuccess }) {
  const { hasPermission } = useAuth();
  // Los salarios solo los ven y cambian administración y Contabilidad; al crear se pueden capturar. Al editar,
  // quien no lleva la planilla tampoco cambia cuenta, forma de pago, vinculación, grupo ni fecha de baja.
  const canSeeSalaries = ["PLANILLA.CORRIDAS.VER", "PLANILLA.CORRIDAS.CREAR", "PLANILLA.CORRIDAS.APROBAR"].some(hasPermission);
  const salaryLocked = Boolean(employeeId) && !canSeeSalaries;
  const salaryPlaceholder = salaryLocked ? "Solo administración y Contabilidad" : "0.00";
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dpi: "",
    hireDate: "",
    position: "",
    salary: "",
    bankAccount: "",
    paymentMethod: "",
    igssDeduction: "",
    quincenaBruta: "",
    quincenaNeta: "",
    employmentType: "PLANILLA",
    payGroup: "",
    bonification: "",
    nit: "",
    igssAffiliation: "",
    terminationDate: "",
    departmentId: "",
    costCenterId: "",
    operationalUnitId: "",
    userId: "",
    status: "active",
  });
  // Lo que traía la ficha al abrirla: solo se borra a propósito lo que tenía valor.
  const [loaded, setLoaded] = useState(NOTHING_LOADED);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [departments, setDepartments] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [operationalUnits, setOperationalUnits] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (isOpen) {
      loadLookups();
      if (employeeId) {
        loadEmployee();
      } else {
        resetForm();
      }
    }
  }, [isOpen, employeeId]);

  const loadLookups = async () => {
    try {
      const [deptsData, costCentersData, unitsData, usersData] = await Promise.all([
        getDepartments(),
        getCostCenters(),
        getOperationalUnits(),
        getUsers(),
      ]);
      setDepartments(deptsData || []);
      setCostCenters(costCentersData || []);
      setOperationalUnits(unitsData || []);
      setUsers(usersData || []);
    } catch (err) {
      console.error("Error al cargar catálogos:", err);
    }
  };

  const loadEmployee = async () => {
    try {
      setLoading(true);
      const employee = await getEmployeeById(employeeId);
      setFormData({
        firstName: employee.firstName || "",
        lastName: employee.lastName || "",
        email: employee.email || "",
        phone: employee.phone || "",
        dpi: employee.dpi || "",
        hireDate: employee.hireDate ? employee.hireDate.split("T")[0] : "",
        position: employee.position || "",
        salary: employee.salary || "",
        bankAccount: employee.bankAccount || "",
        paymentMethod: employee.paymentMethod || "",
        igssDeduction: employee.igssDeduction || "",
        quincenaBruta: employee.quincenaBruta || "",
        quincenaNeta: employee.quincenaNeta || "",
        employmentType: employee.employmentType || "PLANILLA",
        payGroup: employee.payGroup || "",
        bonification: employee.bonification ?? "",
        nit: employee.nit || "",
        igssAffiliation: employee.igssAffiliation || "",
        terminationDate: employee.terminationDate ? employee.terminationDate.split("T")[0] : "",
        departmentId: employee.departmentId || "",
        costCenterId: employee.costCenterId || "",
        operationalUnitId: employee.operationalUnitId || "",
        userId: employee.user ? employee.user.id : "",
        status: employee.status || "active",
      });
      setLoaded({
        bonification: employee.bonification ?? "",
        terminationDate: employee.terminationDate ? employee.terminationDate.split("T")[0] : "",
      });
    } catch (err) {
      setError(err.message || "Error al cargar el empleado");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      dpi: "",
      hireDate: "",
      position: "",
      salary: "",
      bankAccount: "",
      paymentMethod: "",
      igssDeduction: "",
      quincenaBruta: "",
      quincenaNeta: "",
      employmentType: "PLANILLA",
      payGroup: "",
      bonification: "",
      nit: "",
      igssAffiliation: "",
      terminationDate: "",
      departmentId: "",
      costCenterId: "",
      operationalUnitId: "",
      userId: "",
      status: "active",
    });
    setLoaded(NOTHING_LOADED);
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.firstName.trim()) {
      newErrors.firstName = "El nombre es requerido";
    }
    
    if (!formData.lastName.trim()) {
      newErrors.lastName = "El apellido es requerido";
    }
    
    if (!formData.email.trim()) {
      newErrors.email = "El email es requerido";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "El email no es válido";
    }
    
    if (!formData.dpi.trim()) {
      newErrors.dpi = "El DPI es requerido";
    }
    
    if (!formData.hireDate) {
      newErrors.hireDate = "La fecha de contratación es requerida";
    }
    
    // Departamento ya no es requerido
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setLoading(true);
      setError("");
      const department = departments.find((d) => String(d.id) === String(formData.departmentId));
      // "Según departamento" en una edición fija el grupo del departamento; vacío lo dejaría como estaba.
      const payGroup = formData.payGroup || (employeeId ? payGroupForDepartment(department) : null);
      const submitData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        dpi: formData.dpi.trim(),
        hireDate: formData.hireDate,
        position: formData.position.trim() || null,
        salary: formData.salary ? parseFloat(formData.salary) : null,
        // Sin acceso a la planilla, los datos de pago van vacíos y el backend conserva los actuales.
        bankAccount: salaryLocked ? null : formData.bankAccount.trim() || null,
        paymentMethod: salaryLocked ? null : formData.paymentMethod.trim() || null,
        igssDeduction: formData.igssDeduction ? parseFloat(formData.igssDeduction) : null,
        quincenaBruta: formData.quincenaBruta ? parseFloat(formData.quincenaBruta) : null,
        quincenaNeta: formData.quincenaNeta ? parseFloat(formData.quincenaNeta) : null,
        employmentType: salaryLocked ? null : formData.employmentType || "PLANILLA",
        payGroup: salaryLocked ? null : payGroup,
        bonification: formData.bonification !== "" ? parseFloat(formData.bonification) : null,
        clearBonification: Boolean(employeeId) && canSeeSalaries && formData.bonification === "" && loaded.bonification !== "",
        clearTerminationDate: Boolean(employeeId) && !salaryLocked && !formData.terminationDate && loaded.terminationDate !== "",
        nit: formData.nit.trim(),
        igssAffiliation: formData.igssAffiliation.trim(),
        terminationDate: salaryLocked ? null : formData.terminationDate || null,
        departmentId: formData.departmentId ? Number(formData.departmentId) : null,
        costCenterId: formData.costCenterId ? Number(formData.costCenterId) : null,
        operationalUnitId: formData.operationalUnitId ? Number(formData.operationalUnitId) : null,
        userId: formData.userId && formData.userId !== "" ? Number(formData.userId) : null,
        status: formData.status,
      };
      
      if (employeeId) {
        await updateEmployee(employeeId, submitData);
      } else {
        await createEmployee(submitData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el empleado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        {employeeId ? "Editar Empleado" : "Nuevo Empleado"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody style={{ maxHeight: "80vh", overflowY: "auto" }}>
          {error && <Alert color="danger">{error}</Alert>}
          
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Nombre *</Label>
                <Input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  invalid={!!errors.firstName}
                />
                {errors.firstName && <div className="text-danger small">{errors.firstName}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Apellido *</Label>
                <Input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  invalid={!!errors.lastName}
                />
                {errors.lastName && <div className="text-danger small">{errors.lastName}</div>}
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  invalid={!!errors.email}
                />
                {errors.email && <div className="text-danger small">{errors.email}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Teléfono</Label>
                <Input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>DPI *</Label>
                <Input
                  type="text"
                  value={formData.dpi}
                  onChange={(e) => setFormData({ ...formData, dpi: e.target.value })}
                  invalid={!!errors.dpi}
                  maxLength={20}
                />
                {errors.dpi && <div className="text-danger small">{errors.dpi}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Fecha de Contratación *</Label>
                <Input
                  type="date"
                  value={formData.hireDate}
                  onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
                  invalid={!!errors.hireDate}
                />
                {errors.hireDate && <div className="text-danger small">{errors.hireDate}</div>}
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Puesto</Label>
                <Input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder="Ej: JEFE DE PRODUCCION"
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Salario Mensual</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.salary}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  placeholder={salaryPlaceholder}
                />
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Número de Cuenta Bancaria</Label>
                <Input
                  type="text"
                  maxLength={50}
                  value={formData.bankAccount}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, bankAccount: e.target.value })}
                  placeholder="Número de cuenta"
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Método de Pago</Label>
                <Input
                  type="select"
                  value={formData.paymentMethod}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                >
                  <option value="">Seleccione...</option>
                  <option value="TRANSFERENCIA BANCARIA">TRANSFERENCIA BANCARIA</option>
                  <option value="CHEQUE">CHEQUE</option>
                  <option value="EFECTIVO">EFECTIVO</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>

          {salaryLocked && (
            <p className="small text-muted">
              La cuenta, la forma de pago, la vinculación, el grupo de pago y la fecha de baja solo los cambian
              administración y Contabilidad.
            </p>
          )}
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Tipo de vinculación</Label>
                <Input
                  type="select"
                  value={formData.employmentType}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                >
                  <option value="PLANILLA">PLANILLA (IGSS, ISR y bonificación)</option>
                  <option value="SERVICIOS">SERVICIOS (sin retenciones)</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Grupo de pago</Label>
                <Input
                  type="select"
                  value={formData.payGroup}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, payGroup: e.target.value })}
                >
                  <option value="">Según departamento</option>
                  <option value="PLANTA">PLANTA (5 y 20)</option>
                  <option value="ADMINISTRACION">ADMINISTRACIÓN Y KIOSCOS (15 y fin de mes)</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Bonificación incentivo mensual</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.bonification}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, bonification: e.target.value })}
                  placeholder={salaryLocked ? salaryPlaceholder : "250.00 si se deja vacío"}
                />
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="4">
              <FormGroup>
                <Label>NIT</Label>
                <Input
                  type="text"
                  maxLength={20}
                  value={formData.nit}
                  onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Afiliación IGSS</Label>
                <Input
                  type="text"
                  maxLength={30}
                  value={formData.igssAffiliation}
                  onChange={(e) => setFormData({ ...formData, igssAffiliation: e.target.value })}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Fecha de baja</Label>
                <Input
                  type="date"
                  value={formData.terminationDate}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, terminationDate: e.target.value })}
                />
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Deducción IGSS</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.igssDeduction}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, igssDeduction: e.target.value })}
                  placeholder={salaryPlaceholder}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Quincena Bruta</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.quincenaBruta}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, quincenaBruta: e.target.value })}
                  placeholder={salaryPlaceholder}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Quincena Neta</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.quincenaNeta}
                  disabled={salaryLocked}
                  onChange={(e) => setFormData({ ...formData, quincenaNeta: e.target.value })}
                  placeholder={salaryPlaceholder}
                />
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Departamento</Label>
                <Input
                  type="select"
                  value={formData.departmentId}
                  onChange={(e) => {
                    const department = departments.find((d) => String(d.id) === e.target.value);
                    // Quien no lleva la planilla cambia el departamento sin mover el grupo de pago.
                    setFormData({
                      ...formData,
                      departmentId: e.target.value,
                      payGroup: salaryLocked ? formData.payGroup : payGroupForDepartment(department),
                    });
                  }}
                  invalid={!!errors.departmentId}
                >
                  <option value="">Seleccione...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </Input>
                {errors.departmentId && <div className="text-danger small">{errors.departmentId}</div>}
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Centro de Costo</Label>
                <Input
                  type="select"
                  value={formData.costCenterId}
                  onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value })}
                >
                  <option value="">Seleccione...</option>
                  {costCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Unidad Operativa</Label>
                <Input
                  type="select"
                  value={formData.operationalUnitId}
                  onChange={(e) => setFormData({ ...formData, operationalUnitId: e.target.value })}
                >
                  <option value="">Seleccione...</option>
                  {operationalUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Usuario Asociado</Label>
                <Input
                  type="select"
                  value={formData.userId}
                  onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                >
                  <option value="">Sin usuario asociado</option>
                  {users
                    .filter((user) => user.status === "active")
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} - {user.email}
                      </option>
                    ))}
                </Input>
              </FormGroup>
            </Col>
          </Row>

          <FormGroup>
            <Label>Estado</Label>
            <Input
              type="select"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
            >
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
            </Input>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : employeeId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default EmployeesForm;

