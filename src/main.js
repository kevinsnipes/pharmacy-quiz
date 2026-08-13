import "./style.css";
import { savePdfBlob, loadPdfBlob, clearPdfBlob } from "./storage.js";
import { hasTextbook, loadTextbookFromBlob, openSourcePage, unloadTextbook } from "./pdfViewer.js";
import { listSlots, loadSlot, saveSlot, snapshotFromState, sameSnapshot, emptySave } from "./saves.js";

const SESSION_SIZE = 20;
const app = document.querySelector("#app");

let phoneMode = false;
let lastState = null;
let questionBank = [];
let saveTimer = null;
let lastSaved = null;
let saveStatus = "";

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
window.addEventListener("orientationchange", () => {
  if (lastState) render(lastState);
  else syncPhoneClass();
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

function formatSavedAt(ts) {
  if (!ts) return "Empty";
  const delta = Date.now() - ts;
  if (delta < 60_000) return "Saved just now";
  if (delta < 3_600_000) return `Saved ${Math.floor(delta / 60_000)} min ago`;
  if (delta < 86_400_000) return `Saved ${Math.floor(delta / 3_600_000)} hr ago`;
  return `Saved ${new Date(ts).toLocaleDateString()}`;
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
  const snap = snapshotFromState(state);
  if (!force && sameSnapshot(snap, lastSaved)) return;
  try {
    setSaveStatus(`Saving slot ${state.slot}…`);
    lastSaved = await saveSlot(snap);
    setSaveStatus(`Slot ${state.slot} saved`);
  } catch {
    setSaveStatus("Cloud save failed — kept on this device, retrying");
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
    notice,
  };
  lastSaved = { ...emptySave(slot), ...save, slot: Number(slot) };
  startAutosave();
  window.scrollTo({ top: 0, behavior: "smooth" });
  render(state);
}

function render(state) {
  lastState = state;
  const phone = syncPhoneClass();
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

function renderGate(state) {
  const slots = state.slots || [];
  app.innerHTML = `
    <header class="masthead slot-screen">
      <p class="kicker">FPGEE review quiz</p>
      <h1>Choose a save slot</h1>
      <p class="lede">
        Enter <strong>1–9</strong>. That number is your save file on every device — phone, computer, anywhere.
        Pool progress, the current 20 questions, and checked answers all restore. Auto-save runs every 5 seconds.
      </p>
      ${state.notice ? `<p class="notice">${escapeHtml(state.notice)}</p>` : ""}
      <div class="slot-grid">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9]
          .map((n) => {
            const info = slots.find((s) => Number(s.slot) === n) || emptySave(n);
            const mastered = Array.isArray(info.mastered) ? info.mastered.length : 0;
            const used = Boolean(info.updatedAt) || mastered > 0 || (info.setIds || []).length > 0;
            return `
              <button class="slot-btn ${used ? "used" : ""}" type="button" data-slot="${n}">
                <span class="slot-num">${n}</span>
                <span class="slot-meta">${used ? `${mastered} mastered` : "Empty"}</span>
                <span class="slot-meta">${used ? formatSavedAt(info.updatedAt) : "Tap to start"}</span>
              </button>`;
          })
          .join("")}
      </div>
      <p class="footnote">The textbook PDF is still loaded once per device. Quiz progress is what syncs with the slot number.</p>
    </header>
  `;

  app.querySelectorAll("[data-slot]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slot = Number(btn.dataset.slot);
      btn.disabled = true;
      app.querySelector(".lede").textContent = `Loading slot ${slot}…`;
      try {
        const save = await loadSlot(slot);
        restoreFromSave(slot, save, `Loaded save slot ${slot}.`);
        void flushSave(lastState, true);
      } catch {
        restoreFromSave(slot, emptySave(slot), `Started save slot ${slot} (cloud unreachable; will keep retrying).`);
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
  let slots = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => emptySave(n));
  try {
    slots = await listSlots();
  } catch {
    /* empty summaries */
  }
  render({ screen: "gate", slots, notice });
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
