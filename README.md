# FPGEE Pharmacy Review Quiz

Static web quiz: 20 randomly selected professional-level multiple-choice questions drawn from a bank synthesized from *The APhA Complete Review for the FPGEE*, 2nd Edition.

The copyrighted textbook PDF is **not** included or hosted. Questions are original paraphrases with page citations.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Deploy (GitHub Pages)

```bash
npm run build
npx gh-pages -d dist
```

Vite `base` is set to `/pharmacy-quiz/` to match the GitHub Pages project URL.

## Regenerating the question bank

`build_questions.py` writes `public/questions.json`. Do not commit `_extract.json` or the PDF.
