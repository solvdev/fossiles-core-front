import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Label,
  FormGroup,
} from "reactstrap";
import { 
  getEmployees, 
  changeEmployeeStatus, 
  deleteEmployee,
  getEmployeeById,
  createMultipleEmployees
} from "services/employeeService";
import { getDepartments } from "services/departmentService";
import { getCostCenters } from "services/costCenterService";
import { getOperationalUnits } from "services/operationalUnitService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import EmployeesForm from "./EmployeesForm";

function EmployeesList() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterDepartmentId, setFilterDepartmentId] = useState("");
  const [viewDetailsModal, setViewDetailsModal] = useState(false);
  const [employeeToView, setEmployeeToView] = useState(null);
  const [bulkCreateModal, setBulkCreateModal] = useState(false);
  const [bulkEmployees, setBulkEmployees] = useState([{ firstName: "", lastName: "", email: "", phone: "", dpi: "", hireDate: "", costCenterId: "", operationalUnitId: "" }]);
  const [bulkDepartmentId, setBulkDepartmentId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("active");
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkErrors, setBulkErrors] = useState({});
  const [bulkResults, setBulkResults] = useState(null);
  const [costCenters, setCostCenters] = useState([]);
  const [operationalUnits, setOperationalUnits] = useState([]);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    loadEmployees();
    loadDepartments();
    loadBulkLookups();
  }, []);

  const loadBulkLookups = async () => {
    try {
      const [costCentersData, operationalUnitsData] = await Promise.all([
        getCostCenters(),
        getOperationalUnits(),
      ]);
      setCostCenters(costCentersData || []);
      setOperationalUnits(operationalUnitsData || []);
    } catch (err) {
      console.error("Error al cargar catálogos:", err);
    }
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getEmployees();
      setEmployees(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar los empleados");
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await getDepartments();
      setDepartments(data || []);
    } catch (err) {
      console.error("Error al cargar departamentos:", err);
    }
  };

  const handleNew = () => {
    setSelectedEmployeeId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedEmployeeId(id);
    setShowForm(true);
  };

  const handleView = async (id) => {
    try {
      const employee = await getEmployeeById(id);
      setEmployeeToView(employee);
      setViewDetailsModal(true);
    } catch (err) {
      setError(err.message || "Error al cargar los detalles del empleado");
    }
  };

  const handleDelete = (employee) => {
    setEmployeeToDelete(employee);
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!employeeToDelete) return;
    try {
      setDeleting(true);
      await deleteEmployee(employeeToDelete.id);
      setDeleteModal(false);
      setEmployeeToDelete(null);
      loadEmployees();
    } catch (err) {
      setError(err.message || "Error al eliminar el empleado");
      setDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (id, currentStatus) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      await changeEmployeeStatus(id, newStatus);
      loadEmployees();
    } catch (err) {
      setError(err.message || "Error al cambiar el estado del empleado");
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setSelectedEmployeeId(null);
    loadEmployees();
  };

  const getStatusBadge = (status) => {
    return status === "active" ? (
      <Badge color="success">Activo</Badge>
    ) : (
      <Badge color="secondary">Inactivo</Badge>
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-GT");
    } catch {
      return dateString;
    }
  };

  const filteredEmployees = useMemo(() => {
    let filtered = employees.filter((employee) => {
      const matchesName =
        !filterName ||
        `${employee.firstName || ""} ${employee.lastName || ""}`
          .toLowerCase()
          .includes(filterName.toLowerCase()) ||
        employee.email?.toLowerCase().includes(filterName.toLowerCase()) ||
        employee.dpi?.includes(filterName);

      const matchesDepartment =
        !filterDepartmentId ||
        (employee.departmentId && String(employee.departmentId) === filterDepartmentId);

      return matchesName && matchesDepartment;
    });

    // Aplicar ordenamiento
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue, bValue;

        switch (sortField) {
          case "id":
            aValue = a.id || 0;
            bValue = b.id || 0;
            break;
          case "name":
            aValue = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
            bValue = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
            break;
          case "position":
            aValue = (a.position || "").toLowerCase();
            bValue = (b.position || "").toLowerCase();
            break;
          case "salary":
            aValue = a.salary || 0;
            bValue = b.salary || 0;
            break;
          case "dpi":
            aValue = (a.dpi || "").toLowerCase();
            bValue = (b.dpi || "").toLowerCase();
            break;
          case "hireDate":
            aValue = a.hireDate ? new Date(a.hireDate).getTime() : 0;
            bValue = b.hireDate ? new Date(b.hireDate).getTime() : 0;
            break;
          case "department":
            aValue = getDepartmentName(a.departmentId).toLowerCase();
            bValue = getDepartmentName(b.departmentId).toLowerCase();
            break;
          case "status":
            aValue = (a.status || "").toLowerCase();
            bValue = (b.status || "").toLowerCase();
            break;
          default:
            return 0;
        }

        if (aValue < bValue) {
          return sortDirection === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortDirection === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [employees, filterName, filterDepartmentId, sortField, sortDirection, departments]);

  const handleClearFilters = () => {
    setFilterName("");
    setFilterDepartmentId("");
  };

  const getDepartmentName = (departmentId) => {
    const dept = departments.find((d) => d.id === departmentId);
    return dept ? dept.name : "-";
  };

  const getCostCenterName = (costCenterId) => {
    const cc = costCenters.find((c) => c.id === costCenterId);
    return cc ? `${cc.code || ""} - ${cc.name || ""}`.trim() : "-";
  };

  const getOperationalUnitName = (operationalUnitId) => {
    const unit = operationalUnits.find((u) => u.id === operationalUnitId);
    return unit ? `${unit.code || ""} - ${unit.name || ""}`.trim() : "-";
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return "-";
    return `Q ${parseFloat(amount).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const handleSort = (field) => {
    if (sortField === field) {
      // Si ya está ordenando por este campo, cambiar dirección
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Si es un campo nuevo, ordenar ascendente
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <i className="nc-icon nc-minimal-up" style={{ opacity: 0.3 }} />;
    }
    return sortDirection === "asc" 
      ? <i className="nc-icon nc-minimal-up" /> 
      : <i className="nc-icon nc-minimal-down" />;
  };

  const handleBulkCreate = () => {
    setBulkEmployees([{ firstName: "", lastName: "", email: "", phone: "", dpi: "", hireDate: "", costCenterId: "", operationalUnitId: "" }]);
    setBulkDepartmentId("");
    setBulkStatus("active");
    setBulkErrors({});
    setBulkResults(null);
    setBulkCreateModal(true);
  };

  const parseDateFromExcel = (dateStr) => {
    if (!dateStr || !dateStr.trim()) return "";
    
    const trimmed = dateStr.trim();
    
    // Si ya está en formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // Intentar diferentes formatos
    const separators = [/[\/]/, /[-]/, /[.]/];
    for (const sep of separators) {
      const parts = trimmed.split(sep);
      if (parts.length === 3) {
        let day, month, year;
        
        // Detectar formato DD/MM/YYYY o MM/DD/YYYY
        if (parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
          // Asumir DD/MM/YYYY (formato común en Guatemala)
          day = parts[0].padStart(2, '0');
          month = parts[1].padStart(2, '0');
          year = parts[2];
        } else if (parts[0].length === 4) {
          // Formato YYYY/MM/DD
          year = parts[0];
          month = parts[1].padStart(2, '0');
          day = parts[2].padStart(2, '0');
        } else {
          // Intentar detectar automáticamente
          const numParts = parts.map(p => parseInt(p));
          if (numParts[0] > 12) {
            // Primer número > 12, debe ser día (DD/MM/YYYY)
            day = parts[0].padStart(2, '0');
            month = parts[1].padStart(2, '0');
            year = parts[2];
          } else {
            // Podría ser MM/DD/YYYY o DD/MM/YYYY, asumir DD/MM/YYYY
            day = parts[0].padStart(2, '0');
            month = parts[1].padStart(2, '0');
            year = parts[2];
          }
        }
        
        return `${year}-${month}-${day}`;
      }
    }
    
    return trimmed; // Retornar tal cual si no se puede parsear
  };

  const handlePasteFromExcel = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    
    // Parsear datos pegados (formato tabulado de Excel)
    // Formato esperado: Nombre | Apellido | Email | Teléfono | DPI | Fecha Contratación
    const lines = pastedData.split('\n').filter(line => line.trim());
    
    const parsedEmployees = lines.map(line => {
      const columns = line.split('\t'); // Excel usa tabs para separar columnas
      
      return {
        firstName: columns[0]?.trim() || "",
        lastName: columns[1]?.trim() || "",
        email: columns[2]?.trim() || "",
        phone: columns[3]?.trim() || "",
        dpi: columns[4]?.trim() || "",
        hireDate: parseDateFromExcel(columns[5]),
        costCenterId: "",
        operationalUnitId: ""
      };
    }).filter(emp => emp.firstName || emp.lastName || emp.email || emp.dpi); // Filtrar filas vacías
    
    if (parsedEmployees.length > 0) {
      setBulkEmployees(parsedEmployees);
    }
  };

  const handleAddEmployeeRow = () => {
    setBulkEmployees([...bulkEmployees, { firstName: "", lastName: "", email: "", phone: "", dpi: "", hireDate: "", costCenterId: "", operationalUnitId: "" }]);
  };

  const handleRemoveEmployeeRow = (index) => {
    if (bulkEmployees.length > 1) {
      setBulkEmployees(bulkEmployees.filter((_, i) => i !== index));
    }
  };

  const handleBulkEmployeeChange = (index, field, value) => {
    const updated = [...bulkEmployees];
    updated[index][field] = value;
    setBulkEmployees(updated);
    if (bulkErrors[`employee_${index}_${field}`]) {
      setBulkErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`employee_${index}_${field}`];
        return newErrors;
      });
    }
  };

  const validateBulkForm = () => {
    const newErrors = {};

    if (!bulkDepartmentId) {
      newErrors.departmentId = "El departamento es requerido";
    }

    bulkEmployees.forEach((employee, index) => {
      if (!employee.firstName.trim()) {
        newErrors[`employee_${index}_firstName`] = "El nombre es requerido";
      }
      if (!employee.lastName.trim()) {
        newErrors[`employee_${index}_lastName`] = "El apellido es requerido";
      }
      if (!employee.email.trim()) {
        newErrors[`employee_${index}_email`] = "El email es requerido";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) {
        newErrors[`employee_${index}_email`] = "El email no es válido";
      }
      if (!employee.dpi.trim()) {
        newErrors[`employee_${index}_dpi`] = "El DPI es requerido";
      }
      if (!employee.hireDate) {
        newErrors[`employee_${index}_hireDate`] = "La fecha de contratación es requerida";
      }
    });

    setBulkErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBulkSubmit = async () => {
    setBulkErrors({});
    setBulkResults(null);

    if (!validateBulkForm()) {
      return;
    }

    try {
      setBulkCreating(true);
      const employeesData = bulkEmployees.map((employee) => ({
        firstName: employee.firstName.trim(),
        lastName: employee.lastName.trim(),
        email: employee.email.trim(),
        phone: employee.phone.trim() || null,
        dpi: employee.dpi.trim(),
        hireDate: employee.hireDate,
        status: bulkStatus,
        departmentId: Number(bulkDepartmentId),
        costCenterId: employee.costCenterId ? Number(employee.costCenterId) : null,
        operationalUnitId: employee.operationalUnitId ? Number(employee.operationalUnitId) : null,
      }));

      const results = await createMultipleEmployees(employeesData);
      setBulkResults(results);

      if (results.errors.length === 0) {
        setTimeout(() => {
          setBulkCreateModal(false);
          loadEmployees();
        }, 2000);
      }
    } catch (err) {
      setBulkErrors({ general: err.message || "Error al crear empleados" });
    } finally {
      setBulkCreating(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Empleados</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="success"
                    onClick={handleBulkCreate}
                    className="btn-round mr-2"
                  >
                    <i className="nc-icon nc-badge" /> Crear Múltiples Empleados
                  </Button>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nuevo Empleado
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              {/* Filtros */}
              <Row className="mb-3">
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar por nombre, email o DPI</Label>
                    <Input
                      type="text"
                      placeholder="Buscar..."
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Departamento</Label>
                    <Input
                      type="select"
                      value={filterDepartmentId}
                      onChange={(e) => setFilterDepartmentId(e.target.value)}
                    >
                      <option value="">Todos</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="4" className="d-flex align-items-end">
                  <Button color="secondary" onClick={handleClearFilters} size="sm">
                    Limpiar Filtros
                  </Button>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center">
                  <p>Cargando empleados...</p>
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="text-center">
                  <p>No hay empleados registrados.</p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("id")}
                      >
                        ID {getSortIcon("id")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("name")}
                      >
                        Nombre Completo {getSortIcon("name")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("position")}
                      >
                        Puesto {getSortIcon("position")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("salary")}
                      >
                        Salario {getSortIcon("salary")}
                      </th>
                    
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("department")}
                      >
                        Departamento {getSortIcon("department")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("status")}
                      >
                        Estado {getSortIcon("status")}
                      </th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => (
                      <tr key={employee.id}>
                        <td>{employee.id}</td>
                        <td>{`${employee.firstName || ""} ${employee.lastName || ""}`.trim()}</td>
                        <td>{employee.position || "-"}</td>
                        <td>{formatCurrency(employee.salary)}</td>

                        <td>{getDepartmentName(employee.departmentId)}</td>
                        <td>{getStatusBadge(employee.status)}</td>
                        <td className="text-right">
                          <Button 
                            color="info" 
                            size="sm" 
                            onClick={() => handleView(employee.id)} 
                            className="btn-round mr-1"
                            title="Ver detalles"
                          >
                            <i className="nc-icon nc-zoom-split" />
                          </Button>
                          <Button 
                            color="warning" 
                            size="sm" 
                            onClick={() => handleEdit(employee.id)} 
                            className="btn-round mr-1"
                            title="Editar"
                          >
                            <i className="nc-icon nc-ruler-pencil" />
                          </Button>
                          <Button 
                            color={employee.status === "active" ? "secondary" : "success"} 
                            size="sm" 
                            onClick={() => handleStatusChange(employee.id, employee.status)} 
                            className="btn-round mr-1"
                            title={employee.status === "active" ? "Desactivar" : "Activar"}
                          >
                            <i className={`nc-icon nc-${employee.status === "active" ? "simple-remove" : "check-2"}`} />
                          </Button>
                          <Button 
                            color="danger" 
                            size="sm" 
                            onClick={() => handleDelete(employee)} 
                            className="btn-round"
                            title="Eliminar"
                          >
                            <i className="nc-icon nc-simple-remove" />
                          </Button>
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

      {/* Modal de detalles */}
      <Modal isOpen={viewDetailsModal} toggle={() => setViewDetailsModal(false)} size="xl">
        <ModalHeader toggle={() => setViewDetailsModal(false)}>
          <h4 className="modal-title">
            <i className="nc-icon nc-single-02 mr-2" />
            Detalles del Empleado
          </h4>
        </ModalHeader>
        <ModalBody style={{ maxHeight: "80vh", overflowY: "auto" }}>
          {employeeToView && (
            <>
              {/* Información Personal */}
              <Card className="mb-3">
                <CardHeader className="bg-primary text-white">
                  <CardTitle tag="h5" className="mb-0">
                    <i className="nc-icon nc-single-02 mr-2" />
                    Información Personal
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Row>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>ID:</strong></Label>
                        <p className="mb-2">{employeeToView.id}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Estado:</strong></Label>
                        <p className="mb-2">{getStatusBadge(employeeToView.status)}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Nombre:</strong></Label>
                        <p className="mb-2">{employeeToView.firstName || "-"}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Apellido:</strong></Label>
                        <p className="mb-2">{employeeToView.lastName || "-"}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Email:</strong></Label>
                        <p className="mb-2">{employeeToView.email || "-"}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Teléfono:</strong></Label>
                        <p className="mb-2">{employeeToView.phone || "-"}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>DPI:</strong></Label>
                        <p className="mb-2">{employeeToView.dpi || "-"}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Fecha de Contratación:</strong></Label>
                        <p className="mb-2">{formatDate(employeeToView.hireDate)}</p>
                      </FormGroup>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* Información Laboral */}
              <Card className="mb-3">
                <CardHeader className="bg-info text-white">
                  <CardTitle tag="h5" className="mb-0">
                    <i className="nc-icon nc-briefcase-24 mr-2" />
                    Información Laboral
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Row>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Puesto:</strong></Label>
                        <p className="mb-2">{employeeToView.position || "-"}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Salario Mensual:</strong></Label>
                        <p className="mb-2">{formatCurrency(employeeToView.salary)}</p>
                      </FormGroup>
                    </Col>
                    <Col md="4">
                      <FormGroup>
                        <Label><strong>Departamento:</strong></Label>
                        <p className="mb-2">{getDepartmentName(employeeToView.departmentId)}</p>
                      </FormGroup>
                    </Col>
                    <Col md="4">
                      <FormGroup>
                        <Label><strong>Centro de Costo:</strong></Label>
                        <p className="mb-2">{getCostCenterName(employeeToView.costCenterId)}</p>
                      </FormGroup>
                    </Col>
                    <Col md="4">
                      <FormGroup>
                        <Label><strong>Unidad Operativa:</strong></Label>
                        <p className="mb-2">{getOperationalUnitName(employeeToView.operationalUnitId)}</p>
                      </FormGroup>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* Información de Planilla */}
              <Card className="mb-3">
                <CardHeader className="bg-success text-white">
                  <CardTitle tag="h5" className="mb-0">
                    <i className="nc-icon nc-money-coins mr-2" />
                    Información de Planilla
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Row>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Quincena Bruta:</strong></Label>
                        <p className="mb-2">{formatCurrency(employeeToView.quincenaBruta)}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Deducción IGSS:</strong></Label>
                        <p className="mb-2 text-danger">{formatCurrency(employeeToView.igssDeduction)}</p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Quincena Neta:</strong></Label>
                        <p className="mb-2 text-success"><strong>{formatCurrency(employeeToView.quincenaNeta)}</strong></p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Método de Pago:</strong></Label>
                        <p className="mb-2">
                          <Badge color={employeeToView.paymentMethod === "TRANSFERENCIA BANCARIA" ? "success" : "info"}>
                            {employeeToView.paymentMethod || "-"}
                          </Badge>
                        </p>
                      </FormGroup>
                    </Col>
                    <Col md="12">
                      <FormGroup>
                        <Label><strong>Número de Cuenta Bancaria:</strong></Label>
                        <p className="mb-2">{employeeToView.bankAccount || "-"}</p>
                      </FormGroup>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

              {/* Información del Sistema */}
              <Card className="mb-3">
                <CardHeader className="bg-secondary text-white">
                  <CardTitle tag="h5" className="mb-0">
                    <i className="nc-icon nc-settings-gear-65 mr-2" />
                    Información del Sistema
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Row>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Usuario Asociado:</strong></Label>
                        <p className="mb-2">
                          {employeeToView.user ? (
                            <Badge color="primary">{employeeToView.user.username}</Badge>
                          ) : (
                            <Badge color="secondary">No asociado</Badge>
                          )}
                        </p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Fecha de Creación:</strong></Label>
                        <p className="mb-2">
                          {employeeToView.createdAt 
                            ? formatDateTimeGt(employeeToView.createdAt)
                            : "-"}
                        </p>
                      </FormGroup>
                    </Col>
                    <Col md="6">
                      <FormGroup>
                        <Label><strong>Última Actualización:</strong></Label>
                        <p className="mb-2">
                          {employeeToView.updatedAt 
                            ? formatDateTimeGt(employeeToView.updatedAt)
                            : "-"}
                        </p>
                      </FormGroup>
                    </Col>
                  </Row>
                </CardBody>
              </Card>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setViewDetailsModal(false)}>
            Cerrar
          </Button>
          {employeeToView && (
            <Button 
              color="primary" 
              onClick={() => {
                setViewDetailsModal(false);
                handleEdit(employeeToView.id);
              }}
            >
              <i className="nc-icon nc-ruler-pencil mr-1" />
              Editar Empleado
            </Button>
          )}
        </ModalFooter>
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <Modal isOpen={deleteModal} toggle={() => setDeleteModal(false)}>
        <ModalHeader toggle={() => setDeleteModal(false)}>
          Confirmar Eliminación
        </ModalHeader>
        <ModalBody>
          ¿Está seguro de eliminar al empleado{" "}
          {employeeToDelete
            ? `${employeeToDelete.firstName} ${employeeToDelete.lastName}`
            : ""}
          ? Esta acción no se puede deshacer.
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setDeleteModal(false)} disabled={deleting}>
            Cancelar
          </Button>
          <Button color="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de creación masiva */}
      <Modal isOpen={bulkCreateModal} toggle={() => setBulkCreateModal(false)} size="xl">
        <ModalHeader toggle={() => setBulkCreateModal(false)}>
          Crear Múltiples Empleados
        </ModalHeader>
        <ModalBody style={{ maxHeight: "70vh", overflowY: "auto" }}>
          {bulkErrors.general && <Alert color="danger">{bulkErrors.general}</Alert>}
          
          {bulkResults && (
            <Alert color={bulkResults.errors.length === 0 ? "success" : "warning"}>
              <strong>Resultados:</strong>
              <br />
              ✓ Empleados creados: {bulkResults.success.length}
              {bulkResults.errors.length > 0 && (
                <>
                  <br />
                  ✗ Errores: {bulkResults.errors.length}
                  <ul className="mt-2 mb-0">
                    {bulkResults.errors.map((err, idx) => (
                      <li key={idx}>
                        {err.employeeData.firstName || err.employeeData.email}: {err.error}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Alert>
          )}

          <Row className="mb-3">
            <Col md="6">
              <FormGroup className={bulkErrors.departmentId ? "has-danger" : ""}>
                <Label>Departamento (Común para todos) *</Label>
                <Input
                  type="select"
                  value={bulkDepartmentId}
                  onChange={(e) => setBulkDepartmentId(e.target.value)}
                  disabled={bulkCreating}
                >
                  <option value="">Seleccione</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name || dept.code}
                    </option>
                  ))}
                </Input>
                {bulkErrors.departmentId && (
                  <label className="error">{bulkErrors.departmentId}</label>
                )}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Estado</Label>
                <Input
                  type="select"
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  disabled={bulkCreating}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>

          <hr />
          
          {/* Área para pegar desde Excel */}
          <Alert color="info" className="mb-3">
            <strong>💡 Pegar desde Excel:</strong>
            <br />
            Copia las columnas desde Excel y pégalas aquí. Formato esperado:
            <br />
            <code>Nombre | Apellido | Email | Teléfono | DPI | Fecha Contratación (DD/MM/YYYY)</code>
            <br />
            <small className="text-muted">Puedes pegar directamente en la tabla o usar el área de texto de abajo</small>
          </Alert>
          
          <FormGroup>
            <Label>Pegar datos desde Excel (opcional)</Label>
            <Input
              type="textarea"
              rows="5"
              placeholder="Pega aquí los datos desde Excel (una fila por línea, columnas separadas por tabulaciones)"
              onPaste={handlePasteFromExcel}
              disabled={bulkCreating}
              style={{ fontFamily: 'monospace', fontSize: '12px' }}
            />
            <small className="text-muted">
              Formato: Nombre [TAB] Apellido [TAB] Email [TAB] Teléfono [TAB] DPI [TAB] Fecha (DD/MM/YYYY)
            </small>
          </FormGroup>

          <div className="d-flex justify-content-between align-items-center mb-3">
            <Label className="mb-0"><strong>Empleados a Crear ({bulkEmployees.length}):</strong></Label>
            <Button
              color="primary"
              size="sm"
              onClick={handleAddEmployeeRow}
              disabled={bulkCreating}
              className="btn-round"
            >
              <i className="nc-icon nc-simple-add" /> Agregar Fila
            </Button>
          </div>

          <Table responsive size="sm">
            <thead>
              <tr>
                <th>Nombre *</th>
                <th>Apellido *</th>
                <th>Email *</th>
                <th>Teléfono</th>
                <th>DPI *</th>
                <th>Fecha Contratación *</th>
                <th>Centro de Costo</th>
                <th>Unidad Operativa</th>
                <th width="80">Acción</th>
              </tr>
            </thead>
            <tbody>
              {bulkEmployees.map((employee, index) => (
                <tr key={index}>
                  <td>
                    <Input
                      type="text"
                      value={employee.firstName}
                      onChange={(e) => handleBulkEmployeeChange(index, "firstName", e.target.value)}
                      placeholder="Nombre"
                      disabled={bulkCreating}
                      className={bulkErrors[`employee_${index}_firstName`] ? "is-invalid" : ""}
                    />
                    {bulkErrors[`employee_${index}_firstName`] && (
                      <small className="text-danger d-block">{bulkErrors[`employee_${index}_firstName`]}</small>
                    )}
                  </td>
                  <td>
                    <Input
                      type="text"
                      value={employee.lastName}
                      onChange={(e) => handleBulkEmployeeChange(index, "lastName", e.target.value)}
                      placeholder="Apellido"
                      disabled={bulkCreating}
                      className={bulkErrors[`employee_${index}_lastName`] ? "is-invalid" : ""}
                    />
                    {bulkErrors[`employee_${index}_lastName`] && (
                      <small className="text-danger d-block">{bulkErrors[`employee_${index}_lastName`]}</small>
                    )}
                  </td>
                  <td>
                    <Input
                      type="email"
                      value={employee.email}
                      onChange={(e) => handleBulkEmployeeChange(index, "email", e.target.value)}
                      placeholder="email@ejemplo.com"
                      disabled={bulkCreating}
                      className={bulkErrors[`employee_${index}_email`] ? "is-invalid" : ""}
                    />
                    {bulkErrors[`employee_${index}_email`] && (
                      <small className="text-danger d-block">{bulkErrors[`employee_${index}_email`]}</small>
                    )}
                  </td>
                  <td>
                    <Input
                      type="text"
                      value={employee.phone}
                      onChange={(e) => handleBulkEmployeeChange(index, "phone", e.target.value)}
                      placeholder="Teléfono"
                      disabled={bulkCreating}
                    />
                  </td>
                  <td>
                    <Input
                      type="text"
                      value={employee.dpi}
                      onChange={(e) => handleBulkEmployeeChange(index, "dpi", e.target.value)}
                      placeholder="DPI"
                      disabled={bulkCreating}
                      maxLength={20}
                      className={bulkErrors[`employee_${index}_dpi`] ? "is-invalid" : ""}
                    />
                    {bulkErrors[`employee_${index}_dpi`] && (
                      <small className="text-danger d-block">{bulkErrors[`employee_${index}_dpi`]}</small>
                    )}
                  </td>
                  <td>
                    <Input
                      type="date"
                      value={employee.hireDate}
                      onChange={(e) => handleBulkEmployeeChange(index, "hireDate", e.target.value)}
                      disabled={bulkCreating}
                      className={bulkErrors[`employee_${index}_hireDate`] ? "is-invalid" : ""}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text');
                        const parsedDate = parseDateFromExcel(pasted);
                        handleBulkEmployeeChange(index, "hireDate", parsedDate);
                      }}
                    />
                    {bulkErrors[`employee_${index}_hireDate`] && (
                      <small className="text-danger d-block">{bulkErrors[`employee_${index}_hireDate`]}</small>
                    )}
                  </td>
                  <td>
                    <Input
                      type="select"
                      value={employee.costCenterId}
                      onChange={(e) => handleBulkEmployeeChange(index, "costCenterId", e.target.value)}
                      disabled={bulkCreating}
                    >
                      <option value="">Seleccione...</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name || cc.code}
                        </option>
                      ))}
                    </Input>
                  </td>
                  <td>
                    <Input
                      type="select"
                      value={employee.operationalUnitId}
                      onChange={(e) => handleBulkEmployeeChange(index, "operationalUnitId", e.target.value)}
                      disabled={bulkCreating}
                    >
                      <option value="">Seleccione...</option>
                      {operationalUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.name || unit.code}
                        </option>
                      ))}
                    </Input>
                  </td>
                  <td>
                    {bulkEmployees.length > 1 && (
                      <Button
                        color="danger"
                        size="sm"
                        onClick={() => handleRemoveEmployeeRow(index)}
                        disabled={bulkCreating}
                        className="btn-round"
                      >
                        <i className="nc-icon nc-simple-remove" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setBulkCreateModal(false)} disabled={bulkCreating}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleBulkSubmit} disabled={bulkCreating}>
            {bulkCreating ? "Creando..." : `Crear ${bulkEmployees.length} Empleado(s)`}
          </Button>
        </ModalFooter>
      </Modal>

      <EmployeesForm
        employeeId={selectedEmployeeId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedEmployeeId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

export default EmployeesList;

