/**
 * Free Routes Database Service
 * Uses OpenFlights Routes Database (free, public domain)
 * Maps airline + flight number patterns to common routes
 */

class RouteDatabase {
  constructor() {
    this.routes = new Map();
    this.initializeDatabase();
  }

  initializeDatabase() {
    // Common routes by airline (subset of OpenFlights Routes)
    // Full database available at: https://openflights.org/data.html
    // Format: airline_code -> [common routes]
    
    const routeData = {
      // Air India
      'AI': [
        { from: 'DEL', to: 'BOM', frequency: 'high' },
        { from: 'DEL', to: 'DXB', frequency: 'high' },
        { from: 'BOM', to: 'DXB', frequency: 'high' },
        { from: 'DEL', to: 'LHR', frequency: 'high' },
        { from: 'BOM', to: 'LHR', frequency: 'high' },
        { from: 'DEL', to: 'JFK', frequency: 'medium' },
        { from: 'BOM', to: 'JFK', frequency: 'medium' },
        { from: 'DEL', to: 'SIN', frequency: 'medium' },
        { from: 'BOM', to: 'SIN', frequency: 'medium' },
      ],
      
      // IndiGo
      '6E': [
        { from: 'DEL', to: 'BOM', frequency: 'very_high' },
        { from: 'DEL', to: 'BLR', frequency: 'very_high' },
        { from: 'BOM', to: 'BLR', frequency: 'very_high' },
        { from: 'DEL', to: 'MAA', frequency: 'high' },
        { from: 'BOM', to: 'MAA', frequency: 'high' },
        { from: 'DEL', to: 'CCU', frequency: 'high' },
        { from: 'BOM', to: 'HYD', frequency: 'high' },
        { from: 'DEL', to: 'DXB', frequency: 'medium' },
        { from: 'BOM', to: 'DXB', frequency: 'medium' },
        { from: 'DEL', to: 'SIN', frequency: 'medium' },
      ],
      
      // Emirates
      'EK': [
        { from: 'DXB', to: 'BOM', frequency: 'very_high' },
        { from: 'DXB', to: 'DEL', frequency: 'very_high' },
        { from: 'DXB', to: 'LHR', frequency: 'very_high' },
        { from: 'DXB', to: 'JFK', frequency: 'high' },
        { from: 'DXB', to: 'LAX', frequency: 'high' },
        { from: 'DXB', to: 'SIN', frequency: 'high' },
        { from: 'DXB', to: 'BKK', frequency: 'high' },
        { from: 'DXB', to: 'HKG', frequency: 'high' },
      ],
      
      // Lufthansa
      'LH': [
        { from: 'FRA', to: 'DEL', frequency: 'high' },
        { from: 'FRA', to: 'BOM', frequency: 'high' },
        { from: 'FRA', to: 'JFK', frequency: 'very_high' },
        { from: 'FRA', to: 'LAX', frequency: 'high' },
        { from: 'MUC', to: 'DEL', frequency: 'medium' },
        { from: 'MUC', to: 'BOM', frequency: 'medium' },
        { from: 'FRA', to: 'SIN', frequency: 'high' },
        { from: 'FRA', to: 'BKK', frequency: 'high' },
      ],
      
      // British Airways
      'BA': [
        { from: 'LHR', to: 'DEL', frequency: 'very_high' },
        { from: 'LHR', to: 'BOM', frequency: 'very_high' },
        { from: 'LHR', to: 'BLR', frequency: 'high' },
        { from: 'LHR', to: 'JFK', frequency: 'very_high' },
        { from: 'LHR', to: 'LAX', frequency: 'high' },
        { from: 'LHR', to: 'SIN', frequency: 'high' },
        { from: 'LHR', to: 'HKG', frequency: 'high' },
      ],
      
      // Qatar Airways
      'QR': [
        { from: 'DOH', to: 'DEL', frequency: 'very_high' },
        { from: 'DOH', to: 'BOM', frequency: 'very_high' },
        { from: 'DOH', to: 'LHR', frequency: 'very_high' },
        { from: 'DOH', to: 'JFK', frequency: 'high' },
        { from: 'DOH', to: 'SIN', frequency: 'high' },
        { from: 'DOH', to: 'BKK', frequency: 'high' },
      ],
      
      // Singapore Airlines
      'SQ': [
        { from: 'SIN', to: 'DEL', frequency: 'high' },
        { from: 'SIN', to: 'BOM', frequency: 'high' },
        { from: 'SIN', to: 'BLR', frequency: 'high' },
        { from: 'SIN', to: 'LHR', frequency: 'high' },
        { from: 'SIN', to: 'JFK', frequency: 'high' },
        { from: 'SIN', to: 'SYD', frequency: 'very_high' },
        { from: 'SIN', to: 'HKG', frequency: 'very_high' },
      ],
      
      // Qantas
      'QF': [
        { from: 'SYD', to: 'SIN', frequency: 'very_high' },
        { from: 'SYD', to: 'HKG', frequency: 'high' },
        { from: 'SYD', to: 'DXB', frequency: 'high' },
        { from: 'SYD', to: 'LHR', frequency: 'high' },
        { from: 'MEL', to: 'SIN', frequency: 'high' },
        { from: 'MEL', to: 'DXB', frequency: 'high' },
      ],
    };

    // Build route map
    Object.entries(routeData).forEach(([airline, routes]) => {
      this.routes.set(airline, routes);
    });
  }

  /**
   * Get common routes for an airline
   * @param {string} airlineCode - Airline IATA code
   * @returns {Array} Array of common routes
   */
  getRoutes(airlineCode) {
    if (!airlineCode) return [];
    return this.routes.get(airlineCode.toUpperCase()) || [];
  }

  /**
   * Guess route for a flight based on airline and position
   * @param {string} airlineCode - Airline code
   * @param {number} lat - Current latitude
   * @param {number} lon - Current longitude
   * @returns {Object|null} Estimated route
   */
  guessRoute(airlineCode, lat, lon) {
    const routes = this.getRoutes(airlineCode);
    if (routes.length === 0) return null;

    // For now, return the most common route
    // In a full implementation, you could use position to determine direction
    return routes[0];
  }

  /**
   * Get most common route for an airline
   * @param {string} airlineCode - Airline code
   * @returns {Object|null} Most common route
   */
  getMostCommonRoute(airlineCode) {
    const routes = this.getRoutes(airlineCode);
    if (routes.length === 0) return null;

    // Sort by frequency (very_high > high > medium)
    const frequencyOrder = { very_high: 3, high: 2, medium: 1, low: 0 };
    routes.sort((a, b) => {
      return (frequencyOrder[b.frequency] || 0) - (frequencyOrder[a.frequency] || 0);
    });

    return routes[0];
  }
}

module.exports = new RouteDatabase();

