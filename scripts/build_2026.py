#!/usr/bin/env python3
"""Build data/2026.json (Placement '26, batch 2K22) from the community sheet.

The 2026 season is finished, so its data is frozen into a JSON file instead of
being read live. To rebuild it, download "Placement'26 Unoff Stats" as .xlsx
(File -> Download -> Microsoft Excel) and run:

    pip install openpyxl
    python3 scripts/build_2026.py "Placement'26 Unoff Stats.xlsx" data/2026.json

Sheets used:
  * "Detailed DATA"         one row per offer (roll, name, CGPA, company, role,
                            duration, stipend, CTC text, type, branch)
  * "Sheet7"                same rows with a cleaned numeric CTC column
  * "CGPA - DATA (6th SEM)" whole-batch CGPA list. Only aggregates (students
                            per branch and per CGPA band) are written out, so
                            CGPAs of students without offers are never published.
"""

import json
import re
import sys
from collections import Counter

import openpyxl

UPDATED_ON = "14 Feb 2026, 18:00"
BATCH_YEAR = "22"

CGPA_BANDS = [
    (">= 9.5", 9.5, None),
    ("9.0 - 9.5", 9.0, 9.5),
    ("8.5 - 9.0", 8.5, 9.0),
    ("8.0 - 8.5", 8.0, 8.5),
    ("7.5 - 8.0", 7.5, 8.0),
    ("7.0 - 7.5", 7.0, 7.5),
    ("6.5 - 7.0", 6.5, 7.0),
    ("< 6.5", None, 6.5),
]

# Obvious spelling / duplicate-entity variants in the 2026 sheet.
COMPANY_ALIASES = {
    "texas instrumetns": "Texas Instruments",
    "msil (maruti suzuki)": "Maruti Suzuki",
    "zs associates (jaipur)": "ZS Associates",
    "hcl hack fte": "HCL",
    "hcl tech": "HCL",
    "schneider": "Schneider Electric",
}


def rows(wb, name):
    out = []
    for r in wb[name].iter_rows(values_only=True):
        if any(c not in (None, "") for c in r):
            out.append(list(r) + [None] * 20)
    return out


def text(v):
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return re.sub(r"\s+", " ", str(v)).strip()


def num(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v).replace(",", ""))
    return float(m.group()) if m else None


def roll_key(roll, name):
    r = text(roll).upper().replace(" ", "")
    m = re.match(r"^(?:2K)?(\d{2})/([A-Z&]+)/0*(\d+)$", r)
    if m:
        return f"{m.group(1)}/{m.group(2)}/{int(m.group(3))}"
    return "name:" + text(name).lower()


def clean_roll(roll):
    r = text(roll).upper().replace(" ", "")
    return "" if r in ("", "NONE", "#N/A") else r


def parse_ctc_text(t):
    """Best-effort numeric CTC (LPA) from free text such as '23.5 lpa (14 base)'."""
    if not t:
        return None
    s = t.lower().replace(",", "")
    m = re.search(r"\d+(?:\.\d+)?", s)
    if not m:
        return None
    v = float(m.group())
    if v >= 100000:  # plain rupees, e.g. 4007110
        v = v / 100000
    return round(v, 2)


def parse_base(t):
    if not t:
        return None
    s = t.lower().replace(",", "")
    m = re.search(r"base\s*[:\-]?\s*(\d+(?:\.\d+)?)", s) or re.search(
        r"(\d+(?:\.\d+)?)\s*(?:lpa|l|lakh)?\s*(?:fixed|base)", s
    )
    return float(m.group(1)) if m else None


def parse_stipend_k(v):
    """Monthly stipend in thousands from '70k', '1.2 lakh', '35k/45k', 75000 ..."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v) / 1000 if v >= 1000 else float(v)
    s = str(v).lower().replace(",", "").replace("₹", "")
    m = re.search(r"(\d+(?:\.\d+)?)\s*(k|lakh|l\b)?", s)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2)
    if unit in ("lakh", "l"):
        return val * 100
    if unit == "k":
        return val
    return val / 1000 if val >= 1000 else val


def norm_offer(v):
    s = text(v).upper().replace(" ", "")
    if not s or "LPA" in s or s.startswith("#"):
        return ""
    return " + ".join(p for p in s.split("+") if p)


def norm_cat(v):
    s = re.sub(r"[^a-z]", "", text(v).lower())
    return {"tech": "Tech", "nontech": "Non Tech", "core": "Core"}.get(s, "Unknown")


def norm_company(v):
    s = text(v)
    return COMPANY_ALIASES.get(s.lower(), s)


def main(src, dst):
    wb = openpyxl.load_workbook(src, data_only=True, read_only=True)

    detailed = rows(wb, "Detailed DATA")[1:]
    sheet7 = rows(wb, "Sheet7")[1:]

    # Numeric CTC from Sheet7, matched on (student, company, role), falling
    # back to (student, company) because Sheet7 leaves many roles blank.
    ctc_lookup = {}
    for r in sheet7:
        if isinstance(r[11], (int, float)):
            student, comp = roll_key(r[0], r[1]), text(r[3]).lower()
            ctc_lookup.setdefault((student, comp, text(r[4]).lower()), float(r[11]))
            ctc_lookup.setdefault((student, comp, None), float(r[11]))

    offers, seen = [], set()
    dupes = unmatched = 0
    for r in detailed:
        roll, name, cgpa, company, role, duration, stipend, ctc, _count, cat, branch = r[:11]
        company = norm_company(company)
        if not company or company.lower() == "none" or not text(name):
            continue
        key = roll_key(roll, name)
        dedupe = (key, company.lower(), text(role).lower(), norm_offer(duration))
        if dedupe in seen:
            dupes += 1
            continue
        seen.add(dedupe)

        ctc_text = text(ctc)
        raw_company = text(r[3]).lower()
        ctc_num = ctc_lookup.get((key, raw_company, text(role).lower()))
        if ctc_num is None:
            ctc_num = ctc_lookup.get((key, raw_company, None))
        if ctc_num is None:
            unmatched += 1
            ctc_num = parse_ctc_text(ctc_text)
        cg = num(cgpa)
        br = text(branch).upper()
        if not br:
            m = re.match(r"^(?:2K)?(\d{2})/([A-Z]+)/", clean_roll(roll))
            br = m.group(2) if m and m.group(1) == BATCH_YEAR else "MISC"

        offers.append({
            "roll": clean_roll(roll),
            "name": text(name),
            "cgpa": round(cg, 2) if cg is not None and 0 < cg <= 10 else None,
            "company": company,
            "role": text(role),
            "offer": norm_offer(duration),
            "stipend": parse_stipend_k(stipend),
            "stipendText": text(stipend),
            "ctc": round(ctc_num, 2) if ctc_num is not None and ctc_num > 0 else None,
            "ctcText": ctc_text if not isinstance(ctc, (int, float)) else "",
            "base": parse_base(ctc_text) or (
                round(ctc_num, 2) if ctc_num and "all base" in ctc_text.lower() else None),
            "cat": norm_cat(cat),
            "branch": br,
        })

    # Batch aggregates from the CGPA sheet (no per-student values leave this script).
    cgpa_rows = rows(wb, "CGPA - DATA (6th SEM)")[1:]
    strength = Counter(text(r[3]).upper() for r in cgpa_rows if text(r[3]))
    bands = []
    for label, lo, hi in CGPA_BANDS:
        total = 0
        for r in cgpa_rows:
            g = num(r[10])
            if g is None or g <= 0:
                continue
            if (lo is None or g >= lo) and (hi is None or g < hi):
                total += 1
        bands.append({"label": label, "min": lo, "max": hi, "total": total})

    out = {
        "season": "2026",
        "batch": "2K22",
        "updated": UPDATED_ON,
        "source": "Community compiled from acceptance messages",
        "branchStrength": dict(sorted(strength.items())),
        "cgpaBands": bands,
        "offers": offers,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"offers: {len(offers)} (dropped {dupes} duplicate rows, "
          f"{unmatched} CTCs parsed from text)")
    print(f"students in batch: {sum(strength.values())}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
