import "./style.css";
import { loadMastery, saveMastery, savePdfBlob, loadPdfBlob, clearPdfBlob } from "./storage.js";
import { hasTextbook, loadTextbookFromBlob, openSourcePage, unloadTextbook } from "./pdfViewer.js";
import {
  loadStudy,
  saveStudy,
  makeStudyId,
  unionIds,
  parseIncoming,
  resumeUrl,
  writeUrl,
} from "./progress.js";

const SESSION_SIZE = 20;
const app = document.querySelector("#app");

let phoneMode = false;
let lastState = null;

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
  if (next !== phoneMode && lastState) {
    render(lastState);
  } else {
    syncPhoneClass();
  }
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

function persist(state) {
  try {
    const id = saveStudy(state.studyId, state.mastered);
    state.studyId = id;
    saveMastery(state.mastered);
    writeUrl(id, state.mastered);
  } catch {
    state.notice = state.notice || "Could not save locally. Copy the continue link so you do not lose progress.";
  }
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

function render(state) {
  lastState = state;
  const phone = syncPhoneClass();
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
        A pool of <strong>${state.bank.length}</strong> unique items covers the full textbook.
        Each session draws 20 at random from questions you have not yet answered correctly.
        Correct items leave the pool until every question is mastered; missed items are shuffled back in.
      </p>
      <p class="lede copy-phone">
        20 random items from ${state.bank.length}. Correct answers leave the pool; misses go back in.
      </p>
      <div class="controls">
        <button class="regen" type="button" id="regen">Regenerate questions</button>
      </div>
      <div class="study-bar">
        <div>
          <p class="study-label">Your study ID (no password)</p>
          <p class="study-id" id="study-id">${escapeHtml(state.studyId || "")}</p>
          <p class="study-help copy-pc">Same ID + continue link restores progress on your phone. The textbook PDF is still loaded once per device.</p>
          <p class="study-help copy-phone">Paste a continue link from your computer, or copy this device’s link to keep progress.</p>
        </div>
        <div class="study-actions">
          <button class="ghost" type="button" id="copy-link">Copy continue link</button>
          <button class="ghost" type="button" id="toggle-qr">Phone QR</button>
        </div>
        <form class="study-form" id="study-form">
          <label for="study-input">Continue on this device</label>
          <div class="study-row">
            <input id="study-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Paste study ID or continue link" />
            <button class="regen" type="submit">Continue</button>
          </div>
        </form>
        <div class="qr-wrap ${state.showQr ? "" : "hidden"}" id="qr-wrap">
          <img alt="QR code to continue this quiz on another device" width="180" height="180" src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(resumeUrl(state.studyId, state.mastered))}" />
          <p>Scan with your phone camera.</p>
        </div>
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

  bind(state);
}

function bind(state) {
  document.getElementById("regen").addEventListener("click", () => {
    startSession(state.bank, state.mastered, state.set.map((q) => q.id));
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
        persist(state);
      }
      render(state);
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
          state.notice = "Select your FPGEE review PDF. After it loads, click the source link again to jump to the highlighted page.";
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

  document.getElementById("copy-link").addEventListener("click", async () => {
    const link = resumeUrl(state.studyId, state.mastered);
    try {
      await navigator.clipboard.writeText(link);
      state.notice = "Continue link copied. Open it on your phone to keep this progress.";
    } catch {
      state.notice = `Copy this link: ${link}`;
    }
    render(state);
  });

  document.getElementById("toggle-qr").addEventListener("click", () => {
    state.showQr = !state.showQr;
    render(state);
  });

  document.getElementById("study-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const incoming = parseIncoming(document.getElementById("study-input").value);
    const studyId = incoming.studyId || state.studyId;
    if (incoming.mastered.length) {
      state.mastered = unionIds(state.mastered, incoming.mastered);
    }
    state.studyId = studyId;
    persist(state);
    startSession(
      state.bank,
      state.mastered,
      state.set.map((q) => q.id),
      studyId,
      incoming.mastered.length
        ? "Progress loaded. Correct answers from that link are in your pool."
        : "Study ID saved on this device. Paste the full continue link to restore answers from another device."
    );
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

function startSession(bank, mastered, excludeIds = [], studyId = lastState?.studyId, extraNotice = "") {
  const { set, reset } = pickSet(bank, mastered, excludeIds);
  const answers = set.map(() => ({ selected: null, checked: false, correct: false }));
  const state = {
    bank,
    set,
    answers,
    mastered,
    studyId: studyId || makeStudyId(),
    showQr: Boolean(lastState?.showQr),
    notice: reset
      ? "Every question had been answered correctly. The pool is reset and a new random 20 is ready."
      : extraNotice,
  };
  persist(state);
  window.scrollTo({ top: 0, behavior: "smooth" });
  render(state);
}

async function boot() {
  app.innerHTML = `<header class="masthead"><h1>Loading question pool…</h1></header>`;
  const url = `${import.meta.env.BASE_URL}questions.json`;
  const res = await fetch(url);
  if (!res.ok) {
    app.innerHTML = `<header class="masthead"><h1>Could not load questions.</h1><p class="lede">Failed to fetch ${url}</p></header>`;
    return;
  }
  const bank = await res.json();
  for (const q of bank) {
    if (!q.pdfPage) q.pdfPage = Number(q.page) + 1;
    if (!q.sourceQuote) q.sourceQuote = "";
  }
  const known = new Set(bank.map((q) => q.id));
  const incoming = parseIncoming(window.location.href);
  const local = loadStudy();
  const legacy = loadMastery();
  const studyId = incoming.studyId || local.studyId || makeStudyId();
  const mastered = unionIds(incoming.mastered, local.mastered, legacy.mastered).filter((id) => known.has(id));
  startSession(bank, mastered, [], studyId);
  try {
    const blob = await loadPdfBlob();
    if (blob) {
      await loadTextbookFromBlob(blob);
      if (lastState) render(lastState);
    }
  } catch {
    /* ignore stale pdf */
  }
}

boot();
