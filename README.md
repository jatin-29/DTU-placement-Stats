# DTU Placement Stats

An unofficial dashboard of DTU campus placements: the **2027 season, updated live**, and
the complete **2026 archive** (batch 2K22).

**Site:** https://jatin-29.github.io/DTU-placement-Stats/

## What's in it

- **Dashboard**: students placed, % of batch, offers, companies visited, highest, average and
  median CTC, and average stipend. Charts cover offers by branch (split into Tech / Non-tech /
  Core), placement rate by branch and by CGPA band, top recruiters by intake, CTC
  distribution and offer types. A branch × profile table gives counts with average CTC.
- **Companies**: one card per company with its logo, number of offers, highest CTC, profiles,
  offer types and CGPA cut-off. You can search and filter by profile, status (selections out,
  ongoing, none) and branch. Clicking a card opens the company's roles, packages, selections
  by branch and the full list of selected students.
- **Branches**: placement rate, the Tech / Non-tech / Core split with average CTC, and the top
  recruiters for each branch.
- **Students**: a searchable, sortable table of every offer. It filters by branch, profile,
  company, offer type and CGPA range, and exports to CSV.
- **Eligibility** ("Where could I get in?"): enter a CGPA and branch to see which companies
  were open to you (cut-off met and branch confirmed), which probably were (branches or cut-off
  not on record), and which were out of reach and why. It also shows how students from your
  branch with a similar CGPA did: their placement rate in 2026 and where they got offers.
- **2026 vs 2027**: the two seasons side by side, by branch, profile mix and recruiter.

## How the live updates work

The data source is set in `assets/js/config.js`. The page reads it directly in the
visitor's browser, so it needs no API key and no rebuild. It reads the **Students** and
**Companies** tabs, refreshes every 5 minutes while the page is open, and has a **Refresh**
button for an immediate re-read. The site itself never names or links the source.

For this to keep working:

- The sheet must stay shared as **"Anyone with the link can view"**.
- The tabs must keep the names `Students` and `Companies`. You can change them in
  `assets/js/config.js`.
- Columns are matched by header name (Roll No, Name, CGPA, Company, Role, Offer Type,
  Stipend, CTC, Base, Category, Branch / Count, Comments), so adding or reordering columns
  is fine.

If the source can't be reached, the site falls back to `data/2027.json`. The deploy workflow
refreshes that snapshot from the sheet every hour.

## Deploying (GitHub Pages)

The workflow in `.github/workflows/deploy.yml` tests the site, refreshes the snapshot and
publishes it. It runs on every push to the default branch, every hour, and on demand.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Local development

```bash
python3 -m http.server 8080     # then open http://localhost:8080
npm test                        # data/normalisation sanity checks (Node 18+)
node scripts/fetch-sheet.mjs    # refresh data/2027.json from the sheet
```

There is no build step. The site is plain HTML, CSS and ES modules, with Chart.js vendored
in `assets/vendor`.

## Customising

- **Logos.** Companies are matched to a website domain in `assets/js/lib/logos.js`, and the
  logo comes from that domain. Companies without a known domain show a coloured monogram.
  To add one, add a `"Company": "domain.com"` line there, or add a `Website` column to the
  Companies tab. For sharper logos, set a [logo.dev](https://logo.dev) publishable key in
  `config.js`.
- **Branch strength and CGPA bands** (the denominators for "% placed") are in
  `assets/js/config.js`, taken from the sheet's Analytics tab.
- **2026 archive.** `data/2026.json` is built with `scripts/build_2026.py`. Only aggregate
  counts are taken from the whole-batch CGPA list.

## Data notes

- All figures are unofficial and are compiled from acceptance messages.
- Offers are counted per offer, and "students placed" counts unique roll numbers. Students
  with two offers count once in "% placed" and twice in offers.
- 2K22's Computer Engineering is `CO`, and 2K23's is `CS`. The comparison page treats them as
  the same programme.
- In 2026, offers to M.Tech, MBA and other-batch students are grouped as `MISC`. They count
  in offers but not in B.Tech placement rates.
- Eligibility (`assets/js/lib/eligibility.js`) reads the branches from each posting's
  "Eligible: ..." note, or from a bare list of branch codes in the note or the role name.
  A branch counts as open when it is listed or someone from it was selected; a cut-off that
  is not on record counts as met when someone was selected at or below your CGPA. Last
  season's list for the same company is shown as a hint only. Intern conversions (PPO) and
  off-campus routes ("via ...", "Hackathon/Intern convert", HackWithInfy) are not drives, and
  their offers are not used as evidence.
- The "students like you" rates use per-branch counts of the 2K22 batch by CGPA band
  (`branchCgpa` in `data/2026.json`). Bands are half a point wide, merged so that each holds
  at least 5 students and so that no subtraction against the batch-wide bands can single out
  fewer than 5 (the tests check this). Only counts are published, never an individual's CGPA.
- The 2026 archive corrects the sheet where the workbook itself shows it is wrong
  (`scripts/build_2026.py` lists every correction):
  - 13 wrong or missing roll numbers (11 pulled another student's CGPA)
  - 6 CTCs that Sheet7 had wrong
  - 14 duplicate rows dropped
  - 3 "Oracle - WAITLIST" rows left out, since a waitlist is not an offer
  - CGPA and branch filled in from the batch CGPA list
  - 12 offers that never made it into the sheet, taken from placement-cell selection messages
    (listed in `EXTRA_OFFERS`)
  - Campus postings (`scripts/data/2026_postings.json`) list every company that visited, with
    roles, packages and CGPA cut-offs, including companies with no recorded offers

Not affiliated with DTU or its Training & Placement department.
