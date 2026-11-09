import forge from "node-forge";
import client from "./client";

export async function secureLogin(username, password, extra = {}) {
  const base = (client.defaults.baseURL ?? "").replace(/\/$/, "");

  const keyRes = await fetch(`${base}/auth/public-key/`);
  if (!keyRes.ok) throw new Error("Could not start login");
  const { public_key, nonce } = await keyRes.json();

  const payload = forge.util.encodeUtf8(JSON.stringify({ username, password, nonce }));
  if (payload.length > 190) throw new Error("Username or password is too long");

  const publicKey = forge.pki.publicKeyFromPem(public_key);
  const encrypted = publicKey.encrypt(payload, "RSA-OAEP", {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  

  const res = await fetch(`${base}/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...extra, credentials_enc: forge.util.encode64(encrypted) }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error || "Invalid credentials");
    err.status = res.status;
    throw err;
  }
  return data; // { token, user, expires_in }
}