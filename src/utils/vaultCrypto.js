/**
 * Password Hub - Cryptographic Engine
 * 
 * Cryptographic Specifications:
 * - KDF: Argon2id (RFC 9106 via hash-wasm) with 64 MB memory, 3 iterations, 1 parallelism, 32-byte output
 * - Key Separation: RFC 5869 HKDF using SHA-256 and distinct application context strings
 * - Encryption: AES-256-GCM with fresh, unique 12-byte random IVs and 128-bit authentication tags
 * - Key Wrapping: Envelope encryption wrapping the random 256-bit Vault Symmetric Key
 * - Randomness: Web Crypto API (crypto.getRandomValues)
 */

import { argon2id } from 'hash-wasm';

const cryptoObj = globalThis.crypto;

// Argon2id Configuration Parameters
export const ARGON2_PARAMS = {
  iterations: 3,
  memorySize: 65536, // 64 MB (in KB)
  parallelism: 1,
  hashLength: 32, // 32 bytes = 256 bits
  outputType: 'binary',
};

// RFC 5869 HKDF Context Strings (Decoupled Key Derivation)
export const HKDF_INFO = {
  MASTER_ENCRYPTION_KEY: 'note_app:vault:master_encryption_key:v1',
  CLIENT_AUTH_VERIFIER: 'note_app:vault:client_auth_verifier:v1',
};

/* ==========================================================================
   Binary / Base64 / Hex Utilities
   ========================================================================== */

export function bufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bufferToHex(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBuffer(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new Error('Invalid hexadecimal string.');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/* ==========================================================================
   Randomness Generation
   ========================================================================== */

/**
 * Generate a cryptographically secure random salt.
 * @param {number} byteLength - Number of bytes (default 16 bytes = 128 bits)
 * @returns {Uint8Array}
 */
export function generateRandomSalt(byteLength = 16) {
  const salt = new Uint8Array(byteLength);
  cryptoObj.getRandomValues(salt);
  return salt;
}

/**
 * Generate a fresh, unique 12-byte (96-bit) IV for AES-GCM.
 * @returns {Uint8Array}
 */
export function generateGcmIv() {
  const iv = new Uint8Array(12);
  cryptoObj.getRandomValues(iv);
  return iv;
}

/* ==========================================================================
   Argon2id Key Derivation
   ========================================================================== */

/**
 * Derive the 256-bit Master Key (MK) from master password and salt using Argon2id.
 * @param {string} masterPassword - The user's master password
 * @param {Uint8Array} saltBytes - Cryptographic salt (minimum 16 bytes)
 * @returns {Promise<Uint8Array>} 32-byte Master Key
 */
export async function deriveMasterKey(masterPassword, saltBytes) {
  if (!masterPassword || typeof masterPassword !== 'string') {
    throw new Error('Master password must be a non-empty string.');
  }
  if (!(saltBytes instanceof Uint8Array) || saltBytes.length < 16) {
    throw new Error('Salt must be a Uint8Array of at least 16 bytes.');
  }

  const mkBytes = await argon2id({
    password: masterPassword,
    salt: saltBytes,
    ...ARGON2_PARAMS,
  });

  return mkBytes;
}

/* ==========================================================================
   RFC 5869 HKDF Key Separation
   ========================================================================== */

/**
 * Derives independent Master Encryption Key (MEK) and Client Auth Hash
 * from the Master Key (MK) using standard RFC 5869 HKDF with SHA-256.
 * 
 * @param {Uint8Array} mkBytes - 32-byte Master Key from Argon2id
 * @returns {Promise<{ mek: CryptoKey, clientAuthHash: string }>}
 */
export async function deriveSubKeys(mkBytes) {
  if (!(mkBytes instanceof Uint8Array) || mkBytes.length !== 32) {
    throw new Error('Master Key must be exactly 32 bytes.');
  }

  // 1. Import Master Key as raw key material for HKDF
  const baseHkdfKey = await cryptoObj.subtle.importKey(
    'raw',
    mkBytes,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const encoder = new TextEncoder();
  const hkdfSalt = new Uint8Array(32); // Standard zero-filled 32-byte salt for PRK already pseudorandom

  // 2. Derive Master Encryption Key (MEK) for AES-256-GCM wrapping
  const mek = await cryptoObj.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt,
      info: encoder.encode(HKDF_INFO.MASTER_ENCRYPTION_KEY),
    },
    baseHkdfKey,
    { name: 'AES-GCM', length: 256 },
    false, // MEK cannot be extracted from the browser key store
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  // 3. Derive Client Auth Hash (256 bits = 32 bytes) for server authentication handshake
  const authBits = await cryptoObj.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt,
      info: encoder.encode(HKDF_INFO.CLIENT_AUTH_VERIFIER),
    },
    baseHkdfKey,
    256
  );

  const clientAuthHash = bufferToHex(new Uint8Array(authBits));

  return {
    mek,
    clientAuthHash,
  };
}

/* ==========================================================================
   AES-256-GCM Vault Key Management (Envelope Encryption)
   ========================================================================== */

/**
 * Generate a fresh, random 256-bit Vault Symmetric Key (VK).
 * This key encrypts all credential records.
 * @returns {Promise<CryptoKey>}
 */
export async function generateVaultKey() {
  return await cryptoObj.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // Extractable so it can be wrapped by MEK for storage
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap (encrypt) the Vault Key (VK) with the Master Encryption Key (MEK).
 * Uses AES-256-GCM with a fresh 12-byte IV.
 * 
 * @param {CryptoKey} mek - Master Encryption Key
 * @param {CryptoKey} vk - Vault Symmetric Key
 * @returns {Promise<{ encryptedVaultKey: string, keyIv: string }>}
 */
export async function wrapVaultKey(mek, vk) {
  const rawVk = await cryptoObj.subtle.exportKey('raw', vk);
  const keyIv = generateGcmIv();

  const encryptedBuffer = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv: keyIv, tagLength: 128 },
    mek,
    rawVk
  );

  return {
    encryptedVaultKey: bufferToBase64(new Uint8Array(encryptedBuffer)),
    keyIv: bufferToBase64(keyIv),
  };
}

/**
 * Unwrap (decrypt) the Vault Key (VK) using the Master Encryption Key (MEK).
 * Throws an error automatically if master password / MEK is incorrect (AES-GCM tag check fails).
 * 
 * @param {CryptoKey} mek - Master Encryption Key
 * @param {string} encryptedVaultKeyBase64 - Base64 ciphertext of wrapped VK
 * @param {string} keyIvBase64 - Base64 IV used when wrapping VK
 * @returns {Promise<CryptoKey>} Unwrapped Vault Key
 */
export async function unwrapVaultKey(mek, encryptedVaultKeyBase64, keyIvBase64) {
  const encryptedBytes = base64ToBuffer(encryptedVaultKeyBase64);
  const ivBytes = base64ToBuffer(keyIvBase64);

  // If MEK is wrong, crypto.subtle.decrypt throws an OperationError (integrity check fails)
  const rawVk = await cryptoObj.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes, tagLength: 128 },
    mek,
    encryptedBytes
  );

  const vk = await cryptoObj.subtle.importKey(
    'raw',
    rawVk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return vk;
}

/* ==========================================================================
   AES-256-GCM Payload Encryption & Decryption
   ========================================================================== */

/**
 * Encrypt a credential data object using the Vault Key (VK) and AES-256-GCM.
 * Generates a fresh, unique 12-byte IV for every invocation.
 * 
 * @param {CryptoKey} vk - Vault Key
 * @param {object} dataObject - Credential object (service_name, username, password, url, notes, category)
 * @returns {Promise<{ iv: string, ciphertext: string }>} Base64 strings
 */
export async function encryptPayload(vk, dataObject) {
  if (!dataObject || typeof dataObject !== 'object') {
    throw new Error('Data to encrypt must be an object.');
  }

  const jsonString = JSON.stringify(dataObject);
  const encodedPlaintext = new TextEncoder().encode(jsonString);
  const iv = generateGcmIv();

  const ciphertextBuffer = await cryptoObj.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    vk,
    encodedPlaintext
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(new Uint8Array(ciphertextBuffer)),
  };
}

/**
 * Decrypt a credential record using the Vault Key (VK) and AES-256-GCM.
 * Validates the 128-bit authentication tag. Throws an error if ciphertext was altered.
 * 
 * @param {CryptoKey} vk - Vault Key
 * @param {string} ciphertextBase64 - Base64 ciphertext with appended auth tag
 * @param {string} ivBase64 - Base64 12-byte IV
 * @returns {Promise<object>} Decrypted credential object
 */
export async function decryptPayload(vk, ciphertextBase64, ivBase64) {
  const ciphertextBytes = base64ToBuffer(ciphertextBase64);
  const ivBytes = base64ToBuffer(ivBase64);

  const decryptedBuffer = await cryptoObj.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes, tagLength: 128 },
    vk,
    ciphertextBytes
  );

  const decodedJson = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(decodedJson);
}

/* ==========================================================================
   Cryptographically Secure Password Generator
   ========================================================================== */

const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

/**
 * Generates a random, high-entropy password using crypto.getRandomValues().
 * Ensures unbiased character selection and guarantees at least one character
 * from each selected character set.
 * 
 * @param {object} options
 * @param {number} [options.length=16] - Length of password (8 to 64)
 * @param {boolean} [options.uppercase=true]
 * @param {boolean} [options.lowercase=true]
 * @param {boolean} [options.numbers=true]
 * @param {boolean} [options.symbols=true]
 * @returns {string} Generated password
 */
export function generateSecurePassword(options = {}) {
  const length = Math.max(8, Math.min(64, options.length || 16));
  const useUpper = options.uppercase !== false;
  const useLower = options.lowercase !== false;
  const useNumbers = options.numbers !== false;
  const useSymbols = options.symbols !== false;

  let pool = '';
  const mandatoryChars = [];

  if (useUpper) {
    pool += CHARSETS.uppercase;
    mandatoryChars.push(getRandomChar(CHARSETS.uppercase));
  }
  if (useLower) {
    pool += CHARSETS.lowercase;
    mandatoryChars.push(getRandomChar(CHARSETS.lowercase));
  }
  if (useNumbers) {
    pool += CHARSETS.numbers;
    mandatoryChars.push(getRandomChar(CHARSETS.numbers));
  }
  if (useSymbols) {
    pool += CHARSETS.symbols;
    mandatoryChars.push(getRandomChar(CHARSETS.symbols));
  }

  if (pool.length === 0) {
    pool = CHARSETS.lowercase + CHARSETS.numbers;
    mandatoryChars.push(getRandomChar(CHARSETS.lowercase));
  }

  const remainingLength = length - mandatoryChars.length;
  const remainingChars = [];

  // Generate unbiased random bytes using rejection sampling
  const randomBytes = new Uint8Array(remainingLength * 2);
  cryptoObj.getRandomValues(randomBytes);

  let byteIdx = 0;
  const poolLen = pool.length;
  const maxValidByte = 256 - (256 % poolLen);

  while (remainingChars.length < remainingLength) {
    if (byteIdx >= randomBytes.length) {
      cryptoObj.getRandomValues(randomBytes);
      byteIdx = 0;
    }
    const val = randomBytes[byteIdx++];
    if (val < maxValidByte) {
      remainingChars.push(pool[val % poolLen]);
    }
  }

  // Combine and shuffle mandatory + remaining characters using Fisher-Yates with crypto random values
  const allChars = [...mandatoryChars, ...remainingChars];
  for (let i = allChars.length - 1; i > 0; i--) {
    const swapByte = new Uint8Array(1);
    cryptoObj.getRandomValues(swapByte);
    const j = swapByte[0] % (i + 1);
    [allChars[i], allChars[j]] = [allChars[j], allChars[i]];
  }

  return allChars.join('');
}

function getRandomChar(charset) {
  const byte = new Uint8Array(1);
  const maxValid = 256 - (256 % charset.length);
  while (true) {
    cryptoObj.getRandomValues(byte);
    if (byte[0] < maxValid) {
      return charset[byte[0] % charset.length];
    }
  }
}
