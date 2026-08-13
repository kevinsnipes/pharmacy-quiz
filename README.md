# FPGEE Pharmacy Review Quiz

Static web quiz from *The APhA Complete Review for the FPGEE*, 2nd Edition.

- 1000 unique multiple-choice items covering the full book
- Each visit/session draws 20 from the **unmastered** pool
- **Check answer** shows the correct choice, why distractors are wrong, and a source link
- Correct items leave the pool until all 1000 are mastered, then the pool resets
- Incorrect items are shuffled back into the pool
- **Regenerate questions** draws a new random 20 from remaining unmastered items
- Load your own copy of the textbook PDF (once per browser). Source links then open that page and highlight the answer passage

The copyrighted textbook is **not** included or hosted. Questions are original paraphrases with page citations.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npx gh-pages -d dist
```

Vite `base` is `/pharmacy-quiz/` for GitHub Pages.

## Regenerating the question bank

Passage packs: `python extract_passages.py` (needs the local PDF; writes gitignored `_packs/`).
Merge generated `out_*.json` files: `python merge_questions.py`.
Do not commit `_extract.json`, `_packs/`, or the PDF.
