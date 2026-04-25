/**
 * Utilidad de prueba para verificar la compatibilidad de encriptación
 * Ejecutar en la consola del navegador para probar
 */

import { encrypt, decrypt } from '../services/encryptionService';

/**
 * Prueba la encriptación y desencriptación
 */
export const testEncryption = () => {
  const testPassword = 'test123';
  console.log('Testing encryption with password:', testPassword);
  
  try {
    const encrypted = encrypt(testPassword);
    console.log('Encrypted (Base64):', encrypted);
    console.log('Encrypted length:', encrypted.length);
    
    const decrypted = decrypt(encrypted);
    console.log('Decrypted:', decrypted);
    console.log('Match:', testPassword === decrypted ? '✅ YES' : '❌ NO');
    
    return {
      original: testPassword,
      encrypted,
      decrypted,
      match: testPassword === decrypted
    };
  } catch (error) {
    console.error('Test failed:', error);
    return { error: error.message };
  }
};

