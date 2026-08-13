import "./style.css";
import { loadMastery, saveMastery, savePdfBlob, loadPdfBlob, clearPdfBlob } from "./storage.js";
import { hasTextbook, loadTextbookFromBlob, openSourcePage, unloadTextbook } from "./pdfViewer.js";

const SESSION_SIZE = 20;
const app = document.querySelector("#app");

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
    saveMastery(mastered);
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

let lastState = null;

function render(state) {
  lastState = state;
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
        <strong>${hasTextbook() ? "Textbook ready in this browser" : "Load textbook PDF"}</strong>
        <span>${
          hasTextbook()
            ? "After you check an answer, use Open page to jump there and highlight the source."
            : "Choose your copy of The APhA Complete Review for the FPGEE (pharmacy_book.pdf). It is stored only in this browser so source links can open the page and highlight the answer."
        }</span>
      </div>
      <div class="book-actions">
        <label class="regen" for="pdf-file">${hasTextbook() ? "Replace PDF" : "Load textbook PDF"}</label>
        <input id="pdf-file" class="file-input" type="file" accept="application/pdf,.pdf" />
        ${hasTextbook() ? `<button class="ghost" type="button" id="clear-pdf">Remove PDF</button>` : ""}
      </div>
    </div>
    <header class="masthead">
      <p class="kicker">Professional pharmacy practice quiz</p>
      <h1>FPGEE Review: 20-Question Challenge</h1>
      <p class="lede">
        A pool of <strong>${state.bank.length}</strong> unique items covers the full textbook.
        Each session draws 20 at random from questions you have not yet answered correctly.
        Correct items leave the pool until every question is mastered; missed items are shuffled back in.
      </p>
      <div class="controls">
        <button class="regen" type="button" id="regen">Regenerate questions</button>
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
        saveMastery(state.mastered);
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

function startSession(bank, mastered, excludeIds = []) {
  const { set, reset } = pickSet(bank, mastered, excludeIds);
  const answers = set.map(() => ({ selected: null, checked: false, correct: false }));
  window.scrollTo({ top: 0, behavior: "smooth" });
  render({
    bank,
    set,
    answers,
    mastered,
    notice: reset
      ? "Every question had been answered correctly. The pool is reset and a new random 20 is ready."
      : "",
  });
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
  const { mastered } = loadMastery();
  const known = new Set(bank.map((q) => q.id));
  const filtered = mastered.filter((id) => known.has(id));
  startSession(bank, filtered);
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
