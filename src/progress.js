const POOL_SIZE = 1000;
export const STUDY_KEY = "fpgee-study-v1";

function toBits(ids) {
  const bits = new Uint8Array(Math.ceil(POOL_SIZE / 8));
  for (const id of ids) {
    const n = Number.parseInt(String(id).replace(/^q/i, ""), 10);
    if (!Number.isFinite(n) || n < 1 || n > POOL_SIZE) continue;
    const i = n - 1;
    bits[i >> 3] |= 1 << (i & 7);
  }
  return bits;
}

export function encodeMastered(ids) {
  const bits = toBits(ids);
  let bin = "";
  for (const b of bits) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeMastered(code) {
  if (!code) return [];
  try {
    const pad = code.length % 4 === 0 ? "" : "=".repeat(4 - (code.length % 4));
    const bin = atob(String(code).replaceAll("-", "+").replaceAll("_", "/") + pad);
    const bits = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const ids = [];
    for (let i = 0; i < POOL_SIZE; i += 1) {
      if (bits[i >> 3] & (1 << (i & 7))) ids.push(`q${String(i + 1).padStart(4, "0")}`);
    }
    return ids;
  } catch {
    return [];
  }
}

export function makeStudyId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rand = new Uint32Array(6);
  crypto.getRandomValues(rand);
  const chars = [...rand].map((n) => alphabet[n % alphabet.length]).join("");
  return `${chars.slice(0, 3)}-${chars.slice(3)}`;
}

export function unionIds(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

export function normalizeStudyId(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^([A-Z0-9]{3})([A-Z0-9]{3}).*/, "$1-$2");
}

export function loadStudy() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STUDY_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return { studyId: "", mastered: [] };
    return {
      studyId: normalizeStudyId(parsed.studyId),
      mastered: Array.isArray(parsed.mastered) ? parsed.mastered : [],
    };
  } catch {
    return { studyId: "", mastered: [] };
  }
}

export function saveStudy(studyId, mastered) {
  const id = normalizeStudyId(studyId) || makeStudyId();
  localStorage.setItem(STUDY_KEY, JSON.stringify({ studyId: id, mastered: [...mastered] }));
  return id;
}

export function resumeUrl(studyId, mastered) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("id", normalizeStudyId(studyId));
  url.searchParams.set("p", encodeMastered(mastered));
  return url.toString();
}

export function parseIncoming(raw = "") {
  const text = String(raw).trim();
  if (!text) {
    return parseIncoming(window.location.href);
  }
  let studyId = "";
  let mastered = [];
  try {
    const url = new URL(text, window.location.origin);
    studyId = normalizeStudyId(url.searchParams.get("id"));
    mastered = decodeMastered(url.searchParams.get("p"));
  } catch {
    const compact = text.replace(/\s/g, "");
    const [maybeId, maybeP] = compact.split(".");
    if (maybeP) {
      studyId = normalizeStudyId(maybeId);
      mastered = decodeMastered(maybeP);
    } else if (/^[A-Za-z0-9+/=_-]{20,}$/.test(compact)) {
      mastered = decodeMastered(compact);
    } else {
      studyId = normalizeStudyId(compact);
    }
  }
  return { studyId, mastered };
}

export function writeUrl(studyId, mastered) {
  const next = resumeUrl(studyId, mastered);
  const current = `${window.location.pathname}${window.location.search}`;
  const parsed = new URL(next);
  const target = `${parsed.pathname}${parsed.search}`;
  if (current !== target) {
    window.history.replaceState({}, "", target);
  }
}
