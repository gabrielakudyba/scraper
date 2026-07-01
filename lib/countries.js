/** Common country names for location parsing */
export const COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bolivia", "Bosnia and Herzegovina",
  "Brazil", "Bulgaria", "Cambodia", "Canada", "Chile", "China", "Colombia", "Croatia", "Cuba",
  "Cyprus", "Czech Republic", "Czechia", "Denmark", "Ecuador", "Egypt", "Estonia", "Ethiopia",
  "Finland", "France", "Georgia", "Germany", "Ghana", "Greece", "Hungary", "Iceland", "India",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Japan", "Jordan", "Kazakhstan",
  "Kenya", "Kuwait", "Latvia", "Lebanon", "Lithuania", "Luxembourg", "Malaysia", "Mexico",
  "Moldova", "Mongolia", "Morocco", "Netherlands", "New Zealand", "Nigeria", "North Macedonia",
  "Norway", "Oman", "Pakistan", "Panama", "Peru", "Philippines", "Poland", "Portugal", "Qatar",
  "Romania", "Russia", "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia",
  "South Africa", "South Korea", "Spain", "Sri Lanka", "Sweden", "Switzerland", "Taiwan",
  "Thailand", "Tunisia", "Turkey", "Türkiye", "Ukraine", "United Arab Emirates", "UAE",
  "United Kingdom", "UK", "United States", "USA", "Uzbekistan", "Venezuela", "Vietnam",
];

const COUNTRY_ALIASES = {
  UK: "United Kingdom",
  USA: "United States",
  US: "United States",
  UAE: "United Arab Emirates",
  Czechia: "Czech Republic",
  Türkiye: "Turkey",
  DE: "Germany",
  ES: "Spain",
  FR: "France",
  IT: "Italy",
  PL: "Poland",
  CN: "China",
  JP: "Japan",
  AU: "Australia",
  CA: "Canada",
  NL: "Netherlands",
  BE: "Belgium",
  AT: "Austria",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  IE: "Ireland",
  PT: "Portugal",
  GR: "Greece",
  TR: "Turkey",
  IN: "India",
  SG: "Singapore",
  MY: "Malaysia",
  TH: "Thailand",
  VN: "Vietnam",
  KR: "South Korea",
  BR: "Brazil",
  MX: "Mexico",
  RU: "Russian Federation",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  IL: "Israel",
  ZA: "South Africa",
  NZ: "New Zealand",
  HK: "Hong Kong",
  TW: "Taiwan",
};

export function normalizeCountry(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (COUNTRY_ALIASES[s]) return COUNTRY_ALIASES[s];
  if (COUNTRY_ALIASES[s.toUpperCase()]) return COUNTRY_ALIASES[s.toUpperCase()];
  const found = COUNTRIES.find(
    (c) => c.toLowerCase() === s.toLowerCase() || s.toLowerCase().includes(c.toLowerCase())
  );
  return found ? (COUNTRY_ALIASES[found] || found) : s;
}

export function extractCountryFromText(text) {
  if (!text) return "";
  const sorted = [...COUNTRIES].sort((a, b) => b.length - a.length);
  for (const country of sorted) {
    const re = new RegExp(`\\b${country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) return normalizeCountry(country);
  }
  return "";
}
