import "./style.css";
import { savePdfBlob, loadPdfBlob, clearPdfBlob } from "./storage.js";
import { hasTextbook, loadTextbookFromBlob, openSourcePage, unloadTextbook } from "./pdfViewer.js";
import {
  inspectSlots,
  loadSlot,
  saveSlot,
  snapshotFromState,
  sameSnapshot,
  sameProgress,
  emptySave,
  isValidSave,
  writeLocalSlot,
  peekCloudSlot,
  readLocalSlot,
} from "./saves.js";

const SESSION_SIZE = 20;
const app = document.querySelector("#app");

let phoneMode = false;
let lastState = null;
let questionBank = [];
let saveTimer = null;
let lastSaved = null;
let lastCloudAt = 0;
let saveStatus = "";
let studyClockStart = 0;
const CLOUD_GAP_MS = 60_000;

function isPhone() {
  const ua = navigator.userAgent || "";
  if (/Android.+Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  if (/iPad|Android/i.test(ua) && window.innerWidth <= 1024) return true;
  if (window.matchMedia("(pointer: coarse) and (hover: none)").matches && window.innerWidth <= 900) {
    return true;
  }
  return false;
}

function syncPhoneClass() {
  phoneMode = isPhone();
  document.documentElement.classList.toggle("phone", phoneMode);
  return phoneMode;
}

syncPhoneClass();
window.addEventListener("resize", () => {
  const next = isPhone();
  if (next !== phoneMode && lastState) render(lastState);
  else syncPhoneClass();
});
document.addEventListener("visibilitychange", () => {
  if (!lastState || lastState.screen !== "quiz") return;
  if (document.hidden) {
    consumeStudyTime(lastState);
    studyClockStart = 0;
    void flushSave(lastState, true);
  } else {
    studyClockStart = Date.now();
  }
});
window.addEventListener("pagehide", () => {
  if (lastState?.screen === "quiz") void flushSave(lastState, true);
});

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function remainingPool(bank, mastered, excludeIds = []) {
  const done = new Set(mastered);
  const skip = new Set(excludeIds);
  const open = bank.filter((q) => !done.has(q.id));
  if (!open.length) return [];
  const fresh = open.filter((q) => !skip.has(q.id));
  return fresh.length ? fresh : open;
}

function pickSet(bank, mastered, excludeIds = []) {
  let pool = remainingPool(bank, mastered, excludeIds);
  let reset = false;
  if (!pool.length) {
    mastered.length = 0;
    pool = [...bank];
    reset = true;
  }
  const size = Math.min(SESSION_SIZE, pool.length);
  return { set: shuffle(pool).slice(0, size), reset };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatStudyTime(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const hours = Math.floor(total / 3_600_000);
  const mins = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function formatLastSaved(ts) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function consumeStudyTime(state) {
  if (!state || state.screen !== "quiz") return;
  const extra = studyClockStart ? Date.now() - studyClockStart : 0;
  studyClockStart = Date.now();
  state.studiedMs = (Number(state.studiedMs) || 0) + extra;
}

function stopAutosave() {
  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
}

function startAutosave() {
  stopAutosave();
  saveTimer = setInterval(() => {
    if (lastState?.screen === "quiz") void flushSave(lastState, false);
  }, 5000);
}

function setSaveStatus(text) {
  saveStatus = text;
  const el = document.getElementById("save-status");
  if (el) el.textContent = text;
}

async function flushSave(state, force = true) {
  if (!state || state.screen !== "quiz") return;
  consumeStudyTime(state);
  const snap = snapshotFromState(state);
  writeLocalSlot(state.slot, snap);
  const progressChanged = !sameProgress(snap, lastSaved);
  const cloudDue = Date.now() - lastCloudAt >= CLOUD_GAP_MS;
  if (!force && sameSnapshot(snap, lastSaved) && !cloudDue) return;
  lastSaved = snap;
  if (!force && !progressChanged && !cloudDue) {
    setSaveStatus(`Slot ${state.slot} saved on this device`);
    return;
  }
  try {
    setSaveStatus(`Saving slot ${state.slot}…`);
    lastSaved = await saveSlot(snap);
    lastCloudAt = Date.now();
    setSaveStatus(`Slot ${state.slot} saved`);
  } catch {
    setSaveStatus("Saved on this device — cloud retrying");
  }
}

function restoreFromSave(slot, save, extraNotice = "") {
  const known = new Map(questionBank.map((q) => [q.id, q]));
  const mastered = (save.mastered || []).filter((id) => known.has(id));
  let set = (save.setIds || []).map((id) => known.get(id)).filter(Boolean);
  let answers = Array.isArray(save.answers) ? save.answers : [];
  let notice = extraNotice;
  if (set.length !== SESSION_SIZE) {
    const picked = pickSet(questionBank, mastered, []);
    set = picked.set;
    answers = set.map(() => ({ selected: null, checked: false, correct: false }));
    if (picked.reset) notice = "This slot had finished the pool, so it was reset.";
  } else {
    answers = set.map((_, i) => ({
      selected: answers[i]?.selected ?? null,
      checked: Boolean(answers[i]?.checked),
      correct: Boolean(answers[i]?.correct),
    }));
  }
  const state = {
    screen: "quiz",
    slot: Number(slot),
    bank: questionBank,
    set,
    answers,
    mastered,
    studiedMs: Number(save.studiedMs) || 0,
    notice,
  };
  studyClockStart = Date.now();
  lastSaved = { ...emptySave(slot), ...save, slot: Number(slot) };
  startAutosave();
  window.scrollTo({ top: 0, behavior: "smooth" });
  render(state);
}

function render(state) {
  lastState = state;
  const phone = syncPhoneClass();
  document.documentElement.classList.toggle("login", state.screen === "gate");
  if (state.screen === "gate") {
    renderGate(state);
    return;
  }

  const checkedCount = state.answers.filter((a) => a.checked).length;
  const correctCount = state.answers.filter((a) => a.checked && a.correct).length;
  const remaining = state.bank.filter((q) => !state.mastered.includes(q.id)).length;
  const masteredN = state.mastered.length;
  const progress = Math.round((masteredN / state.bank.length) * 100);
  const sessionProgress = Math.round((checkedCount / state.set.length) * 100);
  const allChecked = checkedCount === state.set.length;
  const poolEmpty = remaining === 0;

  app.innerHTML = `
    <div class="book-bar ${hasTextbook() ? "ready" : ""}">
      <div class="book-copy">
        <strong>${hasTextbook() ? "Textbook ready" : "Load textbook PDF"}</strong>
        <span class="copy-pc">
          ${
            hasTextbook()
              ? "After you check an answer, use Open page to jump there and highlight the source."
              : "Choose your copy of The APhA Complete Review for the FPGEE (pharmacy_book.pdf). It is stored only in this browser so source links can open the page and highlight the answer."
          }
        </span>
        <span class="copy-phone">
          ${
            hasTextbook()
              ? "Check an answer, then tap Open page to highlight the source."
              : "Choose pharmacy_book.pdf on this phone. Needed only to jump to highlighted pages."
          }
        </span>
      </div>
      <div class="book-actions">
        <label class="regen" for="pdf-file">${hasTextbook() ? "Replace PDF" : "Load textbook PDF"}</label>
        <input id="pdf-file" class="file-input" type="file" accept="application/pdf,.pdf" />
        ${hasTextbook() ? `<button class="ghost" type="button" id="clear-pdf">Remove PDF</button>` : ""}
      </div>
    </div>
    <header class="masthead">
      <p class="kicker">Professional pharmacy practice quiz</p>
      <h1>${phone ? "FPGEE 20-Question Challenge" : "FPGEE Review: 20-Question Challenge"}</h1>
      <p class="lede copy-pc">
        Save slot <strong>${state.slot}</strong> syncs to every device. Progress auto-saves every 5 seconds,
        including the current 20 questions and which answers you already checked.
      </p>
      <p class="lede copy-phone">
        Slot ${state.slot} · auto-saves every 5 seconds on any device.
      </p>
      <div class="controls">
        <button class="regen" type="button" id="regen">Regenerate questions</button>
        <button class="ghost" type="button" id="change-slot">Change save slot</button>
        <span class="meta" id="save-status">${escapeHtml(saveStatus || `Slot ${state.slot}`)}</span>
      </div>
      <p class="meta">${remaining} remaining in pool · ${masteredN}/${state.bank.length} mastered · ${state.set.length} this session</p>
      ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ""}
      <div class="progress-wrap">
        <div class="progress-label">
          <span>Pool mastery ${masteredN}/${state.bank.length}</span>
          <span>Session ${checkedCount}/${state.set.length} checked · ${correctCount} correct</span>
        </div>
        <div class="bar"><span style="width:${progress}%"></span></div>
        <div class="bar session"><span style="width:${sessionProgress}%"></span></div>
      </div>
    </header>

    ${state.set
      .map((q, i) => {
        const ans = state.answers[i];
        return `
        <article class="card" data-index="${i}">
          <div class="q-top">
            <span class="q-num">Question ${i + 1} of ${state.set.length}</span>
            <span class="chapter">${escapeHtml(q.chapter || "")}</span>
          </div>
          <p class="question">${escapeHtml(q.question)}</p>
          <div class="choices">
            ${q.choices
              .map((c) => {
                let cls = "choice";
                if (ans.selected === c.id) cls += " selected";
                if (ans.checked && c.id === q.correct) cls += " correct";
                if (ans.checked && ans.selected === c.id && c.id !== q.correct) cls += " incorrect";
                return `
                  <button class="${cls}" type="button" data-choice="${c.id}" ${ans.checked ? "disabled" : ""}>
                    <span class="letter">${c.id}</span>
                    <span>${escapeHtml(c.text)}</span>
                  </button>`;
              })
              .join("")}
          </div>
          <button class="check" type="button" data-check="${i}" ${ans.selected && !ans.checked ? "" : "disabled"}>
            Check answer
          </button>
          ${ans.checked ? revealHtml(q, i, ans) : ""}
        </article>`;
      })
      .join("")}

    ${
      allChecked
        ? `<section class="score">
            <h2>${poolEmpty ? "Pool complete" : "Session complete"}</h2>
            <p>This round: <strong>${correctCount} of ${state.set.length}</strong> correct.
            ${
              poolEmpty
                ? "You have answered every question in the pool correctly. Regenerating will reset the pool."
                : `Mastered items stay out of the pool. Missed items were shuffled back. <strong>${remaining}</strong> remain.`
            }</p>
          </section>`
        : ""
    }

    <p class="footnote">
      Original study questions with page citations to <em>The APhA Complete Review for the FPGEE</em>, 2nd Edition.
      This site does not reproduce or host the textbook. Load your legal copy to jump to the highlighted source page.
    </p>
  `;

  bindQuiz(state);
}

function masteredCount(save) {
  return Array.isArray(save?.mastered) ? save.mastered.length : 0;
}

function saveStatsHtml(save) {
  if (!isValidSave(save)) {
    return "Empty";
  }
  return `Time spent studying: ${formatStudyTime(save.studiedMs)}<br />Last saved: ${formatLastSaved(save.updatedAt)}<br />Mastered: ${masteredCount(save)}/1000`;
}

function slotPreview(info) {
  const local = isValidSave(info?.local) ? `${formatStudyTime(info.local.studiedMs)} · ${formatLastSaved(info.local.updatedAt)}` : "Empty";
  const cloud = !info?.cloudOk
    ? "Unavailable"
    : isValidSave(info?.cloud)
      ? `${formatStudyTime(info.cloud.studiedMs)} · ${formatLastSaved(info.cloud.updatedAt)}`
      : "Empty";
  return `This device: ${local}<br />Cloud: ${cloud}`;
}

function renderGate(state) {
  const slots = state.slots || [];
  const bg = `${import.meta.env.BASE_URL}login-bg.png`;
  const pick = Number(state.pickSlot) || 0;
  const picked = pick ? slots.find((s) => Number(s.slot) === pick) : null;
  const localOk = isValidSave(picked?.local);
  const cloudOk = Boolean(picked?.cloudOk) && isValidSave(picked?.cloud);
  const choices = [];
  if (pick && localOk) {
    choices.push(`
      <div class="save-block">
        <button class="save-slot" type="button" data-source="local">This device</button>
        <p class="save-tip">${saveStatsHtml(picked.local)}</p>
      </div>`);
  }
  if (pick && cloudOk) {
    choices.push(`
      <div class="save-block">
        <button class="save-slot" type="button" data-source="cloud">Cloud</button>
        <p class="save-tip">${saveStatsHtml(picked.cloud)}</p>
      </div>`);
  }
  if (pick && !localOk && !cloudOk) {
    choices.push(`
      <div class="save-block">
        <button class="save-slot" type="button" data-source="new">Start new game</button>
        <p class="save-tip">No save in this slot yet.</p>
      </div>`);
  }

  app.innerHTML = `
    <div class="login-wrap" style="background-image:url('${bg}')">
      <div class="login-veil"></div>
      <div class="login-panel">
        <p class="kicker">FPGEE review</p>
        <h1>${pick ? `Save Slot ${pick}` : "Load Game"}</h1>
        ${
          pick
            ? `<p class="lede login-copy">Choose which save to use.</p>`
            : ""
        }
        ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ""}
        ${
          pick && picked && !picked.cloudOk
            ? `<p class="save-tip cloud-warn">Cloud is unreachable right now${localOk ? ", so only the save on this device is listed" : ""}.</p>`
            : ""
        }
        <div class="save-list">
          ${
            pick
              ? `${choices.join("")}
                <button class="ghost" type="button" id="back-slots">Back</button>`
              : [1, 2, 3]
                  .map((n) => {
                    const info = slots.find((s) => Number(s.slot) === n) || {
                      slot: n,
                      local: emptySave(n),
                      cloud: null,
                      cloudOk: false,
                    };
                    return `
                      <div class="save-block">
                        <button class="save-slot" type="button" data-slot="${n}">Save Slot ${n}</button>
                        <p class="save-tip">${slotPreview(info)}</p>
                      </div>`;
                  })
                  .join("")
          }
        </div>
      </div>
    </div>
  `;

  const back = document.getElementById("back-slots");
  if (back) {
    back.addEventListener("click", () => {
      render({ ...state, pickSlot: 0, notice: "" });
    });
  }

  app.querySelectorAll("[data-slot]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slot = Number(btn.dataset.slot);
      btn.disabled = true;
      const title = app.querySelector(".login-panel h1");
      if (title) title.textContent = `Checking slot ${slot}…`;
      try {
        const cloud = await peekCloudSlot(slot);
        const nextSlots = (state.slots || []).map((row) =>
          Number(row.slot) === slot ? { ...row, cloud, cloudOk: true } : row
        );
        render({ ...state, slots: nextSlots, pickSlot: slot, notice: "" });
      } catch {
        const nextSlots = (state.slots || []).map((row) =>
          Number(row.slot) === slot ? { ...row, cloud: null, cloudOk: false } : row
        );
        render({ ...state, slots: nextSlots, pickSlot: slot, notice: "" });
      }
    });
  });

  app.querySelectorAll("[data-source]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const source = btn.dataset.source;
      btn.disabled = true;
      const title = app.querySelector(".login-panel h1");
      if (title) title.textContent = `Loading slot ${pick}…`;
      try {
        const save = await loadSlot(pick, source);
        const label =
          source === "cloud" ? "cloud save" : source === "local" ? "save on this device" : "new game";
        restoreFromSave(pick, save, `Loaded slot ${pick} from ${label}.`);
        void flushSave(lastState, true);
      } catch {
        restoreFromSave(
          pick,
          source === "local" ? picked?.local || emptySave(pick) : emptySave(pick),
          `Started save slot ${pick} from this device.`
        );
      }
    });
  });
}

function bindQuiz(state) {
  document.getElementById("regen").addEventListener("click", () => {
    const { set, reset } = pickSet(state.bank, state.mastered, state.set.map((q) => q.id));
    state.set = set;
    state.answers = set.map(() => ({ selected: null, checked: false, correct: false }));
    state.notice = reset
      ? "Every question had been answered correctly. The pool is reset and a new random 20 is ready."
      : "";
    render(state);
    void flushSave(state, true);
  });

  document.getElementById("change-slot").addEventListener("click", async () => {
    await flushSave(state, true);
    stopAutosave();
    await showGate("Saved slot " + state.slot + ". Pick a number to continue.");
  });

  const fileInput = document.getElementById("pdf-file");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    await savePdfBlob(file);
    await loadTextbookFromBlob(file);
    state.notice = "Textbook loaded in this browser. Source links open the cited page and highlight the passage.";
    render(state);
  });

  const clearBtn = document.getElementById("clear-pdf");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      await clearPdfBlob();
      unloadTextbook();
      state.notice = "Textbook removed from this browser.";
      render(state);
    });
  }

  app.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".card");
      const index = Number(card.dataset.index);
      if (state.answers[index].checked) return;
      state.answers[index].selected = btn.dataset.choice;
      render(state);
      void flushSave(state, true);
      const next = app.querySelector(`[data-index="${index}"]`);
      if (next) next.scrollIntoView({ block: "nearest" });
    });
  });

  app.querySelectorAll("[data-check]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.check);
      const q = state.set[index];
      const ans = state.answers[index];
      if (!ans.selected || ans.checked) return;
      ans.checked = true;
      ans.correct = ans.selected === q.correct;
      if (ans.correct && !state.mastered.includes(q.id)) {
        state.mastered.push(q.id);
      }
      render(state);
      void flushSave(state, true);
      const next = app.querySelector(`[data-index="${index}"]`);
      if (next) next.scrollIntoView({ block: "nearest" });
    });
  });

  app.querySelectorAll("[data-source]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const index = Number(btn.dataset.source);
      const q = state.set[index];
      try {
        if (!hasTextbook()) {
          fileInput.click();
          state.notice = "Select your FPGEE review PDF. After it loads, tap the source link again.";
          render(state);
          return;
        }
        await openSourcePage({
          pdfPage: q.pdfPage,
          page: q.page,
          quote: q.sourceQuote,
          chapter: q.chapter,
        });
      } catch {
        state.notice = "Could not open that page. Load the matching textbook PDF and try again.";
        render(state);
      }
    });
  });
}

function revealHtml(q, index, ans) {
  const wrongIds = q.choices.map((c) => c.id).filter((id) => id !== q.correct);
  const wrongList = wrongIds
    .map((id) => {
      const text = q.explanationWrong?.[id] || "This option does not match the cited material.";
      return `<li><strong>${id}.</strong> ${escapeHtml(text)}</li>`;
    })
    .join("");
  const result = ans.correct
    ? `Correct. The answer is ${q.correct}. This item is removed from the pool until every question is mastered.`
    : `Incorrect. You selected ${ans.selected}; the correct answer is ${q.correct}. This item is shuffled back into the pool.`;
  return `
    <div class="reveal">
      <button class="cite-link" type="button" data-source="${index}">Open page ${q.page} and highlight source</button>
      <p class="cite">See page ${q.page}${q.chapter ? ` · ${escapeHtml(q.chapter)}` : ""}</p>
      <p class="why"><strong>${result}</strong> ${escapeHtml(q.explanationCorrect)}</p>
      <ul class="why-wrong">${wrongList}</ul>
    </div>
  `;
}

async function showGate(notice = "") {
  stopAutosave();
  let slots = [1, 2, 3].map((n) => ({
    slot: n,
    local: readLocalSlot(n),
    cloud: null,
    cloudOk: false,
  }));
  try {
    slots = await inspectSlots();
  } catch {
    /* keep local-only summaries */
  }
  render({ screen: "gate", slots, pickSlot: 0, notice });
}

async function boot() {
  app.innerHTML = `<header class="masthead"><h1>Loading…</h1></header>`;
  const url = `${import.meta.env.BASE_URL}questions.json`;
  const res = await fetch(url);
  if (!res.ok) {
    app.innerHTML = `<header class="masthead"><h1>Could not load questions.</h1><p class="lede">Failed to fetch ${url}</p></header>`;
    return;
  }
  questionBank = await res.json();
  for (const q of questionBank) {
    if (!q.pdfPage) q.pdfPage = Number(q.page) + 1;
    if (!q.sourceQuote) q.sourceQuote = "";
  }
  try {
    const blob = await loadPdfBlob();
    if (blob) await loadTextbookFromBlob(blob);
  } catch {
    /* ignore stale pdf */
  }
  await showGate();
}

boot();
