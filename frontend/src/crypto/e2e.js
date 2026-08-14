/**
 * End-to-end encrypted chat: ECDH (P-256) key agreement + AES-GCM message
 * encryption, entirely client-side via the browser's Web Crypto API. The
 * server (see backend/app/api/routes/chat_ws.py) only ever stores and
 * relays ciphertext + IV -- it never has the plaintext or either party's
 * private key.
 *
 * Each browser generates its own ECDH keypair on first use and persists it
 * in IndexedDB (CryptoKey objects are structured-cloneable, so they can be
 * stored directly -- no manual serialization needed). Only the *public*
 * key is ever exported and sent to the server (see ChatPage.jsx uploading
 * it via PATCH /api/users/me); the private key never leaves this browser.
 *
 * Two users' shared AES key is derived independently on each side via
 * ECDH(myPrivateKey, theirPublicKey) -- both sides land on the same secret
 * without ever transmitting it (the standard Diffie-Hellman property).
 *
 * Caveat, by design, not a bug: a private key never leaves the device it
 * was created on. Clear browser storage, or open the conversation on a
 * different device/browser, and past encrypted messages become
 * undecryptable there -- there is no recovery mechanism, because building
 * one would mean the server (or someone) *could* recover your messages,
 * which defeats the point.
 */

const DB_NAME = "skillswap-e2e";
const STORE_NAME = "keys";
const SELF_KEY_ID = "self";
const CURVE = "ECDH";
const NAMED_CURVE = "P-256";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Loads this browser's persisted keypair, generating and storing a new
 * one on first use. Safe to call repeatedly (e.g. on every ChatPage
 * mount) -- it's a no-op after the first call on a given browser. */
export async function getOrCreateKeyPair() {
  const stored = await idbGet(SELF_KEY_ID);
  if (stored?.privateKey && stored?.publicKey) return stored;

  const keyPair = await crypto.subtle.generateKey(
    { name: CURVE, namedCurve: NAMED_CURVE },
    true, // extractable -- needed to export+upload the public half; the private half is simply never exported
    ["deriveKey", "deriveBits"]
  );
  await idbPut(SELF_KEY_ID, keyPair);
  return keyPair;
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function exportPublicKeyBase64(publicKey) {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return bufToBase64(raw);
}

async function importPublicKeyBase64(b64) {
  const raw = base64ToBuf(b64);
  return crypto.subtle.importKey("raw", raw, { name: CURVE, namedCurve: NAMED_CURVE }, true, []);
}

/** Derives the shared AES-GCM key for a conversation with one other user,
 * given their base64-encoded public key (as stored on their UserOut). */
export async function deriveSharedKey(myPrivateKey, theirPublicKeyBase64) {
  const theirPublicKey = await importPublicKeyBase64(theirPublicKeyBase64);
  return crypto.subtle.deriveKey(
    { name: CURVE, public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false, // never need to export the derived symmetric key either
    ["encrypt", "decrypt"]
  );
}

/** Encrypts plaintext with a fresh random IV (AES-GCM requires a unique
 * IV per message under the same key -- reusing one breaks the scheme). */
export async function encryptText(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, new TextEncoder().encode(plaintext));
  return { content: bufToBase64(ciphertext), iv: bufToBase64(iv) };
}

/** Throws if the ciphertext can't be decrypted with this key (wrong key,
 * corrupted data, or -- most commonly -- this browser doesn't hold the
 * private key the message was originally encrypted for). Callers should
 * catch and show a "can't decrypt on this device" placeholder. */
export async function decryptText(sharedKey, contentBase64, ivBase64) {
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuf(ivBase64) },
    sharedKey,
    base64ToBuf(contentBase64)
  );
  return new TextDecoder().decode(plainBuf);
}
