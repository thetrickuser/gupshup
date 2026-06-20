import CryptoJS from 'crypto-js';

/**
 * Generates a random 32-byte encryption key (256-bit for AES-256)
 */
export function generateEncryptionKey(): string {
  return CryptoJS.lib.WordArray.random(32).toString();
}

/**
 * Derives a deterministic encryption key from session ID and device ID
 * Ensures same session always uses same encryption key
 */
export function deriveSessionKey(sessionId: string, deviceId: string): string {
  const combined = `${sessionId}:${deviceId}`;
  return CryptoJS.SHA256(combined).toString();
}

/**
 * Encrypts plaintext using AES-256 with the provided key
 * Returns ciphertext in hex format
 */
export function encryptPayload(plaintext: string, encryptionKey: string): string {
  try {
    const encrypted = CryptoJS.AES.encrypt(plaintext, encryptionKey);
    const ciphertext = encrypted.toString();
    console.log(`[ENCRYPT] Plaintext: "${plaintext}" -> Ciphertext: "${ciphertext.substring(0, 50)}..."`);
    return ciphertext;
  } catch (err) {
    console.error('Encryption error:', err);
    throw new Error(`Failed to encrypt payload: ${err}`);
  }
}

/**
 * Decrypts ciphertext using AES-256 with the provided key
 * Returns plaintext string
 */
export function decryptPayload(ciphertext: string, encryptionKey: string): string {
  try {
    const decrypted = CryptoJS.AES.decrypt(ciphertext, encryptionKey);
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    console.log(`[DECRYPT] Ciphertext: "${ciphertext.substring(0, 50)}..." -> Plaintext: "${plaintext}"`);
    return plaintext;
  } catch (err) {
    console.error('Decryption error:', err);
    throw new Error(`Failed to decrypt payload: ${err}`);
  }
}

/**
 * Validates if a ciphertext can be decrypted with the given key
 * Useful for error handling
 */
export function canDecrypt(ciphertext: string, encryptionKey: string): boolean {
  try {
    const decrypted = CryptoJS.AES.decrypt(ciphertext, encryptionKey);
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    return plaintext.length > 0;
  } catch {
    return false;
  }
}
