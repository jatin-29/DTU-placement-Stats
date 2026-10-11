// Company logos. Each company name is mapped to its website domain and the
// logo is fetched from a favicon/logo service by domain. Names without a known
// domain get a coloured monogram. To add a logo: add "Company name": "domain"
// below, or add a "Website" column to the Companies tab of the sheet.

import { CONFIG } from '../config.js';
import { companyKey } from './normalize.js';
import { escapeHtml } from './dom.js';

const KNOWN = {
  'Accenture': 'accenture.com',
  'Acme Group': 'acme.in',
  'Acmegrade': 'acmegrade.in',
  'Addverb Technologies': 'addverb.com',
  'Adobe': 'adobe.com',
  'AdvantageClub.ai': 'advantageclub.ai',
  'AiDash': 'aidash.com',
  'Air Liquide': 'airliquide.com',
  'Airamatrix': 'airamatrix.com',
  'AlgoSec': 'algosec.com',
  'Alvarez & Marsal': 'alvarezandmarsal.com',
  'Alvarez & Marshal': 'alvarezandmarsal.com',
  'Amazon': 'amazon.com',
  'AMD': 'amd.com',
  'Amdocs': 'amdocs.com',
  'Antino': 'antino.com',
  'Apple': 'apple.com',
  'Arcesium': 'arcesium.com',
  'ARM': 'arm.com',
  'Astrotalk': 'astrotalk.com',
  'Atlassian': 'atlassian.com',
  'Avaada Group': 'avaada.com',
  'Axis Bank': 'axisbank.com',
  'Axtria': 'axtria.com',
  'Bain': 'bain.com',
  'BCN (Bain)': 'bain.com',
  'Baker Hughes': 'bakerhughes.com',
  'Barco': 'barco.com',
  'Barco Electronics': 'barco.com',
  'Beghou': 'beghouconsulting.com',
  'Bharti Airtel Ltd': 'airtel.in',
  'BlackNGreen (BNG)': 'blackngreen.com',
  'BlackRock': 'blackrock.com',
  'Blinkit': 'blinkit.com',
  'Blinkit (Eternal)': 'blinkit.com',
  'Blue Matter': 'bluematterconsulting.com',
  'BNY Mellon': 'bny.com',
  'Bounteous x Accolit': 'bounteous.com',
  'BPCL': 'bharatpetroleum.in',
  'BrowserStack': 'browserstack.com',
  'Campus Activewear Ltd': 'campusshoes.com',
  'Car Dekho': 'cardekho.com',
  'GirnarSoft (Cardekho Group)': 'cardekho.com',
  'Care Health': 'careinsurance.com',
  'Cashfree Payments': 'cashfree.com',
  'CDOT': 'cdot.in',
  'Ciena': 'ciena.com',
  'Cisco': 'cisco.com',
  'ClearTax': 'cleartax.in',
  'Cognizant': 'cognizant.com',
  'Coursera': 'coursera.org',
  'CRED': 'cred.club',
  'Cvent': 'cvent.com',
  'De Shaw': 'deshaw.com',
  'Eightfold': 'eightfold.ai',
  'EIL': 'engineersindia.com',
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
  'Fluxon': 'fluxon.com',
  'FNZ': 'fnz.com',
  'Forvis Mazars': 'forvismazars.com',
  'Fractal.AI': 'fractal.ai',
  'Future First': 'futuresfirst.com',
  'Futures First': 'futuresfirst.com',
  'Gartner': 'gartner.com',
  'GEP': 'gep.com',
  'GoDaddy': 'godaddy.com',
  'Godrej Properties Ltd': 'godrejproperties.com',
  'Goldman Sachs': 'goldmansachs.com',
  'Google': 'google.com',
  'Grant Thorton': 'grantthornton.in',
  'Grant Thornton': 'grantthornton.in',
  'Groww': 'groww.in',
  'Havells India': 'havells.com',
  'HCL': 'hcltech.com',
  'Hero': 'heromotocorp.com',
  'Hindustan Coca-Cola Beverages': 'hccb.in',
  'Hyperverge': 'hyperverge.co',
  'IBM Consulting': 'ibm.com',
  'ICICI Bank': 'icicibank.com',
  'ICICI Bank Ltd': 'icicibank.com',
  'IGUS': 'igus.com',
  'Incedo': 'incedoinc.com',
  'IndiaMART': 'indiamart.com',
  'Indigo': 'goindigo.in',
  'Infineon': 'infineon.com',
  'InfoEdge': 'infoedge.in',
  'Infollion': 'infollion.com',
  'InfoOrigin': 'infoorigin.com',
  'Infosys': 'infosys.com',
  'Innovaccer': 'innovaccer.com',
  'Intuit': 'intuit.com',
  'ION Group': 'iongroup.com',
  'ITC Limited': 'itcportal.com',
  'Ixigo': 'ixigo.com',
  'JCB': 'jcb.com',
  'Jindal Steel': 'jindalsteel.com',
  'Joveo': 'joveo.com',
  'JPMC': 'jpmorganchase.com',
  'Jubilant Foodworks': 'jubilantfoodworks.com',
  'Juspay': 'juspay.in',
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
  'MAQ Software': 'maqsoftware.com',
  'Maruti Suzuki': 'marutisuzuki.com',
  'Masters Union': 'mastersunion.org',
  'Mastercard': 'mastercard.com',
  'McCain': 'mccain.com',
  'McKinsey': 'mckinsey.com',
  'Media Net': 'media.net',
  'Media.Net': 'media.net',
  'Meesho': 'meesho.com',
  'Micron': 'micron.com',
  'Microsoft': 'microsoft.com',
  'MongoDB': 'mongodb.com',
  'Moodys': 'moodys.com',
  'Morgan Stanley': 'morganstanley.com',
  'MPS Limited': 'mpslimited.com',
  'MRSOOL': 'mrsool.co',
  'Myntra': 'myntra.com',
  'Myntra (off-campus)': 'myntra.com',
  'Nagarro': 'nagarro.com',
  'National Australia Bank': 'nab.com.au',
  'Natwest': 'natwestgroup.com',
  'Navi': 'navi.com',
  'Netsmartz': 'netsmartz.com',
  'Nielsen': 'nielsen.com',
  'Niva Bupa': 'nivabupa.com',
  'Novartis': 'novartis.com',
  'NVIDIA': 'nvidia.com',
  'NXP': 'nxp.com',
  'NXP Semiconductor': 'nxp.com',
  'NxtWave': 'nxtwave.com',
  'Nykaa': 'nykaa.com',
  'OLX': 'olx.in',
  'OnGrid': 'ongrid.in',
  'Optum': 'optum.com',
  'Oracle': 'oracle.com',
  'Oracle - WAITLIST': 'oracle.com',
  'Orange Business': 'orange-business.com',
  'OYO': 'oyorooms.com',
  'PRISM (OYO)': 'oyorooms.com',
  'Paharpur Cooling Towers Ltd.': 'paharpur.com',
  'Palo Alto Networks': 'paloaltonetworks.com',
  'PayTM': 'paytm.com',
  'Pharmeasy': 'pharmeasy.in',
  'PhonePe': 'phonepe.com',
  'Pine Labs': 'pinelabs.com',
  'Polestar Analytics': 'polestarllp.com',
  'Policy Bazaar': 'policybazaar.com',
  'PolicyBazaar': 'policybazaar.com',
  'Proc DNA': 'procdna.com',
  'Publicis Sapient': 'publicissapient.com',
  'PwC': 'pwc.com',
  'QuadEye securities': 'quadeye.com',
  'Qualcomm': 'qualcomm.com',
  'Razorpay': 'razorpay.com',
  'ReNew': 'renew.com',
  'Renesas': 'renesas.com',
  'Rippling': 'rippling.com',
  'Rohde and Schwarz': 'rohde-schwarz.com',
  'Rx Logic': 'rxlogix.com',
  'Saas Labs': 'saaslabs.co',
  'Salescode.ai': 'salescode.ai',
  'Salesforce': 'salesforce.com',
  'Samsung E&A': 'samsungena.com',
  'Samsung E&A Pvt Ltd India': 'samsungena.com',
  'Samsung Heavy': 'samsungshi.com',
  'Samsung R&D Institute Bangalore (SRIB)': 'samsung.com',
  'Samsung Research Institute Noida (SRIN)': 'samsung.com',
  'Sandisk': 'sandisk.com',
  'Sauce Labs': 'saucelabs.com',
  'Scaler AI Labs': 'scaler.com',
  'Schlumberger': 'slb.com',
  'Schlumberger(SLB)': 'slb.com',
  'Schneider Electric': 'se.com',
  'SEIL (Siemens Energy India Limited)': 'siemens-energy.com',
  'Siemens Energy India Limited (SEIL)': 'siemens-energy.com',
  'Shiprocket': 'shiprocket.in',
  'Shipsy': 'shipsy.io',
  'Siemens EDA': 'siemens.com',
  'Siemens SISW': 'siemens.com',
  'Sigmoid': 'sigmoid.com',
  'Signify': 'signify.com',
  'Signify Innovations(formerly Philips Lighting)': 'signify.com',
  'Silicon Labs': 'silabs.com',
  'Sirion Labs': 'sirion.ai',
  'SirionLabs': 'sirion.ai',
  'Sitetracker': 'sitetracker.com',
  'Slice': 'sliceit.com',
  'Spinny': 'spinny.com',
  'Sprinklr': 'sprinklr.com',
  'Squad Stack': 'squadstack.ai',
  'SquadStack.ai': 'squadstack.ai',
  'STM SW': 'st.com',
  'Swiggy': 'swiggy.com',
  'Syrma SGS': 'syrmasgs.com',
  'SYSTRA MVA Consulting India': 'systra.com',
  'Tata AIG Insurance': 'tataaig.com',
  'Tata Steel Downstream Products Limited (TSDPL)': 'tatasteel.com',
  'TBO': 'tbo.com',
  'TCIL (PSU)': 'tcil.net.in',
  'Tech Mahindra': 'techmahindra.com',
  'Technip Energies': 'technipenergies.com',
  'Tekion': 'tekion.com',
  'Texas Instruments': 'ti.com',
  'Thorogood': 'thorogood.com',
  'Thorogood Associates': 'thorogood.com',
  'Times Internet': 'timesinternet.in',
  'Titan Email': 'titan.email',
  'To The New': 'tothenew.com',
  'Tower Research Capital': 'tower-research.com',
  'Tractebel Energy': 'tractebel-engie.com',
  'Transorg Analytics': 'transorg.com',
  'Tredence': 'tredence.com',
  'Trilogy': 'trilogy.com',
  'Trinity Life Sciences': 'trinitylifesciences.com',
  'Tyfone': 'tyfone.com',
  'Uber': 'uber.com',
  'Unify Apps': 'unifyapps.com',
  'UnifyApps': 'unifyapps.com',
  'United Airlines': 'united.com',
  'Unthinkable Solutions': 'unthinkable.co',
  'Urban Company': 'urbancompany.com',
  'Vecmocon Technologies': 'vecmocon.com',
  'Vegapay': 'vegapay.tech',
  'Verizon Data Services Pvt Ltd': 'verizon.com',
  'Vidyamandir Classes (VMC)': 'vidyamandir.com',
  'Viscadia Pvt Ltd.': 'viscadia.com',
  'Visa': 'visa.com',
  'Walmart': 'walmart.com',
  'Wells Fargo': 'wellsfargo.com',
  'Winzo': 'winzogames.com',
  'Wishlink': 'wishlink.com',
  'Wizcommerce': 'wizcommerce.com',
  'Wootz.work': 'wootz.work',
  'World Wide Technology': 'wwt.com',
  'WWT': 'wwt.com',
  'Xindus': 'xindus.net',
  'Yum India Global Services': 'yum.com',
  'Zenarate India': 'zenarate.com',
  'ZENARATE INDIA Pvt Ltd.': 'zenarate.com',
  'Zomato': 'zomato.com',
  'ZS Associates': 'zs.com',
};

const DOMAINS = new Map(Object.entries(KNOWN).map(([name, domain]) => [companyKey(name), domain]));

export function domainFor(company) {
  if (company.domain) return company.domain;
  return DOMAINS.get(company.key) || DOMAINS.get(companyKey(company.name.replace(/\(.*?\)/g, ''))) || '';
}

export function logoSources(company) {
  const domain = domainFor(company);
  if (!domain) return [];
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
      // Favicon services sometimes answer with a 16px placeholder; treat tiny images as missing.
      if (img.naturalWidth && img.naturalWidth < 24) img.dispatchEvent(new Event('error'));
      else img.closest('.logo').classList.add('is-loaded');
    },
    true,
  );
}
