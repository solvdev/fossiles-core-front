import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Alert,
  Badge,
  FormGroup,
  Label,
  Input,
} from "reactstrap";
import { getPrintFormats, deletePrintFormat } from "services/printFormatService";
import PrintFormatsForm from "./PrintFormatsForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";
import { downloadFile } from "services/uploadService";

function PrintFormats() {
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [formatToDelete, setFormatToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    loadFormats();
  }, []);

  const loadFormats = async () => {
    try {
      setLoading(true);
      const data = await getPrintFormats();
      setFormats(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar los formatos de impresión");
      showError(err.message || "Error al cargar los formatos de impresión");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedFormatId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedFormatId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadFormats();
    setShowForm(false);
    setSelectedFormatId(null);
  };

  const handleDeleteClick = (format) => {
    setFormatToDelete(format);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!formatToDelete) return;

    try {
      await deletePrintFormat(formatToDelete.id);
      showSuccess("Formato de impresión eliminado correctamente");
      loadFormats();
    } catch (err) {
      showError(err.message || "Error al eliminar el formato de impresión");
    } finally {
      setFormatToDelete(null);
      setShowDeleteModal(false);
    }
  };

  const handleDownloadTemplate = async (format) => {
    if (!format.templatePath) {
      showError("No hay plantilla disponible para este formato");
      return;
    }

    try {
      // Si es una URL pública de S3, intentar descargar directamente
      if (format.templatePath.startsWith('https://') || format.templatePath.startsWith('http://')) {
        try {
          const blob = await downloadFile(format.templatePath);
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          const fileName = format.templatePath.split('/').pop() || `formato-${format.formatName}.pdf`;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          showSuccess("Plantilla descargada correctamente");
        } catch (fetchError) {
          // Si falla el fetch, intentar descargar directamente desde la URL
          const a = document.createElement('a');
          a.href = format.templatePath;
          a.download = format.templatePath.split('/').pop() || `formato-${format.formatName}.pdf`;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          showSuccess("Descarga iniciada");
        }
      } else {
        const blob = await downloadFile(format.templatePath);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = format.templatePath.split('/').pop() || `formato-${format.formatName}.pdf`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showSuccess("Plantilla descargada correctamente");
      }
    } catch (err) {
      showError(err.message || "Error al descargar la plantilla");
    }
  };

  const handlePrintTemplate = async (format) => {
    if (!format.templatePath) {
      showError("No hay plantilla disponible para este formato");
      return;
    }

    try {
      // Si es una URL pública de S3, abrir directamente
      if (format.templatePath.startsWith('https://') || format.templatePath.startsWith('http://')) {
        try {
          const blob = await downloadFile(format.templatePath);
          const url = window.URL.createObjectURL(blob);
          const printWindow = window.open(url, '_blank');
          
          if (printWindow) {
            printWindow.onload = () => {
              setTimeout(() => {
                printWindow.print();
                window.URL.revokeObjectURL(url);
              }, 250);
            };
          } else {
            window.URL.revokeObjectURL(url);
            showError("Por favor, permite las ventanas emergentes para imprimir");
          }
        } catch (fetchError) {
          // Si falla el fetch, abrir directamente la URL
          const printWindow = window.open(format.templatePath, '_blank');
          if (printWindow) {
            printWindow.onload = () => {
              setTimeout(() => {
                printWindow.print();
              }, 500);
            };
          } else {
            showError("Por favor, permite las ventanas emergentes para imprimir");
          }
        }
      } else {
        const blob = await downloadFile(format.templatePath);
        const url = window.URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        
        if (printWindow) {
          printWindow.onload = () => {
            setTimeout(() => {
              printWindow.print();
              window.URL.revokeObjectURL(url);
            }, 250);
          };
        } else {
          window.URL.revokeObjectURL(url);
          showError("Por favor, permite las ventanas emergentes para imprimir");
        }
      }
    } catch (err) {
      showError(err.message || "Error al imprimir la plantilla");
    }
  };

  const filteredFormats = formats.filter((format) => {
    const matchesSearch = !searchTerm || 
      format.documentType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      format.formatName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || format.documentType === filterType;
    return matchesSearch && matchesType;
  });

  const documentTypes = [...new Set(formats.map(f => f.documentType))];

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="4">
                  <CardTitle tag="h4">Formatos de Impresión (PDF)</CardTitle>
                  <p className="text-muted small mb-0">
                    Gestiona los formatos de impresión para documentos PDF
                  </p>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar</Label>
                    <Input
                      type="search"
                      placeholder="Tipo, nombre..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Tipo</Label>
                    <Input
                      type="select"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      {documentTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="text-right">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <div>
                      <Button color="primary" onClick={handleNew} className="btn-round" block>
                        <i className="nc-icon nc-simple-add" /> Nuevo
                      </Button>
                    </div>
                  </FormGroup>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando formatos...</p></div>
              ) : filteredFormats.length === 0 ? (
                <div className="text-center">
                  <p>{formats.length === 0 ? "No hay formatos configurados." : "No se encontraron formatos que coincidan con la búsqueda."}</p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Tipo</th>
                      <th>Nombre</th>
                      <th>Plantilla</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFormats.map((format) => (
                      <tr key={format.id}>
                        <td>{format.documentType}</td>
                        <td>{format.formatName}</td>
                        <td>
                          {format.templatePath ? (
                            <div>
                              <Button
                                color="success"
                                size="sm"
                                onClick={() => handleDownloadTemplate(format)}
                                className="btn-round mr-1"
                              >
                                <i className="nc-icon nc-cloud-download-93" /> Descargar
                              </Button>
                              
                            </div>
                          ) : (
                            <Badge color="secondary">Sin plantilla</Badge>
                          )}
                        </td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(format.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDeleteClick(format)} className="btn-round">
                            <i className="nc-icon nc-simple-remove" /> Eliminar
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
      <PrintFormatsForm
        formatId={selectedFormatId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedFormatId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Confirmar Eliminación"
        message={`¿Está seguro de eliminar el formato "${formatToDelete?.formatName}"? Esta acción no se puede deshacer.`}
        confirmText="Sí, Eliminar"
        confirmColor="danger"
      />
    </div>
  );
}

export default PrintFormats;
