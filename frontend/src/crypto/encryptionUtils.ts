import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

/**
 * Generates a random 32-byte encryption key (256-bit for AES-256)
 */
export function generateEncryptionKey(): string {
  const secureUuid = Crypto.randomUUID();
  return CryptoJS.SHA256(secureUuid).toString();
}

/**
 * Derives a deterministic encryption key from session ID and device ID
 */
export function deriveSessionKey(sessionId: string, deviceId: string): string {
  const combined = `${sessionId}:${deviceId}`;
  return CryptoJS.SHA256(combined).toString();
}

/**
 * Encrypts plaintext using AES-256 with strict WordArray objects
 * Forces crypto-js to completely bypass internal KDF salt generation
 */
export function encryptPayload(plaintext: string, encryptionKey: string): string {
  try {
    // 1. Hash the key to guarantee a clean 256-bit hexadecimal string representation
    const hashedKeyStr = CryptoJS.SHA256(encryptionKey).toString();
    const parsedKey = CryptoJS.enc.Hex.parse(hashedKeyStr);

    // 2. Derive a deterministic 16-byte initialization vector (IV) from the key
    const ivStr = hashedKeyStr.substring(0, 32); // 32 hex chars = 16 bytes
    const parsedIv = CryptoJS.enc.Hex.parse(ivStr);

    const cfg = { 
      iv: parsedIv, 
      mode: CryptoJS.mode.CBC, 
      padding: CryptoJS.pad.Pkcs7 
    };

    // 3. Perform encryption by passing the explicit WordArray key object
    const encrypted = CryptoJS.AES.encrypt(plaintext, parsedKey, cfg);
    return encrypted.toString();
  } catch (err) {
    console.error('Encryption error:', err);
    throw new Error(`Failed to encrypt payload: ${err}`);
  }
}

/**
 * Decrypts ciphertext using matching WordArray key/IV pairs
 */
export function decryptPayload(ciphertext: string, encryptionKey: string): string {
  try {
    const hashedKeyStr = CryptoJS.SHA256(encryptionKey).toString();
    const parsedKey = CryptoJS.enc.Hex.parse(hashedKeyStr);

    const ivStr = hashedKeyStr.substring(0, 32);
    const parsedIv = CryptoJS.enc.Hex.parse(ivStr);

    const cfg = { 
      iv: parsedIv, 
      mode: CryptoJS.mode.CBC, 
      padding: CryptoJS.pad.Pkcs7 
    };

    const decrypted = CryptoJS.AES.decrypt(ciphertext, parsedKey, cfg);
    const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
    return plaintext;
  } catch (err) {
    console.error('Decryption error:', err);
    throw new Error(`Failed to decrypt payload: ${err}`);
  }
}

/**
 * Validates if a ciphertext can be decrypted safely
 */
export function canDecrypt(ciphertext: string, encryptionKey: string): boolean {
  try {
    const hashedKeyStr = CryptoJS.SHA256(encryptionKey).toString();
    const parsedKey = CryptoJS.enc.Hex.parse(hashedKeyStr);

    const ivStr = hashedKeyStr.substring(0, 32);
    const parsedIv = CryptoJS.enc.Hex.parse(ivStr);

    const cfg = { iv: parsedIv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 };
    const decrypted = CryptoJS.AES.decrypt(ciphertext, parsedKey, cfg);
    return decrypted.toString(CryptoJS.enc.Utf8).length > 0;
  } catch {
    return false;
  }
}