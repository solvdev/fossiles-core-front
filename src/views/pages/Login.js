/*!

=========================================================
* Paper Dashboard PRO React - v1.3.2
=========================================================

* Product Page: https://www.creative-tim.com/product/paper-dashboard-pro-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import bg from '../../assets/img/bg/blue.png'

// reactstrap components
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Label,
  FormGroup,
  Form,
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  Container,
  Col,
  Row,
  Alert,
} from "reactstrap";

// Services
import { login } from "../../services/authService";
import { encrypt } from "../../services/encryptionService";
import { clearPermissionCache } from "../../utils/permissionHelper";

function Login() {
  const navigate = useNavigate();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validar campos
      if (!usernameOrEmail.trim() || !password.trim()) {
        setError("Por favor, completa todos los campos");
        setLoading(false);
        return;
      }

      // Encriptar la contraseña antes de enviarla
      const encryptedPassword = encrypt(password);

      // Realizar login
      await login(usernameOrEmail.trim(), encryptedPassword);

      // Limpiar cache de permisos para forzar una nueva carga
      clearPermissionCache();

      // Redirigir al módulo inicial según permisos
      navigate("/admin");
    } catch (err) {
      setError(err.message || "Error al iniciar sesión. Verifica tus credenciales.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    document.body.classList.toggle("login-page");
    // Eliminar el overlay del full-page y aplicar fondo gris
    const style = document.createElement('style');
    style.textContent = `
      .full-page.section-image::after {
        display: none !important;
      }
      .full-page.section-image {
        background-color:rgb(153, 174, 201) !important;
        padding: 0 !important;
        min-height: 100vh !important;
        height: 100vh !important;
        display: flex !important;
        flex-direction: column !important;
      }
      .full-page > .content {
        padding-top: 0 !important;
        padding-bottom: 0 !important;
        flex: 1 !important;
        display: flex !important;
        align-items: center !important;
      }
      body {
        margin: 0 !important;
        padding: 0 !important;
        height: 100vh !important;
      }
      .wrapper-full-page {
        background-color:#8D98A6!important;
        height: 100vh !important;
      }
      html {
        height: 100% !important;
      }
      html, body {
        background-color:#8D98A6 !important;
      }
      .footer {
        flex-shrink: 0 !important;
        margin-top: auto !important;
      }
      .card-login {
        border: none !important;
        padding: 0 !important;
      }
      .card {
        border: none !important;
      }
      .card-login .row {
        height: 100% !important;
        min-height: 100% !important;
      }
      .card-login .col {
        height: 100% !important;
        min-height: 100% !important;
      }
    `;
    document.head.appendChild(style);
    return function cleanup() {
      document.body.classList.toggle("login-page");
      document.head.removeChild(style);
    };
  });
  return (
    <div className="login-page" style={{ 
      height: "100%",
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center",
      position: "relative",
      margin: 0,
      padding: 0,
      flex: 1
    }}>
      <Card
        className="card-login"
        style={{
          width: "70vw",
          maxWidth: "1200px",
          minWidth: "700px",
          height: "calc(100vh - 100px)",
          maxHeight: "600px",
          borderRadius: "0.5rem",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          display: "flex",
          overflow: "hidden",
          position: "relative",
          zIndex: 2,
          border: "none",
          padding: 0
        }}
      >
        <Row className="no-gutters align-items-stretch" style={{ width: "100%", height: "100%", margin: 0, minHeight: "100%" }}>
          <Col
            md="6"
            className="d-none d-md-flex align-items-center justify-content-center"
            style={{
              backgroundImage: `url(${bg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              height: "100%",
              minHeight: "100%"
            }}
          >
            <div style={{ color: "white", textAlign: "left", width: "100%", padding: "3rem" }}>
              <h2 style={{ fontWeight: 700, fontSize: "4rem", marginBottom: "1.5rem" }}>¡Bienvenido de Nuevo!</h2>
              <p style={{ fontSize: "1.2rem", lineHeight: "1.6" }}>
                Ingresa tus credenciales para acceder a tu cuenta.
              </p>
            </div>
          </Col>
          <Col
            xs="12"
            md="6"
            className="d-flex flex-column justify-content-center"
            style={{
              background: "white",
              padding: "3rem 4rem",
              height: "100%",
              minHeight: "100%"
            }}
          >
            <Form onSubmit={handleSubmit} className="form" style={{ width: "100%" }}>
              <CardHeader 
                className="pb-3" 
                style={{ background: "transparent", border: "none", padding: 0 }}
              >
                <h2 className="header text-center mb-5" style={{ fontSize: "3rem", fontWeight: 600, color: "#333" }}>Login</h2>
              </CardHeader>
              <CardBody style={{ padding: 0 }}>
                {error && (
                  <Alert color="danger" style={{ marginBottom: "1.5rem", fontSize: "0.95rem" }}>
                    {error}
                  </Alert>
                )}
                <InputGroup className="mb-4" style={{ fontSize: "1.1rem" }}>
                  <InputGroupAddon addonType="prepend">
                    <InputGroupText style={{ fontSize: "1.2rem", padding: "0.75rem 1rem" }}>
                      <i className="nc-icon nc-single-02" />
                    </InputGroupText>
                  </InputGroupAddon>
                  <Input 
                    placeholder="Usuario o e-mail" 
                    type="text"
                    value={usernameOrEmail}
                    onChange={(e) => setUsernameOrEmail(e.target.value)}
                    disabled={loading}
                    style={{ 
                      fontSize: "1.1rem", 
                      padding: "0.75rem 1rem",
                      height: "auto"
                    }} 
                  />
                </InputGroup>
                <InputGroup className="mb-4" style={{ fontSize: "1.1rem" }}>
                  <InputGroupAddon addonType="prepend">
                    <InputGroupText style={{ fontSize: "1.2rem", padding: "0.75rem 1rem" }}>
                      <i className="nc-icon nc-key-25" />
                    </InputGroupText>
                  </InputGroupAddon>
                  <Input
                    placeholder="Contraseña"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                    style={{ 
                      fontSize: "1.1rem", 
                      padding: "0.75rem 1rem",
                      height: "auto"
                    }}
                  />
                </InputGroup>
              </CardBody>
              <CardFooter 
                className="pt-4" 
                style={{ background: "transparent", border: "none", padding: 0 }}
              >
                <Button
                  type="submit"
                  block
                  className="btn-round"
                  disabled={loading}
                  style={{
                    backgroundColor: loading ? "#6c757d" : "#283240",
                    borderColor: loading ? "#6c757d" : "#283240",
                    color: "#fff",
                    fontSize: "1.1rem",
                    padding: "0.875rem 2rem",
                    fontWeight: 600,
                    letterSpacing: "0.5px",
                    borderRadius: "8px",
                    cursor: loading ? "not-allowed" : "pointer"
                  }}
                >
                  {loading ? "INICIANDO SESIÓN..." : "INICIAR SESIÓN"}
                </Button>
              </CardFooter>
            </Form>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

export default Login;
