// Site configuration. Everything that is specific to a placement season lives here.

// Shared fields of a batch of reported selections.
const SAMSUNG_EA = { company: 'Samsung E&A', offer: 'FTE', ctc: 8.5, base: 8.3, cat: 'Core' };
const SCALER_AI = { company: 'Scaler AI Labs', role: 'Software Engineer Intern', offer: '6M + PPO', ctc: 40, stipend: 75, cat: 'Tech' };

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
      // Corrections applied on top of the live data, matched by roll number.
      // They win over whatever the sheet says, on every refresh.
      overrides: [
        { roll: '23/EE/355', set: { cgpa: 8.4 } }, // Hiten Sharma
      ],
      // Selections reported directly, shown until the live data lists them
      // (same roll number at the same company), then ignored.
      // Companies whose process ended with no selections, shown as such even
      // while the live data still leaves their count blank.
      closedNoSelection: ['Cmart Solutions'],
      reported: [
        // Samsung E&A FTE selections, announced 4 Nov 2026.
        { roll: '23/CH/097', name: 'Shashwat Yadav', cgpa: 7.243, branch: 'CH', role: 'GET (Execution)', ...SAMSUNG_EA },
        { roll: '23/CH/071', name: 'Sohil Samarajit M', cgpa: 9.216, branch: 'CH', role: 'GET (Process)', ...SAMSUNG_EA },
        { roll: '23/CE/158', name: 'Arun Tiwari', cgpa: 7.571, branch: 'CE', role: 'GET (CSA)', ...SAMSUNG_EA },
        { roll: '23/CE/079', name: 'Naman Gupta', cgpa: 8.952, branch: 'CE', role: 'GET (CSA)', ...SAMSUNG_EA },
        { roll: '23/CE/138', name: 'Utkarsh', cgpa: 8.485, branch: 'CE', role: 'GET (CSA)', ...SAMSUNG_EA },
        { roll: '23/EE/053', name: 'Aryan Upadhyay', cgpa: 8.456, branch: 'EE', role: 'GET (Electrical)', ...SAMSUNG_EA },
        { roll: '23/EE/116', name: 'Jayant Pant', cgpa: 8.464, branch: 'EE', role: 'GET (Electrical)', ...SAMSUNG_EA },
        { roll: '23/EE/342', name: 'Soumya Sen', cgpa: 7.928, branch: 'EE', role: 'GET (Electrical)', ...SAMSUNG_EA },
        { roll: '23/EE/256', name: 'Sumit Guin', cgpa: 7.463, branch: 'EE', role: 'GET (Electrical)', ...SAMSUNG_EA },
        { roll: '23/ME/033', name: 'Ajay Nayak', cgpa: 8.858, branch: 'ME', role: 'GET (Piping)', ...SAMSUNG_EA },
        { roll: '23/ME/058', name: 'Anujansh', cgpa: 8.799, branch: 'ME', role: 'GET (Piping)', ...SAMSUNG_EA },
        { roll: '23/ME/068', name: 'Arpit Tiwari', cgpa: 9.135, branch: 'ME', role: 'GET (Piping)', ...SAMSUNG_EA },
        { roll: '23/ME/117', name: 'Govind Garg', cgpa: 9.379, branch: 'ME', role: 'GET (Piping)', ...SAMSUNG_EA },
        { roll: '23/ME/167', name: 'Manjeet Kumar', cgpa: 8.674, branch: 'ME', role: 'GET (Piping)', ...SAMSUNG_EA },
        { roll: '23/ME/355', name: 'Rudransh Maliya', cgpa: 7.314, branch: 'ME', role: 'GET (Piping)', ...SAMSUNG_EA },
        // Scaler AI Labs 6M + PPO selections, announced 5 Nov 2026 (more expected).
        { roll: '23/IT/209', name: 'Aryan Goel', cgpa: 8.734, branch: 'IT', ...SCALER_AI },
        { roll: '23/EP/034', name: 'Devyansh Bhattacharya', cgpa: 8.772, branch: 'EP', ...SCALER_AI },
        { roll: '23/CS/462', name: 'Vishrut Grover', cgpa: 8.938, branch: 'CS', ...SCALER_AI },
        // EverythingRF LLP 6M + FTE selection, announced 5 Nov 2026 (posted CTC 6-8.4 LPA).
        { roll: '23/EC/203', name: 'Sonu Kumar', cgpa: 8.008, branch: 'EC', company: 'EverythingRF LLP', role: 'Graduate Engineer', offer: '6M + FTE', ctc: 8.4, cat: 'Core' },
      ],
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
    '2028': {
      id: '2028',
      label: 'Internships 2028',
      batch: '2K24',
      live: false,
      // Summer internship selections, company by company (no student names).
      // Refreshed by scripts/fetch-2028.mjs on every deploy.
      kind: 'internship',
      data: 'data/2028.json',
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

export const SEASON_IDS = ['2028', '2027', '2026'];

// The seasons the 2026 vs 2027 page compares.
export const COMPARE_IDS = ['2027', '2026'];

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
