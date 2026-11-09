// src/api/secureLogin.js
import api from './axios';

const pemToDer = (pem) =>
  Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));

const toBase64 = (buf) => {
  let s = "";
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};

export async function secureLogin(username, password) {
  if (!window.crypto?.subtle) {
    throw new Error("Secure login requires HTTPS");
  }

  // 1. Public key + one-time nonce
  const keyRes = await api.get("auth/public-key/");
  const { public_key, nonce } = keyRes.data;

  // 2. Encrypt with RSA-OAEP (SHA-256)
  const key = await crypto.subtle.importKey(
    "spki",
    pemToDer(public_key),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );

  const payload = new TextEncoder().encode(JSON.stringify({ username, password, nonce }));
  if (payload.length > 190) throw new Error("Username or password is too long");

  const cipher = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, payload);

  // 3. Send ciphertext only
  const res = await api.post("auth/login/", { credentials_enc: toBase64(cipher) });
  return res.data; // { token, user, expires_in }
}