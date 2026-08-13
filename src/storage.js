const DB_NAME = "fpgee-quiz";
const DB_VERSION = 1;
const PDF_STORE = "files";
const PDF_KEY = "textbook";
export const MASTERY_KEY = "fpgee-mastery-v1";

export function loadMastery() {
  try {
    const raw = localStorage.getItem(MASTERY_KEY);
    if (!raw) return { mastered: [] };
    const parsed = JSON.parse(raw);
    return { mastered: Array.isArray(parsed.mastered) ? parsed.mastered : [] };
  } catch {
    return { mastered: [] };
  }
}

export function saveMastery(mastered) {
  localStorage.setItem(MASTERY_KEY, JSON.stringify({ mastered: [...mastered] }));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePdfBlob(blob) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PDF_STORE).put(blob, PDF_KEY);
  });
  db.close();
}

export async function loadPdfBlob() {
  const db = await openDb();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const req = tx.objectStore(PDF_STORE).get(PDF_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return blob || null;
}

export async function clearPdfBlob() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(PDF_STORE).delete(PDF_KEY);
  });
  db.close();
}
