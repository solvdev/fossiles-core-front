import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getUserData, getAuthHeader } from 'services/authService';

const AuthContext = createContext(null);

/**
 * Provider de autenticación que maneja usuario, roles y permisos
 */
export const AuthProvider = ({ children }) => {
  const normalizeRoleValue = useCallback((value) => {
    return String(value || "")
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[_\-\s]/g, "");
  }, []);

  const roleMatches = useCallback((userRoleValue, expectedRoleValue) => {
    const userNormalized = normalizeRoleValue(userRoleValue);
    const expectedNormalized = normalizeRoleValue(expectedRoleValue);
    if (!userNormalized || !expectedNormalized) return false;

    // Match exacto o por inclusión para variantes como ADMIN/ADMINISTRADOR o RRHH/RECURSOSHUMANOS
    return (
      userNormalized === expectedNormalized ||
      userNormalized.includes(expectedNormalized) ||
      expectedNormalized.includes(userNormalized)
    );
  }, [normalizeRoleValue]);

  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const extractPermissionsFromUser = useCallback((userFull) => {
    const permissionsSet = new Set();
    if (Array.isArray(userFull?.roles)) {
      userFull.roles.forEach((role) => {
        if (Array.isArray(role?.permissions)) {
          role.permissions.forEach((permission) => {
            if (permission?.code) {
              permissionsSet.add(permission.code);
            }
          });
        }
      });
    }
    return Array.from(permissionsSet);
  }, []);

  /**
   * Carga los datos del usuario y sus permisos
   */
  const loadUserData = useCallback(async () => {
    try {
      setLoading(true);
      setInitialized(false);
      
      // Obtener datos básicos del usuario desde localStorage
      const userData = getUserData();
      if (!userData) {
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setInitialized(true);
        setLoading(false);
        return;
      }

      setUser(userData);

      // Obtener usuario completo, roles y permisos en una sola llamada
      try {
        const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

        const response = await fetch(`${API_URL}/users/me`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader()
          }
        });

        if (response.ok) {
          const userFull = await response.json();
          setUser((prev) => ({ ...(prev || {}), ...(userFull || {}) }));
          setRoles(Array.isArray(userFull.roles) ? userFull.roles : []);
          setPermissions(extractPermissionsFromUser(userFull));
        } else {
          setRoles([]);
          setPermissions([]);
        }
      } catch (error) {
        console.warn('Error al obtener usuario/permisos:', error);
        setRoles([]);
        setPermissions([]);
      }

      // Solo marcar como inicializado después de que los permisos estén cargados
      // Si después de los intentos no hay permisos, aún así marcar como inicializado
      // (puede ser que el usuario realmente no tenga permisos)
      setInitialized(true);
    } catch (error) {
      console.error('Error al cargar datos del usuario:', error);
      setUser(null);
      setRoles([]);
      setPermissions([]);
      setInitialized(true);
    } finally {
      setLoading(false);
    }
  }, [extractPermissionsFromUser]);

  /**
   * Recarga los datos del usuario (útil después de cambios en roles/permisos)
   */
  const refreshUserData = useCallback(async () => {
    await loadUserData();
  }, [loadUserData]);

  /**
   * Verifica si el usuario tiene un permiso específico
   */
  const hasPermission = useCallback((permissionCode) => {
    if (!permissionCode) return true; // Si no requiere permiso, permitir acceso
    
    // Si tiene ADMIN_FULL_ACCESS o SUPER_ADMIN, tiene todos los permisos
    if (permissions.includes('ADMIN_FULL_ACCESS') || permissions.includes('SUPER_ADMIN')) {
      return true;
    }
    
    return permissions.includes(permissionCode);
  }, [permissions]);

  /**
   * Verifica si el usuario tiene al menos uno de los permisos especificados
   */
  const hasAnyPermission = useCallback((permissionCodes) => {
    if (!permissionCodes || permissionCodes.length === 0) return true;
    
    if (permissions.includes('ADMIN_FULL_ACCESS') || permissions.includes('SUPER_ADMIN')) {
      return true;
    }
    
    return permissionCodes.some(code => permissions.includes(code));
  }, [permissions]);

  /**
   * Verifica si el usuario tiene todos los permisos especificados
   */
  const hasAllPermissions = useCallback((permissionCodes) => {
    if (!permissionCodes || permissionCodes.length === 0) return false;
    
    if (permissions.includes('ADMIN_FULL_ACCESS') || permissions.includes('SUPER_ADMIN')) {
      return true;
    }
    
    return permissionCodes.every(code => permissions.includes(code));
  }, [permissions]);

  /**
   * Verifica si el usuario tiene un rol específico
   */
  const hasRole = useCallback((roleCode) => {
    return roles.some((role) =>
      roleMatches(role?.code, roleCode) || roleMatches(role?.name, roleCode)
    );
  }, [roles, roleMatches]);

  /**
   * Verifica si el usuario tiene al menos uno de los roles especificados
   */
  const hasAnyRole = useCallback((roleCodes) => {
    if (!Array.isArray(roleCodes) || roleCodes.length === 0) return true;
    return roles.some((role) =>
      roleCodes.some((code) => roleMatches(role?.code, code) || roleMatches(role?.name, code))
    );
  }, [roles, roleMatches]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Escuchar cambios en el token de localStorage para recargar automáticamente
  useEffect(() => {
    const handleStorageChange = (e) => {
      // Si cambió el token o los datos del usuario, recargar
      if (e.key === 'authToken' || e.key === 'userData') {
        loadUserData();
      }
    };

    // Escuchar eventos de storage (cuando cambia en otra pestaña)
    window.addEventListener('storage', handleStorageChange);

    // También escuchar cambios locales usando un evento personalizado
    // Esto se dispara cuando se guarda el token después del login
    const handleCustomStorageChange = () => {
      loadUserData();
    };
    window.addEventListener('authTokenChanged', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('authTokenChanged', handleCustomStorageChange);
    };
  }, [loadUserData]);

  const value = {
    user,
    roles,
    permissions,
    loading,
    initialized,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    hasAnyRole,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook para usar el contexto de autenticación
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};

