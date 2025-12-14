/**
 * Free Airline Database Service
 * Uses OpenFlights Airlines Database (free, public domain)
 * Maps airline codes (IATA/ICAO) to airline names
 */

class AirlineDatabase {
  constructor() {
    // Common airline codes database (subset of OpenFlights)
    // Full database available at: https://openflights.org/data.html
    this.airlines = new Map();
    this.initializeDatabase();
  }

  initializeDatabase() {
    // Popular airlines - you can expand this with full OpenFlights dataset
    const airlineData = [
      // Indian Airlines
      { iata: 'AI', icao: 'AIC', name: 'Air India', country: 'India' },
      { iata: '6E', icao: 'IGO', name: 'IndiGo', country: 'India' },
      { iata: 'SG', icao: 'SEJ', name: 'SpiceJet', country: 'India' },
      { iata: 'UK', icao: 'VTI', name: 'Vistara', country: 'India' },
      { iata: 'G8', icao: 'GOW', name: 'GoAir', country: 'India' },
      { iata: 'IX', icao: 'AXB', name: 'Air India Express', country: 'India' },
      { iata: 'I5', icao: 'IAD', name: 'AirAsia India', country: 'India' },
      
      // Middle East
      { iata: 'EK', icao: 'UAE', name: 'Emirates', country: 'United Arab Emirates' },
      { iata: 'QR', icao: 'QTR', name: 'Qatar Airways', country: 'Qatar' },
      { iata: 'EY', icao: 'ETD', name: 'Etihad Airways', country: 'United Arab Emirates' },
      { iata: 'SV', icao: 'SVA', name: 'Saudia', country: 'Saudi Arabia' },
      { iata: 'GF', icao: 'GFA', name: 'Gulf Air', country: 'Bahrain' },
      
      // European
      { iata: 'LH', icao: 'DLH', name: 'Lufthansa', country: 'Germany' },
      { iata: 'BA', icao: 'BAW', name: 'British Airways', country: 'United Kingdom' },
      { iata: 'AF', icao: 'AFR', name: 'Air France', country: 'France' },
      { iata: 'KL', icao: 'KLM', name: 'KLM Royal Dutch Airlines', country: 'Netherlands' },
      { iata: 'LX', icao: 'SWR', name: 'Swiss International Air Lines', country: 'Switzerland' },
      { iata: 'OS', icao: 'AUA', name: 'Austrian Airlines', country: 'Austria' },
      { iata: 'SN', icao: 'BEL', name: 'Brussels Airlines', country: 'Belgium' },
      { iata: 'IB', icao: 'IBE', name: 'Iberia', country: 'Spain' },
      { iata: 'TP', icao: 'TAP', name: 'TAP Air Portugal', country: 'Portugal' },
      { iata: 'TK', icao: 'THY', name: 'Turkish Airlines', country: 'Turkey' },
      
      // North American
      { iata: 'AA', icao: 'AAL', name: 'American Airlines', country: 'United States' },
      { iata: 'DL', icao: 'DAL', name: 'Delta Air Lines', country: 'United States' },
      { iata: 'UA', icao: 'UAL', name: 'United Airlines', country: 'United States' },
      { iata: 'WN', icao: 'SWA', name: 'Southwest Airlines', country: 'United States' },
      { iata: 'B6', icao: 'JBU', name: 'JetBlue Airways', country: 'United States' },
      { iata: 'AC', icao: 'ACA', name: 'Air Canada', country: 'Canada' },
      
      // Asian
      { iata: 'SQ', icao: 'SIA', name: 'Singapore Airlines', country: 'Singapore' },
      { iata: 'CX', icao: 'CPA', name: 'Cathay Pacific', country: 'Hong Kong' },
      { iata: 'JL', icao: 'JAL', name: 'Japan Airlines', country: 'Japan' },
      { iata: 'NH', icao: 'ANA', name: 'All Nippon Airways', country: 'Japan' },
      { iata: 'KE', icao: 'KAL', name: 'Korean Air', country: 'South Korea' },
      { iata: 'OZ', icao: 'AAR', name: 'Asiana Airlines', country: 'South Korea' },
      { iata: 'TG', icao: 'THA', name: 'Thai Airways', country: 'Thailand' },
      { iata: 'MH', icao: 'MAS', name: 'Malaysia Airlines', country: 'Malaysia' },
      { iata: 'GA', icao: 'GIA', name: 'Garuda Indonesia', country: 'Indonesia' },
      
      // Australian
      { iata: 'QF', icao: 'QFA', name: 'Qantas Airways', country: 'Australia' },
      { iata: 'VA', icao: 'VOZ', name: 'Virgin Australia', country: 'Australia' },
      { iata: 'JQ', icao: 'JST', name: 'Jetstar Airways', country: 'Australia' },
      
      // Low Cost
      { iata: 'FR', icao: 'RYR', name: 'Ryanair', country: 'Ireland' },
      { iata: 'U2', icao: 'EZY', name: 'easyJet', country: 'United Kingdom' },
      { iata: 'W6', icao: 'WZZ', name: 'Wizz Air', country: 'Hungary' },
      { iata: 'VY', icao: 'VLG', name: 'Vueling', country: 'Spain' },
      
      // Chinese
      { iata: 'CA', icao: 'CCA', name: 'Air China', country: 'China' },
      { iata: 'CZ', icao: 'CSN', name: 'China Southern Airlines', country: 'China' },
      { iata: 'MU', icao: 'CES', name: 'China Eastern Airlines', country: 'China' },
      { iata: 'HU', icao: 'CHH', name: 'Hainan Airlines', country: 'China' },
    ];

    // Index by IATA code
    airlineData.forEach(airline => {
      this.airlines.set(airline.iata, airline);
      if (airline.icao) {
        this.airlines.set(airline.icao, airline);
      }
    });
  }

  /**
   * Get airline information by code (IATA or ICAO)
   * @param {string} code - Airline code (e.g., 'AI', 'AIC', 'LH')
   * @returns {Object|null} Airline information
   */
  getAirline(code) {
    if (!code) return null;
    
    const upperCode = code.toUpperCase().trim();
    
    // Try exact match first
    let airline = this.airlines.get(upperCode);
    
    // If not found, try 2-letter prefix (common for IATA codes)
    if (!airline && upperCode.length >= 2) {
      airline = this.airlines.get(upperCode.substring(0, 2));
    }
    
    // If still not found, try 3-letter prefix (common for ICAO codes)
    if (!airline && upperCode.length >= 3) {
      airline = this.airlines.get(upperCode.substring(0, 3));
    }
    
    return airline || null;
  }

  /**
   * Extract airline code from callsign (e.g., "AI676" -> "AI")
   * @param {string} callsign - Flight callsign
   * @returns {string|null} Airline code
   */
  extractAirlineCode(callsign) {
    if (!callsign) return null;
    
    const clean = callsign.toUpperCase().trim();
    
    // Try 2-letter code first (most common)
    if (clean.length >= 2) {
      const code2 = clean.substring(0, 2);
      if (this.airlines.has(code2)) {
        return code2;
      }
    }
    
    // Try 3-letter code
    if (clean.length >= 3) {
      const code3 = clean.substring(0, 3);
      if (this.airlines.has(code3)) {
        return code3;
      }
    }
    
    // Return first 2 letters as fallback
    return clean.length >= 2 ? clean.substring(0, 2) : null;
  }

  /**
   * Get airline name from callsign
   * @param {string} callsign - Flight callsign (e.g., "AI676")
   * @returns {string} Airline name
   */
  getAirlineName(callsign) {
    const code = this.extractAirlineCode(callsign);
    const airline = this.getAirline(code);
    return airline ? airline.name : 'Unknown Airline';
  }

  /**
   * Get full airline info from callsign
   * @param {string} callsign - Flight callsign
   * @returns {Object|null} Full airline information
   */
  getAirlineInfo(callsign) {
    const code = this.extractAirlineCode(callsign);
    return this.getAirline(code);
  }
}

module.exports = new AirlineDatabase();

