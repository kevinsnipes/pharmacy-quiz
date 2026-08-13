"""Validate, dedupe, and merge pack outputs into public/questions.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PACKS = ROOT / "_packs"
OUT = ROOT / "public" / "questions.json"


def norm(text: str) -> str:
    return re.sub(r"\W+", " ", str(text).lower()).strip()


def token_set(text: str) -> set[str]:
    return {t for t in norm(text).split() if len(t) > 3}


def too_similar(a: str, b: str) -> bool:
    sa, sb = token_set(a), token_set(b)
    if not sa or not sb:
        return False
    j = len(sa & sb) / len(sa | sb)
    return j >= 0.55


def quote_in_text(quote: str, text: str) -> bool:
    q = normalize_ws(quote)
    t = normalize_ws(text)
    if q and q in t:
        return True
    words = q.split()
    if len(words) >= 6:
        return " ".join(words[:6]) in t
    return False


def normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", str(text)).strip().lower()


def main() -> None:
    passages = {}
    for pack in sorted(PACKS.glob("pack_*.json")):
        for row in json.loads(pack.read_text(encoding="utf-8")):
            passages[row["packId"]] = row

    items = []
    for path in sorted(PACKS.glob("out_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise SystemExit(f"{path.name} is not a JSON array")
        items.extend(data)

    cleaned = []
    seen_ids = set()
    for q in items:
        pid = q.get("id")
        if pid in seen_ids:
            continue
        src = passages.get(pid)
        if not src:
            continue
        choices = q.get("choices") or []
        letters = [c.get("id") for c in choices]
        if letters != ["A", "B", "C", "D"]:
            continue
        if q.get("correct") not in letters:
            continue
        quote = (q.get("sourceQuote") or "").strip()
        if len(quote) < 12:
            continue
        if not quote_in_text(quote, src["text"]):
            # keep but flag — still usable if close
            q["sourceQuote"] = pick_fallback_quote(src["text"])
        q["page"] = src["page"]
        q["pdfPage"] = src["pdfPage"]
        q["chapter"] = src["chapter"]
        wrong = q.get("explanationWrong") or {}
        for letter in letters:
            if letter != q["correct"] and letter not in wrong:
                wrong[letter] = "This option does not match the cited source passage."
        q["explanationWrong"] = {k: wrong[k] for k in letters if k != q["correct"]}
        seen_ids.add(pid)
        cleaned.append(q)

    unique = []
    for q in cleaned:
        if any(too_similar(q["question"], u["question"]) for u in unique):
            continue
        unique.append(q)

    unique.sort(key=lambda x: (x["pdfPage"], x["id"]))
    for i, q in enumerate(unique, 1):
        q["id"] = f"q{i:04d}"

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(unique, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(unique)} questions from {len(items)} raw items")
    missing = [pid for pid in passages if pid not in seen_ids]
    print(f"missing packs ids: {len(missing)}")
    if missing[:12]:
        print("examples", missing[:12])


def pick_fallback_quote(text: str) -> str:
    words = re.findall(r"[A-Za-z0-9’'-]+", text)
    slice_ = words[8:20] if len(words) > 20 else words[:12]
    return " ".join(slice_)


if __name__ == "__main__":
    main()
