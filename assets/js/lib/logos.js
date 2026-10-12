// Company logos. Each company name is mapped to its website domain. At deploy
// time scripts/fetch-logos.mjs downloads each domain's icon into the site
// (listed in data/logos.json); a domain missing there falls back to favicon
// services. Names without a known domain get a coloured monogram. To add a
// logo: add "Company name": "domain" below, or add a "Website" column to the
// Companies tab of the sheet.

import { CONFIG } from '../config.js';
import { companyKey } from './normalize.js';
import { escapeHtml } from './dom.js';

const KNOWN = {
  '4S Medical Research Private Limited': 'seesoundlive.com',
  'Accenture': 'accenture.com',
  'Acespl': 'acespl.in',
  'Acme Group': 'acme.in',
  'Acmegrade': 'acmegrade.in',
  'Addverb Technologies': 'addverb.com',
  'Adobe': 'adobe.com',
  'AdvantageClub.ai': 'advantageclub.ai',
  'Adverk Technologies': 'adverk.net',
  'AegisCovenant': 'aegiscovenant.com',
  'Aerod Technologies': 'aerodtechnologies.com',
  'Agent Mira': 'agentmira.ai',
  'Ai+ Smartphone': 'aiplusstore.com',
  'AiDash': 'aidash.com',
  'Air India Express': 'airindiaexpress.com',
  'Air Liquide': 'airliquide.com',
  'Airamatrix': 'airamatrix.com',
  'AlgoSec': 'algosec.com',
  'Alvarez & Marsal': 'alvarezandmarsal.com',
  'Alvarez & Marshal': 'alvarezandmarsal.com',
  'Amazon': 'amazon.com',
  'Ambak': 'ambak.com',
  'AMD': 'amd.com',
  'Amdocs': 'amdocs.com',
  'Amity Software Limited': 'amitysoftware.com',
  'Antino': 'antino.com',
  'Aplazo': 'aplazo.mx',
  'Apple': 'apple.com',
  'Arcesium': 'arcesium.com',
  'Arisinfra Solution Ltd.': 'arisinfra.com',
  'ARM': 'arm.com',
  'Astrotalk': 'astrotalk.com',
  'Atlassian': 'atlassian.com',
  'Autodesk': 'autodesk.com',
  'Avaada Group': 'avaada.com',
  'Averixis Solutions': 'averixis.com',
  'Awiros': 'awiros.com',
  'Axis Bank': 'axisbank.com',
  'Axtria': 'axtria.com',
  'Axxela': 'axxela.in',
  'Bain': 'bain.com',
  'Bajaj Finance': 'bajajfinserv.in',
  'Baker Hughes': 'bakerhughes.com',
  'Barco': 'barco.com',
  'Barco Electronics': 'barco.com',
  'BCN (Bain)': 'bain.com',
  'Beghou': 'beghouconsulting.com',
  'Bharti Airtel Ltd': 'airtel.in',
  'BigBinary': 'bigbinary.com',
  'BlackNGreen (BNG)': 'blackngreen.com',
  'BlackRock': 'blackrock.com',
  'Blinkit': 'blinkit.com',
  'Blinkit (Eternal)': 'blinkit.com',
  'Blue Matter': 'bluematterconsulting.com',
  'Blue Matter consulting': 'bluematterconsulting.com',
  'BNP Paribas': 'group.bnpparibas',
  'BNY Mellon': 'bny.com',
  'Bounteous x Accolit': 'bounteous.com',
  'BPCL': 'bharatpetroleum.in',
  'BrowserStack': 'browserstack.com',
  'Cadence': 'cadence.com',
  'Campus Activewear Ltd': 'campusshoes.com',
  'Car Dekho': 'cardekho.com',
  'Care Health': 'careinsurance.com',
  'Cashfree Payments': 'cashfree.com',
  'CDOT': 'cdot.in',
  'Chaayos': 'chaayos.com',
  'Ciena': 'ciena.com',
  'Cisco': 'cisco.com',
  'ClearTax': 'cleartax.in',
  'CodeSpire Solutions': 'codespiresolutions.com',
  'Cognito Analytics': 'cognitioanalytics.com',
  'Cognizant': 'cognizant.com',
  'College Dunia': 'collegedunia.com',
  'Contravolt': 'contravault.com',
  'Coursera': 'coursera.org',
  'CRED': 'cred.club',
  'Cvent': 'cvent.com',
  'Damco Solutions': 'damcogroup.com',
  'Databricks': 'databricks.com',
  'De Shaw': 'deshaw.com',
  'Deutsche Telekom Digital Labs': 'dtdl.in',
  'Different Labs': 'different.ai',
  'DotPe': 'dotpe.in',
  'Earnest Data Analytics': 'earnestdata-analytics.in',
  'Ebullient Securities': 'ebullientsecurities.com',
  'Edu-Versity': 'edu-versity.in',
  'Eduexpose Technologies (OPC) Pvt. Ltd': 'eduexpose.in',
  'Eightfold': 'eightfold.ai',
  'EIL': 'engineersindia.com',
  'Eleation': 'eleation.com',
  'Eleven X Capital': 'elevenxcapital.com',
  'EnterPret': 'enterpret.com',
  'EnWe Clean Technologies': 'enweclean.com',
  'Escorts Kubota': 'escortskubota.com',
  'Eternal': 'eternal.com',
  'Ethos': 'ethos.com',
  'Ethos Life': 'ethos.com',
  'Euler Motors': 'eulermotors.com',
  'Evalueserve': 'evalueserve.com',
  'Everest': 'everestgrp.com',
  'Everest Group': 'everestgrp.com',
  'Evernorth Health Services': 'evernorth.com',
  'Everything RF LLP': 'everythingrf.com',
  'Exicom Tele Systems': 'exicom.com',
  'EXL Digital': 'exlservice.com',
  'EXL Service': 'exlservice.com',
  'Exotel': 'exotel.com',
  'Expedia': 'expediagroup.com',
  'ExxonMobil': 'exxonmobil.com',
  'EY': 'ey.com',
  'EY GDS': 'ey.com',
  'EY India': 'ey.com',
  'Fareportal': 'fareportal.com',
  'Fast Retailing': 'fastretailing.com',
  'Flipkart': 'flipkart.com',
  'Fluor Daniel India Private Limited': 'fluor.com',
  'Fluor Daniel India Pvt Ltd': 'fluor.com',
  'Fluxon': 'fluxon.com',
  'FNZ': 'fnz.com',
  'Forvis Mazars': 'forvismazars.com',
  'Fractal Analysis': 'fractal.ai',
  'Fractal.AI': 'fractal.ai',
  'Furrvy': 'furrvy.com',
  'Future First': 'futuresfirst.com',
  'Futures First': 'futuresfirst.com',
  'Gartner': 'gartner.com',
  'GEP': 'gep.com',
  'Giesecke & Devrient': 'gi-de.com',
  'GirnarSoft (Cardekho Group)': 'cardekho.com',
  'GNA Energy': 'gnaenergy.in',
  'GoComet': 'gocomet.com',
  'GoDaddy': 'godaddy.com',
  'Godrej Properties Ltd': 'godrejproperties.com',
  'Goldman Sachs': 'goldmansachs.com',
  'GoodSpace AI': 'goodspace.ai',
  'Google': 'google.com',
  'Grant Thornton': 'grantthornton.in',
  'Grant Thorton': 'grantthornton.in',
  'Growth Jockey': 'growthjockey.com',
  'Groww': 'groww.in',
  'Haber': 'haberwater.com',
  'HashedIn by Deloitte': 'hashedin.com',
  'Havells India': 'havells.com',
  'HBSS': 'hbssindia.com',
  'HCL': 'hcltech.com',
  'Hero': 'heromotocorp.com',
  'Hindustan Coca-Cola Beverages': 'hccb.in',
  'Honasa (Mamaearth)': 'honasa.in',
  'HSBC Technology India': 'hsbc.com',
  'Hyperverge': 'hyperverge.co',
  'Hyundai India Insurance': 'hiib.in',
  'IBM Consulting': 'ibm.com',
  'ICICI Bank': 'icicibank.com',
  'ICICI Bank Ltd': 'icicibank.com',
  'IGUS': 'igus.com',
  'Incedo': 'incedoinc.com',
  'IndiaAI': 'indiaai.gov.in',
  'IndiaMART': 'indiamart.com',
  'Indigo': 'goindigo.in',
  'Infineon': 'infineon.com',
  'Infinite Locus': 'infinitelocus.com',
  'InfoEdge': 'infoedge.in',
  'Infollion': 'infollion.com',
  'InfoOrigin': 'infoorigin.com',
  'Infosys': 'infosys.com',
  'INGLU Global': 'ingluglobal.in',
  'Innovaccer': 'innovaccer.com',
  'Intact': 'intactfc.com',
  'Intello Labs': 'intellolabs.com',
  'Intuit': 'intuit.com',
  'ION Group': 'iongroup.com',
  'Iqvia': 'iqvia.com',
  'ITC Limited': 'itcportal.com',
  'Ixigo': 'ixigo.com',
  'Jarvis Labs': 'jarvislabs.ai',
  'JCB': 'jcb.com',
  'Jindal Steel': 'jindalsteel.com',
  'Joveo': 'joveo.com',
  'JPMC': 'jpmorganchase.com',
  'JSW Energy': 'jsw.in',
  'Jubilant Foodworks': 'jubilantfoodworks.com',
  'Juspay': 'juspay.in',
  'Kearney': 'kearney.com',
  'Keyence': 'keyence.com',
  'Keysight': 'keysight.com',
  'KickDrum': 'kickdrumtech.com',
  'KKR': 'kkr.com',
  'KKR & Co, Inc': 'kkr.com',
  'KPMG': 'kpmg.com',
  'L&T': 'larsentoubro.com',
  'Leena AI': 'leena.ai',
  'Lenskart': 'lenskart.com',
  'Macquarie Group': 'macquarie.com',
  'Magicpin': 'magicpin.in',
  'MakeMyTrip': 'makemytrip.com',
  'Mantarav PVT. LTD. (EMB Global)': 'emb.global',
  'MAQ Software': 'maqsoftware.com',
  'Maruti Suzuki': 'marutisuzuki.com',
  'Mastercard': 'mastercard.com',
  'Masters Union': 'mastersunion.org',
  'Mathworks': 'mathworks.com',
  'MayaCardio': 'mayacardio.io',
  'McCain': 'mccain.com',
  'McKinsey': 'mckinsey.com',
  'Media Net': 'media.net',
  'Media.Net': 'media.net',
  'Meesho': 'meesho.com',
  'Micron': 'micron.com',
  'Microsoft': 'microsoft.com',
  'Minix Fintech': 'minix.one',
  'MongoDB': 'mongodb.com',
  'Moodys': 'moodys.com',
  'Morgan Stanley': 'morganstanley.com',
  'Mozark': 'mozark.ai',
  'MPS Limited': 'mpslimited.com',
  'MRSOOL': 'mrsool.co',
  'Myntra': 'myntra.com',
  'Myntra (off-campus)': 'myntra.com',
  'Nagarro': 'nagarro.com',
  'Namekart': 'namekart.com',
  'National Australia Bank': 'nab.com.au',
  'Natwest': 'natwestgroup.com',
  'Navi': 'navi.com',
  'Netsmartz': 'netsmartz.com',
  'NHAI': 'nhai.gov.in',
  'Nielsen': 'nielsen.com',
  'Niva Bupa': 'nivabupa.com',
  'NK Security': 'nksecurities.com',
  'Novartis': 'novartis.com',
  'Novus Hi-Tech Robotics': 'novushitech.com',
  'Nubra (Zanskar Securities)': 'nubra.io',
  'Nucleus Software': 'nucleussoftware.com',
  'NudgIT.AI': 'nudgit.ai',
  'Number7 AI solutions Pvt. Ltd': 'number7ai.com',
  'NVIDIA': 'nvidia.com',
  'NXP': 'nxp.com',
  'NXP Semiconductor': 'nxp.com',
  'NxtWave': 'nxtwave.com',
  'Nykaa': 'nykaa.com',
  'OLX': 'olx.in',
  'OmniPresent': 'omnipresenttech.com',
  'Omnipresent Robot Tech': 'omnipresenttech.com',
  'ONE Group Developers': 'onegroup.co.in',
  'OneBanc': 'onebanc.ai',
  'OnGrid': 'ongrid.in',
  'Optum': 'optum.com',
  'Oracle': 'oracle.com',
  'Oracle - WAITLIST': 'oracle.com',
  'Orange Business': 'orange-business.com',
  'OYO': 'oyorooms.com',
  'Paharpur Cooling Towers Ltd.': 'paharpur.com',
  'Paisabazaar': 'paisabazaar.com',
  'Palo Alto Networks': 'paloaltonetworks.com',
  'Patronus': 'patronustradetech.com',
  'Patronus Tradetech': 'patronustradetech.com',
  'Payoneer': 'payoneer.com',
  'PayTM': 'paytm.com',
  'PCBL': 'pcblltd.com',
  'Pharmeasy': 'pharmeasy.in',
  'PhonePe': 'phonepe.com',
  'PhysicsWallah': 'pw.live',
  'Pine Labs': 'pinelabs.com',
  'Pluang': 'pluang.com',
  'Polestar Analytics': 'polestarllp.com',
  'Policy Bazaar': 'policybazaar.com',
  'PolicyBazaar': 'policybazaar.com',
  'PRISM (OYO)': 'oyorooms.com',
  'Proc DNA': 'procdna.com',
  'Procol.ai': 'procol.ai',
  'Prospecta Software Solutions': 'prospecta.com',
  'Publicis Sapient': 'publicissapient.com',
  'PwC': 'pwc.com',
  'QuadEye securities': 'quadeye.com',
  'Qualcomm': 'qualcomm.com',
  'raamtel': 'raamtel.com',
  'Razorpay': 'razorpay.com',
  'Renesas': 'renesas.com',
  'ReNew': 'renew.com',
  'Reslink Technologies Pvt. Ltd': 'reslink.org',
  'Rippling': 'rippling.com',
  'Rohde and Schwarz': 'rohde-schwarz.com',
  'Rx Logic': 'rxlogix.com',
  'Saas Labs': 'saaslabs.co',
  'SagaciousElevate': 'sagaciousresearch.com',
  'Salescode.ai': 'salescode.ai',
  'Salesforce': 'salesforce.com',
  'Samagra': 'samagragovernance.in',
  'Samsung E&A': 'samsungena.com',
  'Samsung E&A Pvt Ltd India': 'samsungena.com',
  'Samsung Heavy': 'samsungshi.com',
  'Samsung R&D Institute Bangalore (SRIB)': 'samsung.com',
  'Samsung Research Institute Noida (SRIN)': 'samsung.com',
  'Sandisk': 'sandisk.com',
  'SAP Labs': 'sap.com',
  'Sauce Labs': 'saucelabs.com',
  'Scaler': 'scaler.com',
  'Scaler AI Labs': 'scaler.com',
  'Schlumberger': 'slb.com',
  'Schlumberger(SLB)': 'slb.com',
  'Schneider Electric': 'se.com',
  'SEIL (Siemens Energy India Limited)': 'siemens-energy.com',
  'Shiprocket': 'shiprocket.in',
  'Shipsy': 'shipsy.io',
  'Shorthills.ai': 'shorthills.ai',
  'Siemens EDA': 'siemens.com',
  'Siemens Energy India Limited (SEIL)': 'siemens-energy.com',
  'Siemens SISW': 'siemens.com',
  'Sigmoid': 'sigmoid.com',
  'Signify': 'signify.com',
  'Signify Innovations(formerly Philips Lighting)': 'signify.com',
  'Silicon Labs': 'silabs.com',
  'Sirion Labs': 'sirion.ai',
  'SirionLabs': 'sirion.ai',
  'Sitetracker': 'sitetracker.com',
  'SITG': 'sitg.dev',
  'SITG France': 'sitg.dev',
  'SiTimes': 'sitime.com',
  'Slice': 'sliceit.com',
  'Sopra Steria': 'soprasteria.com',
  'Spinny': 'spinny.com',
  'Sprinklr': 'sprinklr.com',
  'Squad Stack': 'squadstack.ai',
  'SquadStack.ai': 'squadstack.ai',
  'STM SW': 'st.com',
  'Swiggy': 'swiggy.com',
  'Syrma SGS': 'syrmasgs.com',
  'SYSTRA MVA Consulting India': 'systra.com',
  'Tak Technologies': 'tak-technologies.com',
  'Tata 1Mg': '1mg.com',
  'Tata Advanced Systems Ltd': 'tataadvancedsystems.com',
  'Tata AIG Insurance': 'tataaig.com',
  'Tata Steel Downstream Products Limited (TSDPL)': 'tatasteel.com',
  'TBO': 'tbo.com',
  'TCIL (PSU)': 'tcil.net.in',
  'Tech Mahindra': 'techmahindra.com',
  'Technip Energies': 'technipenergies.com',
  'Tekion': 'tekion.com',
  'Texas Instruments': 'ti.com',
  'Think Exam': 'thinkexam.com',
  'Thorogood': 'thorogood.com',
  'Thorogood Associates': 'thorogood.com',
  'Times Internet': 'timesinternet.in',
  'Titan Email': 'titan.email',
  'To The New': 'tothenew.com',
  'Tower Research Capital': 'tower-research.com',
  'Tractebel Energy': 'tractebel-engie.com',
  'Transorg Analytics': 'transorg.com',
  'Tredence': 'tredence.com',
  'Trehan IRIS': 'trehaniris.com',
  'Trilogy': 'trilogy.com',
  'Trilogy Innovations': 'trilogy.com',
  'Trinity Life Sciences': 'trinitylifesciences.com',
  'Trusave (Bachatt)': 'bachatt.app',
  'Trusave Fintech (Bachatt)': 'bachatt.app',
  'Tyfone': 'tyfone.com',
  'Uber': 'uber.com',
  'udaan': 'udaan.com',
  'UKG': 'ukg.com',
  'Unify Apps': 'unifyapps.com',
  'UnifyApps': 'unifyapps.com',
  'United Airlines': 'united.com',
  'Univlabs': 'univlabs.in',
  'Unthinkable Solutions': 'unthinkable.co',
  'UPC Renewables India PVT LTD': 'upcrenewables.com',
  'Urban Company': 'urbancompany.com',
  'Vansun Media Tech': 'vansunmediatech.com',
  'Vara5': 'vara5.com',
  'Vecmocon Technologies': 'vecmocon.com',
  'Vegapay': 'vegapay.tech',
  'Veraxion': 'veraxion.com',
  'Verizon Data Services Pvt Ltd': 'verizon.com',
  'Vidyamandir Classes (VMC)': 'vidyamandir.com',
  'Visa': 'visa.com',
  'Viscadia Pvt Ltd.': 'viscadia.com',
  'VMware': 'vmware.com',
  'Walker Digital Table Systems': 'wdtablesystems.com',
  'Walmart': 'walmart.com',
  'Wells Fargo': 'wellsfargo.com',
  'WFYI Technology': 'wfyi.ai',
  'Winzo': 'winzogames.com',
  'Wio Bank': 'wio.io',
  'Wishlink': 'wishlink.com',
  'Wizcommerce': 'wizcommerce.com',
  'WNS Global Services (By Capegemini)': 'wns.com',
  'Wolf Mentoring': 'wolfmentoring.com',
  'Wootz.work': 'wootz.work',
  'World Wide Technology': 'wwt.com',
  'WPP Production': 'wppproduction.com',
  'WTW': 'wtwco.com',
  'WWT': 'wwt.com',
  'Xindus': 'xindus.net',
  'Yum India Global Services': 'yum.com',
  'Zenarate India': 'zenarate.com',
  'ZENARATE INDIA Pvt Ltd.': 'zenarate.com',
  'Zenergize': 'zenergize.in',
  'Zomato': 'zomato.com',
  'ZS Associates': 'zs.com',
  'Zstate AI': 'zstate.ai',
};

const DOMAINS = new Map(Object.entries(KNOWN).map(([name, domain]) => [companyKey(name), domain]));

export function knownDomains() {
  return [...new Set(Object.values(KNOWN))];
}

// Logos bundled with the site: { domain: path }. Loaded once; a slow or missing
// file just means the favicon services are used instead.
let bundled = {};
export function loadLogoManifest(timeoutMs = 2500) {
  const load = fetch('data/logos.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .then((m) => {
      if (m && typeof m === 'object') bundled = m;
    })
    .catch(() => {});
  return Promise.race([load, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

export function domainFor(company) {
  if (company.domain) return company.domain;
  return DOMAINS.get(company.key) || DOMAINS.get(companyKey(company.name.replace(/\(.*?\)/g, ''))) || '';
}

export function logoSources(company) {
  const domain = domainFor(company);
  if (!domain) return [];
  if (bundled[domain]) return [bundled[domain]];
  const list = [];
  if (CONFIG.logoDevToken) {
    list.push(`https://img.logo.dev/${domain}?token=${CONFIG.logoDevToken}&size=128&format=png`);
  }
  // Returns 404 (instead of a generic globe) when no icon exists, so the fallback kicks in.
  list.push(
    `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`,
  );
  list.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  return list;
}

export function initials(name) {
  const words = name.replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9& ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function monogramHue(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

// <span class="logo"> with an <img> that walks through the sources, ending in a monogram.
export function logoHtml(company, size = 'md') {
  const srcs = logoSources(company);
  const hue = `style="--h:${monogramHue(company.name)}"`;
  const mono = `<span class="logo-mono">${escapeHtml(initials(company.name))}</span>`;
  if (!srcs.length) return `<span class="logo logo-${size} is-mono" ${hue} aria-hidden="true">${mono}</span>`;
  const rest = srcs.slice(1).join('|');
  return `<span class="logo logo-${size}" ${hue} aria-hidden="true">${mono}<img src="${escapeHtml(srcs[0])}" data-fallbacks="${escapeHtml(rest)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`;
}

// One delegated handler for every logo image on the page.
export function installLogoFallbacks(root = document) {
  root.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.closest('.logo')) return;
      const rest = (img.dataset.fallbacks || '').split('|').filter(Boolean);
      if (rest.length) {
        img.dataset.fallbacks = rest.slice(1).join('|');
        img.src = rest[0];
      } else {
        img.closest('.logo').classList.add('is-mono');
        img.remove();
      }
    },
    true,
  );
  root.addEventListener(
    'load',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.closest('.logo')) return;
      const svg = /\.svg(\?|$)/i.test(img.currentSrc);
      const bundled = img.currentSrc.includes('/assets/logos/');
      // Favicon services sometimes answer with a 16px placeholder; treat tiny images from
      // them as missing (bundled logos were checked at build time; SVGs scale).
      if (!bundled && !svg && img.naturalWidth && img.naturalWidth < 24) {
        img.dispatchEvent(new Event('error'));
        return;
      }
      const logo = img.closest('.logo');
      logo.classList.add('is-loaded');
      // A small bitmap is drawn smaller so it stays sharp.
      if (!svg && img.naturalWidth && img.naturalWidth < 32) logo.classList.add('is-lowres');
    },
    true,
  );
}
