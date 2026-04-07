/**
 * IATA airport code → IANA timezone for interpreting sheet "wall clock" times
 * (no timezone in CSV) as absolute instants (stored as UTC in Mongo).
 * Covers major hubs; unknown codes fall back via getTimezoneForIata.
 */
const IATA_TO_TZ = {
  // Malaysia / SEA
  KUL: 'Asia/Kuala_Lumpur',
  PEN: 'Asia/Kuala_Lumpur',
  JHB: 'Asia/Kuala_Lumpur',
  BKI: 'Asia/Kuching',
  KCH: 'Asia/Kuching',
  SIN: 'Asia/Singapore',
  BKK: 'Asia/Bangkok',
  HKT: 'Asia/Bangkok',
  USM: 'Asia/Bangkok',
  MNL: 'Asia/Manila',
  CGK: 'Asia/Jakarta',
  DPS: 'Asia/Makassar',
  SUB: 'Asia/Jakarta',
  HAN: 'Asia/Bangkok',
  SGN: 'Asia/Ho_Chi_Minh',
  RGN: 'Asia/Yangon',
  // South Asia
  DEL: 'Asia/Kolkata',
  BOM: 'Asia/Kolkata',
  BLR: 'Asia/Kolkata',
  MAA: 'Asia/Kolkata',
  CCU: 'Asia/Kolkata',
  HYD: 'Asia/Kolkata',
  CMB: 'Asia/Colombo',
  DAC: 'Asia/Dhaka',
  KTM: 'Asia/Kathmandu',
  // East Asia
  HKG: 'Asia/Hong_Kong',
  MFM: 'Asia/Macau',
  TPE: 'Asia/Taipei',
  PVG: 'Asia/Shanghai',
  PEK: 'Asia/Shanghai',
  CAN: 'Asia/Shanghai',
  SZX: 'Asia/Shanghai',
  NRT: 'Asia/Tokyo',
  HND: 'Asia/Tokyo',
  KIX: 'Asia/Tokyo',
  ICN: 'Asia/Seoul',
  // Middle East
  DXB: 'Asia/Dubai',
  AUH: 'Asia/Dubai',
  DOH: 'Asia/Qatar',
  RUH: 'Asia/Riyadh',
  JED: 'Asia/Riyadh',
  TLV: 'Asia/Jerusalem',
  IST: 'Europe/Istanbul',
  // Europe
  LHR: 'Europe/London',
  LGW: 'Europe/London',
  MAN: 'Europe/London',
  CDG: 'Europe/Paris',
  ORY: 'Europe/Paris',
  AMS: 'Europe/Amsterdam',
  FRA: 'Europe/Berlin',
  MUC: 'Europe/Berlin',
  ZRH: 'Europe/Zurich',
  VIE: 'Europe/Vienna',
  MAD: 'Europe/Madrid',
  BCN: 'Europe/Madrid',
  FCO: 'Europe/Rome',
  ATH: 'Europe/Athens',
  ARN: 'Europe/Stockholm',
  OSL: 'Europe/Oslo',
  CPH: 'Europe/Copenhagen',
  HEL: 'Europe/Helsinki',
  WAW: 'Europe/Warsaw',
  PRG: 'Europe/Prague',
  DUB: 'Europe/Dublin',
  // Americas
  JFK: 'America/New_York',
  EWR: 'America/New_York',
  LGA: 'America/New_York',
  BOS: 'America/New_York',
  IAD: 'America/New_York',
  MIA: 'America/New_York',
  ORD: 'America/Chicago',
  DFW: 'America/Chicago',
  DEN: 'America/Denver',
  LAX: 'America/Los_Angeles',
  SFO: 'America/Los_Angeles',
  SEA: 'America/Los_Angeles',
  YVR: 'America/Vancouver',
  YYZ: 'America/Toronto',
  YUL: 'America/Toronto',
  GRU: 'America/Sao_Paulo',
  GIG: 'America/Sao_Paulo',
  MEX: 'America/Mexico_City',
  // Oceania
  SYD: 'Australia/Sydney',
  MEL: 'Australia/Melbourne',
  BNE: 'Australia/Brisbane',
  PER: 'Australia/Perth',
  AKL: 'Pacific/Auckland',
  // Africa
  JNB: 'Africa/Johannesburg',
  CPT: 'Africa/Johannesburg',
  CAI: 'Africa/Cairo',
  NBO: 'Africa/Nairobi',
  ADD: 'Africa/Addis_Ababa'
};

const DEFAULT_EVENT_TZ = 'Asia/Kuala_Lumpur';

/**
 * @param {string|null|undefined} iata - 3-letter IATA or null
 * @returns {string} IANA timezone
 */
function getTimezoneForIata(iata) {
  if (!iata || typeof iata !== 'string') return DEFAULT_EVENT_TZ;
  const code = iata.trim().toUpperCase();
  if (code.length !== 3) return DEFAULT_EVENT_TZ;
  return IATA_TO_TZ[code] || DEFAULT_EVENT_TZ;
}

module.exports = {
  IATA_TO_TZ,
  DEFAULT_EVENT_TZ,
  getTimezoneForIata
};
