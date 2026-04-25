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
  Nav,
  NavItem,
  NavLink,
  TabContent,
  TabPane,
  Card,
  CardBody,
  Badge,
} from "reactstrap";
import { getPrintFormatById, createPrintFormat, updatePrintFormat } from "services/printFormatService";
import { showSuccess, showError } from "utils/notificationHelper";
import classnames from "classnames";
import PrintFormatBuilder from "components/PrintFormatBuilder/PrintFormatBuilder";
import { uploadPDF, uploadDOCX, downloadFile } from "services/uploadService";

function PrintFormatsForm({ formatId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    documentType: "",
    formatName: "",
    templatePath: "",
    paperSize: "A4",
    margins: "",
    header: "",
    footer: "",
    body: "",
    logoPath: "",
    isDefault: false,
    description: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("1");
  const [useBuilder, setUseBuilder] = useState({ header: false, body: false, footer: false });
  const [uploadingPDF, setUploadingPDF] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");

  const documentTypes = [
    "INVOICE",
    "PURCHASE_ORDER",
    "PRODUCTION_ORDER",
    "QUOTE",
    "DELIVERY_NOTE",
    "CREDIT_NOTE",
    "DEBIT_NOTE",
    "EMPLOYEE",
    "PAYROLL",
    "VOUCHER"
  ];

  const paperSizes = ["A4", "LETTER", "LEGAL", "A3", "A5"];

  const getAvailableVariables = (documentType) => {
    const commonVars = [
      { name: "{{documentNumber}}", description: "Número de documento" },
      { name: "{{date}}", description: "Fecha del documento" },
      { name: "{{companyName}}", description: "Nombre de la empresa" },
      { name: "{{companyAddress}}", description: "Dirección de la empresa" },
      { name: "{{companyPhone}}", description: "Teléfono de la empresa" },
      { name: "{{companyEmail}}", description: "Email de la empresa" },
      { name: "{{logo}}", description: "Logo de la empresa" },
    ];

    const typeSpecificVars = {
      INVOICE: [
        { name: "{{customerName}}", description: "Nombre del cliente" },
        { name: "{{customerAddress}}", description: "Dirección del cliente" },
        { name: "{{items}}", description: "Lista de items (array)" },
        { name: "{{subtotal}}", description: "Subtotal" },
        { name: "{{tax}}", description: "Impuesto" },
        { name: "{{total}}", description: "Total" },
      ],
      PURCHASE_ORDER: [
        { name: "{{supplierName}}", description: "Nombre del proveedor" },
        { name: "{{supplierAddress}}", description: "Dirección del proveedor" },
        { name: "{{items}}", description: "Lista de items (array)" },
        { name: "{{subtotal}}", description: "Subtotal" },
        { name: "{{total}}", description: "Total" },
      ],
      EMPLOYEE: [
        { name: "{{employeeId}}", description: "ID del empleado" },
        { name: "{{firstName}}", description: "Nombre" },
        { name: "{{lastName}}", description: "Apellido" },
        { name: "{{fullName}}", description: "Nombre completo" },
        { name: "{{email}}", description: "Email" },
        { name: "{{phone}}", description: "Teléfono" },
        { name: "{{dpi}}", description: "DPI" },
        { name: "{{position}}", description: "Puesto" },
        { name: "{{salary}}", description: "Salario" },
        { name: "{{department}}", description: "Departamento" },
        { name: "{{hireDate}}", description: "Fecha de contratación" },
        { name: "{{status}}", description: "Estado" },
      ],
      PAYROLL: [
        { name: "{{employeeId}}", description: "ID del empleado" },
        { name: "{{fullName}}", description: "Nombre completo" },
        { name: "{{period}}", description: "Período de pago" },
        { name: "{{quincenaBruta}}", description: "Quincena bruta" },
        { name: "{{igssDeduction}}", description: "Deducción IGSS" },
        { name: "{{quincenaNeta}}", description: "Quincena neta" },
        { name: "{{paymentMethod}}", description: "Método de pago" },
        { name: "{{bankAccount}}", description: "Cuenta bancaria" },
      ],
      VOUCHER: [
        { name: "{{voucherNumber}}", description: "Número de voucher" },
        { name: "{{beneficiaryName}}", description: "Nombre del beneficiario" },
        { name: "{{amount}}", description: "Monto" },
        { name: "{{concept}}", description: "Concepto" },
        { name: "{{paymentDate}}", description: "Fecha de pago" },
        { name: "{{paymentMethod}}", description: "Método de pago" },
        { name: "{{authorizedBy}}", description: "Autorizado por" },
        { name: "{{account}}", description: "Cuenta contable" },
      ],
    };

    return [...commonVars, ...(typeSpecificVars[documentType] || [])];
  };

  const insertVariable = (variable, field) => {
    const textarea = document.querySelector(`textarea[name="${field}"]`);
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = formData[field] || "";
      const newText = text.substring(0, start) + variable + text.substring(end);
      setFormData({ ...formData, [field]: newText });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (formatId) {
        loadFormat();
      } else {
        resetForm();
      }
    }
  }, [isOpen, formatId]);

  const loadFormat = async () => {
    try {
      setLoading(true);
      const format = await getPrintFormatById(formatId);
      setFormData({
        documentType: format.documentType || "",
        formatName: format.formatName || "",
        templatePath: format.templatePath || "",
        paperSize: format.paperSize || "A4",
        margins: format.margins || "",
        header: format.header || "",
        footer: format.footer || "",
        body: format.body || "",
        logoPath: format.logoPath || "",
        isDefault: format.isDefault || false,
        description: format.description || "",
      });
      setPdfUrl(format.templatePath || "");
    } catch (err) {
      setError(err.message || "Error al cargar el formato de impresión");
      showError(err.message || "Error al cargar el formato de impresión");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      documentType: "",
      formatName: "",
      templatePath: "",
      paperSize: "A4",
      margins: "",
      header: "",
      footer: "",
      body: "",
      logoPath: "",
      isDefault: false,
      description: "",
    });
    setErrors({});
    setError("");
    setActiveTab("1");
    setPdfUrl("");
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.documentType.trim()) newErrors.documentType = "El tipo de documento es requerido";
    if (!formData.formatName.trim()) newErrors.formatName = "El nombre del formato es requerido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showError("Por favor, corrige los errores en el formulario.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const submitData = {
        documentType: formData.documentType.trim(),
        formatName: formData.formatName.trim(),
        templatePath: formData.templatePath.trim() || null,
        paperSize: formData.paperSize || null,
        margins: formData.margins.trim() || null,
        header: formData.header.trim() || null,
        footer: formData.footer.trim() || null,
        body: formData.body.trim() || null,
        logoPath: formData.logoPath.trim() || null,
        isDefault: formData.isDefault,
        description: formData.description.trim() || null,
      };
      if (formatId) {
        await updatePrintFormat(formatId, submitData);
        showSuccess("Formato de impresión actualizado correctamente");
      } else {
        await createPrintFormat(submitData);
        showSuccess("Formato de impresión creado correctamente");
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el formato de impresión");
      showError(err.message || "Error al guardar el formato de impresión");
    } finally {
      setLoading(false);
    }
  };

  const renderPreview = () => {
    const previewHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .footer { border-top: 2px solid #333; padding-top: 10px; margin-top: 20px; }
          .body-content { min-height: 200px; }
        </style>
      </head>
      <body>
        ${formData.header ? `<div class="header">${formData.header}</div>` : ''}
        ${formData.body ? `<div class="body-content">${formData.body}</div>` : '<div class="body-content"><p>Contenido del cuerpo del documento...</p></div>'}
        ${formData.footer ? `<div class="footer">${formData.footer}</div>` : ''}
      </body>
      </html>
    `;
    return previewHTML;
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl" style={{ maxWidth: "98vw", width: "98vw" }}>
      <ModalHeader toggle={toggle}>
        {formatId ? "Editar Formato de Impresión" : "Nuevo Formato de Impresión"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody style={{ maxHeight: "85vh", overflowY: "auto", padding: "15px" }}>
          {error && <Alert color="danger">{error}</Alert>}
          
          {/* Información Básica */}
          <Card className="mb-3">
            <CardBody>
              <h5 className="mb-3">Información Básica</h5>
              <Row>
                <Col md="6">
                  <FormGroup>
                    <Label>Tipo de Documento *</Label>
                    <Input
                      type="select"
                      value={formData.documentType}
                      onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                      invalid={!!errors.documentType}
                    >
                      <option value="">Seleccione tipo</option>
                      {documentTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </Input>
                    {errors.documentType && <div className="text-danger small">{errors.documentType}</div>}
                  </FormGroup>
                </Col>
                <Col md="6">
                  <FormGroup>
                    <Label>Nombre del Formato *</Label>
                    <Input
                      type="text"
                      value={formData.formatName}
                      onChange={(e) => setFormData({ ...formData, formatName: e.target.value })}
                      invalid={!!errors.formatName}
                      placeholder="Ej: Formato Estándar"
                    />
                    {errors.formatName && <div className="text-danger small">{errors.formatName}</div>}
                  </FormGroup>
                </Col>
              </Row>
              <Row>
                <Col md="12">
                  <FormGroup>
                    <Label>Ruta del Archivo en AWS S3</Label>
                    <Input
                      type="text"
                      value={formData.templatePath}
                      onChange={(e) => setFormData({ ...formData, templatePath: e.target.value })}
                      placeholder="https://bucket.s3.region.amazonaws.com/uploads/pdfs/archivo.pdf"
                    />
                    <small className="form-text text-muted">
                      URL completa del archivo PDF o Word en AWS S3 (o use el botón de subir archivo arriba)
                    </small>
                  </FormGroup>
                </Col>
              </Row>
              <Row>
                <Col md="12">
                  <FormGroup>
                    <Label>Descripción</Label>
                    <Input
                      type="textarea"
                      rows="2"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Descripción del formato..."
                    />
                  </FormGroup>
                </Col>
              </Row>
            </CardBody>
          </Card>

          {/* Gestión de Archivos del Formato */}
          <Card className="mt-3">
            <CardBody>
              <h5 className="mb-3">Archivo del Formato (PDF o Word)</h5>
              <Alert color="info" className="mb-3">
                <small>
                  Suba el archivo PDF o Word (.docx) del formato de impresión. El sistema guardará el archivo en S3 y lo utilizará para generar los documentos.
                </small>
              </Alert>
              
              <Row>
                <Col md="12">
                  <FormGroup>
                    <Label>Subir Archivo del Formato</Label>
                    <Input
                      type="file"
                      accept=".pdf,application/pdf,.docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;

                        const isPDF = file.type === "application/pdf" || file.name.toLowerCase().endsWith('.pdf');
                        const isDOCX = file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                    || file.type === "application/msword"
                                    || file.name.toLowerCase().endsWith('.docx')
                                    || file.name.toLowerCase().endsWith('.doc');

                        if (!isPDF && !isDOCX) {
                          showError("El archivo debe ser un PDF o un documento Word (.docx o .doc)");
                          return;
                        }

                        try {
                          setUploadingPDF(true);
                          setError("");
                          const result = isPDF ? await uploadPDF(file) : await uploadDOCX(file);
                          setPdfUrl(result.url);
                          setFormData({ ...formData, templatePath: result.url });
                          showSuccess(isPDF ? "PDF subido correctamente" : "Documento Word subido correctamente");
                        } catch (err) {
                          setError(err.message || "Error al subir el archivo");
                          showError(err.message || "Error al subir el archivo");
                        } finally {
                          setUploadingPDF(false);
                        }
                      }}
                      disabled={uploadingPDF}
                    />
                    <small className="form-text text-muted">
                      Seleccione un archivo PDF o Word (.docx) que contenga el formato de impresión
                    </small>
                    {uploadingPDF && (
                      <div className="text-info small mt-2">
                        <i className="nc-icon nc-spin nc-refresh-69 mr-1" />
                        Subiendo archivo...
                      </div>
                    )}
                  </FormGroup>
                </Col>
              </Row>

              {pdfUrl && (
                <Row className="mt-3">
                  <Col md="12">
                    <Alert color="success">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>Archivo cargado:</strong> {pdfUrl.split('/').pop() || pdfUrl}
                        </div>
                        <div>
                          <Button
                            color="info"
                            size="sm"
                            className="mr-2"
                            onClick={async () => {
                              try {
                                const blob = await downloadFile(pdfUrl);
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                const fileName = pdfUrl.split('/').pop() || 'formato.pdf';
                                a.download = fileName;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (err) {
                                showError(err.message || "Error al descargar el archivo");
                              }
                            }}
                          >
                            <i className="nc-icon nc-cloud-download-93 mr-1" />
                            Descargar
                          </Button>
                          <Button
                            color="primary"
                            size="sm"
                            onClick={() => {
                              window.open(pdfUrl, '_blank');
                            }}
                          >
                            <i className="nc-icon nc-zoom-split mr-1" />
                            Ver Archivo
                          </Button>
                          <Button
                            color="danger"
                            size="sm"
                            className="ml-2"
                            onClick={() => {
                              if (window.confirm("¿Desea eliminar el archivo cargado?")) {
                                setPdfUrl("");
                                setFormData({ ...formData, templatePath: "" });
                                showSuccess("Archivo eliminado");
                              }
                            }}
                          >
                            <i className="nc-icon nc-simple-remove mr-1" />
                            Eliminar
                          </Button>
                        </div>
                      </div>
                    </Alert>
                  </Col>
                </Row>
              )}

              {formData.templatePath && !pdfUrl && (
                <Row className="mt-3">
                  <Col md="12">
                    <Alert color="warning">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <strong>Archivo existente:</strong> {formData.templatePath}
                        </div>
                        <div>
                          <Button
                            color="info"
                            size="sm"
                            className="mr-2"
                            onClick={async () => {
                              try {
                                const blob = await downloadFile(formData.templatePath);
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                const fileName = formData.templatePath.split('/').pop() || 'formato.pdf';
                                a.download = fileName;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (err) {
                                showError(err.message || "Error al descargar el archivo");
                              }
                            }}
                          >
                            <i className="nc-icon nc-cloud-download-93 mr-1" />
                            Descargar
                          </Button>
                          <Button
                            color="primary"
                            size="sm"
                            onClick={() => {
                              window.open(formData.templatePath, '_blank');
                            }}
                          >
                            <i className="nc-icon nc-zoom-split mr-1" />
                            Ver Archivo
                          </Button>
                        </div>
                      </div>
                    </Alert>
                  </Col>
                </Row>
              )}
            </CardBody>
          </Card>

          {/* Tabs para Template HTML - OCULTAS TEMPORALMENTE */}
          {false && (
            <>
              <Nav tabs>
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === "1" })}
                    onClick={() => setActiveTab("1")}
                  >
                    <i className="nc-icon nc-settings-gear-65 mr-1" />
                    Encabezado
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === "2" })}
                    onClick={() => setActiveTab("2")}
                  >
                    <i className="nc-icon nc-paper mr-1" />
                    Cuerpo
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === "3" })}
                    onClick={() => setActiveTab("3")}
                  >
                    <i className="nc-icon nc-align-center mr-1" />
                    Pie de Página
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === "4" })}
                    onClick={() => setActiveTab("4")}
                  >
                    <i className="nc-icon nc-zoom-split mr-1" />
                    Vista Previa
                  </NavLink>
                </NavItem>
              </Nav>

              <TabContent activeTab={activeTab}>
            <TabPane tabId="1">
              <Card className="mt-3">
                <CardBody>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <Label className="mb-0"><strong>Encabezado (HTML)</strong></Label>
                    <div>
                      {formData.documentType && (
                        <Badge color="info" className="mr-2">
                          {getAvailableVariables(formData.documentType).length} variables disponibles
                        </Badge>
                      )}
                      <Button
                        color={useBuilder.header ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => setUseBuilder({ ...useBuilder, header: !useBuilder.header })}
                      >
                        <i className={`nc-icon nc-${useBuilder.header ? "ruler-pencil" : "layout-11"} mr-1`} />
                        {useBuilder.header ? "Editor HTML" : "Constructor Visual"}
                      </Button>
                    </div>
                  </div>
                  {useBuilder.header ? (
                    <PrintFormatBuilder
                      value={formData.header}
                      onChange={(html) => setFormData({ ...formData, header: html })}
                      availableVariables={formData.documentType ? getAvailableVariables(formData.documentType) : []}
                    />
                  ) : (
                    <>
                      {formData.documentType && (
                        <Alert color="info" className="mb-2">
                          <small>
                            <strong>Variables disponibles:</strong>{" "}
                            {getAvailableVariables(formData.documentType).map((v, idx) => (
                              <span key={idx}>
                                <code style={{ cursor: "pointer" }} onClick={() => insertVariable(v.name, "header")} title={v.description}>
                                  {v.name}
                                </code>
                                {idx < getAvailableVariables(formData.documentType).length - 1 && ", "}
                              </span>
                            ))}
                          </small>
                        </Alert>
                      )}
                      <Input
                        type="textarea"
                        name="header"
                        rows="8"
                        value={formData.header}
                        onChange={(e) => setFormData({ ...formData, header: e.target.value })}
                        placeholder='<div class="header"><h1>{{companyName}}</h1><p>{{companyAddress}}</p></div>'
                        style={{ fontFamily: "monospace", fontSize: "13px" }}
                      />
                      <small className="form-text text-muted">
                        HTML del encabezado. Usa variables dinámicas con dobles llaves: {"{{variableName}}"}
                      </small>
                    </>
                  )}
                </CardBody>
              </Card>
            </TabPane>

            <TabPane tabId="2">
              <Card className="mt-3">
                <CardBody>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <Label className="mb-0"><strong>Cuerpo del Documento (HTML)</strong></Label>
                    <div>
                      {formData.documentType && (
                        <Badge color="info" className="mr-2">
                          {getAvailableVariables(formData.documentType).length} variables disponibles
                        </Badge>
                      )}
                      <Button
                        color={useBuilder.body ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => setUseBuilder({ ...useBuilder, body: !useBuilder.body })}
                      >
                        <i className={`nc-icon nc-${useBuilder.body ? "ruler-pencil" : "layout-11"} mr-1`} />
                        {useBuilder.body ? "Editor HTML" : "Constructor Visual"}
                      </Button>
                    </div>
                  </div>
                  {useBuilder.body ? (
                    <PrintFormatBuilder
                      value={formData.body}
                      onChange={(html) => setFormData({ ...formData, body: html })}
                      availableVariables={formData.documentType ? getAvailableVariables(formData.documentType) : []}
                    />
                  ) : (
                    <>
                      {formData.documentType && (
                        <Alert color="info" className="mb-2">
                          <small>
                            <strong>Variables disponibles:</strong>{" "}
                            {getAvailableVariables(formData.documentType).map((v, idx) => (
                              <span key={idx}>
                                <code style={{ cursor: "pointer" }} onClick={() => insertVariable(v.name, "body")} title={v.description}>
                                  {v.name}
                                </code>
                                {idx < getAvailableVariables(formData.documentType).length - 1 && ", "}
                              </span>
                            ))}
                          </small>
                        </Alert>
                      )}
                      <Input
                        type="textarea"
                        name="body"
                        rows="12"
                        value={formData.body}
                        onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                        placeholder='<div class="content"><h2>{{documentNumber}}</h2><p>Fecha: {{date}}</p><p>Cliente: {{customerName}}</p></div>'
                        style={{ fontFamily: "monospace", fontSize: "13px" }}
                      />
                      <small className="form-text text-muted">
                        HTML del cuerpo principal del documento. Usa variables dinámicas con dobles llaves: {"{{variableName}}"}
                      </small>
                    </>
                  )}
                </CardBody>
              </Card>
            </TabPane>

            <TabPane tabId="3">
              <Card className="mt-3">
                <CardBody>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <Label className="mb-0"><strong>Pie de Página (HTML)</strong></Label>
                    <div>
                      {formData.documentType && (
                        <Badge color="info" className="mr-2">
                          {getAvailableVariables(formData.documentType).length} variables disponibles
                        </Badge>
                      )}
                      <Button
                        color={useBuilder.footer ? "secondary" : "primary"}
                        size="sm"
                        onClick={() => setUseBuilder({ ...useBuilder, footer: !useBuilder.footer })}
                      >
                        <i className={`nc-icon nc-${useBuilder.footer ? "ruler-pencil" : "layout-11"} mr-1`} />
                        {useBuilder.footer ? "Editor HTML" : "Constructor Visual"}
                      </Button>
                    </div>
                  </div>
                  {useBuilder.footer ? (
                    <PrintFormatBuilder
                      value={formData.footer}
                      onChange={(html) => setFormData({ ...formData, footer: html })}
                      availableVariables={formData.documentType ? getAvailableVariables(formData.documentType) : []}
                    />
                  ) : (
                    <>
                      {formData.documentType && (
                        <Alert color="info" className="mb-2">
                          <small>
                            <strong>Variables disponibles:</strong>{" "}
                            {getAvailableVariables(formData.documentType).map((v, idx) => (
                              <span key={idx}>
                                <code style={{ cursor: "pointer" }} onClick={() => insertVariable(v.name, "footer")} title={v.description}>
                                  {v.name}
                                </code>
                                {idx < getAvailableVariables(formData.documentType).length - 1 && ", "}
                              </span>
                            ))}
                          </small>
                        </Alert>
                      )}
                      <Input
                        type="textarea"
                        name="footer"
                        rows="8"
                        value={formData.footer}
                        onChange={(e) => setFormData({ ...formData, footer: e.target.value })}
                        placeholder='<div class="footer"><p>{{companyName}} - {{companyPhone}}</p></div>'
                        style={{ fontFamily: "monospace", fontSize: "13px" }}
                      />
                      <small className="form-text text-muted">
                        HTML del pie de página. Usa variables dinámicas con dobles llaves: {"{{variableName}}"}
                      </small>
                    </>
                  )}
                </CardBody>
              </Card>
            </TabPane>

            <TabPane tabId="4">
              <Card className="mt-3">
                <CardBody>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <Label className="mb-0"><strong>Vista Previa del Formato</strong></Label>
                    <Button
                      color="secondary"
                      size="sm"
                      onClick={() => {
                        const previewWindow = window.open("", "_blank");
                        previewWindow.document.write(renderPreview());
                        previewWindow.document.close();
                      }}
                    >
                      <i className="nc-icon nc-paper mr-1" />
                      Abrir en Nueva Ventana
                    </Button>
                  </div>
                  <div
                    style={{
                      border: "1px solid #ddd",
                      padding: "20px",
                      backgroundColor: "#fff",
                      minHeight: "400px",
                      maxHeight: "600px",
                      overflow: "auto",
                    }}
                    dangerouslySetInnerHTML={{
                      __html: `
                        <div class="header" style="border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">
                          ${formData.header || '<p style="color: #999;">Contenido del encabezado...</p>'}
                        </div>
                        <div class="body-content" style="min-height: 200px;">
                          ${formData.body || '<p style="color: #999;">Contenido del cuerpo del documento...</p>'}
                        </div>
                        <div class="footer" style="border-top: 2px solid #333; padding-top: 10px; margin-top: 20px;">
                          ${formData.footer || '<p style="color: #999;">Contenido del pie de página...</p>'}
                        </div>
                      `,
                    }}
                  />
                  <small className="form-text text-muted mt-2">
                    Vista previa aproximada. Las variables no se reemplazarán en esta vista.
                  </small>
                </CardBody>
              </Card>
            </TabPane>
              </TabContent>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : formatId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default PrintFormatsForm;

