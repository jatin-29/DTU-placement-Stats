#!/usr/bin/env python3
"""Build data/2026.json (Placement '26, batch 2K22) from the community sheet.

The 2026 season is finished, so its data is frozen into a JSON file instead of
being read live. To rebuild it, download "Placement'26 Unoff Stats" as .xlsx
(File -> Download -> Microsoft Excel) and run:

    pip install openpyxl
    python3 scripts/build_2026.py "Placement'26 Unoff Stats.xlsx" data/2026.json

Company postings (roles, packages, CGPA cut-offs, dates of companies that
visited, including ones with no recorded offers) come from the curated file
scripts/data/2026_postings.json, extracted from the workbook's job-postings tab
(Sheet8) and Sheet2.

Sheets used:
  * "Detailed DATA"         one row per offer (roll, name, CGPA, company, role,
                            duration, stipend, CTC text, type, branch)
  * "Sheet7"                same rows with a cleaned numeric CTC column
  * "CGPA - DATA (6th SEM)" whole-batch CGPA list. Only aggregates (students
                            per branch and per CGPA band) are written out, so
                            CGPAs of students without offers are never published.
"""

import json
import os
import re
import sys
from collections import Counter
from difflib import SequenceMatcher

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

# Rows whose roll number was mistyped in "Detailed DATA", so the sheet's CGPA
# lookup pulled another student's CGPA (and, on the site, merged two people).
# Keyed by (name, roll as typed). Each correct roll is checked against the
# batch CGPA list at build time; the build fails if the names do not match.
ROLL_FIXES = {
    ("hemant verma", "2K22/IT/73"): "2K22/IT/72",
    ("divyansh singh", "2K22/CO/17"): "2K22/CO/174",
    ("swapnil gupta", "2K22/EP/106"): "2K22/EP/105",
    ("shivansh rajdehl", "2K22/MC/15"): "2K22/MC/151",
    ("depdeep mishra", "2K22/PE/01"): "2K22/PE/18",
    ("mrigyank", "2K22/SE/106"): "2K22/IT/106",
    ("shivesh aditya", "2K22/EC/253"): "2K22/EC/215",
    ("manoj", "2K22/MC/08"): "2K22/MC/89",
    ("syed muneeb ali", "2K22/CO/463"): "2K22/CO/464",
    ("omveer", "2K22/PE/4"): "2K22/PE/41",
    ("dhruv chopra", "2K22/AE/34"): "2K22/CE/47",
    # Selection message: "Incubation and Solution Engineer ... Sahil (22/CO/390)".
    ("sahil", "2K22/CO/525"): "2K22/CO/390",
    # Blank roll; the only Aditya ... Patil in the batch, and CO/35 is otherwise unused.
    ("aditya patil", ""): "2K22/CO/35",
}

NAME_FIXES = {"depdeep mishra": "Debdeep Mishra"}

# Same student under a different spelling of the name (the only Shashi in IT).
SAME_PERSON = {("shashi kant", "2K22/IT/151")}

# Sheet7's numeric CTC is wrong for these rows (a stale value, or a value
# filled down from the Polestar rows above); the CTC text says otherwise.
CTC_FIXES = {
    ("kanika verma", "natwest"): 15.0,          # '15 lpa(all base)'
    ("rohit gupta", "advantageclub.ai"): 14.0,  # '14 lpa (10 base + 4 ESOPS)'
    ("mrigyank", "advantageclub.ai"): 14.0,
    ("chaitanya gairola", "advantageclub.ai"): 14.0,
    ("arnav kashyap", "minix fintech"): 20.0,   # '18-22 LPA' (midpoint, as Sheet7 does for ranges)
    ("roshan kumar dubey", "minix fintech"): 20.0,
}
BASE_FIXES = {  # '10-15LPA base' -> midpoint, matching the CTC convention above
    ("arnav kashyap", "minix fintech"): 12.5,
    ("roshan kumar dubey", "minix fintech"): 12.5,
}

# Rows that only name a company; filled from the one matching posting/row in the workbook.
ROW_FILLS = {
    # Sheet2 r47 is the only Schneider entry.
    ("akshita bhist", "Schneider Electric"): {
        "role": "Graduate Engineer Trainee", "offer": "6M + PPO", "stipendText": "35k",
        "ctcText": "12 lpa", "ctc": 12.0, "cat": "Core",
    },
    # Every HCL row in Detailed DATA is an FTE tech role (the two HCL packages differ, so no CTC).
    ("deevansh kishore", "HCL"): {"offer": "FTE", "cat": "Tech"},
}

# Offers missing from the sheet, taken from the placement-cell selection messages
# pasted as comments on the "DTU 2026 PLACEMENTS" sheet (announced Nov 2025 - Jan 2026).
# Columns as in Detailed DATA: roll, name, company, role, duration, stipend, CTC, type.
EXTRA_OFFERS = [
    ("2K22/CO/407", "Sanchit Mishra", "Keysight", "IT Intern", "6M", "", "", "Tech"),          # 6 Jan 2026
    ("2K22/SE/162", "Shakti Singh", "Keysight", "IT Intern", "6M", "", "", "Tech"),            # 25 Dec 2025
    ("2K22/CO/213", "Hitesh Kholwal", "Think Exam", "Software Trainee", "6M + PPO", "", "", "Tech"),  # 1 Jan 2026
    ("2K22/SE/72", "Harsh Kumar", "Think Exam", "Software Trainee", "6M + PPO", "", "", "Tech"),
    ("2K22/CO/477", "Tushar Mongia", "ClearTax", "SDE", "6M + PPO", "", "20 lpa (14 base + 6 esops)", "Tech"),  # 26 Dec 2025
    ("2K22/IT/147", "Satwik Jain", "Novus Hi-Tech Robotics", "", "", "", "", ""),               # 25 Dec 2025
    ("2K22/EE/106", "Farhan Shahid", "Novus Hi-Tech Robotics", "", "", "", "", ""),
    ("2K22/PE/57", "Saumik Kumar", "PCBL", "GET", "", "", "", "Core"),                            # 19 Dec 2025
    ("2K22/EE/277", "Tushar", "PCBL", "GET", "", "", "", "Core"),
    ("2K22/CO/37", "Aibel Rejan Varghese", "Magicpin", "Data Analyst", "6M + PPO", "38K", "10 LPA", "Non Tech"),  # Dec 2025
    ("2K22/EE/292", "Vansh Vashishtha", "Exicom Tele Systems", "", "6M + FTE", "30K", "7 LPA", ""),  # 10 Dec 2025
    ("2K22/EE/285", "Uttkarsh Sharma", "Wolf Mentoring", "", "FTE", "", "10 LPA", ""),            # 27 Nov 2025
]

# "Oracle - WAITLIST" rows are waitlisted candidates, not offers.
EXCLUDED_COMPANIES = {"oracle - waitlist"}

BTECH_BRANCHES = {"AE", "BT", "CE", "CH", "CO", "EC", "EE", "EN", "EP", "IT", "MC", "ME", "PE", "SE"}

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
    v = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", str(v))  # zero-width characters
    return re.sub(r"\s+", " ", v).strip()


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
    # "Base: 6 LPA" / "base - 6", else the number right before "base"/"fixed",
    # including "15.75 lpa (base)" and "10 LPA (Fixed)".
    m = re.search(r"base\s*[:\-]\s*(\d+(?:\.\d+)?)", s) or re.search(
        r"(\d+(?:\.\d+)?)\s*(?:lpa|l|lakh)?\s*\(?\s*(?:fixed|base)", s
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


def names_match(a, b):
    """Same person? Tolerates spelling variants, initials punctuation, word order
    and a missing surname, but not a different person (e.g. Hemant Verma vs Hitesh Kumar)."""
    a = [w for w in re.sub(r"[^a-z ]", " ", text(a).lower()).split() if w]
    b = [w for w in re.sub(r"[^a-z ]", " ", text(b).lower()).split() if w]
    if not a or not b:
        return False
    ratio = lambda x, y: SequenceMatcher(None, x, y).ratio()
    if ratio("".join(a), "".join(b)) >= 0.8 or ratio("".join(sorted(a)), "".join(sorted(b))) >= 0.8:
        return True
    # A shorter form of the same name: "Anurag Jha" / "ANURAG KUMAR JHA", "Mrigyank" / "MRIGYANK ROY".
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if short[0] != long_[0]:
        return False
    it = iter(long_)
    return all(w in it for w in short)


def infer_cat(role):
    """Profile from the role text, for rows the sheet left untyped (mirrors the site's rule)."""
    r = text(role).lower()
    if re.search(r"\bcore\b|hardware|analog|embedded|vlsi|\bget\b|graduate engineer|mechanical|electrical|civil|chemical|manufactur|production|quality", r):
        return "Core"
    if re.search(r"analyst|consult|business|product manager|management|marketing|sales|finance|banking|operations|founder|relationship", r):
        return "Non Tech"
    if re.search(r"sde|software|developer|engineer|data scien|\bml\b|\bai\b|full ?stack|backend|frontend|devops|sdet|programmer", r):
        return "Tech"
    return "Unknown"


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

    # Batch CGPA list, keyed by roll: the source of truth for CGPA and branch.
    cgpa_rows = rows(wb, "CGPA - DATA (6th SEM)")[1:]
    batch = {}
    for r in cgpa_rows:
        g = num(r[10])
        batch[roll_key(r[2], r[1])] = {"name": text(r[1]), "cgpa": g, "branch": text(r[3]).upper()}

    offers, seen, by_name = [], {}, {}
    stats = Counter()
    extra = [[roll, name, None, comp, role, dur, stip, ctc, None, cat, ""] + [None] * 20
             for roll, name, comp, role, dur, stip, ctc, cat in EXTRA_OFFERS]
    for r in detailed + extra:
        roll, name, cgpa, company, role, duration, stipend, ctc, _count, cat, branch = r[:11]
        raw_company = text(company).lower()
        company = norm_company(company)
        if not company or company.lower() == "none" or not text(name):
            continue
        if company.lower() in EXCLUDED_COMPANIES:
            stats["excluded"] += 1
            continue

        name = re.sub(r"[\s'’\-.]+$", "", text(name))  # "Adarsh Kumar jha'", "Naman Padiyar-"
        roll = clean_roll(roll)
        fixed_roll = ROLL_FIXES.get((name.lower(), roll))
        if fixed_roll:
            hit = batch.get(roll_key(fixed_roll, name))
            if not hit or not names_match(name, hit["name"]):
                sys.exit(f"ROLL_FIXES entry for {name} points at {fixed_roll}, which is {hit and hit['name']}")
            roll = fixed_roll
            stats["roll fixed"] += 1
        name = NAME_FIXES.get(name.lower(), name)
        key = roll_key(roll, name)

        ctc_text = text(ctc)
        offer = {
            "roll": roll,
            "name": name,
            "cgpa": None,
            "company": company,
            "role": text(role),
            "offer": norm_offer(duration),
            "stipend": None,
            "stipendText": text(stipend),
            "ctc": None,
            "ctcText": ctc_text if not isinstance(ctc, (int, float)) else "",
            "base": None,
            "cat": norm_cat(cat),
            "branch": text(branch).upper(),
        }
        for k, v in ROW_FILLS.get((name.lower(), company), {}).items():
            if not offer.get(k) or (k == "cat" and offer[k] == "Unknown"):
                offer[k] = v
                stats["field filled"] += 1

        # Duplicates: same student, company and role/offer type; or same student,
        # company, offer type and package; or (when one row has no usable roll)
        # same name, company, offer type and package. Keep the first row and
        # copy over anything only the duplicate has.
        role_key = re.sub(r"[^a-z]", "", offer["role"].lower())
        dupe_keys = [
            ("role", key, company.lower(), role_key, offer["offer"]),
            ("pkg", key, company.lower(), offer["offer"], offer["ctcText"].lower()),
        ]
        name_key = ("name", name.lower(), company.lower(), offer["offer"], offer["ctcText"].lower())
        kept = next((seen[k] for k in dupe_keys if k in seen), None)
        if kept is None and key.startswith("name:"):
            kept = by_name.get(name_key)
        if kept is not None:
            for f in ("role", "offer", "stipendText", "ctcText"):
                if not kept[f] and offer[f]:
                    kept[f] = offer[f]
            stats["duplicate dropped"] += 1
            continue
        for k in dupe_keys:
            seen[k] = offer
        by_name.setdefault(name_key, offer)

        # CTC: Sheet7's cleaned number, unless listed in CTC_FIXES.
        ctc_num = CTC_FIXES.get((name.lower(), company.lower()))
        if ctc_num is None:
            ctc_num = ctc_lookup.get((roll_key(r[0], r[1]), raw_company, text(role).lower()))
        if ctc_num is None:
            ctc_num = ctc_lookup.get((roll_key(r[0], r[1]), raw_company, None))
        if ctc_num is None:
            ctc_num = offer.pop("ctc") or parse_ctc_text(offer["ctcText"])
            stats["ctc from text"] += 1 if ctc_num else 0
        offer["ctc"] = round(ctc_num, 2) if ctc_num is not None and ctc_num > 0 else None
        offer["base"] = BASE_FIXES.get((name.lower(), company.lower())) or parse_base(offer["ctcText"]) or (
            offer["ctc"] if offer["ctc"] and "all base" in offer["ctcText"].lower() else None)
        offer["stipend"] = parse_stipend_k(offer["stipendText"])

        # CGPA and branch: from the batch list when this is a 2K22 B.Tech roll.
        hit = batch.get(key)
        if hit and (names_match(name, hit["name"]) or (name.lower(), roll) in SAME_PERSON):
            g = hit["cgpa"] if hit["cgpa"] and 0 < hit["cgpa"] <= 10 else num(cgpa)  # list has a few blanks
            offer["cgpa"] = round(g, 2) if g is not None and 0 < g <= 10 else None
            offer["branch"] = hit["branch"] or offer["branch"]
        else:
            m = re.match(r"^(?:2K)?(\d{2})/([A-Z]+)/", roll)
            if m and m.group(1) == BATCH_YEAR and m.group(2) in BTECH_BRANCHES:
                offer["branch"] = m.group(2)
            if hit:
                # The roll belongs to someone else, so the sheet's CGPA lookup is theirs too.
                print(f"warning: {roll} is {hit['name']} in the CGPA list, not {name}; roll and CGPA left blank")
                offer["roll"] = ""
            else:
                cg = num(cgpa)
                offer["cgpa"] = round(cg, 2) if cg is not None and 0 < cg <= 10 else None
        if not offer["branch"]:
            offer["branch"] = "MISC"
        if offer["cat"] == "Unknown":
            offer["cat"] = infer_cat(offer["role"])

        if r in extra:
            if not (hit and names_match(name, hit["name"])):
                sys.exit(f"EXTRA_OFFERS entry {name} {roll} does not match the batch CGPA list")
            stats["extra offer added"] += 1
        offers.append(offer)

    # Duplicates may have contributed text fields after their kept row was parsed.
    for o in offers:
        if o["stipend"] is None and o["stipendText"]:
            o["stipend"] = parse_stipend_k(o["stipendText"])
        if o["ctc"] is None and o["ctcText"]:
            v = parse_ctc_text(o["ctcText"])
            o["ctc"] = round(v, 2) if v and v < 1000 else None
        if o["base"] is None and o["ctcText"]:
            o["base"] = parse_base(o["ctcText"])

    # Batch aggregates from the CGPA sheet (no per-student values leave this script).
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

    postings_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "2026_postings.json")
    with open(postings_path, encoding="utf-8") as f:
        postings = json.load(f)
    for p in postings:
        p["company"] = norm_company(p["company"])

    out = {
        "season": "2026",
        "batch": "2K22",
        "updated": UPDATED_ON,
        "source": "Community compiled from acceptance messages",
        "branchStrength": dict(sorted(strength.items())),
        "cgpaBands": bands,
        "offers": offers,
        "companies": postings,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"company postings: {len(postings)} ({len({p['company'] for p in postings})} companies)")
    print(f"offers: {len(offers)}; " + ", ".join(f"{k}: {v}" for k, v in sorted(stats.items())))
    print(f"students in batch: {sum(strength.values())}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
