import { useState, useEffect } from 'react';
import { getUserPermissions } from '../utils/permissionHelper';

/**
 * Hook para obtener y verificar permisos del usuario
 */
export const usePermissions = () => {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const userPerms = await getUserPermissions();
        console.log('Hook usePermissions - Permisos cargados:', userPerms);
        setPermissions(userPerms);
      } catch (error) {
        console.error('Error al cargar permisos:', error);
        setPermissions([]);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, []);

  const hasPermission = (permissionCode) => {
    if (!permissionCode) return true; // Si no requiere permiso, permitir acceso
    
    // Debug log
    const hasAdminAccess = permissions.includes('ADMIN_FULL_ACCESS');
    const hasSpecificPermission = permissions.includes(permissionCode);
    
    if (hasAdminAccess) {
      console.log(`Permiso ${permissionCode}: ACCESO GRANTED (ADMIN_FULL_ACCESS)`);
      return true;
    }
    
    console.log(`Permiso ${permissionCode}: ${hasSpecificPermission ? 'GRANTED' : 'DENIED'}`);
    return hasSpecificPermission;
  };

  const hasAnyPermission = (permissionCodes) => {
    if (!permissionCodes || permissionCodes.length === 0) return true;
    if (permissions.includes('ADMIN_FULL_ACCESS')) return true;
    return permissionCodes.some(code => permissions.includes(code));
  };

  return {
    permissions,
    loading,
    hasPermission,
    hasAnyPermission,
  };
};

