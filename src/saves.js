const API_BASE = "https://crudcrud.com/api/03d3b41df7d04ef89b31c438a8ed4975/slots";

const SLOT_IDS = {
  1: "6a7d479c88d77103e82654a8",
  2: "6a7d47aa88d77103e82654a9",
  3: "6a7d47aa88d77103e82654aa",
  4: "6a7d47ab88d77103e82654ab",
  5: "6a7d47ac88d77103e82654ac",
  6: "6a7d47ad88d77103e82654ad",
  7: "6a7d47ae88d77103e82654ae",
  8: "6a7d47ae88d77103e82654af",
  9: "6a7d47b088d77103e82654b0",
};

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
  };
}

export function snapshotFromState(state) {
  return {
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
  };
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
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocal(slot, doc) {
  try {
    localStorage.setItem(localKey(slot), JSON.stringify(withoutId(doc)));
  } catch {
    /* ignore quota */
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Save server ${res.status}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function listSlots() {
  try {
    const rows = await fetchJson(API_BASE);
    const bySlot = {};
    for (const row of rows || []) {
      if (row.slot >= 1 && row.slot <= 9) bySlot[row.slot] = row;
    }
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot) => {
      const cloud = bySlot[slot];
      if (cloud) {
        writeLocal(slot, cloud);
        return cloud;
      }
      return readLocal(slot) || emptySave(slot);
    });
  } catch {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((slot) => readLocal(slot) || emptySave(slot));
  }
}

export async function loadSlot(slot) {
  const n = Number(slot);
  const id = SLOT_IDS[n];
  try {
    const cloud = await fetchJson(`${API_BASE}/${id}`);
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
  const payload = withoutId({
    ...emptySave(n),
    ...doc,
    slot: n,
    updatedAt: Date.now(),
  });
  writeLocal(n, payload);
  const id = SLOT_IDS[n];
  await fetchJson(`${API_BASE}/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return payload;
}

export function sameSnapshot(a, b) {
  const strip = (d) => {
    if (!d) return "";
    const copy = withoutId(d);
    delete copy.updatedAt;
    return JSON.stringify(copy);
  };
  return strip(a) === strip(b);
}
