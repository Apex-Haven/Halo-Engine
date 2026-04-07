const axios = require('axios');
const moment = require('moment-timezone');
const User = require('../models/User');
const Transfer = require('../models/Transfer');
const bcrypt = require('bcryptjs');
const { enrichFlightDetails, formatAirportLocation, syncEstimatedPickupTimesFromFlights } = require('./flightEnrichmentHelper');
const { getTimezoneForIata } = require('./iataTimezones');

/**
 * Google Sheets Sync Service for Travelers and Drivers
 * Uses opensheet.elk.sh API (free, no auth needed for public sheets)
 */
class GoogleSheetsSyncService {
  constructor() {
    this.opensheetBaseUrl = 'https://opensheet.elk.sh';
  }

  /**
   * Fetch data from Google Sheets
   * @param {string} sheetId - Google Sheet ID (from URL)
   * @param {string} sheetName - Optional sheet name (default: first sheet)
   * @returns {Promise<Array>} Array of row objects
   */
  async fetchSheetData(sheetId, sheetName = '') {
    try {
      // Validate Sheet ID format (should be alphanumeric with hyphens/underscores, typically 44 chars)
      if (!sheetId || typeof sheetId !== 'string' || sheetId.trim().length < 20) {
        throw new Error('Invalid Sheet ID format. Please check that you copied the correct Sheet ID from the Google Sheets URL.');
      }

      const cleanSheetId = sheetId.trim();
      const basePath = sheetName 
        ? `${this.opensheetBaseUrl}/${cleanSheetId}/${encodeURIComponent(sheetName)}`
        : `${this.opensheetBaseUrl}/${cleanSheetId}`;
      const url = `${basePath}?raw=true`;
      
      console.log(`📊 Fetching Google Sheet data from: ${basePath}`);
      const response = await axios.get(url, {
        timeout: 30000 // 30 second timeout
      });

      if (!Array.isArray(response.data)) {
        throw new Error('Invalid sheet data format - expected array of rows');
      }

      if (response.data.length === 0) {
        throw new Error('Sheet appears to be empty or has no data rows');
      }

      console.log(`✅ Fetched ${response.data.length} rows from Google Sheet`);
      return response.data;
    } catch (error) {
      console.error('Error fetching Google Sheet:', error.message);
      console.error('Full error:', error.response?.data || error.message);
      
      // Provide more helpful error messages
      if (error.response?.status === 400) {
        throw new Error(
          'Failed to fetch Google Sheet (400 Bad Request). ' +
          'Common causes: 1) Sheet is not public (Share → Anyone with the link → Viewer), ' +
          '2) Invalid Sheet ID, 3) Sheet name doesn\'t exist. ' +
          `Sheet ID used: ${sheetId.substring(0, 20)}...`
        );
      } else if (error.response?.status === 404) {
        throw new Error(
          'Sheet not found (404). Please verify: 1) The Sheet ID is correct, ' +
          '2) The sheet is public (Share → Anyone with the link → Viewer), ' +
          '3) The sheet name (if provided) matches exactly.'
        );
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new Error('Request timed out. The sheet might be too large or the service is slow. Please try again.');
      } else {
        throw new Error(`Failed to fetch Google Sheet: ${error.message || 'Unknown error'}`);
      }
    }
  }

  /**
   * Parse a single CSV line handling quoted fields (handles commas inside quotes)
   * @param {string} line - CSV line
   * @returns {string[]} Array of field values
   */
  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    result.push(current.trim());
    return result;
  }

  /**
   * Fetch sheet data as CSV to preserve column order (for duplicate headers).
   * Transfer sync format has duplicate "Check In Date" and "Flight No" columns.
   * @param {string} sheetId - Google Sheet ID
   * @param {number} gid - Sheet tab ID (0 = first sheet)
   * @returns {Promise<{ headers: string[], rows: string[][] }>}
   */
  async fetchSheetDataAsArrays(sheetId, gid = 0) {
    try {
      if (!sheetId || typeof sheetId !== 'string' || sheetId.trim().length < 20) {
        throw new Error('Invalid Sheet ID format. Please check that you copied the correct Sheet ID from the Google Sheets URL.');
      }
      const cleanSheetId = sheetId.trim();
      const url = `https://docs.google.com/spreadsheets/d/${cleanSheetId}/export?format=csv&gid=${gid}`;
      console.log(`📊 Fetching Google Sheet as CSV: ${url}`);
      const response = await axios.get(url, { timeout: 30000, responseType: 'text' });
      const text = typeof response.data === 'string' ? response.data : String(response.data);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        throw new Error('Sheet appears to be empty or has no data rows');
      }
      const headers = this.parseCSVLine(lines[0]);
      const rows = lines.slice(1).map((line) => this.parseCSVLine(line));
      console.log(`✅ Fetched ${rows.length} rows (${headers.length} columns) from CSV`);
      return { headers, rows };
    } catch (error) {
      if (error.response?.status === 403 || error.response?.status === 404) {
        throw new Error(
          'Failed to fetch Google Sheet. Ensure the sheet is public (Share → Anyone with the link → Viewer). ' +
          `Sheet ID: ${sheetId.substring(0, 20)}...`
        );
      }
      throw error;
    }
  }

  /**
   * Normalize column names (handle variations)
   * @param {string} columnName - Column name from sheet
   * @returns {string} Normalized column name
   */
  normalizeColumnName(columnName) {
    if (!columnName) return '';
    
    const normalized = columnName.trim().toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[_-]/g, '')
      .replace(/[()\/:&]/g, '');
    
    // Map common variations (normalized key → internal field name used in getValue)
    const columnMap = {
      'firstname': 'firstName',
      'first_name': 'firstName',
      'fname': 'firstName',
      'lastname': 'lastName',
      'last_name': 'lastName',
      'lname': 'lastName',
      'salutation': 'salutation',
      'fullname': 'fullName',
      'full_name': 'fullName',
      'name': 'fullName',
      'email': 'email',
      'emailaddress': 'email',
      'emailid': 'email',
      'email_id': 'email',
      'phone': 'phone',
      'phonenumber': 'phone',
      'mobile': 'phone',
      'client': 'client',
      'clientname': 'client',
      'clientemail': 'client',
      'vendor': 'vendor',
      'vendorname': 'vendor',
      'vendoremail': 'vendor',
      'username': 'username',
      'user': 'username',
      'password': 'password',
      'pass': 'password',
      'licensenumber': 'licenseNumber',
      'license': 'licenseNumber',
      'licenseno': 'licenseNumber',
      'vehicletype': 'vehicleType',
      'vehicle': 'vehicleType',
      'vehiclenumber': 'vehicleNumber',
      'vehicleno': 'vehicleNumber',
      'vehiclereg': 'vehicleNumber',
      'experience': 'experience',
      'exp': 'experience',
      'yearsexperience': 'experience',

      // Event registration specific (Delegate 1 / primary traveler)
      'timestamp': 'timestamp',
      'emailaddress': 'email',
      'emailid': 'email',
      'fullname': 'fullName',
      'jobpositiondesignation': 'primaryJobPosition',
      'companyname': 'primaryCompanyName',
      'phonenumber': 'primaryPhone',
      'phonenumberwhatsapp': 'primaryPhone',
      'haveyoualreadybookedyourflightfortheevent': 'flightBooked',
      'arrivalflightnumber': 'arrivalFlightNo',
      'arrivaldate': 'arrivalDate',
      'arrivaldate&time': 'arrivalDateTime',
      'arrivaldatetime': 'arrivalDateTime',
      'departureflightnumber': 'departureFlightNo',
      'departuredate': 'departureDate',
      'departuredate&time': 'departureDateTime',
      'departuredatetime': 'departureDateTime',
      'iagreereceiveemailcommunicationregardingmyairporttransfersandeventtravelcoordination': 'primaryConsentEmail',
      'iconsenttoreceivewhatsappnotificationsrelatedtopickupschedulesandupdates': 'primaryConsentWhatsapp',
      'pleaseprovideyourwhatsappnumber': 'primaryWhatsapp',
      'pleaseprovideyourwhatsappnumberbelow': 'primaryWhatsappAlt',

      // Delegate 2 (plus-one) specific
      'wouldyouliketoaddanadditionaldelegatetravellingwithyou': 'addDelegate',
      'fullname(delegate2)': 'delegate2FullName',
      'jobpositiondesignationdelegate2': 'delegate2JobPosition',
      'companynamedelegate2': 'delegate2CompanyName',
      'emailiddelegate2': 'delegate2Email',
      'phonenumberwhatsappdelegate2': 'delegate2Phone',
      'isitthe sameasdelegate1': 'delegate2SameAsPrimaryFlight',
      'isittthesameasdelegate1': 'delegate2SameAsPrimaryFlight',
      'isittthesameasdelegate1?': 'delegate2SameAsPrimaryFlight',
      'arrivalflightnumberdelegate2': 'delegate2ArrivalFlightNo',
      'arrivaldatedelegate2': 'delegate2ArrivalDate',
      'departureflightnumberdelegate2': 'delegate2DepartureFlightNo',
      'departuredatedelegate2': 'delegate2DepartureDate',
      'iagreereceiveemailcommunicationregardingmyairporttransfersandeventtravelcoordinationdelegate2': 'delegate2ConsentEmail'
    };

    return columnMap[normalized] || normalized;
  }

  /**
   * Parse sheet row to traveler data
   * @param {Object} row - Row from Google Sheet
   * @param {Object} columnMap - Map of normalized column names to indices
   * @returns {Object} Traveler data object
   */
  parseRowToTraveler(row, columnMap) {
    const getValue = (normalizedKey) => {
      // Get the actual header name from the map
      const actualHeaderName = columnMap[normalizedKey];
      if (!actualHeaderName) return null;
      
      // Try different case variations of the header name
      const value = row[actualHeaderName] || 
                    row[actualHeaderName.toLowerCase()] || 
                    row[actualHeaderName.toUpperCase()] ||
                    row[this.capitalizeFirst(actualHeaderName)];
      
      return value ? String(value).trim() : null;
    };

    let firstName = getValue('firstName');
    let lastName = getValue('lastName');
    const fullName = getValue('fullName');
    // If sheet has "Full Name" instead of First/Last, split into first and last
    if (fullName && fullName.trim() && (!firstName || !lastName)) {
      const parts = fullName.trim().split(/\s+/);
      if (parts.length >= 2) {
        firstName = firstName || parts[0] || '';
        lastName = lastName || parts.slice(1).join(' ').trim() || '';
      } else if (parts.length === 1) {
        firstName = firstName || parts[0] || '';
        lastName = lastName || parts[0] || ''; // use same for last if single word
      }
    }
    const salutation = getValue('salutation');
    const email = getValue('email');
    const phone = getValue('phone');
    const client = getValue('client');
    const username = getValue('username');
    const password = getValue('password');

    // Validate required fields (need at least first name, last name, and email)
    if (!firstName || !lastName || !email) {
      return {
        valid: false,
        error: 'Missing required fields: FirstName, LastName, or Email (or use columns: Full Name and Email Address / Email ID)'
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        error: `Invalid email format: ${email}`
      };
    }

    // Validate and normalize phone format if provided
    let normalizedPhone = phone;
    if (phone) {
      // Remove all spaces and any non-digit characters except +
      normalizedPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
      
      // Auto-fix: If phone doesn't start with +, try to add it
      if (!normalizedPhone.startsWith('+')) {
        // Case 1: 12-digit number starting with 91 (Indian with country code) - MOST COMMON
        if (normalizedPhone.length === 12 && normalizedPhone.startsWith('91')) {
          normalizedPhone = `+${normalizedPhone}`;
        }
        // Case 2: 10-digit number starting with 9 (likely Indian mobile)
        else if (normalizedPhone.length === 10 && normalizedPhone.startsWith('9')) {
          normalizedPhone = `+91${normalizedPhone}`;
        }
        // Case 3: 10-digit number starting with 1 (likely US/Canada)
        else if (normalizedPhone.length === 10 && normalizedPhone.startsWith('1')) {
          normalizedPhone = `+1${normalizedPhone}`;
        }
        // Case 4: 11-digit number starting with 1 (US/Canada with country code)
        else if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
          normalizedPhone = `+${normalizedPhone}`;
        }
        // Case 5: Any other 10-15 digit number - try adding +1 for US/Canada
        else if (normalizedPhone.length >= 10 && normalizedPhone.length <= 15 && /^\d+$/.test(normalizedPhone)) {
          // For numbers that look like they might be missing the +, we'll be lenient
          // and add +1 for US/Canada (most common), but this might not always be correct
          // Better to require + prefix for other countries
          if (normalizedPhone.length === 10) {
            normalizedPhone = `+1${normalizedPhone}`; // Assume US/Canada
          } else {
            return {
              valid: false,
              error: `Invalid phone format: ${phone}. Phone must start with + followed by country code. Example: +918108457911 (for India) or +1234567890 (for US). Your number appears to be missing the + prefix.`
            };
          }
        }
        // Case 6: Invalid format
        else {
          return {
            valid: false,
            error: `Invalid phone format: ${phone}. Phone must start with + followed by country code. Example: +918108457911 (for India) or +1234567890 (for US). Your number: ${normalizedPhone}`
          };
        }
      }
      
      // Final validation: must match +[1-9][digits] format (1-15 digits after +)
      if (!/^\+[1-9]\d{1,14}$/.test(normalizedPhone)) {
        return {
          valid: false,
          error: `Invalid phone format: ${phone}. Must be in format +[country code][number] (e.g., +918108457911). Country code must be 1-9, followed by 1-14 digits.`
        };
      }
    }

    return {
      valid: true,
      data: {
        salutation: salutation || undefined,
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone: normalizedPhone || '',
        client,
        username: username || this.generateUsername(email, firstName, lastName),
        password: password || this.generatePassword()
      }
    };
  }

  /**
   * Build column index map for transfer sync format.
   * New format: Confirmation, Company Name, Salutation, First Name, Last Name, Name As Per Passport,
   * Contact No, Email, Onward Flight No, Onward Flight Dep. Airport, Onward Flight Dep. Date,
   * Onward Flight ETD, Onward Flight Arr. Airport, Onward Flight Arr. Date, Onward Flight ETA,
   * Return Flight No, Return Flight Dep. Airport, Return Flight Dep. Date, Return Flight ETD,
   * Return Flight Arr. Airport, Return Flight Arr. Date, Return Flight ETA
   * Also supports legacy: Check In Date, Flight No, ETA, Check Out Date, Flight No, ETD
   * @param {string[]} headers - Header row from CSV
   * @returns {Object} Map of field name -> column index
   */
  buildTransferSyncColumnMap(headers) {
    const normalize = (h) =>
      String(h || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[.\-_()/:&]/g, '');
    const map = {};
    const seen = {};
    for (let i = 0; i < headers.length; i++) {
      const n = normalize(headers[i]);
      if (!n) continue;
      // New format: explicit Onward / Return columns
      if (n === 'onwardflightno') map.arrivalFlightNo = i;
      else if (n === 'onwardflightdepairport') map.onwardDepAirport = i;
      else if (n === 'onwardflightdepdate') map.onwardDepDate = i;
      else if (n === 'onwardflightetd') map.onwardETD = i;
      else if (n === 'onwardflightarrairport') map.onwardArrAirport = i;
      else if (n === 'onwardflightarrdate') map.onwardArrDate = i;
      else if (n === 'onwardflighteta') map.onwardETA = i;
      else if (n === 'returnflightno') map.returnFlightNo = i;
      else if (n === 'returnflightdepairport') map.returnDepAirport = i;
      else if (n === 'returnflightdepdate') map.returnDepDate = i;
      else if (n === 'returnflightetd') map.returnETD = i;
      else if (n === 'returnflightarrairport') map.returnArrAirport = i;
      else if (n === 'returnflightarrdate') map.returnArrDate = i;
      else if (n === 'returnflighteta') map.returnETA = i;
      // Legacy: duplicate Check In Date / Flight No
      else if (n === 'checkindate') {
        if (!seen.checkindate) {
          map.arrivalCheckInDate = i;
          map.onwardArrDate = map.onwardArrDate ?? i;
          seen.checkindate = 1;
        } else {
          map.returnCheckInDate = i;
          map.returnDepDate = map.returnDepDate ?? i;
        }
      } else if (n === 'flightno') {
        if (!seen.flightno) {
          map.arrivalFlightNo = map.arrivalFlightNo ?? i;
          seen.flightno = 1;
        } else {
          map.returnFlightNo = map.returnFlightNo ?? i;
        }
      } else if (n === 'eta') {
        map.onwardETA = map.onwardETA ?? i;
      } else if (n === 'checkoutdate') {
        map.checkOutDate = i;
        map.returnDepDate = map.returnDepDate ?? i;
      } else if (n === 'etd') {
        map.returnETD = map.returnETD ?? i;
      }
      // Common
      else if (n === 'companyname') map.companyName = i;
      else if (n === 'salutation') map.salutation = i;
      else if (n === 'firstname') map.firstName = i;
      else if (n === 'lastname') map.lastName = i;
      else if (n === 'nameasperpassport') map.nameAsPerPassport = i;
      else if (n === 'passportno' || n === 'passportnumber') map.passportNumber = i;
      else if (n === 'contactno') map.contactNo = i;
      else if (n === 'email') map.email = i;
    }
    return map;
  }

  /**
   * Parse date+time from transfer sync format (e.g. "7/5/2026", "21:00").
   * Sheet times have no timezone: they are interpreted as **local wall time at the reference airport**
   * (onward: Onward Dep. Airport, fallback Onward Arr.; return: Return Dep., fallback Return Arr.).
   * Stored result is UTC (ISO), so the UI can format consistently.
   *
   * @param {string} dateStr - Date like "7/5/2026", "2026-05-07", or Sheets serial
   * @param {string} timeStr - "21:00" (24h), "9:55 PM", etc.
   * @param {string|null} [airportIata] - 3-letter IATA for timezone (e.g. onward dep airport)
   * @returns {string|null} ISO string or null
   */
  parseTransferSyncDateTime(dateStr, timeStr, airportIata) {
    if (dateStr == null || !String(dateStr).trim()) return null;
    const tz = getTimezoneForIata(airportIata);
    const s = String(dateStr).trim();

    let y;
    let month;
    let day;

    const num = Number(s);
    if (!Number.isNaN(num) && num > 20000 && num < 80000) {
      const dSerial = new Date((num - 25569) * 86400 * 1000);
      if (!Number.isNaN(dSerial.getTime())) {
        y = dSerial.getUTCFullYear();
        month = dSerial.getUTCMonth() + 1;
        day = dSerial.getUTCDate();
      }
    }

    const isoYmd = !y && s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!y && isoYmd) {
      y = parseInt(isoYmd[1], 10);
      month = parseInt(isoYmd[2], 10);
      day = parseInt(isoYmd[3], 10);
    }

    // Google Sheets often exports dates as "6-May-26" / "06-May-2026" — numeric split below fails on "May".
    if (!y) {
      const flex = moment(
        s,
        [
          'D-MMM-YY',
          'DD-MMM-YY',
          'D-MMM-YYYY',
          'DD-MMM-YYYY',
          'D MMM YY',
          'DD MMM YY',
          'D MMM YYYY',
          'DD MMM YYYY'
        ],
        true
      );
      if (flex.isValid()) {
        y = flex.year();
        month = flex.month() + 1;
        day = flex.date();
      }
    }

    if (!y) {
      const parts = s.split(/[/-]/);
      if (parts.length >= 3) {
        const [a, b, c] = parts.map((p) => parseInt(p, 10));
        if ([a, b, c].some((n) => Number.isNaN(n))) {
          return null;
        }
        if (a > 12) {
          day = a;
          month = b;
          y = c;
        } else if (b > 12) {
          month = a;
          day = b;
          y = c;
        } else {
          month = b;
          day = a;
          y = c;
        }
      } else {
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return null;
        y = d.getFullYear();
        month = d.getMonth() + 1;
        day = d.getDate();
      }
    }

    let hour = 0;
    let minute = 0;
    if (timeStr && String(timeStr).trim()) {
      const t = String(timeStr).trim();
      const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
      // 24h "21:00" must not be parsed as 12h; try 24h if no AM/PM match
      const m24 = !m12 ? t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/) : null;
      if (m12) {
        let h = parseInt(m12[1], 10);
        const mins = parseInt(m12[2], 10);
        const ampm = m12[3].toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        hour = h;
        minute = mins;
      } else if (m24) {
        hour = parseInt(m24[1], 10);
        minute = parseInt(m24[2], 10);
        if (hour > 23 || minute > 59) return null;
      }
    }

    const m = moment.tz(
      { year: y, month: month - 1, day, hour, minute, second: 0, millisecond: 0 },
      tz
    );
    if (!m.isValid()) return null;
    return m.toISOString();
  }

  /**
   * Parse transfer sync sheet row (new format) into primary traveler data.
   * One row per traveler; no Delegate 2 in this format.
   *
   * @param {string[]} row - Row as array of cell values
   * @param {Object} colMap - Map of field name -> column index (from buildTransferSyncColumnMap)
   * @returns {{ valid: boolean, error?: string, data?: Object }}
   */
  parseRowToTransferSyncFormat(row, colMap) {
    const get = (key) => {
      const idx = colMap[key];
      if (idx == null || idx >= row.length) return null;
      const v = row[idx];
      return v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : null;
    };

    const companyName = get('companyName');
    const salutation = get('salutation');
    const firstName = get('firstName');
    const lastName = get('lastName');
    const nameAsPerPassport = get('nameAsPerPassport');
    const passportNumber = get('passportNumber');
    const contactNo = get('contactNo');
    const email = get('email');
    // Onward arrival date/time (landing at KUL). Prefer Arr.* columns; fall back to Dep.* if that’s how the sheet is laid out.
    const onwardArrDate = get('onwardArrDate') || get('arrivalCheckInDate') || get('onwardDepDate');
    const onwardETA = get('onwardETA') || get('eta') || get('onwardETD');
    const arrivalFlightNo = get('arrivalFlightNo');
    const onwardDepAirport = get('onwardDepAirport');
    const onwardArrAirport = get('onwardArrAirport');
    // New format: Return Flight Dep. Date + ETD (when flight departs)
    const returnDepDate = get('returnDepDate') || get('checkOutDate');
    const returnETD = get('returnETD') || get('etd');
    const returnFlightNo = get('returnFlightNo');
    const returnDepAirport = get('returnDepAirport');
    const returnArrAirport = get('returnArrAirport');

    const name = [firstName, lastName].filter(Boolean).join(' ') || nameAsPerPassport || email?.split('@')[0] || '';

    if (!email) {
      return { valid: false, error: 'Missing required field: Email' };
    }

    // Skip #ERROR! and invalid phone. Supports (44)7939336353, (49)1732742690, (91)9940158505
    const phone = contactNo && !String(contactNo).includes('#ERROR') ? contactNo : '';

    // Wall-clock times from the sheet → interpret in airport local TZ (no UTC in CSV)
    const onwardTimeAirport = this.toIataCode(onwardDepAirport) || this.toIataCode(onwardArrAirport);
    const returnTimeAirport =
      this.toIataCode(returnDepAirport) || this.toIataCode(returnArrAirport) || onwardTimeAirport;
    const arrivalTime = this.parseTransferSyncDateTime(onwardArrDate, onwardETA, onwardTimeAirport);
    const departureTime = this.parseTransferSyncDateTime(returnDepDate, returnETD, returnTimeAirport);

    if (!arrivalTime) {
      return {
        valid: false,
        error:
          'Missing or unparseable Onward flight arrival date/time. Set Onward Arr. Date and ETA (time). Examples: 06/05/2026 + 06:29, 2026-05-06 + 06:29, or 6-May-2026 + 06:29.'
      };
    }

    const primary = {
      name: name || email,
      firstName: firstName || '',
      lastName: lastName || '',
      email: email.toLowerCase(),
      phone,
      salutation: salutation || undefined,
      job_position: '',
      company_name: companyName || '',
      whatsapp_number: '',
      consent_email: undefined,
      consent_whatsapp: undefined,
      flight_booked: undefined,
      name_as_per_passport: nameAsPerPassport || undefined,
      passport_number: passportNumber || undefined,
      arrival_flight_no: arrivalFlightNo || 'XX000',
      arrival_time: arrivalTime,
      departure_flight_no: returnFlightNo || arrivalFlightNo || 'XX000',
      departure_time: departureTime || arrivalTime,
      // Airport codes from sheet (for demo when flight API has ±3 day limit)
      onward_dep_airport: this.toIataCode(onwardDepAirport),
      onward_arr_airport: this.toIataCode(onwardArrAirport),
      return_dep_airport: this.toIataCode(returnDepAirport),
      return_arr_airport: this.toIataCode(returnArrAirport)
    };

    return {
      valid: true,
      data: {
        primary,
        delegate2: { present: false }
      }
    };
  }

  /**
   * Extract 3-char IATA code from sheet value. Expects "KUL", "LHR" etc.
   * If value is 3 letters, use it. Otherwise try to find a 3-char code in the string.
   */
  toIataCode(val) {
    if (!val || typeof val !== 'string') return null;
    const s = val.trim().toUpperCase();
    if (s.length === 3 && /^[A-Z]{3}$/.test(s)) return s;
    const match = s.match(/\b([A-Z]{3})\b/);
    return match ? match[1] : null;
  }

  /**
   * Parse registration sheet row (Delegate 1 + optional Delegate 2)
   * into a structured object suitable for creating a Transfer.
   * This does NOT create any users – it only shapes data.
   *
   * @param {Object} row - Row from Google Sheet
   * @param {Object} columnMap - Map of normalized column names to actual headers
   * @returns {{ valid: boolean, error?: string, data?: Object }}
   */
  parseRowToRegistration(row, columnMap) {
    const getValue = (key) => {
      const header = columnMap[key];
      if (!header) return null;
      const v = row[header] || row[header.toLowerCase()] || row[header.toUpperCase()] || row[this.capitalizeFirst(header)];
      return v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : null;
    };

    const toBool = (raw) => {
      if (!raw) return false;
      const v = String(raw).trim().toLowerCase();
      return ['yes', 'y', 'true', '1'].includes(v);
    };

    const toDateIso = (raw) => {
      if (raw === undefined || raw === null || raw === '') return null;
      const r = String(raw).trim();
      if (!r) return null;
      // Google Sheets serial date (days since 1899-12-30, fractional part = time of day)
      const num = Number(r);
      if (!Number.isNaN(num) && num > 10000) {
        const d = new Date((num - 25569) * 86400 * 1000);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    };

    // Primary / Delegate 1
    const primaryName = getValue('fullName');
    const primaryEmail = getValue('email');
    const primaryPhone = getValue('primaryPhone') || getValue('phone');
    const primaryJob = getValue('primaryJobPosition');
    const primaryCompany = getValue('primaryCompanyName');
    const primaryWhatsapp = getValue('primaryWhatsappAlt') || getValue('primaryWhatsapp');
    const primaryConsentEmail = toBool(getValue('primaryConsentEmail'));
    const primaryConsentWhatsapp = toBool(getValue('primaryConsentWhatsapp'));
    const flightBooked = toBool(getValue('flightBooked'));

    const arrivalFlightNo = getValue('arrivalFlightNo');
    const arrivalDateTime = toDateIso(getValue('arrivalDateTime') || getValue('arrivalDate'));
    const departureFlightNo = getValue('departureFlightNo') || getValue('departureFlightNoPrimary2');
    const departureDateTime = toDateIso(getValue('departureDateTime') || getValue('departureDate'));

    if (!primaryName || !primaryEmail) {
      return {
        valid: false,
        error: 'Missing required Delegate 1 fields: Full Name or Email'
      };
    }

    // Delegate 2 (plus-one) – optional
    const delegate2FullName = getValue('delegate2FullName');
    const delegate2Email = getValue('delegate2Email');
    const delegate2Phone = getValue('delegate2Phone');
    const delegate2Job = getValue('delegate2JobPosition');
    const delegate2Company = getValue('delegate2CompanyName');
    const delegate2ConsentEmail = toBool(getValue('delegate2ConsentEmail'));
    const delegate2SameAsPrimaryFlight = toBool(getValue('delegate2SameAsPrimaryFlight'));

    const delegate2ArrivalFlightNo = getValue('delegate2ArrivalFlightNo');
    const delegate2ArrivalDate = toDateIso(getValue('delegate2ArrivalDate'));
    const delegate2DepartureFlightNo = getValue('delegate2DepartureFlightNo');
    const delegate2DepartureDate = toDateIso(getValue('delegate2DepartureDate'));

    const hasDelegate2 =
      !!(delegate2FullName || delegate2Email || delegate2Phone);

    const primary = {
      name: primaryName,
      email: primaryEmail.toLowerCase(),
      phone: primaryPhone || '',
      job_position: primaryJob || '',
      company_name: primaryCompany || '',
      whatsapp_number: primaryWhatsapp || '',
      consent_email: primaryConsentEmail,
      consent_whatsapp: primaryConsentWhatsapp,
      flight_booked: flightBooked,
      arrival_flight_no: arrivalFlightNo || 'XX000',
      arrival_time: arrivalDateTime,
      departure_flight_no: departureFlightNo || arrivalFlightNo || 'XX000',
      departure_time: departureDateTime || arrivalDateTime
    };

    const delegate2 = hasDelegate2
      ? {
          present: true,
          name: delegate2FullName || '',
          email: (delegate2Email || '').toLowerCase(),
          phone: delegate2Phone || '',
          job_position: delegate2Job || '',
          company_name: delegate2Company || '',
          consent_email: delegate2ConsentEmail,
          flight_same_as_delegate_1: delegate2SameAsPrimaryFlight !== false,
          arrival_flight_no: delegate2ArrivalFlightNo || null,
          arrival_time: delegate2ArrivalDate || null,
          departure_flight_no: delegate2DepartureFlightNo || null,
          departure_time: delegate2DepartureDate || null
        }
      : { present: false };

    return {
      valid: true,
      data: {
        primary,
        delegate2
      }
    };
  }

  /**
   * Parse sheet row to driver data
   * @param {Object} row - Row from Google Sheet
   * @param {Object} columnMap - Map of normalized column names to indices
   * @returns {Object} Driver data object
   */
  parseRowToDriver(row, columnMap) {
    const getValue = (normalizedKey) => {
      const actualHeaderName = columnMap[normalizedKey];
      if (!actualHeaderName) return null;
      
      const value = row[actualHeaderName] || 
                    row[actualHeaderName.toLowerCase()] || 
                    row[actualHeaderName.toUpperCase()] ||
                    row[this.capitalizeFirst(actualHeaderName)];
      
      return value ? String(value).trim() : null;
    };

    const firstName = getValue('firstName');
    const lastName = getValue('lastName');
    const email = getValue('email');
    const phone = getValue('phone');
    const vendor = getValue('vendor');
    const username = getValue('username');
    const password = getValue('password');
    const licenseNumber = getValue('licenseNumber');
    const vehicleType = getValue('vehicleType');
    const vehicleNumber = getValue('vehicleNumber');
    const experience = getValue('experience');

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return {
        valid: false,
        error: 'Missing required fields: FirstName, LastName, or Email'
      };
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        error: `Invalid email format: ${email}`
      };
    }

    // Validate and normalize phone format if provided (same logic as travelers)
    let normalizedPhone = phone;
    if (phone) {
      normalizedPhone = phone.replace(/\s/g, '').replace(/[^\d+]/g, '');
      
      if (!normalizedPhone.startsWith('+')) {
        if (normalizedPhone.length === 12 && normalizedPhone.startsWith('91')) {
          normalizedPhone = `+${normalizedPhone}`;
        } else if (normalizedPhone.length === 10 && normalizedPhone.startsWith('9')) {
          normalizedPhone = `+91${normalizedPhone}`;
        } else if (normalizedPhone.length === 10 && normalizedPhone.startsWith('1')) {
          normalizedPhone = `+1${normalizedPhone}`;
        } else if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
          normalizedPhone = `+${normalizedPhone}`;
        } else if (normalizedPhone.length >= 10 && normalizedPhone.length <= 15 && /^\d+$/.test(normalizedPhone)) {
          if (normalizedPhone.length === 10) {
            normalizedPhone = `+1${normalizedPhone}`;
          } else {
            return {
              valid: false,
              error: `Invalid phone format: ${phone}. Phone must start with + followed by country code. Example: +918108457911`
            };
          }
        } else {
          return {
            valid: false,
            error: `Invalid phone format: ${phone}. Phone must start with + followed by country code. Example: +918108457911`
          };
        }
      }
      
      if (!/^\+[1-9]\d{1,14}$/.test(normalizedPhone)) {
        return {
          valid: false,
          error: `Invalid phone format: ${phone}. Must be in format +[country code][number] (e.g., +918108457911)`
        };
      }
    }

    // Parse experience (should be a number)
    let experienceYears = 0;
    if (experience) {
      const expNum = parseInt(experience, 10);
      if (!isNaN(expNum) && expNum >= 0) {
        experienceYears = expNum;
      }
    }

    return {
      valid: true,
      data: {
        firstName,
        lastName,
        email: email.toLowerCase(),
        phone: normalizedPhone || '',
        vendor,
        username: username || this.generateUsername(email, firstName, lastName),
        password: password || this.generatePassword(),
        licenseNumber: licenseNumber || '',
        vehicleType: vehicleType || '',
        vehicleNumber: vehicleNumber || '',
        experience: experienceYears
      }
    };
  }

  /**
   * Capitalize first letter of string
   */
  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Generate username from email or name
   */
  generateUsername(email, firstName, lastName) {
    // Use email prefix or name-based
    if (email) {
      return email.split('@')[0];
    }
    return `${firstName}${lastName}`.toLowerCase().replace(/\s/g, '');
  }

  /**
   * Generate random password
   */
  generatePassword() {
    return `Traveler${Math.random().toString(36).substring(2, 10)}!`;
  }

  /**
   * Normalize phone to E.164 format for international numbers.
   * Handles numbers with or without + prefix (e.g. 971501234567, +971501234567).
   * @param {string} phone - Raw phone string
   * @returns {string} E.164 format (+[1-9][0-9]{1,14}) or fallback +10000000000
   */
  normalizePhoneToE164(phone) {
    if (!phone || typeof phone !== 'string') return '+10000000000';
    const cleaned = String(phone).trim().replace(/\s/g, '').replace(/[^\d+]/g, '');
    let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
    if (!digits || digits.length < 7) return '+10000000000';
    // E.164: max 15 digits, first digit after + must be 1-9
    digits = digits.replace(/^0+/, '');
    if (digits.length > 15) digits = digits.slice(0, 15);
    const e164 = `+${digits}`;
    return /^\+[1-9]\d{1,14}$/.test(e164) ? e164 : '+10000000000';
  }

  /**
   * Create or find a Traveler user from delegate data (used during transfer sync).
   * @param {Object} delegate - { name, email, phone?, job_position?, company_name?, consent_email?, consent_whatsapp?, whatsapp_number? }
   * @param {mongoose.Types.ObjectId} clientId - Client (customer) user ID
   * @returns {Promise<{ user: Object|null, created: boolean }>} Traveler user and whether it was newly created
   */
  async createOrFindTravelerFromDelegate(delegate, clientId) {
    const email = (delegate.email || '').toLowerCase().trim();
    if (!email) return { user: null, created: false };

    const nameParts = (delegate.name || '').trim().split(/\s+/);
    const firstName = delegate.firstName || nameParts[0] || delegate.email?.split('@')[0] || 'Traveler';
    const lastName = delegate.lastName || (delegate.firstName ? nameParts.slice(1).join(' ') : nameParts.slice(1).join(' ')) || firstName;
    const phone = this.normalizePhoneToE164(delegate.phone);

    const existingTraveler = await User.findOne({
      email,
      role: 'TRAVELER'
    });

    if (existingTraveler) {
      // Update salutation if provided and different
      if (delegate.salutation !== undefined && existingTraveler.profile) {
        existingTraveler.profile.salutation = delegate.salutation || '';
        existingTraveler.markModified('profile');
        await existingTraveler.save();
      }
      return { user: existingTraveler, created: false };
    }

    const existingUserAnyRole = await User.findOne({ email });
    if (existingUserAnyRole) {
      return { user: null, created: false };
    }

    const username = email.split('@')[0] + (Date.now().toString().slice(-4));
    const usernameExists = await User.findOne({ username });
    const finalUsername = usernameExists ? `${username}_${Date.now().toString().slice(-4)}` : username;
    const hashedPassword = await bcrypt.hash(this.generatePassword(), 10);

    const phoneE164 = phone && phone !== '+10000000000' ? phone : undefined;
    const traveler = new User({
      username: finalUsername,
      email,
      password: hashedPassword,
      role: 'TRAVELER',
      profile: {
        salutation: delegate.salutation || '',
        firstName,
        lastName,
        ...(phoneE164 && { phone: phoneE164 }),
        job_position: delegate.job_position || '',
        company_name: delegate.company_name || '',
        consent_email: delegate.consent_email || undefined,
        consent_whatsapp: delegate.consent_whatsapp || undefined,
        whatsapp_number: delegate.whatsapp_number || ''
      },
      createdBy: clientId,
      preferences: {
        notifications: { email: true, sms: true, whatsapp: true, push: true },
        language: 'en',
        timezone: 'Asia/Kolkata'
      }
    });

    await traveler.save();
    return { user: traveler, created: true };
  }

  /**
   * Find client by name or email
   * @param {string} clientIdentifier - Client name or email
   * @returns {Promise<Object|null>} Client user object
   */
  async findClient(clientIdentifier) {
    if (!clientIdentifier) return null;

    const client = await User.findOne({
      role: 'CLIENT',
      $or: [
        { email: clientIdentifier.toLowerCase() },
        { username: clientIdentifier },
        { 'profile.firstName': { $regex: new RegExp(`^${clientIdentifier}`, 'i') } },
        { 'profile.lastName': { $regex: new RegExp(`^${clientIdentifier}`, 'i') } }
      ]
    });

    return client;
  }

  /**
   * Find vendor by name or email
   * @param {string} vendorIdentifier - Vendor name or email
   * @returns {Promise<Object|null>} Vendor user object
   */
  async findVendor(vendorIdentifier) {
    if (!vendorIdentifier) return null;

    // Clean the vendor identifier (trim and normalize)
    const cleanIdentifier = vendorIdentifier.trim();
    
    console.log(`🔍 Searching for vendor: "${cleanIdentifier}"`);

    // Try exact matches first (most reliable)
    let vendor = await User.findOne({
      role: 'VENDOR',
      $or: [
        { email: cleanIdentifier.toLowerCase() },
        { username: cleanIdentifier }
      ]
    });

    if (vendor) {
      console.log(`✅ Found vendor by email/username: ${vendor.email}`);
      return vendor;
    }

    // Try company name match (case-insensitive, partial match)
    vendor = await User.findOne({
      role: 'VENDOR',
      'vendorDetails.companyName': { 
        $regex: new RegExp(cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') 
      }
    });

    if (vendor) {
      console.log(`✅ Found vendor by company name: ${vendor.vendorDetails?.companyName || 'N/A'}`);
      return vendor;
    }

    // Try partial match on company name (contains)
    vendor = await User.findOne({
      role: 'VENDOR',
      $or: [
        { 'vendorDetails.companyName': { $regex: new RegExp(cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
        { 'profile.firstName': { $regex: new RegExp(`^${cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') } },
        { 'profile.lastName': { $regex: new RegExp(`^${cleanIdentifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') } }
      ]
    });

    if (vendor) {
      console.log(`✅ Found vendor by partial match: ${vendor.vendorDetails?.companyName || vendor.email}`);
      return vendor;
    }

    console.warn(`❌ Vendor not found: "${cleanIdentifier}"`);
    console.log(`   Searched by: email="${cleanIdentifier.toLowerCase()}", username="${cleanIdentifier}", company name (partial)`);
    
    // Show available vendors to help user
    const allVendors = await User.find({ role: 'VENDOR' })
      .select('email username vendorDetails.companyName profile.firstName profile.lastName')
      .limit(20);
    
    if (allVendors.length > 0) {
      console.log(`💡 Available vendors in system (${allVendors.length} found):`);
      allVendors.forEach(v => {
        const companyName = v.vendorDetails?.companyName || 'N/A';
        const email = v.email || 'N/A';
        const username = v.username || 'N/A';
        console.log(`   - Company: "${companyName}" | Email: ${email} | Username: ${username}`);
      });
      console.log(`💡 Tip: Use vendor email (e.g., "eleven@halo.com") or username in the sheet for exact matching (most reliable)`);
      console.log(`💡 Or make sure the company name matches exactly: "${cleanIdentifier}"`);
    } else {
      console.warn(`⚠️  No vendors found in system! Please create vendors first.`);
    }

    return null;
  }

  /**
   * Sync travelers from Google Sheets to database
   * @param {string} sheetId - Google Sheet ID
   * @param {string} sheetName - Optional sheet name
   * @param {string} syncUserId - User ID performing the sync (for createdBy field)
   * @param {boolean} forceClientAssignment - If true, all travelers will be assigned to syncUserId (for CLIENT users)
   * @returns {Promise<Object>} Sync results
   */
  async syncTravelersFromSheet(sheetId, sheetName, syncUserId, forceClientAssignment = false) {
    const results = {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Fetch sheet data
      const rows = await this.fetchSheetData(sheetId, sheetName);
      
      if (rows.length === 0) {
        return {
          ...results,
          message: 'Sheet is empty'
        };
      }

      // opensheet.elk.sh returns array of objects with header names as keys
      // First, identify the column names from the first row
      const firstRow = rows[0];
      const columnMap = {};
      
      // Map actual column names to normalized names
      Object.keys(firstRow).forEach(headerName => {
        const normalized = this.normalizeColumnName(headerName);
        if (normalized) {
          columnMap[normalized] = headerName; // Map normalized name to actual header name
        }
      });
      // Prefer "Email Address" over "Email ID" for email when both exist (common in forms)
      if (firstRow['Email Address'] !== undefined && firstRow['Email Address'] !== null && String(firstRow['Email Address']).trim() !== '') {
        columnMap['email'] = 'Email Address';
      }

      console.log('📋 Column mapping:', columnMap);
      console.log('📋 First row sample:', firstRow);

      // Process each row (all rows are data, headers are used as object keys)
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        results.total++;

        try {
          // Parse row to traveler data
          const parsed = this.parseRowToTraveler(row, columnMap);
          
          if (!parsed.valid) {
            results.skipped++;
            results.errors.push({
              row: i + 1,
              email: row[columnMap.email] || row.Email || row.email || 'N/A',
              error: parsed.error
            });
            continue;
          }

          const { salutation, firstName, lastName, email, phone, client, username, password } = parsed.data;

          // Find or determine client
          let createdByUserId = syncUserId;
          
          // Always respect Client column if provided (for all user roles)
          if (client) {
            const clientUser = await this.findClient(client);
            if (clientUser) {
              createdByUserId = clientUser._id;
              console.log(`📌 Using Client from sheet: ${client} (${clientUser.email})`);
            } else {
              console.warn(`⚠️  Client not found: ${client}, using sync user as createdBy`);
              // If forceClientAssignment is true and client not found, use sync user
              if (forceClientAssignment) {
                createdByUserId = syncUserId;
                console.log(`📌 CLIENT sync: Client "${client}" not found, assigning to sync user`);
              }
            }
          } else {
            // No Client column specified - use sync user
            createdByUserId = syncUserId;
            if (forceClientAssignment) {
              console.log(`📌 CLIENT sync: No Client specified, assigning traveler ${email} to sync user`);
            }
          }

          // Check if traveler already exists (by email)
          const existingTraveler = await User.findOne({
            email: email.toLowerCase(),
            role: 'TRAVELER'
          });

          // If email exists under another role (e.g. CLIENT), don't create duplicate – skip with clear message
          if (!existingTraveler) {
            const existingUserAnyRole = await User.findOne({ email: email.toLowerCase() });
            if (existingUserAnyRole) {
              results.skipped++;
              results.errors.push({
                row: i + 1,
                email,
                error: `Email already registered as ${existingUserAnyRole.role}. Use a different email for a traveler, or use that account in the portal.`
              });
              console.warn(`⚠️  Row ${i + 1} (${email}): Skipped - email already exists as role "${existingUserAnyRole.role}"`);
              continue;
            }
          }

          if (existingTraveler) {
            // Update existing traveler
            if (salutation !== undefined) existingTraveler.profile.salutation = salutation || '';
            existingTraveler.profile.firstName = firstName;
            existingTraveler.profile.lastName = lastName;
            if (phone) {
              existingTraveler.profile.phone = phone;
            }
            if (username && username !== existingTraveler.username) {
              // Check if new username is available
              const usernameExists = await User.findOne({ 
                username, 
                _id: { $ne: existingTraveler._id } 
              });
              if (!usernameExists) {
                existingTraveler.username = username;
              }
            }
            if (password) {
              existingTraveler.password = await bcrypt.hash(password, 10);
            }
            if (createdByUserId && createdByUserId.toString() !== existingTraveler.createdBy?.toString()) {
              existingTraveler.createdBy = createdByUserId;
            }

            await existingTraveler.save();
            results.updated++;
            console.log(`✅ Updated traveler: ${email}`);
          } else {
            // Create new traveler
            // Check if username already exists
            let finalUsername = username;
            const usernameExists = await User.findOne({ username: finalUsername });
            if (usernameExists) {
              finalUsername = `${username}${Date.now().toString().slice(-4)}`;
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            const traveler = new User({
              username: finalUsername,
              email: email.toLowerCase(),
              password: hashedPassword,
              role: 'TRAVELER',
              profile: {
                salutation: salutation || '',
                firstName,
                lastName,
                phone: phone || ''
              },
              createdBy: createdByUserId,
              preferences: {
                notifications: {
                  email: true,
                  sms: true,
                  whatsapp: true,
                  push: true
                },
                language: 'en',
                timezone: 'Asia/Kolkata'
              }
            });

            await traveler.save();
            results.created++;
            console.log(`✅ Created traveler: ${email}`);
          }
        } catch (error) {
          results.skipped++;
          results.errors.push({
            row: i + 1,
            email: row[columnMap.email] || row.Email || row.email || 'N/A',
            error: error.message
          });
          console.error(`❌ Error processing row ${i + 1}:`, error.message);
        }
      }

      return {
        ...results,
        success: true,
        message: `Sync completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`
      };
    } catch (error) {
      console.error('Error syncing travelers from Google Sheets:', error);
      return {
        ...results,
        success: false,
        message: `Sync failed: ${error.message}`,
        errors: [...results.errors, { error: error.message }]
      };
    }
  }

  /**
   * Rows with the **same full inbound + return itinerary** (same car) merge into one transfer with delegates.
   * Must include **return** leg in the key: merged transfers only store row-1 flight data, so rows that share
   * the same inbound but differ on return must **not** merge (each row keeps its own return times).
   * Skipped for placeholder flights or missing inbound times.
   */
  buildTransferSyncGroupKey(primary) {
    const raw = (primary.arrival_flight_no || '').toString().trim().toUpperCase();
    const placeholderFlights = ['', 'XX000', 'TBD', 'N/A'];
    if (!raw || placeholderFlights.includes(raw)) return null;
    const t = primary.arrival_time;
    if (!t) return null;
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return null;
    const minuteBucket = Math.floor(d.getTime() / 60000);

    const retFlightRaw = (primary.departure_flight_no || '').toString().trim().toUpperCase();
    const retFlightPart = !retFlightRaw || placeholderFlights.includes(retFlightRaw) ? '—' : retFlightRaw;

    let returnMinutePart = '—';
    const rt = primary.departure_time;
    if (rt) {
      const rd = new Date(rt);
      if (!Number.isNaN(rd.getTime())) {
        returnMinutePart = String(Math.floor(rd.getTime() / 60000));
      }
    }

    return `${raw}|${minuteBucket}|${retFlightPart}|${returnMinutePart}`;
  }

  /**
   * One transfer for multiple sheet rows sharing the same itinerary (see buildTransferSyncGroupKey).
   * Booker / primary contact is the first row by row number; others become delegates with the same flights.
   */
  async _createMergedRegistrationTransfer(group, results, customerId) {
    group.sort((a, b) => a.rowNum - b.rowNum);
    const primary = group[0].data.primary;
    const rowNum = group[0].rowNum;
    const rowsLabel = group.map((g) => g.rowNum).join(', ');

    const delegatePayload = (p) => ({
      name: p.name,
      salutation: p.salutation,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      job_position: p.job_position,
      company_name: p.company_name,
      consent_email: p.consent_email,
      consent_whatsapp: p.consent_whatsapp,
      whatsapp_number: p.whatsapp_number
    });

    const tr0 = await this.createOrFindTravelerFromDelegate(delegatePayload(primary), customerId);
    if (!tr0.user) {
      results.errors.push({
        row: rowNum,
        email: primary.email,
        error: 'Merged rows: could not create primary traveler — will try per-row sync'
      });
      return false;
    }
    if (tr0.created) results.createdTravelers += 1;
    const primaryTravelerId = tr0.user._id;

    const delegates = [];
    for (let i = 1; i < group.length; i++) {
      const p = group[i].data.primary;
      const rn = group[i].rowNum;
      // eslint-disable-next-line no-await-in-loop
      const tr = await this.createOrFindTravelerFromDelegate(delegatePayload(p), customerId);
      if (!tr.user) {
        results.errors.push({
          row: rn,
          email: p.email,
          error: 'Merged group: could not create traveler — will try per-row sync'
        });
        return false;
      }
      if (tr.created) results.createdTravelers += 1;
      delegates.push({
        traveler_id: tr.user._id,
        flight_same_as_primary: true,
        flight_details: null
      });
    }

    const customer_details = {
      name: primary.name,
      salutation: primary.salutation || undefined,
      email: primary.email,
      contact_number: this.normalizePhoneToE164(primary.phone),
      no_of_passengers: 1 + delegates.length,
      luggage_count: 0,
      job_position: primary.job_position || undefined,
      company_name: primary.company_name || undefined,
      consent_email: primary.consent_email || undefined,
      consent_whatsapp: primary.consent_whatsapp || undefined,
      whatsapp_number: primary.whatsapp_number || undefined,
      flight_booked: primary.flight_booked || undefined,
      name_as_per_passport: primary.name_as_per_passport || undefined,
      passport_number: primary.passport_number || undefined
    };

    if (!primary.arrival_time) {
      results.errors.push({
        row: rowNum,
        email: primary.email,
        error:
          'Merged transfer: missing onward arrival time (cannot create transfer without a parsed arrival date/time).'
      });
      return false;
    }
    const onward_arrival_time = primary.arrival_time;
    const return_departure_time = primary.departure_time || onward_arrival_time;
    const onwardDepAirport = primary.onward_dep_airport || 'TBD';
    const onwardArrAirport = 'KUL';
    const returnDepAirport = 'KUL';
    const returnArrAirport = primary.return_arr_airport || 'TBD';

    const flight_details = {
      flight_no: (primary.arrival_flight_no || primary.departure_flight_no || 'XX000').toUpperCase().slice(0, 10),
      airline: 'TBD',
      departure_airport: onwardDepAirport,
      arrival_airport: onwardArrAirport,
      // Inbound: sheet time is landing at KUL — do not copy into departure_time (origin dep comes from FlightStats).
      arrival_time: onward_arrival_time,
      status: 'on_time',
      delay_minutes: 0
    };

    const estimated_pickup_time = onward_arrival_time;
    const transfer_details = {
      pickup_location: 'Kuala Lumpur International Airport (KUL)',
      drop_location: 'Grand Hyatt',
      event_place: 'Event (TBD)',
      estimated_pickup_time,
      special_notes: ''
    };

    const returnDepartureTime = return_departure_time;
    const returnArrivalTime = primary.departure_time
      ? new Date(new Date(primary.departure_time).getTime() + 2 * 60 * 60 * 1000).toISOString()
      : returnDepartureTime;
    const return_flight_details = {
      flight_no: (primary.departure_flight_no || primary.arrival_flight_no || 'XX000').toUpperCase().slice(0, 10),
      airline: 'TBD',
      departure_airport: returnDepAirport,
      arrival_airport: returnArrAirport,
      departure_time: returnDepartureTime,
      arrival_time: returnArrivalTime,
      status: 'on_time',
      delay_minutes: 0,
      gate: '',
      terminal: ''
    };
    const return_transfer_details = {
      pickup_location: 'Hotel / Event (TBD)',
      drop_location: 'Grand Hyatt',
      event_place: 'Event (TBD)',
      estimated_pickup_time: returnDepartureTime,
      special_notes: '',
      transfer_status: 'pending'
    };

    try {
      const [enrichedOnward, enrichedReturn] = await Promise.all([
        enrichFlightDetails(flight_details, onward_arrival_time),
        enrichFlightDetails(return_flight_details, returnDepartureTime)
      ]);
      if (enrichedOnward) Object.assign(flight_details, enrichedOnward);
      if (enrichedReturn) Object.assign(return_flight_details, enrichedReturn);
      flight_details.arrival_airport = 'KUL';
      return_flight_details.departure_airport = 'KUL';
      if (flight_details.arrival_airport && flight_details.arrival_airport !== 'TBD') {
        transfer_details.pickup_location =
          flight_details.arrival_airport === 'KUL'
            ? 'Kuala Lumpur International Airport (KUL)'
            : formatAirportLocation(flight_details.arrival_airport, flight_details.arrival_airport_name);
      }
      if (return_flight_details.departure_airport && return_flight_details.departure_airport !== 'TBD') {
        return_transfer_details.drop_location =
          return_flight_details.departure_airport === 'KUL'
            ? 'Kuala Lumpur International Airport (KUL)'
            : formatAirportLocation(return_flight_details.departure_airport, return_flight_details.departure_airport_name);
      }
      syncEstimatedPickupTimesFromFlights(transfer_details, flight_details, return_transfer_details, return_flight_details);
    } catch (e) {
      console.warn(`[TransferSync] Merged rows ${rowsLabel} flight enrichment failed:`, e.message);
    }

    const rawName = primary.name || 'Client';
    const namePart = rawName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 20) || 'X';
    let apexId;
    for (let attempt = 0; attempt < 10; attempt++) {
      const digits = Math.floor(Math.random() * 90000) + 10000;
      const candidate = `APX${namePart}${digits}`;
      // eslint-disable-next-line no-await-in-loop
      const exists = await Transfer.findById(candidate);
      if (!exists) {
        apexId = candidate;
        break;
      }
    }
    if (!apexId) {
      results.errors.push({
        row: rowNum,
        email: primary.email,
        error: 'Failed to generate unique Apex ID (merged group) — will try per-row sync'
      });
      return false;
    }

    const transfer = new Transfer({
      _id: apexId,
      customer_id: customerId,
      customer_details,
      flight_details,
      transfer_details,
      return_flight_details,
      return_transfer_details,
      traveler_id: primaryTravelerId,
      traveler_details: null,
      traveler_flight_details: null,
      delegates
    });

    await transfer.save();
    results.createdTransfers += 1;
    console.log(
      `[TransferSync] Merged rows ${rowsLabel} → ${transfer._id} (${group.length} travelers, same flight+time)`
    );
    return true;
  }

  /**
   * Sync registration sheet rows into Transfer documents.
   * Uses new transfer sync format: Company Name, First Name, Last Name, Email, Contact No,
   * Check In Date, Flight No, ETA (onward), Check Out Date, Flight No, ETD (return).
   * Rows with the same onward flight + arrival time (minute) merge into one transfer with delegates[].
   *
   * @param {string} sheetId - Google Sheet ID
   * @param {string} sheetName - Unused (kept for API compat); use gid for sheet selection
   * @param {import('mongoose').Types.ObjectId|string} customerId - Client user ID for all transfers
   * @param {import('mongoose').Types.ObjectId|string} syncUserId - User performing the sync
   * @param {number} gid - Sheet tab ID (0 = first sheet). For multi-sheet workbooks, get from URL #gid=
   * @returns {Promise<Object>} Sync results
   */
  async syncTransfersFromRegistrationSheet(sheetId, sheetName, customerId, syncUserId, gid = 0) {
    const results = {
      total: 0,
      createdTransfers: 0,
      createdTravelers: 0,
      skipped: 0,
      errors: []
    };

    try {
      console.log(`[TransferSync] Starting sync: sheetId=${sheetId?.slice(0, 12)}..., gid=${gid}`);
      const { headers, rows } = await this.fetchSheetDataAsArrays(sheetId, gid);
      if (!rows.length) {
        console.log('[TransferSync] Sheet is empty');
        return {
          ...results,
          success: true,
          message: 'Sheet is empty'
        };
      }

      const colMap = this.buildTransferSyncColumnMap(headers);
      console.log('[TransferSync] Column mapping:', JSON.stringify(colMap));
      console.log(`[TransferSync] Processing ${rows.length} rows. Rows with errors will be skipped; rest will be created.`);

      const validItems = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        results.total += 1;
        const rowNum = i + 1;

        try {
          const parsed = this.parseRowToTransferSyncFormat(row, colMap);
          if (!parsed.valid) {
            results.skipped += 1;
            const emailIdx = colMap.email;
            const emailVal = emailIdx != null && row[emailIdx] ? row[emailIdx] : 'N/A';
            results.errors.push({
              row: rowNum,
              email: emailVal,
              error: parsed.error
            });
            console.log(`[TransferSync] Row ${rowNum} SKIP (validation): ${parsed.error} – continuing with other rows`);
            continue;
          }

          validItems.push({ rowNum, row, data: parsed.data });
        } catch (error) {
          results.skipped += 1;
          const emailIdx = colMap.email;
          const emailVal = emailIdx != null && row[emailIdx] ? row[emailIdx] : 'N/A';
          results.errors.push({
            row: rowNum,
            email: emailVal,
            error: error.message
          });
          console.error(`[TransferSync] Row ${rowNum} ERROR – ${error.message}. Skipping this row; rest of transfers will still be created.`);
        }
      }

      const buckets = new Map();
      for (const item of validItems) {
        const key = this.buildTransferSyncGroupKey(item.data.primary);
        const bucketKey = key != null ? key : `__single_${item.rowNum}`;
        if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
        buckets.get(bucketKey).push(item);
      }

      const mergedRowNums = new Set();
      for (const [bucketKey, group] of buckets) {
        if (group.length > 1 && !bucketKey.startsWith('__single_')) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await this._createMergedRegistrationTransfer(group, results, customerId);
          if (ok) {
            group.forEach((g) => mergedRowNums.add(g.rowNum));
          }
        }
      }

      for (const item of validItems) {
        if (mergedRowNums.has(item.rowNum)) continue;

        const { rowNum, row } = item;
        const { primary, delegate2 } = item.data;

        try {
          // Create or find Traveler users for primary and delegate 2
          const primaryTravelerResult = await this.createOrFindTravelerFromDelegate(
            { name: primary.name, salutation: primary.salutation, firstName: primary.firstName, lastName: primary.lastName, email: primary.email, phone: primary.phone, job_position: primary.job_position, company_name: primary.company_name, consent_email: primary.consent_email, consent_whatsapp: primary.consent_whatsapp, whatsapp_number: primary.whatsapp_number },
            customerId
          );
          let primaryTravelerId = primaryTravelerResult.user ? primaryTravelerResult.user._id : null;
          if (primaryTravelerResult.created) results.createdTravelers += 1;

          let delegates = [];

          // Build customer_details
          const customer_details = {
            name: primary.name,
            salutation: primary.salutation || undefined,
            email: primary.email,
            contact_number: this.normalizePhoneToE164(primary.phone),
            no_of_passengers: delegate2.present ? 2 : 1,
            luggage_count: 0,
            job_position: primary.job_position || undefined,
            company_name: primary.company_name || undefined,
            consent_email: primary.consent_email || undefined,
            consent_whatsapp: primary.consent_whatsapp || undefined,
            whatsapp_number: primary.whatsapp_number || undefined,
            flight_booked: primary.flight_booked || undefined,
            name_as_per_passport: primary.name_as_per_passport || undefined,
            passport_number: primary.passport_number || undefined
          };

          // Onward leg: use Arrival Date & Time (when flight lands at airport = pickup time).
          // Rows without a parseable onward arrival are rejected in parseRowToTransferSyncFormat (no fake "sync time").
          const onward_arrival_time = primary.arrival_time;
          const return_departure_time = primary.departure_time || onward_arrival_time;

          // Onward Arr. Airport and Return Dep. Airport = KUL for everyone
          const onwardDepAirport = primary.onward_dep_airport || 'TBD';
          const onwardArrAirport = 'KUL';
          const returnDepAirport = 'KUL';
          const returnArrAirport = primary.return_arr_airport || 'TBD';

          const flight_details = {
            flight_no: (primary.arrival_flight_no || primary.departure_flight_no || 'XX000')
              .toUpperCase()
              .slice(0, 10),
            airline: 'TBD',
            departure_airport: onwardDepAirport,
            arrival_airport: onwardArrAirport,
            // Inbound: sheet ETA = arrival at KUL; origin departure_time filled by FlightStats enrichment.
            arrival_time: onward_arrival_time,
            status: 'on_time',
            delay_minutes: 0
          };

          // Transfer details – pickup at Kuala Lumpur International Airport (hardcoded for all)
          const estimated_pickup_time = onward_arrival_time;
          const transfer_details = {
            pickup_location: 'Kuala Lumpur International Airport (KUL)',
            drop_location: 'Grand Hyatt',
            event_place: 'Event (TBD)',
            estimated_pickup_time,
            special_notes: ''
          };

          // Delegate 2: create Traveler user and add to delegates; also store as traveler_details / traveler_flight_details
          let traveler_details = null;
          let traveler_flight_details = null;

          if (delegate2.present && delegate2.email) {
            const delegate2TravelerResult = await this.createOrFindTravelerFromDelegate(
              { name: delegate2.name, email: delegate2.email, phone: delegate2.phone, job_position: delegate2.job_position, company_name: delegate2.company_name, consent_email: delegate2.consent_email },
              customerId
            );
            if (delegate2TravelerResult.user) {
              if (delegate2TravelerResult.created) results.createdTravelers += 1;
              const flightSameAsPrimary = delegate2.flight_same_as_delegate_1 !== false;
              delegates = [{
                traveler_id: delegate2TravelerResult.user._id,
                travelerName: delegate2.name || delegate2.email || '',
                flight_same_as_primary: flightSameAsPrimary,
                flight_details: null
              }];
            }

            traveler_details = {
              name: delegate2.name || delegate2.email || '',
              email: delegate2.email || '',
              contact_number: delegate2.phone ? this.normalizePhoneToE164(delegate2.phone) : '',
              job_position: delegate2.job_position || '',
              company_name: delegate2.company_name || '',
              consent_email: delegate2.consent_email || undefined,
              consent_whatsapp: undefined,
              whatsapp_number: '',
              flight_same_as_delegate_1: delegate2.flight_same_as_delegate_1
            };

            if (!delegate2.flight_same_as_delegate_1) {
              const delDeparture = delegate2.departure_time || return_departure_time;
              const delArrival = delegate2.arrival_time || delDeparture;
              traveler_flight_details = {
                flight_no:
                  (delegate2.arrival_flight_no ||
                    delegate2.departure_flight_no ||
                    'XX000')
                    .toUpperCase()
                    .slice(0, 10),
                airline: 'TBD',
                departure_airport: 'TBD',
                arrival_airport: 'TBD',
                departure_time: delDeparture,
                arrival_time: delArrival,
                status: 'on_time',
                delay_minutes: 0,
                gate: '',
                terminal: ''
              };
              if (delegates.length > 0) delegates[0].flight_details = traveler_flight_details;
            }
          }

          // Return leg (mandatory by default) – placeholders; can be edited in UI
          const returnDepartureTime = return_departure_time;
          const returnArrivalTime = primary.departure_time
            ? new Date(new Date(primary.departure_time).getTime() + 2 * 60 * 60 * 1000).toISOString()
            : returnDepartureTime;
          const return_flight_details = {
            flight_no: (primary.departure_flight_no || primary.arrival_flight_no || 'XX000').toUpperCase().slice(0, 10),
            airline: 'TBD',
            departure_airport: returnDepAirport,
            arrival_airport: returnArrAirport,
            departure_time: returnDepartureTime,
            arrival_time: returnArrivalTime,
            status: 'on_time',
            delay_minutes: 0,
            gate: '',
            terminal: ''
          };
          const return_transfer_details = {
            pickup_location: 'Hotel / Event (TBD)',
            drop_location: 'Grand Hyatt',
            event_place: 'Event (TBD)',
            estimated_pickup_time: returnDepartureTime,
            special_notes: '',
            transfer_status: 'pending'
          };

          // Fetch flight data from FlightStats (uses sheet dates: Check In Date, Check Out Date)
          try {
            console.log(`[TransferSync] Row ${rowNum} (${primary.email}): enriching flights – onward ${flight_details.flight_no} (${onward_arrival_time?.slice?.(0, 10) || 'N/A'}), return ${return_flight_details.flight_no} (${returnDepartureTime?.slice?.(0, 10) || 'N/A'})`);
            const [enrichedOnward, enrichedReturn, enrichedTraveler] = await Promise.all([
              enrichFlightDetails(flight_details, onward_arrival_time),
              enrichFlightDetails(return_flight_details, returnDepartureTime),
              traveler_flight_details && traveler_flight_details.flight_no !== flight_details?.flight_no
                ? enrichFlightDetails(traveler_flight_details, traveler_flight_details.arrival_time)
                : Promise.resolve(null)
            ]);
            if (enrichedOnward) Object.assign(flight_details, enrichedOnward);
            if (enrichedReturn) Object.assign(return_flight_details, enrichedReturn);
            if (enrichedTraveler && delegates.length > 0) {
              delegates[0].flight_details = enrichedTraveler;
              traveler_flight_details = enrichedTraveler;
            }
            // Enforce KUL for onward arrival and return departure
            flight_details.arrival_airport = 'KUL';
            return_flight_details.departure_airport = 'KUL';

            // Update pickup/drop from airport – KUL uses specific label
            if (flight_details.arrival_airport && flight_details.arrival_airport !== 'TBD') {
              transfer_details.pickup_location = flight_details.arrival_airport === 'KUL'
                ? 'Kuala Lumpur International Airport (KUL)'
                : formatAirportLocation(flight_details.arrival_airport, flight_details.arrival_airport_name);
            }
            if (return_flight_details.departure_airport && return_flight_details.departure_airport !== 'TBD') {
              return_transfer_details.drop_location = return_flight_details.departure_airport === 'KUL'
                ? 'Kuala Lumpur International Airport (KUL)'
                : formatAirportLocation(return_flight_details.departure_airport, return_flight_details.departure_airport_name);
            }
            syncEstimatedPickupTimesFromFlights(transfer_details, flight_details, return_transfer_details, return_flight_details);
          } catch (e) {
            console.warn(`[TransferSync] Row ${rowNum} flight enrichment failed:`, e.message, '– continuing with TBD');
          }

          // Generate APEX ID similar to transferController.generateApexId
          const rawName = primary.name || 'Client';
          const namePart = rawName.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 20) || 'X';
          let apexId;
          // Try a few times to avoid collision
          for (let attempt = 0; attempt < 10; attempt++) {
            const digits = Math.floor(Math.random() * 90000) + 10000;
            const candidate = `APX${namePart}${digits}`;
            // eslint-disable-next-line no-await-in-loop
            const exists = await Transfer.findById(candidate);
            if (!exists) {
              apexId = candidate;
              break;
            }
          }

          if (!apexId) {
            results.skipped += 1;
            results.errors.push({
              row: i + 1,
              email: primary.email,
              error: 'Failed to generate unique Apex ID'
            });
            continue;
          }

          const transfer = new Transfer({
            _id: apexId,
            customer_id: customerId,
            customer_details,
            flight_details,
            transfer_details,
            return_flight_details,
            return_transfer_details,
            traveler_id: primaryTravelerId,
            traveler_details,
            traveler_flight_details,
            delegates
          });

          await transfer.save();
          results.createdTransfers += 1;
          console.log(`[TransferSync] Row ${rowNum} ✓ Created transfer ${transfer._id} for ${primary.email}`);
        } catch (error) {
          results.skipped += 1;
          const emailIdx = colMap.email;
          const emailVal = emailIdx != null && row[emailIdx] ? row[emailIdx] : 'N/A';
          results.errors.push({
            row: rowNum,
            email: emailVal,
            error: error.message
          });
          console.error(`[TransferSync] Row ${rowNum} ERROR – ${error.message}. Skipping this row; rest of transfers will still be created.`);
        }
      }

      console.log(`[TransferSync] Complete: ${results.createdTransfers} created, ${results.createdTravelers} travelers, ${results.skipped} skipped (${results.errors.length} errors)`);
      return {
        ...results,
        success: true,
        message: `Registration sync completed: ${results.createdTransfers} transfers created, ${results.createdTravelers} travelers created, ${results.skipped} skipped. ${results.errors.length ? `Rows with errors were skipped; other transfers were created.` : ''}`
      };
    } catch (error) {
      console.error('[TransferSync] Fatal error:', error.message, error.stack);
      return {
        ...results,
        success: false,
        message: `Registration sync failed: ${error.message}`,
        errors: [...results.errors, { error: error.message }]
      };
    }
  }

  /**
   * Sync drivers from Google Sheets to database
   * @param {string} sheetId - Google Sheet ID
   * @param {string} sheetName - Optional sheet name
   * @param {string} syncUserId - User ID performing the sync (for createdBy field)
   * @param {boolean} forceVendorAssignment - If true, all drivers will be assigned to syncUserId (for VENDOR users)
   * @returns {Promise<Object>} Sync results
   */
  async syncDriversFromSheet(sheetId, sheetName, syncUserId, forceVendorAssignment = false) {
    const results = {
      total: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Fetch sheet data
      const rows = await this.fetchSheetData(sheetId, sheetName);
      
      if (rows.length === 0) {
        return {
          ...results,
          message: 'Sheet is empty'
        };
      }

      // opensheet.elk.sh returns array of objects with header names as keys
      const firstRow = rows[0];
      const columnMap = {};
      
      // Map actual column names to normalized names
      Object.keys(firstRow).forEach(headerName => {
        const normalized = this.normalizeColumnName(headerName);
        if (normalized) {
          columnMap[normalized] = headerName;
        }
      });

      console.log('📋 Column mapping:', columnMap);
      console.log('📋 First row sample:', firstRow);

      // Process each row
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        results.total++;

        try {
          // Parse row to driver data
          const parsed = this.parseRowToDriver(row, columnMap);
          
          if (!parsed.valid) {
            results.skipped++;
            results.errors.push({
              row: i + 1,
              email: row[columnMap.email] || row.Email || row.email || 'N/A',
              error: parsed.error
            });
            continue;
          }

          const { firstName, lastName, email, phone, vendor, username, password, licenseNumber, vehicleType, vehicleNumber, experience } = parsed.data;

          // Always respect Vendor column if provided (for all user roles)
          let createdByUserId = syncUserId;
          let vendorId = syncUserId.toString();
          let vendorNotFound = false;
          
          if (vendor) {
            const vendorUser = await this.findVendor(vendor);
            if (vendorUser) {
              vendorId = vendorUser._id.toString();
              createdByUserId = vendorUser._id;
              console.log(`✅ Using Vendor from sheet: "${vendor}" → Found: ${vendorUser.email} (Company: ${vendorUser.vendorDetails?.companyName || 'N/A'})`);
            } else {
              // Vendor not found - skip this driver
              vendorNotFound = true;
              results.skipped++;
              results.errors.push({
                row: i + 1,
                email: email,
                error: `Vendor "${vendor}" not found in database. Driver skipped. Please create vendor "${vendor}" first.`
              });
              console.error(`❌ Row ${i + 1} (${email}): Vendor "${vendor}" NOT FOUND in database! Driver skipped.`);
              console.error(`   ACTION REQUIRED: Create vendor "${vendor}" first, then re-sync.`);
              continue; // Skip this driver, don't create it
            }
          } else {
            // No Vendor column specified - use sync user
            vendorId = syncUserId.toString();
            createdByUserId = syncUserId;
            if (forceVendorAssignment) {
              console.log(`ℹ️  VENDOR sync: No Vendor specified, assigning driver ${email} to sync user`);
            } else {
              console.log(`ℹ️  ADMIN sync: No Vendor specified, assigning driver ${email} to sync user`);
            }
          }

          // Check if driver already exists (by email)
          const existingDriver = await User.findOne({
            email: email.toLowerCase(),
            role: 'DRIVER'
          });

          if (existingDriver) {
            // Update existing driver
            existingDriver.profile.firstName = firstName;
            existingDriver.profile.lastName = lastName;
            if (phone) {
              existingDriver.profile.phone = phone;
            }
            if (username && username !== existingDriver.username) {
              const usernameExists = await User.findOne({ 
                username, 
                _id: { $ne: existingDriver._id } 
              });
              if (!usernameExists) {
                existingDriver.username = username;
              }
            }
            if (password) {
              existingDriver.password = await bcrypt.hash(password, 10);
            }
            if (vendorId && vendorId !== existingDriver.vendorId?.toString()) {
              existingDriver.vendorId = vendorId;
            }
            if (createdByUserId && createdByUserId.toString() !== existingDriver.createdBy?.toString()) {
              existingDriver.createdBy = createdByUserId;
            }
            
            // Update driver details
            if (licenseNumber) existingDriver.driverDetails.licenseNumber = licenseNumber;
            if (vehicleType) existingDriver.driverDetails.vehicleType = vehicleType;
            if (vehicleNumber) existingDriver.driverDetails.vehicleNumber = vehicleNumber;
            if (experience !== undefined) existingDriver.driverDetails.experience = experience;

            await existingDriver.save();
            results.updated++;
            console.log(`✅ Updated driver: ${email}`);
          } else {
            // Create new driver
            let finalUsername = username;
            const usernameExists = await User.findOne({ username: finalUsername });
            if (usernameExists) {
              finalUsername = `${username}${Date.now().toString().slice(-4)}`;
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            // Generate driver ID
            const driverId = `DRV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const driver = new User({
              username: finalUsername,
              email: email.toLowerCase(),
              password: hashedPassword,
              role: 'DRIVER',
              vendorId: vendorId,
              driverId: driverId,
              profile: {
                firstName,
                lastName,
                phone: phone || ''
              },
              createdBy: createdByUserId,
              driverDetails: {
                licenseNumber: licenseNumber || '',
                vehicleType: vehicleType || '',
                vehicleNumber: vehicleNumber || '',
                experience: experience || 0,
                rating: 0,
                isActive: true
              },
              preferences: {
                notifications: {
                  email: true,
                  sms: true,
                  whatsapp: true,
                  push: true
                },
                language: 'en',
                timezone: 'Asia/Kolkata'
              }
            });

            await driver.save();
            results.created++;
            console.log(`✅ Created driver: ${email}`);
          }
        } catch (error) {
          results.skipped++;
          results.errors.push({
            row: i + 1,
            email: row[columnMap.email] || row.Email || row.email || 'N/A',
            error: error.message
          });
          console.error(`❌ Error processing row ${i + 1}:`, error.message);
        }
      }

      return {
        ...results,
        success: true,
        message: `Sync completed: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`
      };
    } catch (error) {
      console.error('Error syncing drivers from Google Sheets:', error);
      return {
        ...results,
        success: false,
        message: `Sync failed: ${error.message}`,
        errors: [...results.errors, { error: error.message }]
      };
    }
  }
}

module.exports = new GoogleSheetsSyncService();
