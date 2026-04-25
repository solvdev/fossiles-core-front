/**
 * Sistema de aprendizaje para sugerencias de permisos
 * Analiza roles existentes y aprende patrones comunes
 */

// Guardar patrón de permisos en localStorage
export const savePermissionPattern = (roleName, permissionIds, permissionCodes) => {
  try {
    const patterns = getPermissionPatterns();
    const patternKey = roleName.toLowerCase().trim();
    
    patterns[patternKey] = {
      permissionIds,
      permissionCodes,
      lastUsed: new Date().toISOString(),
      usageCount: (patterns[patternKey]?.usageCount || 0) + 1,
    };
    
    localStorage.setItem('permissionPatterns', JSON.stringify(patterns));
    
    // Actualizar co-ocurrencias (qué permisos suelen ir juntos)
    updateCoOccurrences(permissionCodes);
  } catch (error) {
    console.error('Error guardando patrón:', error);
  }
};

// Obtener patrones guardados
export const getPermissionPatterns = () => {
  try {
    const stored = localStorage.getItem('permissionPatterns');
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error leyendo patrones:', error);
    return {};
  }
};

// Actualizar co-ocurrencias de permisos
const updateCoOccurrences = (permissionCodes) => {
  try {
    const coOccurrences = getCoOccurrences();
    
    // Para cada par de permisos, incrementar su co-ocurrencia
    for (let i = 0; i < permissionCodes.length; i++) {
      for (let j = i + 1; j < permissionCodes.length; j++) {
        const perm1 = permissionCodes[i];
        const perm2 = permissionCodes[j];
        const key = [perm1, perm2].sort().join('|');
        
        coOccurrences[key] = (coOccurrences[key] || 0) + 1;
      }
    }
    
    localStorage.setItem('permissionCoOccurrences', JSON.stringify(coOccurrences));
  } catch (error) {
    console.error('Error actualizando co-ocurrencias:', error);
  }
};

// Obtener co-ocurrencias
export const getCoOccurrences = () => {
  try {
    const stored = localStorage.getItem('permissionCoOccurrences');
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Error leyendo co-ocurrencias:', error);
    return {};
  }
};

// Analizar roles existentes desde el backend
export const analyzeExistingRoles = async (getRoles, getRoleById) => {
  try {
    const roles = await getRoles();
    const patterns = {};
    const coOccurrences = {};
    
    // Analizar cada rol
    for (const role of roles) {
      const fullRole = await getRoleById(role.id);
      if (fullRole.permissions && fullRole.permissions.length > 0) {
        const permissionCodes = fullRole.permissions.map(p => p.code);
        const roleName = role.name.toLowerCase().trim();
        
        patterns[roleName] = {
          permissionCodes,
          permissionIds: fullRole.permissions.map(p => p.id),
        };
        
        // Actualizar co-ocurrencias
        for (let i = 0; i < permissionCodes.length; i++) {
          for (let j = i + 1; j < permissionCodes.length; j++) {
            const perm1 = permissionCodes[i];
            const perm2 = permissionCodes[j];
            const key = [perm1, perm2].sort().join('|');
            coOccurrences[key] = (coOccurrences[key] || 0) + 1;
          }
        }
      }
    }
    
    // Guardar en localStorage
    localStorage.setItem('permissionPatterns', JSON.stringify(patterns));
    localStorage.setItem('permissionCoOccurrences', JSON.stringify(coOccurrences));
    
    return { patterns, coOccurrences };
  } catch (error) {
    console.error('Error analizando roles:', error);
    return { patterns: {}, coOccurrences: {} };
  }
};

// Obtener permisos sugeridos basados en aprendizaje
export const getLearnedSuggestions = (roleName, availablePermissions) => {
  const suggestions = new Set();
  const roleNameLower = roleName.toLowerCase().trim();
  
  // 1. Buscar patrón exacto por nombre
  const patterns = getPermissionPatterns();
  if (patterns[roleNameLower]) {
    const patternCodes = patterns[roleNameLower].permissionCodes || [];
    patternCodes.forEach(code => {
      const perm = availablePermissions.find(p => p.code === code);
      if (perm) suggestions.add(perm.id);
    });
  }
  
  // 2. Buscar patrones similares (contiene palabras clave)
  Object.keys(patterns).forEach(patternKey => {
    if (roleNameLower.includes(patternKey) || patternKey.includes(roleNameLower)) {
      const patternCodes = patterns[patternKey].permissionCodes || [];
      patternCodes.forEach(code => {
        const perm = availablePermissions.find(p => p.code === code);
        if (perm) suggestions.add(perm.id);
      });
    }
  });
  
  // 3. Agregar permisos de producción (siempre sugeridos)
  availablePermissions
    .filter(p => p.code.startsWith('PRODUCTION_ORDER'))
    .forEach(p => suggestions.add(p.id));
  
  return Array.from(suggestions);
};

// Obtener permisos relacionados basados en co-ocurrencias
export const getRelatedPermissions = (selectedPermissionCodes, availablePermissions, limit = 5) => {
  const coOccurrences = getCoOccurrences();
  const relatedScores = {};
  
  // Para cada permiso seleccionado, buscar sus co-ocurrencias más comunes
  selectedPermissionCodes.forEach(selectedCode => {
    Object.keys(coOccurrences).forEach(key => {
      const [perm1, perm2] = key.split('|');
      if (perm1 === selectedCode || perm2 === selectedCode) {
        const otherPerm = perm1 === selectedCode ? perm2 : perm1;
        if (!selectedPermissionCodes.includes(otherPerm)) {
          relatedScores[otherPerm] = (relatedScores[otherPerm] || 0) + coOccurrences[key];
        }
      }
    });
  });
  
  // Ordenar por score y tomar los top N
  const sorted = Object.entries(relatedScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([code]) => code);
  
  // Convertir códigos a IDs
  return sorted
    .map(code => availablePermissions.find(p => p.code === code))
    .filter(p => p)
    .map(p => p.id);
};

