// Site configuration. Everything that is specific to a placement season lives here.

export const CONFIG = {
  defaultSeason: '2027',

  // How often the live season is re-read from Google Sheets while the page is open.
  refreshMinutes: 5,

  // Optional: a publishable key from https://logo.dev gives sharper logos.
  // Without it, logos come from Google's favicon service.
  logoDevToken: '',

  seasons: {
    '2027': {
      id: '2027',
      label: 'Placements 2027',
      batch: '2K23',
      live: true,
      // "2027 unoff stats" — must stay shared as "Anyone with the link can view".
      sheetId: '1E7CtZmrXG_YiV6bATHOLBa9NnSvvwh68MUqWdTsykL4',
      tabs: { students: 'Students', companies: 'Companies' },
      // Written by scripts/fetch-sheet.mjs on every deploy; used when the live read fails.
      snapshot: 'data/2027.json',
      // Batch size per branch and per CGPA band (from the sheet's Analytics tab).
      branchStrength: {
        CS: 517, IT: 189, SE: 192, MC: 183, EC: 247, EE: 293, EP: 114,
        ME: 302, AE: 80, PE: 73, EN: 72, CE: 150, CH: 74, BT: 66,
      },
      cgpaBands: [
        { label: '>= 9.5', min: 9.5, max: null, total: 56 },
        { label: '9.0 - 9.5', min: 9.0, max: 9.5, total: 194 },
        { label: '8.5 - 9.0', min: 8.5, max: 9.0, total: 393 },
        { label: '8.0 - 8.5', min: 8.0, max: 8.5, total: 457 },
        { label: '7.5 - 8.0', min: 7.5, max: 8.0, total: 410 },
        { label: '7.0 - 7.5', min: 7.0, max: 7.5, total: 329 },
        { label: '6.5 - 7.0', min: 6.5, max: 7.0, total: 211 },
        { label: '< 6.5', min: null, max: 6.5, total: 518 },
      ],
    },
    '2026': {
      id: '2026',
      label: 'Placements 2026',
      batch: '2K22',
      live: false,
      // Frozen archive built by scripts/build_2026.py (includes branch strength & CGPA bands).
      data: 'data/2026.json',
    },
  },
};

export const SEASON_IDS = ['2027', '2026'];

export const BRANCHES = {
  CS: { name: 'Computer Science & Engineering', short: 'CSE' },
  CO: { name: 'Computer Engineering', short: 'COE' },
  IT: { name: 'Information Technology', short: 'IT' },
  SE: { name: 'Software Engineering', short: 'SE' },
  MC: { name: 'Mathematics & Computing', short: 'MCE' },
  EC: { name: 'Electronics & Communication', short: 'ECE' },
  EE: { name: 'Electrical Engineering', short: 'EE' },
  EP: { name: 'Engineering Physics', short: 'EP' },
  ME: { name: 'Mechanical Engineering', short: 'ME' },
  AE: { name: 'Mechanical & Automotive Engineering', short: 'MAM' },
  PE: { name: 'Production & Industrial Engineering', short: 'PIE' },
  EN: { name: 'Environmental Engineering', short: 'ENE' },
  CE: { name: 'Civil Engineering', short: 'CE' },
  CH: { name: 'Chemical Engineering', short: 'CHE' },
  BT: { name: 'Biotechnology', short: 'BT' },
  MISC: { name: 'Other programmes (M.Tech, MBA, other batches)', short: 'Others' },
};

export const CATEGORIES = ['Tech', 'Non Tech', 'Core'];
