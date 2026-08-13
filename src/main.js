import "./style.css";

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

function pickSet(bank) {
  return shuffle(bank).slice(0, SESSION_SIZE);
}

function render(state) {
  const checkedCount = state.answers.filter((a) => a.checked).length;
  const correctCount = state.answers.filter((a) => a.checked && a.correct).length;
  const progress = Math.round((checkedCount / SESSION_SIZE) * 100);
  const allChecked = checkedCount === SESSION_SIZE;

  app.innerHTML = `
    <header class="masthead">
      <p class="kicker">Professional pharmacy practice quiz</p>
      <h1>FPGEE Review: 20-Question Challenge</h1>
      <p class="lede">
        Each visit draws 20 multiple-choice items at random from a bank of ${state.bank.length}
        original questions synthesized from <em>The APhA Complete Review for the FPGEE</em>,
        2nd Edition. Check any item as you go; citations point to the source page in the book.
        The textbook itself is not hosted here.
      </p>
      <div class="controls">
        <button class="regen" type="button" id="regen">Regenerate questions</button>
        <span class="meta">${state.bank.length} questions in bank · ${SESSION_SIZE} per session</span>
      </div>
      <div class="progress-wrap">
        <div class="progress-label">
          <span>${checkedCount}/${SESSION_SIZE} checked</span>
          <span>${correctCount} correct so far</span>
        </div>
        <div class="bar"><span style="width:${progress}%"></span></div>
      </div>
    </header>

    ${state.set
      .map((q, i) => {
        const ans = state.answers[i];
        const disabled = ans.checked ? "disabled" : "";
        return `
        <article class="card" data-index="${i}">
          <div class="q-top">
            <span class="q-num">Question ${i + 1} of ${SESSION_SIZE}</span>
            <span class="chapter">${q.chapter || ""}</span>
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
          ${ans.checked ? revealHtml(q, ans) : ""}
        </article>`;
      })
      .join("")}

    ${
      allChecked
        ? `<section class="score">
            <h2>Session complete</h2>
            <p>You answered <strong>${correctCount} of ${SESSION_SIZE}</strong> correctly (${Math.round(
              (correctCount / SESSION_SIZE) * 100
            )}%). Use <strong>Regenerate questions</strong> for a new random set.</p>
          </section>`
        : ""
    }

    <p class="footnote">
      Original questions and explanations for study practice. Page citations refer to
      <em>The APhA Complete Review for the FPGEE</em>, 2nd Edition. This site does not
      reproduce the textbook. If you own the PDF locally, look up the cited page there.
    </p>
  `;

  document.getElementById("regen").addEventListener("click", () => {
    startSession(state.bank);
  });

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
      render(state);
      const next = app.querySelector(`[data-index="${index}"]`);
      if (next) next.scrollIntoView({ block: "nearest" });
    });
  });
}

function revealHtml(q, ans) {
  const wrongIds = q.choices.map((c) => c.id).filter((id) => id !== q.correct);
  const wrongList = wrongIds
    .map((id) => {
      const text = q.explanationWrong?.[id] || "This option does not match the cited material.";
      return `<li><strong>${id}.</strong> ${escapeHtml(text)}</li>`;
    })
    .join("");
  const result = ans.correct
    ? `Correct. The answer is ${q.correct}.`
    : `Incorrect. You selected ${ans.selected}; the correct answer is ${q.correct}.`;
  return `
    <div class="reveal">
      <p class="cite">See page ${q.page}${q.chapter ? ` · ${escapeHtml(q.chapter)}` : ""}</p>
      <p class="why"><strong>${result}</strong> ${escapeHtml(q.explanationCorrect)}</p>
      <ul class="why-wrong">${wrongList}</ul>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function startSession(bank) {
  const set = pickSet(bank);
  const answers = set.map(() => ({ selected: null, checked: false, correct: false }));
  window.scrollTo({ top: 0, behavior: "smooth" });
  render({ bank, set, answers });
}

async function boot() {
  app.innerHTML = `<header class="masthead"><h1>Loading question bank…</h1></header>`;
  const url = `${import.meta.env.BASE_URL}questions.json`;
  const res = await fetch(url);
  if (!res.ok) {
    app.innerHTML = `<header class="masthead"><h1>Could not load questions.</h1><p class="lede">Failed to fetch ${url}</p></header>`;
    return;
  }
  const bank = await res.json();
  startSession(bank);
}

boot();
