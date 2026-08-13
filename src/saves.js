import { encodeMastered, decodeMastered } from "./progress.js";

const API_BASE = "https://crudcrud.com/api/03d3b41df7d04ef89b31c438a8ed4975/slots";

const SLOT_IDS = {
  1: "6a7d479c88d77103e82654a8",
  2: "6a7d47aa88d77103e82654a9",
  3: "6a7d47aa88d77103e82654aa",
};

export const SLOT_COUNT = 3;
const idCache = { ...SLOT_IDS };

function localKey(slot) {
  return `fpgee-slot-${slot}`;
}

export function emptySave(slot) {
  return {
    slot: Number(slot),
    updatedAt: null,
    mastered: [],
    setIds: [],
    answers: [],
    notice: "",
    studiedMs: 0,
  };
}

function pack(doc) {
  const mastered = Array.isArray(doc.mastered) ? doc.mastered : [];
  return {
    slot: Number(doc.slot),
    updatedAt: doc.updatedAt || Date.now(),
    studiedMs: Number(doc.studiedMs) || 0,
    notice: doc.notice || "",
    masteredBits: doc.masteredBits || encodeMastered(mastered),
    setIds: Array.isArray(doc.setIds) ? doc.setIds : [],
    answers: Array.isArray(doc.answers) ? doc.answers : [],
  };
}

function unpack(doc) {
  if (!doc || typeof doc !== "object") return null;
  const mastered = Array.isArray(doc.mastered) && doc.mastered.length
    ? doc.mastered
    : decodeMastered(doc.masteredBits || "");
  return {
    ...emptySave(doc.slot),
    ...doc,
    mastered,
  };
}

export function snapshotFromState(state) {
  return pack({
    slot: Number(state.slot),
    updatedAt: Date.now(),
    mastered: [...(state.mastered || [])],
    setIds: (state.set || []).map((q) => q.id),
    answers: (state.answers || []).map((a) => ({
      selected: a.selected || null,
      checked: Boolean(a.checked),
      correct: Boolean(a.correct),
    })),
    notice: state.notice || "",
    studiedMs: Number(state.studiedMs) || 0,
  });
}

function withoutId(doc) {
  const copy = { ...doc };
  delete copy._id;
  return copy;
}

function readLocal(slot) {
  try {
    const raw = localStorage.getItem(localKey(slot));
    if (!raw) return null;
    return unpack(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeLocal(slot, doc) {
  try {
    localStorage.setItem(localKey(slot), JSON.stringify(withoutId(pack(doc))));
  } catch {
    /* ignore quota */
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json, text/plain, */*",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Save server ${res.status}`);
  }
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function resolveId(slot) {
  const n = Number(slot);
  if (idCache[n]) return idCache[n];
  const rows = await fetchJson(API_BASE);
  for (const row of rows || []) {
    if (Number(row.slot) === n && row._id) idCache[n] = row._id;
  }
  return idCache[n] || SLOT_IDS[n];
}

export async function listSlots() {
  try {
    const rows = await fetchJson(API_BASE);
    const bySlot = {};
    for (const row of rows || []) {
      if (row.slot >= 1 && row.slot <= SLOT_COUNT) {
        bySlot[row.slot] = unpack(row);
        if (row._id) idCache[row.slot] = row._id;
      }
    }
    return [1, 2, 3].map((slot) => {
      const cloud = bySlot[slot];
      if (cloud) {
        writeLocal(slot, cloud);
        return cloud;
      }
      return readLocal(slot) || emptySave(slot);
    });
  } catch {
    return [1, 2, 3].map((slot) => readLocal(slot) || emptySave(slot));
  }
}

export async function loadSlot(slot) {
  const n = Number(slot);
  try {
    const id = await resolveId(n);
    const cloud = unpack(await fetchJson(`${API_BASE}/${id}`));
    if (cloud) {
      writeLocal(n, cloud);
      return cloud;
    }
  } catch {
    /* fall through */
  }
  return readLocal(n) || emptySave(n);
}

export async function saveSlot(doc) {
  const n = Number(doc.slot);
  const payload = withoutId(pack({ ...emptySave(n), ...doc, slot: n, updatedAt: Date.now() }));
  writeLocal(n, payload);
  const id = await resolveId(n);
  try {
    await fetchJson(`${API_BASE}/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const created = await fetchJson(API_BASE, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (created && created._id) idCache[n] = created._id;
    else throw err;
  }
  return unpack(payload);
}

export function sameSnapshot(a, b) {
  const strip = (d) => {
    if (!d) return "";
    const copy = withoutId(pack(d));
    delete copy.updatedAt;
    return JSON.stringify(copy);
  };
  return strip(a) === strip(b);
}
