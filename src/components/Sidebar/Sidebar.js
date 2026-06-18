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
import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Nav, Collapse } from "reactstrap";
// javascript plugin used to create scrollbars on windows
import PerfectScrollbar from "perfect-scrollbar";

import avatar from "assets/img/faces/ayo-ogunseinde-2.jpg";
import logo from "assets/img/react-logo.png";
import { logout, getUserData } from "services/authService";
import { useAuth } from "contexts/AuthContext";
import { isSidebarRouteVisible, routeGrantsAnyPermission } from "utils/routePermissionAccess";

var ps;

function Sidebar(props) {
  const [openAvatar, setOpenAvatar] = React.useState(false);
  const [collapseStates, setCollapseStates] = React.useState({});
  const sidebar = React.useRef();
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission, loading: permissionsLoading, user: authUser } = useAuth();
  
  // Obtener datos del usuario
  const userData = getUserData();
  const userName =
    authUser?.firstName && authUser?.lastName
      ? `${authUser.firstName} ${authUser.lastName}`
      : authUser?.username || authUser?.email || userData?.username || userData?.email || "Usuario";
  const profileImageRaw = String(authUser?.profileImageUrl || "").trim();
  const userAvatar = (() => {
    if (!profileImageRaw) return avatar;
    if (
      profileImageRaw.startsWith("http://") ||
      profileImageRaw.startsWith("https://") ||
      profileImageRaw.startsWith("data:") ||
      profileImageRaw.startsWith("blob:")
    ) {
      return profileImageRaw;
    }
    try {
      const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
      const origin = new URL(apiUrl).origin;
      return `${origin}${profileImageRaw.startsWith("/") ? profileImageRaw : `/${profileImageRaw}`}`;
    } catch {
      return profileImageRaw;
    }
  })();
  // Función para manejar el logout
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/auth/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
      // Aún así, limpiar y redirigir
      navigate('/auth/login');
    }
  };
  // this creates the intial state of this component based on the collapse routes
  // that it gets through props.routes
  const getCollapseStates = (routes) => {
    let initialState = {};
    routes.map((prop, key) => {
      if (prop.collapse) {
        initialState = {
          [prop.state]: getCollapseInitialState(prop.views),
          ...getCollapseStates(prop.views),
          ...initialState,
        };
      }
      return null;
    });
    return initialState;
  };
  // this verifies if any of the collapses should be default opened on a rerender of this component
  // for example, on the refresh of the page,
  // while on the src/views/forms/RegularForms.js - route /admin/regular-forms
  const getCollapseInitialState = (routes) => {
    for (let i = 0; i < routes.length; i++) {
      if (routes[i].collapse && getCollapseInitialState(routes[i].views)) {
        return true;
      } else if (window.location.pathname.indexOf(routes[i].path) !== -1) {
        return true;
      }
    }
    return false;
  };
  // Filtrar rutas según permisos
  const filterRoutesByPermissions = (routes) => {
    // Si aún se están cargando los permisos, mostrar todas las rutas temporalmente
    if (permissionsLoading) {
      return routes.filter((prop) => {
        return !prop.redirect && prop.showInSidebar !== false;
      });
    }
    
    return routes.filter((prop) => {
      if (prop.redirect || prop.showInSidebar === false) {
        return false;
      }

      if (prop.collapse) {
        const accessibleViews = prop.views.filter((view) =>
          routeGrantsAnyPermission(view.permissions, hasPermission)
        );
        return accessibleViews.length > 0;
      }

      return routeGrantsAnyPermission(prop.permissions, hasPermission);
    });
  };

  // this function creates the links and collapses that appear in the sidebar (left menu)
  const createLinks = (routes) => {
    // Filtrar rutas según permisos
    const filteredRoutes = filterRoutesByPermissions(routes);
    
    return filteredRoutes.map((prop, key) => {
      if (prop.redirect) {
        return null;
      }
      // Ocultar rutas que tienen showInSidebar: false
      if (prop.showInSidebar === false) {
        return null;
      }
      if (prop.collapse) {
        // Filtrar las vistas dentro del collapse también
        let accessibleViews;
        if (permissionsLoading) {
          // Mientras se cargan permisos, mostrar todas las vistas
          accessibleViews = prop.views.filter(view => view.showInSidebar !== false);
        } else {
          accessibleViews = prop.views.filter((view) =>
            isSidebarRouteVisible(view, hasPermission)
          );
        }
        
        // Si no hay vistas accesibles, no mostrar el collapse
        if (!permissionsLoading && accessibleViews.length === 0) {
          return null;
        }
        
        var st = {};
        st[prop["state"]] = !collapseStates[prop.state];
        return (
          <li
            className={getCollapseInitialState(accessibleViews) ? "active" : ""}
            key={key}
          >
            <a
              href="#pablo"
              data-toggle="collapse"
              aria-expanded={collapseStates[prop.state]}
              onClick={(e) => {
                e.preventDefault();
                setCollapseStates(st);
              }}
            >
              {prop.icon !== undefined ? (
                <>
                  <i className={prop.icon} />
                  <p>
                    {prop.name}
                    <b className="caret" />
                  </p>
                </>
              ) : (
                <>
                  <span className="sidebar-mini-icon">{prop.mini}</span>
                  <span className="sidebar-normal">
                    {prop.name}
                    <b className="caret" />
                  </span>
                </>
              )}
            </a>
            <Collapse isOpen={collapseStates[prop.state]}>
              <ul className="nav">{createLinks(accessibleViews)}</ul>
            </Collapse>
          </li>
        );
      }
      return (
        <li className={activeRoute(prop.layout + prop.path)} key={key}>
          <Link to={prop.layout + prop.path}>
            {prop.icon !== undefined ? (
              <>
                <i className={prop.icon} />
                <p>{prop.name}</p>
              </>
            ) : (
              <>
                <span className="sidebar-mini-icon">{prop.mini}</span>
                <span className="sidebar-normal">{prop.name}</span>
              </>
            )}
          </Link>
        </li>
      );
    });
  };
  // verifies if routeName is the one active (in browser input)
  const activeRoute = (routeName) => {
    return location.pathname.indexOf(routeName) > -1 ? "active" : "";
  };
  React.useEffect(() => {
    // if you are using a Windows Machine, the scrollbars will have a Mac look
    if (navigator.platform.indexOf("Win") > -1) {
      ps = new PerfectScrollbar(sidebar.current, {
        suppressScrollX: true,
        suppressScrollY: false,
      });
    }
    return function cleanup() {
      // we need to destroy the false scrollbar when we navigate
      // to a page that doesn't have this component rendered
      if (navigator.platform.indexOf("Win") > -1) {
        ps.destroy();
      }
    };
  });
  React.useEffect(() => {
    setCollapseStates(getCollapseStates(props.routes));
  }, []);
  return (
    <div
      className="sidebar"
      data-color={props.bgColor}
      data-active-color={props.activeColor}
      style={{ backgroundColor: "#283240" }}
    >
      <div className="logo">
        <a
          href="#pablo"
          className="simple-text logo-mini"
        >
          <div className="logo-img">
            <img src={logo} alt="react-logo" />
          </div>
        </a>
        <a
          href="#pablo"
          className="simple-text logo-normal"
        >
          Fossiles Corp
        </a>
      </div>

      <div className="sidebar-wrapper" ref={sidebar}>
        <div className="user">
          <div className="photo">
            <img src={userAvatar} alt="Avatar" />
          </div>
          <div className="info">
            <a
              href="#pablo"
              data-toggle="collapse"
              aria-expanded={openAvatar}
              onClick={() => setOpenAvatar(!openAvatar)}
            >
              <span>
                {userName}
                <b className="caret" />
              </span>
            </a>
            <Collapse isOpen={openAvatar}>
              <ul className="nav">
                <li>
                  <a
                    href="#pablo"
                    onClick={(e) => {
                      e.preventDefault();
                      handleLogout();
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="sidebar-mini-icon">L</span>
                    <span className="sidebar-normal">Cerrar Sesión</span>
                  </a>
                </li>
              </ul>
            </Collapse>
          </div>
        </div>
        {permissionsLoading ? (
          <Nav>
            <li className="text-center p-3">
              <span className="sidebar-normal text-muted">Cargando permisos...</span>
            </li>
          </Nav>
        ) : (
          <Nav>{createLinks(props.routes)}</Nav>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
