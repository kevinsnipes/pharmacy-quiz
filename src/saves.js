import { encodeMastered, decodeMastered } from "./progress.js";

const API_BASE = "https://api.restful-api.dev/objects";

const SLOT_IDS = {
  1: "ff8081819ff5b110019ff98b3cfa08c1",
  2: "ff8081819ff5b110019ff98b3fb208c2",
  3: "ff8081819ff5b110019ff98b426d08c3",
};

export const SLOT_COUNT = 3;

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
  const mastered =
    Array.isArray(doc.mastered) && doc.mastered.length
      ? doc.mastered
      : decodeMastered(doc.masteredBits || "");
  return {
    ...emptySave(doc.slot),
    ...doc,
    mastered,
  };
}

export function isValidSave(doc) {
  if (!doc) return false;
  return Boolean(
    doc.updatedAt ||
      Number(doc.studiedMs) > 0 ||
      (Array.isArray(doc.mastered) && doc.mastered.length) ||
      (Array.isArray(doc.setIds) && doc.setIds.length)
  );
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
  delete copy.id;
  return copy;
}

export function readLocalSlot(slot) {
  try {
    const raw = localStorage.getItem(localKey(slot));
    if (!raw) return null;
    return unpack(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeLocalSlot(slot, doc) {
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

function unwrapCloud(row) {
  if (!row || typeof row !== "object") return null;
  const inner = row.data;
  if (inner && typeof inner === "object") return unpack(inner);
  return unpack(row);
}

function slotUrl(slot) {
  return `${API_BASE}/${SLOT_IDS[Number(slot)]}`;
}

export async function peekCloudSlot(slot) {
  const n = Number(slot);
  const row = await fetchJson(slotUrl(n));
  const save = unwrapCloud(row);
  if (!save) return null;
  save.slot = n;
  return save;
}

export async function inspectSlots() {
  return Promise.all(
    [1, 2, 3].map(async (n) => {
      const local = readLocalSlot(n);
      try {
        const cloud = await peekCloudSlot(n);
        return { slot: n, local, cloud, cloudOk: true };
      } catch {
        return { slot: n, local, cloud: null, cloudOk: false };
      }
    })
  );
}

export async function loadSlot(slot, source = "auto") {
  const n = Number(slot);
  if (source === "local") {
    return readLocalSlot(n) || emptySave(n);
  }
  if (source === "cloud") {
    const cloud = await peekCloudSlot(n);
    if (cloud) writeLocalSlot(n, cloud);
    return cloud || emptySave(n);
  }
  if (source === "new") {
    return emptySave(n);
  }
  try {
    const cloud = await peekCloudSlot(n);
    if (cloud && isValidSave(cloud)) {
      writeLocalSlot(n, cloud);
      return cloud;
    }
  } catch {
    /* fall through */
  }
  return readLocalSlot(n) || emptySave(n);
}

export async function saveSlot(doc) {
  const n = Number(doc.slot);
  const payload = withoutId(pack({ ...emptySave(n), ...doc, slot: n, updatedAt: Date.now() }));
  writeLocalSlot(n, payload);
  await fetchJson(slotUrl(n), {
    method: "PUT",
    body: JSON.stringify({
      name: `fpgee-slot-${n}`,
      data: payload,
    }),
  });
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

export function sameProgress(a, b) {
  const strip = (d) => {
    if (!d) return "";
    const copy = withoutId(pack(d));
    delete copy.updatedAt;
    delete copy.studiedMs;
    delete copy.notice;
    return JSON.stringify(copy);
  };
  return strip(a) === strip(b);
}
