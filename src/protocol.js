const MAGIC = 'VX1';
export const HEADER_TYPE = 'H';
export const DATA_TYPE = 'D';

// QR alphanumeric + binary via base64url. Keep payload small for reliable camera read.
export const CHUNK_BYTES = 180;

export function toB64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256hex(buffer) {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function encodeHeader(meta) {
  return JSON.stringify({
    m: MAGIC,
    t: HEADER_TYPE,
    id: meta.id,
    n: meta.name,
    typ: meta.type || 'application/octet-stream',
    s: meta.size,
    c: meta.chunks,
    h: meta.hash,
  });
}

export function encodeData(id, index, bytes) {
  return JSON.stringify({
    m: MAGIC,
    t: DATA_TYPE,
    id,
    i: index,
    d: toB64(bytes),
  });
}

export function parseFrame(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || obj.m !== MAGIC) return null;
  if (obj.t === HEADER_TYPE) {
    return {
      type: HEADER_TYPE,
      id: obj.id,
      name: obj.n,
      mime: obj.typ,
      size: obj.s,
      chunks: obj.c,
      hash: obj.h,
    };
  }
  if (obj.t === DATA_TYPE) {
    return {
      type: DATA_TYPE,
      id: obj.id,
      index: obj.i,
      data: fromB64(obj.d),
    };
  }
  return null;
}

export function sessionId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fileToFrames(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256hex(buf);
  const chunks = [];
  for (let i = 0; i < buf.length; i += CHUNK_BYTES) {
    chunks.push(buf.subarray(i, i + CHUNK_BYTES));
  }
  if (chunks.length === 0) chunks.push(new Uint8Array(0));
  const id = sessionId();
  const header = encodeHeader({
    id,
    name: file.name || 'file.bin',
    type: file.type,
    size: buf.length,
    chunks: chunks.length,
    hash,
  });
  const frames = [header];
  chunks.forEach((c, i) => frames.push(encodeData(id, i, c)));
  return { frames, id, hash, size: buf.length, name: file.name, chunkCount: chunks.length };
}
