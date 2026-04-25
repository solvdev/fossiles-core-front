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

function EmployeesForm({ employeeId, isOpen, toggle, onSuccess }) {
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
    departmentId: "",
    costCenterId: "",
    operationalUnitId: "",
    userId: "",
    status: "active",
  });
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
        departmentId: employee.departmentId || "",
        costCenterId: employee.costCenterId || "",
        operationalUnitId: employee.operationalUnitId || "",
        userId: employee.user ? employee.user.id : "",
        status: employee.status || "active",
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
      departmentId: "",
      costCenterId: "",
      operationalUnitId: "",
      userId: "",
      status: "active",
    });
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
      const submitData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || null,
        dpi: formData.dpi.trim(),
        hireDate: formData.hireDate,
        position: formData.position.trim() || null,
        salary: formData.salary ? parseFloat(formData.salary) : null,
        bankAccount: formData.bankAccount.trim() || null,
        paymentMethod: formData.paymentMethod.trim() || null,
        igssDeduction: formData.igssDeduction ? parseFloat(formData.igssDeduction) : null,
        quincenaBruta: formData.quincenaBruta ? parseFloat(formData.quincenaBruta) : null,
        quincenaNeta: formData.quincenaNeta ? parseFloat(formData.quincenaNeta) : null,
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
                  value={formData.salary}
                  onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  placeholder="0.00"
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
                  value={formData.bankAccount}
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
                  onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                >
                  <option value="">Seleccione...</option>
                  <option value="TRANSFERENCIA BANCARIA">TRANSFERENCIA BANCARIA</option>
                  <option value="CHEQUE">CHEQUE</option>
                </Input>
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
                  onChange={(e) => setFormData({ ...formData, igssDeduction: e.target.value })}
                  placeholder="0.00"
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
                  onChange={(e) => setFormData({ ...formData, quincenaBruta: e.target.value })}
                  placeholder="0.00"
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
                  onChange={(e) => setFormData({ ...formData, quincenaNeta: e.target.value })}
                  placeholder="0.00"
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
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
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

