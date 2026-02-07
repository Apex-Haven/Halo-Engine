const axios = require('axios');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

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
      const url = sheetName 
        ? `${this.opensheetBaseUrl}/${cleanSheetId}/${encodeURIComponent(sheetName)}`
        : `${this.opensheetBaseUrl}/${cleanSheetId}`;
      
      console.log(`📊 Fetching Google Sheet data from: ${url}`);
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
   * Normalize column names (handle variations)
   * @param {string} columnName - Column name from sheet
   * @returns {string} Normalized column name
   */
  normalizeColumnName(columnName) {
    if (!columnName) return '';
    
    const normalized = columnName.trim().toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[_-]/g, '');
    
    // Map common variations
    const columnMap = {
      'firstname': 'firstName',
      'first_name': 'firstName',
      'fname': 'firstName',
      'lastname': 'lastName',
      'last_name': 'lastName',
      'lname': 'lastName',
      'email': 'email',
      'emailaddress': 'email',
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
      'yearsexperience': 'experience'
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

    const firstName = getValue('firstName');
    const lastName = getValue('lastName');
    const email = getValue('email');
    const phone = getValue('phone');
    const client = getValue('client');
    const username = getValue('username');
    const password = getValue('password');

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

          const { firstName, lastName, email, phone, client, username, password } = parsed.data;

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

          if (existingTraveler) {
            // Update existing traveler
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
