import CryptoJS from 'crypto-js';

/**
 * Servicio de encriptación AES-256-CBC compatible con Java
 * 
 * IMPORTANTE: La clave debe ser exactamente la misma que en application.properties
 * Formato: [IV (16 bytes)] + [ciphertext] -> Base64
 */
// IMPORTANTE: Esta clave debe ser EXACTAMENTE la misma que encryption.key en application.properties
// Debe tener exactamente 32 caracteres (32 bytes) para AES-256
const ENCRYPTION_KEY = 'MySecretKey12345678901234567890X'; // 32 caracteres exactos
const IV_LENGTH = 16; // 128 bits

/**
 * Encripta un texto usando AES-256-CBC
 * Formato compatible con Java: Base64( IV(16 bytes) || ciphertext )
 * 
 * @param {string} plainText - Texto a encriptar
 * @returns {string} - Texto encriptado en Base64
 */
export const encrypt = (plainText) => {
  try {
    if (!plainText || plainText.trim() === '') {
      throw new Error('El texto a encriptar no puede estar vacío');
    }

    // 1. Generar IV aleatorio (16 bytes = 128 bits)
    const iv = CryptoJS.lib.WordArray.random(IV_LENGTH);
    
    // 2. Preparar la clave (32 bytes para AES-256)
    // IMPORTANTE: CryptoJS.AES.encrypt por defecto deriva la clave usando PBKDF2
    // Para usar la clave directamente sin derivación, necesitamos usar el formato correcto
    // CryptoJS.enc.Utf8.parse convierte la string a WordArray
    const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
    
    // Verificar que la clave tenga exactamente 32 bytes
    if (key.sigBytes !== 32) {
      throw new Error(`Key length is ${key.sigBytes} bytes, expected exactly 32 bytes for AES-256`);
    }
    
    // 3. Encriptar con AES-256-CBC
    // CryptoJS.AES.encrypt puede derivar la clave automáticamente
    // Para evitar la derivación y usar la clave directamente, pasamos la clave como WordArray
    // y especificamos que no queremos derivación (aunque CryptoJS puede hacerlo internamente)
    const encrypted = CryptoJS.AES.encrypt(
      CryptoJS.enc.Utf8.parse(plainText), // Convertir texto a WordArray
      key, // Clave como WordArray
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    // 4. Combinar IV + ciphertext en el formato exacto que Java espera
    // Formato Java: [IV (16 bytes)] + [ciphertext (N bytes)] -> Base64
    // CryptoJS concat() concatena correctamente: primero IV, luego ciphertext
    const combined = iv.concat(encrypted.ciphertext);
    
    // 5. Convertir a Base64 para enviar como string en JSON
    // Este formato debe ser 100% compatible con el backend Java
    const base64Result = CryptoJS.enc.Base64.stringify(combined);
    
    // Log para debugging (solo en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      console.log('Encryption debug:', {
        plainTextLength: plainText.length,
        ivLength: iv.sigBytes,
        ciphertextLength: encrypted.ciphertext.sigBytes,
        combinedLength: combined.sigBytes,
        base64Length: base64Result.length
      });
    }
    
    return base64Result;
  } catch (error) {
    console.error('Error encrypting password:', error);
    throw new Error('Error al encriptar la contraseña: ' + error.message);
  }
};

/**
 * Desencripta un texto (útil para testing/debug)
 * 
 * @param {string} encryptedText - Texto encriptado en Base64
 * @returns {string} - Texto desencriptado
 */
export const decrypt = (encryptedText) => {
  try {
    // 1. Decodificar Base64
    const combined = CryptoJS.enc.Base64.parse(encryptedText);
    
    // 2. Extraer IV (primeros 16 bytes = 4 words en WordArray)
    // Cada word en CryptoJS es 4 bytes, así que 16 bytes = 4 words
    const ivWords = combined.words.slice(0, 4);
    const iv = CryptoJS.lib.WordArray.create(ivWords, IV_LENGTH);
    
    // 3. Extraer ciphertext (resto de bytes)
    const ciphertextWords = combined.words.slice(4);
    const ciphertextLength = combined.sigBytes - IV_LENGTH;
    const ciphertext = CryptoJS.lib.WordArray.create(ciphertextWords, ciphertextLength);
    
    // 4. Preparar clave
    const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
    
    // 5. Desencriptar
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      key,
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Error decrypting password:', error);
    throw new Error('Error al desencriptar la contraseña: ' + error.message);
  }
};
