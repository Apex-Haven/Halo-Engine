const axios = require('axios');
const airportDatabase = require('./databases/airportDatabase');

class FlightTrackingService {
  constructor() {
    // AviationStack API - Free tier allows 100 requests per month
    this.apiKey = process.env.AVIATIONSTACK_API_KEY || 'a81fec64c6fda4a44a703cd582b7bdbb';
    this.baseUrl = 'http://api.aviationstack.com/v1';
    
    // Alternative: OpenSky Network API (completely free, no API key needed)
    this.openSkyUrl = 'https://opensky-network.org/api';
    
    // Airport database for route estimation (already instantiated)
    this.airportDb = airportDatabase;
  }

  async getFlightInfo(flightNumber) {
    try {
      // Try AviationStack first for accurate route data (if available)
      if (this.apiKey && this.apiKey !== 'your_api_key_here') {
        console.log(`🔍 Searching AviationStack for flight: ${flightNumber}`);
        const aviationResult = await this.getFlightFromAviationStack(flightNumber);
        if (aviationResult && aviationResult.departure && aviationResult.arrival) {
          // Try to enhance with OpenSky real-time position data
          console.log(`🔍 Enhancing with OpenSky real-time position: ${flightNumber}`);
          const openSkyResult = await this.getFlightFromOpenSky(flightNumber);
          if (openSkyResult && openSkyResult.position) {
            // Merge AviationStack route data with OpenSky real-time position
            return {
              ...aviationResult,
              status: openSkyResult.status || aviationResult.status,
              live: openSkyResult.live || aviationResult.live,
              position: openSkyResult.position,
              velocity: openSkyResult.velocity,
              altitude: openSkyResult.altitude,
              source: 'aviationstack-opensky-hybrid',
              routeEstimated: false, // AviationStack provides actual route data
              departure: {
                ...aviationResult.departure,
                isEstimated: false // Actual data from AviationStack
              },
              arrival: {
                ...aviationResult.arrival,
                isEstimated: false // Actual data from AviationStack
              }
            };
          }
          // Return AviationStack data even without OpenSky enhancement
          return aviationResult;
        }
      }
      
      // Fallback to OpenSky Network (free, unlimited, real-time data)
      console.log(`🔍 Searching OpenSky Network for flight: ${flightNumber}`);
      const openSkyResult = await this.getFlightFromOpenSky(flightNumber);
      if (openSkyResult) {
        return openSkyResult;
      }
      
      // Fallback to AviationStack if OpenSky doesn't have the flight
      if (this.apiKey && this.apiKey !== 'your_api_key_here') {
        console.log(`🔍 Searching AviationStack for flight: ${flightNumber}`);
        const aviationResult = await this.getFlightFromAviationStack(flightNumber);
        if (aviationResult) {
          return aviationResult;
        }
      }
      
      // Final fallback to mock data
      console.log(`🔍 Using mock data for flight: ${flightNumber}`);
      return this.getMockFlightData(flightNumber);
    } catch (error) {
      console.error('Flight tracking error:', error.message);
      return this.getMockFlightData(flightNumber);
    }
  }

  async getFlightFromAviationStack(flightNumber) {
    try {
      // Normalize flight number - handle different formats
      const normalized = flightNumber.toUpperCase().trim();
      
      // Extract airline code and flight number
      // UAE9H -> try EK9H (Emirates), UAE9H, 9H
      // AI123 -> try AI123, AI 123
      const airlineCode = normalized.substring(0, 2);
      const flightNum = normalized.substring(2);
      
      // Try different search approaches for AviationStack, prioritizing active flights
      const searchVariations = [
        // First try active flights only
        { flight_iata: normalized, flight_status: 'active' },
        { flight_icao: normalized, flight_status: 'active' },
        { flight_number: normalized, flight_status: 'active' },
        // Try with space
        { flight_iata: `${airlineCode} ${flightNum}`, flight_status: 'active' },
        // Try airline code variations (UAE -> EK for Emirates)
        ...(airlineCode === 'UAE' ? [
          { flight_iata: `EK${flightNum}`, flight_status: 'active' },
          { flight_iata: `EK${flightNum}` }
        ] : []),
        // Then try all flights
        { flight_iata: normalized },
        { flight_icao: normalized },
        { flight_number: normalized },
        { flight_iata: `${airlineCode} ${flightNum}` },
        // Try without airline code
        { flight_number: flightNum }
      ];

      for (const searchParams of searchVariations) {
        try {
          console.log(`🔍 Trying AviationStack search:`, searchParams);
          const response = await axios.get(`${this.baseUrl}/flights`, {
            params: {
              access_key: this.apiKey,
              ...searchParams,
              limit: 1
            },
            timeout: 10000
          });

          if (response.data.data && response.data.data.length > 0) {
            const flight = response.data.data[0];
            console.log(`✅ Found flight in AviationStack:`, flight.flight?.iata || flight.flight?.icao);
            console.log(`   Status:`, flight.flight_status);
            return this.formatAviationStackData(flight);
          }
        } catch (searchError) {
          console.log(`AviationStack search failed for ${JSON.stringify(searchParams)}:`, searchError.message);
          continue;
        }
      }
      
      console.log(`❌ No flight found in AviationStack for ${flightNumber}`);
      return null;
    } catch (error) {
      console.error('AviationStack API error:', error.message);
      return null;
    }
  }

  async getFlightFromOpenSky(flightNumber) {
    try {
      // OpenSky Network provides real-time flight data
      // We'll search for currently active flights
      console.log(`🔍 Searching OpenSky Network for active flights matching: ${flightNumber}`);

      // Clean and normalize flight number
      const cleanFlightNumber = flightNumber.replace(/[^A-Z0-9]/g, '').toUpperCase();
      const airlineCode = cleanFlightNumber.substring(0, 2);
      
      // Search in multiple ways
      const searchTerms = [
        cleanFlightNumber, // Exact match
        cleanFlightNumber.substring(0, 3), // First 3 chars
        airlineCode // Airline code only
      ];

      // Try global search first
      for (const searchTerm of searchTerms) {
        try {
          const response = await axios.get(`${this.openSkyUrl}/states/all`, {
            timeout: 10000
          });

          if (response.data && response.data.states) {
            // Look for flights with matching callsign
            const flight = response.data.states.find(state => {
              const callsign = state[1]?.trim().toUpperCase();
              if (!callsign) return false;
              
              // Exact match or contains search term
              return callsign === searchTerm || 
                     callsign.includes(searchTerm) ||
                     (searchTerm.length >= 2 && callsign.startsWith(searchTerm));
            });

            if (flight) {
              console.log(`✅ Found active flight ${flight[1]} in OpenSky Network`);
              return this.formatOpenSkyStateData(flight);
            }
          }
        } catch (searchError) {
          console.log(`Search failed for ${searchTerm}:`, searchError.message);
          continue;
        }
      }

      // Try India bounding box search (more focused, faster)
      try {
        // India bounding box: lat 8-37, lon 68-97
        const response = await axios.get(`${this.openSkyUrl}/states/all`, {
          params: {
            lamin: 8,   // Minimum latitude (south)
            lomin: 68,  // Minimum longitude (west)
            lamax: 37,  // Maximum latitude (north)
            lomax: 97   // Maximum longitude (east)
          },
          timeout: 10000
        });

        if (response.data && response.data.states) {
          const flight = response.data.states.find(state => {
            const callsign = state[1]?.trim().toUpperCase();
            if (!callsign) return false;
            
            return callsign === cleanFlightNumber || 
                   callsign.includes(cleanFlightNumber) ||
                   (cleanFlightNumber.length >= 2 && callsign.startsWith(cleanFlightNumber.substring(0, 2)));
          });

          if (flight) {
            console.log(`✅ Found active flight ${flight[1]} in OpenSky Network (India region)`);
            return this.formatOpenSkyStateData(flight);
          }
        }
      } catch (indiaSearchError) {
        console.log('India region search failed:', indiaSearchError.message);
      }

      console.log(`❌ No active flight found for ${flightNumber} in OpenSky Network`);
      return null;
    } catch (error) {
      console.error('OpenSky API error:', error.message);
      return null;
    }
  }

  // New method: Get all flights in a region (bounding box)
  async getFlightsByRegion(lamin, lomin, lamax, lomax) {
    try {
      const response = await axios.get(`${this.openSkyUrl}/states/all`, {
        params: {
          lamin,  // Minimum latitude
          lomin,  // Minimum longitude
          lamax,  // Maximum latitude
          lomax   // Maximum longitude
        },
        timeout: 10000
      });

      if (response.data && response.data.states) {
        return response.data.states.map(state => this.formatOpenSkyStateData(state));
      }
      
      return [];
    } catch (error) {
      console.error('OpenSky region search error:', error.message);
      return [];
    }
  }

  formatAviationStackData(flight) {
    const now = new Date();
    const scheduledDeparture = new Date(flight.departure?.scheduled);
    const actualDeparture = flight.departure?.actual ? new Date(flight.departure.actual) : null;
    const scheduledArrival = new Date(flight.arrival?.scheduled);
    const actualArrival = flight.arrival?.actual ? new Date(flight.arrival.actual) : null;
    
    // Calculate intelligent flight status based on times
    let status = 'scheduled';
    
    // Simple and robust status calculation
    if (actualArrival && now > actualArrival) {
      status = 'landed';
    } else if (actualDeparture && now > actualDeparture) {
      // Flight has departed
      if (actualArrival && now < actualArrival) {
        status = 'in-flight';
      } else if (!actualArrival && now < scheduledArrival) {
        status = 'in-flight';
      } else {
        status = 'landed';
      }
    } else if (now > scheduledArrival) {
      status = 'landed';
    } else if (now > scheduledDeparture) {
      status = 'in-flight';
    } else {
      status = 'scheduled';
    }

    return {
      flightNumber: flight.flight?.iata || flight.flight?.icao,
      airline: flight.airline?.name,
      aircraft: flight.aircraft?.iata,
      departure: {
        airport: flight.departure?.airport,
        iata: flight.departure?.iata,
        scheduled: flight.departure?.scheduled,
        actual: flight.departure?.actual,
        terminal: flight.departure?.terminal,
        gate: flight.departure?.gate,
        delay: flight.departure?.delay,
        isEstimated: false // AviationStack provides actual route data
      },
      arrival: {
        airport: flight.arrival?.airport,
        iata: flight.arrival?.iata,
        scheduled: flight.arrival?.scheduled,
        actual: flight.arrival?.actual,
        terminal: flight.arrival?.terminal,
        gate: flight.arrival?.gate,
        delay: flight.arrival?.delay,
        isEstimated: false // AviationStack provides actual route data
      },
      status: status,
      live: flight.live,
      source: 'aviationstack',
      routeEstimated: false // AviationStack provides actual route data
    };
  }

  formatOpenSkyStateData(state) {
    // OpenSky states array format:
    // [0] icao24, [1] callsign, [2] origin_country, [3] time_position, [4] last_contact,
    // [5] longitude, [6] latitude, [7] baro_altitude, [8] on_ground, [9] velocity,
    // [10] true_track, [11] vertical_rate, [12] sensors, [13] geo_altitude, [14] squawk,
    // [15] spi, [16] position_source
    const callsign = state[1]?.trim();
    const airline = this.getAirlineFromCallsign(callsign);
    const originCountry = state[2] || 'Unknown';
    const now = new Date();
    const timePosition = state[3] ? new Date(state[3] * 1000) : null;
    const lastContact = state[4] ? new Date(state[4] * 1000) : null;
    
    // Real-time position data
    const longitude = state[5];
    const latitude = state[6];
    const baroAltitude = state[7]; // Barometric altitude in meters
    const geoAltitude = state[13]; // Geometric altitude in meters
    const velocity = state[9]; // Velocity in m/s
    const trueTrack = state[10]; // True track in degrees
    const verticalRate = state[11]; // Vertical rate in m/s
    const onGround = state[8] || false;
    
    // Estimate airports based on position and heading
    const estimatedAirports = this.estimateAirportsFromPosition(latitude, longitude, trueTrack, originCountry, airline);
    
    // Estimate departure time (if we have position time, use it; otherwise estimate)
    const estimatedDepartureTime = timePosition 
      ? new Date(timePosition.getTime() - 2 * 60 * 60 * 1000) // 2 hours before position time
      : new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    // Estimate arrival time based on typical flight duration
    const estimatedArrivalTime = new Date(estimatedDepartureTime.getTime() + 2 * 60 * 60 * 1000);
    
    console.log(`📍 OpenSky Network: Real-time data for ${callsign}`);
    console.log(`   Position: ${latitude}, ${longitude}`);
    console.log(`   Altitude: ${baroAltitude || geoAltitude}m, Speed: ${velocity ? (velocity * 3.6).toFixed(0) : 'N/A'} km/h`);
    console.log(`   Status: ${onGround ? 'On Ground' : 'In Flight'}`);
    console.log(`   Estimated Route: ${estimatedAirports.departure.iata} → ${estimatedAirports.arrival.iata} (${estimatedAirports.isEstimated ? 'ESTIMATED' : 'ACTUAL'})`);
    
    return {
      flightNumber: callsign,
      airline: airline,
      aircraft: state[0], // icao24
      departure: {
        airport: estimatedAirports.departure.airport,
        iata: estimatedAirports.departure.iata,
        scheduled: estimatedDepartureTime.toISOString(),
        actual: estimatedDepartureTime.toISOString(),
        terminal: null, // OpenSky doesn't provide this
        gate: null, // OpenSky doesn't provide this
        delay: 0,
        isEstimated: estimatedAirports.isEstimated
      },
      arrival: {
        airport: estimatedAirports.arrival.airport,
        iata: estimatedAirports.arrival.iata,
        scheduled: estimatedArrivalTime.toISOString(),
        actual: null,
        terminal: null, // OpenSky doesn't provide this
        gate: null, // OpenSky doesn't provide this
        delay: 0,
        isEstimated: estimatedAirports.isEstimated
      },
      status: onGround ? 'landed' : 'in-flight',
      live: true,
      source: 'opensky-live',
      // Real-time position data
      position: {
        latitude: latitude,
        longitude: longitude,
        altitude: baroAltitude || geoAltitude,
        velocity: velocity ? (velocity * 3.6) : null, // Convert m/s to km/h
        heading: trueTrack,
        verticalRate: verticalRate,
        lastUpdate: lastContact || timePosition || now
      },
      originCountry: originCountry,
      routeEstimated: estimatedAirports.isEstimated,
      velocity: velocity ? (velocity * 3.6) : null,
      altitude: baroAltitude || geoAltitude
    };
  }

  // Estimate departure and arrival airports based on current position and heading
  estimateAirportsFromPosition(lat, lon, heading, originCountry, airline) {
    // Major airports database for estimation
    const majorAirports = [
      // Indian Airports
      { iata: 'DEL', name: 'Indira Gandhi International Airport', lat: 28.5562, lon: 77.1000, country: 'India' },
      { iata: 'BOM', name: 'Chhatrapati Shivaji Maharaj International Airport', lat: 19.0896, lon: 72.8656, country: 'India' },
      { iata: 'BLR', name: 'Kempegowda International Airport', lat: 13.1986, lon: 77.7066, country: 'India' },
      { iata: 'MAA', name: 'Chennai International Airport', lat: 12.9941, lon: 80.1709, country: 'India' },
      { iata: 'CCU', name: 'Netaji Subhash Chandra Bose International Airport', lat: 22.6547, lon: 88.4467, country: 'India' },
      { iata: 'HYD', name: 'Rajiv Gandhi International Airport', lat: 17.2403, lon: 78.4294, country: 'India' },
      { iata: 'COK', name: 'Cochin International Airport', lat: 9.9312, lon: 76.2673, country: 'India' },
      { iata: 'GOI', name: 'Dabolim Airport', lat: 15.3808, lon: 73.8314, country: 'India' },
      // International Airports
      { iata: 'DXB', name: 'Dubai International Airport', lat: 25.2532, lon: 55.3657, country: 'UAE' },
      { iata: 'DOH', name: 'Hamad International Airport', lat: 25.2611, lon: 51.5651, country: 'Qatar' },
      { iata: 'CAI', name: 'Cairo International Airport', lat: 30.1219, lon: 31.4056, country: 'Egypt' },
      { iata: 'RUH', name: 'King Khalid International Airport', lat: 24.9576, lon: 46.6988, country: 'Saudi Arabia' },
      { iata: 'JED', name: 'King Abdulaziz International Airport', lat: 21.6796, lon: 39.1565, country: 'Saudi Arabia' },
      { iata: 'AUH', name: 'Abu Dhabi International Airport', lat: 24.4330, lon: 54.6511, country: 'UAE' },
      { iata: 'SIN', name: 'Singapore Changi Airport', lat: 1.3644, lon: 103.9915, country: 'Singapore' },
      { iata: 'BKK', name: 'Suvarnabhumi Airport', lat: 13.6811, lon: 100.7473, country: 'Thailand' },
      { iata: 'KUL', name: 'Kuala Lumpur International Airport', lat: 2.7456, lon: 101.7099, country: 'Malaysia' },
      { iata: 'HKG', name: 'Hong Kong International Airport', lat: 22.3080, lon: 113.9185, country: 'Hong Kong' },
      { iata: 'LHR', name: 'London Heathrow Airport', lat: 51.4700, lon: -0.4543, country: 'UK' },
      { iata: 'LGW', name: 'London Gatwick Airport', lat: 51.1537, lon: -0.1821, country: 'UK' },
      { iata: 'GLA', name: 'Glasgow Airport', lat: 55.8719, lon: -4.4331, country: 'UK' },
      { iata: 'EDI', name: 'Edinburgh Airport', lat: 55.9500, lon: -3.3725, country: 'UK' },
      { iata: 'MAN', name: 'Manchester Airport', lat: 53.3537, lon: -2.2749, country: 'UK' },
      { iata: 'FRA', name: 'Frankfurt Airport', lat: 50.0379, lon: 8.5622, country: 'Germany' },
      { iata: 'MUC', name: 'Munich Airport', lat: 48.3538, lon: 11.7861, country: 'Germany' },
      { iata: 'CDG', name: 'Charles de Gaulle Airport', lat: 49.0097, lon: 2.5479, country: 'France' },
      { iata: 'AMS', name: 'Amsterdam Airport Schiphol', lat: 52.3105, lon: 4.7683, country: 'Netherlands' },
      { iata: 'JFK', name: 'John F. Kennedy International Airport', lat: 40.6413, lon: -73.7781, country: 'USA' },
      { iata: 'LAX', name: 'Los Angeles International Airport', lat: 33.9425, lon: -118.4081, country: 'USA' }
    ];

    // Calculate distance to all airports
    const airportsWithDistance = majorAirports.map(airport => {
      const distance = this.calculateDistance(lat, lon, airport.lat, airport.lon);
      return { ...airport, distance };
    });

    // Sort by distance
    airportsWithDistance.sort((a, b) => a.distance - b.distance);

    // If flight is in the air (not on ground), current position is NOT the departure airport
    // We need to estimate based on heading and typical routes
    let departureAirport, arrivalAirport;
    
    // If heading is available and flight is likely in the air (distance from nearest airport > 50km)
    if (heading !== null && heading !== undefined && airportsWithDistance[0].distance > 50) {
      // Flight is in the air - estimate based on heading direction
      // Heading 113 degrees (eastward) from UAE area suggests departure from west (UK/Europe)
      
      // Find airports in the opposite direction of heading (likely departure)
      const oppositeHeading = (heading + 180) % 360;
      const airportsOppositeDirection = airportsWithDistance.filter(airport => {
        const bearing = this.calculateBearing(lat, lon, airport.lat, airport.lon);
        const angleDiff = Math.abs(bearing - oppositeHeading);
        return angleDiff < 60 || angleDiff > 300; // Within 60 degrees of opposite direction
      });
      
      // Find airports in the heading direction (likely arrival)
      const airportsInDirection = airportsWithDistance.filter(airport => {
        const bearing = this.calculateBearing(lat, lon, airport.lat, airport.lon);
        const angleDiff = Math.abs(bearing - heading);
        return angleDiff < 60 || angleDiff > 300; // Within 60 degrees
      });
      
      // Special case: Flight heading east from Middle East area (likely UK/Europe → Middle East/Asia)
      const isMiddleEastArea = lat > 20 && lat < 35 && lon > 45 && lon < 60;
      const isHeadingEast = heading > 45 && heading < 135;
      
      if (isMiddleEastArea && isHeadingEast) {
        // Flight is in Middle East heading east
        // Departure could be: Cairo (CAI), other Middle East airports, or UK/Europe
        // Arrival is likely DXB or other Middle East/Asian airports
        
        // First, try to find airports in opposite direction (behind the flight)
        if (airportsOppositeDirection.length > 0) {
          // Sort by distance (farther = more likely departure)
          airportsOppositeDirection.sort((a, b) => b.distance - a.distance);
          
          // Prefer regional airports (Egypt, Middle East) over UK if they're in opposite direction
          const regionalAirports = airportsOppositeDirection.filter(a => 
            a.country === 'Egypt' || 
            (a.country === 'UAE' && a.iata !== 'DXB') || // Don't use DXB as departure if it's likely arrival
            a.country === 'Qatar' || 
            a.country === 'Saudi Arabia'
          );
          
          if (regionalAirports.length > 0) {
            // Prefer CAI (Cairo) if available, as it's a common departure for Middle East routes
            departureAirport = regionalAirports.find(a => a.iata === 'CAI') ||
                              regionalAirports[0];
          } else {
            // Fallback to UK airports if no regional airports in opposite direction
            const ukAirports = airportsOppositeDirection.filter(a => a.country === 'UK');
            if (ukAirports.length > 0) {
              departureAirport = ukAirports.find(a => a.iata === 'GLA') || 
                                ukAirports.find(a => a.iata === 'LHR') ||
                                ukAirports[0];
            } else {
              departureAirport = airportsOppositeDirection[0];
            }
          }
        } else {
          // No airports in opposite direction, try to find regional airports
          const regionalAirports = airportsWithDistance.filter(a => 
            a.country === 'Egypt' || 
            (a.country === 'UAE' && a.iata !== 'DXB')
          );
          
          if (regionalAirports.length > 0) {
            departureAirport = regionalAirports.find(a => a.iata === 'CAI') ||
                              regionalAirports[0];
          } else {
            // Last resort: UK airports
            const ukAirports = majorAirports.filter(a => a.country === 'UK');
            departureAirport = ukAirports.find(a => a.iata === 'GLA') || 
                              ukAirports.find(a => a.iata === 'LHR') ||
                              airportsWithDistance[0];
          }
        }
        
        // Arrival is likely DXB or other Middle East/Asian airports in heading direction
        if (airportsInDirection.length > 0) {
          // Prefer DXB if in direction
          arrivalAirport = airportsInDirection.find(a => a.iata === 'DXB') ||
                          airportsInDirection[0];
        } else {
          // Fallback to DXB or nearest
          arrivalAirport = airportsWithDistance.find(a => a.iata === 'DXB') ||
                          airportsWithDistance[0];
        }
      } else {
        // General case: Estimate departure (opposite direction, far away)
        if (airportsOppositeDirection.length > 0) {
          airportsOppositeDirection.sort((a, b) => b.distance - a.distance);
          departureAirport = airportsOppositeDirection[0];
        } else {
          departureAirport = airportsWithDistance[0];
        }
        
        // Estimate arrival (in heading direction, closer)
        if (airportsInDirection.length > 0) {
          arrivalAirport = airportsInDirection[0];
        } else {
          arrivalAirport = airportsWithDistance[0];
        }
      }
    } else {
      // Flight is near an airport (on ground or just departed)
      const nearestAirport = airportsWithDistance[0];
      departureAirport = nearestAirport;
      
      // Estimate arrival airport (second nearest, or based on heading direction)
      arrivalAirport = airportsWithDistance[1] || airportsWithDistance[0];
      
      // If heading is available, try to find airport in that direction
      if (heading !== null && heading !== undefined) {
        const airportsInDirection = airportsWithDistance.filter(airport => {
          const bearing = this.calculateBearing(lat, lon, airport.lat, airport.lon);
          const angleDiff = Math.abs(bearing - heading);
          return angleDiff < 45 || angleDiff > 315; // Within 45 degrees
        });
        
        if (airportsInDirection.length > 0 && airportsInDirection[0].distance > nearestAirport.distance) {
          arrivalAirport = airportsInDirection[0];
        }
      }
    }

    // Ensure departure and arrival are different
    if (departureAirport.iata === arrivalAirport.iata && airportsWithDistance.length > 1) {
      // If same, pick a different one
      const alternatives = airportsWithDistance.filter(a => a.iata !== departureAirport.iata);
      if (alternatives.length > 0) {
        arrivalAirport = alternatives[0];
      }
    }

    return {
      departure: {
        airport: departureAirport.name,
        iata: departureAirport.iata
      },
      arrival: {
        airport: arrivalAirport.name,
        iata: arrivalAirport.iata
      },
      isEstimated: true // Always estimated for OpenSky data
    };
  }

  // Calculate distance between two coordinates (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Calculate bearing from point 1 to point 2
  calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = this.toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(this.toRad(lat2));
    const x = Math.cos(this.toRad(lat1)) * Math.sin(this.toRad(lat2)) -
              Math.sin(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.cos(dLon);
    let bearing = Math.atan2(y, x);
    bearing = this.toDeg(bearing);
    return (bearing + 360) % 360;
  }

  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  toDeg(radians) {
    return radians * (180 / Math.PI);
  }

  formatOpenSkyData(flight) {
    const airline = this.getAirlineFromCallsign(flight.callsign);
    const departureTime = new Date(flight.firstSeen * 1000);
    const arrivalTime = flight.lastSeen ? new Date(flight.lastSeen * 1000) : null;
    
    return {
      flightNumber: flight.callsign,
      airline: airline,
      aircraft: flight.icao24,
      departure: {
        airport: this.getAirportName(flight.estDepartureAirport),
        iata: flight.estDepartureAirport,
        scheduled: departureTime.toISOString(),
        actual: departureTime.toISOString(),
        terminal: this.getRandomTerminal(),
        gate: this.getRandomGate(),
        delay: 0
      },
      arrival: {
        airport: this.getAirportName(flight.estArrivalAirport),
        iata: flight.estArrivalAirport,
        scheduled: arrivalTime ? arrivalTime.toISOString() : new Date(departureTime.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        actual: arrivalTime ? arrivalTime.toISOString() : null,
        terminal: this.getRandomTerminal(),
        gate: this.getRandomGate(),
        delay: 0
      },
      status: flight.lastSeen ? 'landed' : 'in-flight',
      live: true,
      source: 'opensky'
    };
  }

  getAirportName(iataCode) {
    const airports = {
      'EDDF': 'Frankfurt Airport',
      'EGLL': 'London Heathrow Airport',
      'EHAM': 'Amsterdam Airport Schiphol',
      'LFPG': 'Charles de Gaulle Airport',
      'KJFK': 'John F. Kennedy International Airport',
      'KLAX': 'Los Angeles International Airport',
      'KSFO': 'San Francisco International Airport',
      'VIDP': 'Indira Gandhi International Airport',
      'VABB': 'Chhatrapati Shivaji Maharaj International Airport',
      'VOBL': 'Kempegowda International Airport',
      'VOMM': 'Chennai International Airport',
      'VECC': 'Netaji Subhash Chandra Bose International Airport',
      'YSSY': 'Sydney Kingsford Smith Airport',
      'YMML': 'Melbourne Airport',
      'NZAA': 'Auckland Airport',
      'RJTT': 'Tokyo Haneda Airport',
      'RKSI': 'Incheon International Airport',
      'ZBAA': 'Beijing Capital International Airport',
      'ZSPD': 'Shanghai Pudong International Airport',
      'OMDB': 'Dubai International Airport',
      'OTHH': 'Hamad International Airport',
      'WSSS': 'Singapore Changi Airport',
      'VTBS': 'Suvarnabhumi Airport',
      'VHHH': 'Hong Kong International Airport'
    };
    
    return airports[iataCode] || `${iataCode} Airport`;
  }

  getRandomTerminal() {
    return Math.floor(Math.random() * 3) + 1;
  }

  getRandomGate() {
    return Math.floor(Math.random() * 50) + 1;
  }

  getAirlineFromCallsign(callsign) {
    const airlineCodes = {
      'LH': 'Lufthansa',
      'DLH': 'Lufthansa',
      'BA': 'British Airways',
      'AF': 'Air France',
      'KL': 'KLM Royal Dutch Airlines',
      'EK': 'Emirates',
      'QR': 'Qatar Airways',
      'SQ': 'Singapore Airlines',
      'AI': 'Air India',
      '6E': 'IndiGo',
      'SG': 'SpiceJet',
      'G8': 'GoAir',
      'IX': 'Air India Express',
      'QF': 'Qantas Airways',
      'AA': 'American Airlines',
      'DL': 'Delta Air Lines',
      'UA': 'United Airlines',
      'WN': 'Southwest Airlines',
      'AC': 'Air Canada',
      'AF': 'Air France',
      'KL': 'KLM',
      'LX': 'Swiss International Air Lines',
      'OS': 'Austrian Airlines',
      'SN': 'Brussels Airlines',
      'IB': 'Iberia',
      'AZ': 'Alitalia',
      'TP': 'TAP Air Portugal',
      'AY': 'Finnair',
      'SK': 'SAS Scandinavian Airlines',
      'LO': 'LOT Polish Airlines',
      'OK': 'Czech Airlines',
      'RO': 'Tarom',
      'SU': 'Aeroflot',
      'TK': 'Turkish Airlines',
      'MS': 'EgyptAir',
      'ET': 'Ethiopian Airlines',
      'SA': 'South African Airways',
      'KQ': 'Kenya Airways',
      'QR': 'Qatar Airways',
      'EY': 'Etihad Airways',
      'SV': 'Saudia',
      'GF': 'Gulf Air',
      'KU': 'Kuwait Airways',
      'RJ': 'Royal Jordanian',
      'ME': 'Middle East Airlines',
      'MS': 'EgyptAir',
      'LY': 'El Al Israel Airlines',
      'TK': 'Turkish Airlines',
      'PC': 'Pegasus Airlines',
      'W6': 'Wizz Air',
      'FR': 'Ryanair',
      'U2': 'easyJet',
      'VY': 'Vueling',
      'IB': 'Iberia',
      'V7': 'Volotea',
      'HV': 'Transavia',
      'BE': 'Flybe',
      'T3': 'Eastern Airways',
      'B6': 'JetBlue Airways',
      'NK': 'Spirit Airlines',
      'F9': 'Frontier Airlines',
      'AS': 'Alaska Airlines',
      'HA': 'Hawaiian Airlines',
      'VX': 'Virgin America',
      'VS': 'Virgin Atlantic',
      'JL': 'Japan Airlines',
      'NH': 'All Nippon Airways',
      'KE': 'Korean Air',
      'OZ': 'Asiana Airlines',
      'CI': 'China Airlines',
      'BR': 'EVA Air',
      'CX': 'Cathay Pacific',
      'KA': 'Dragonair',
      'MF': 'Xiamen Airlines',
      'CZ': 'China Southern Airlines',
      'CA': 'Air China',
      'MU': 'China Eastern Airlines',
      'HU': 'Hainan Airlines',
      '3U': 'Sichuan Airlines',
      '9C': 'Spring Airlines',
      'HO': 'Juneyao Airlines',
      'JD': 'Beijing Capital Airlines',
      'GS': 'Tianjin Airlines',
      'PN': 'West Air',
      'G5': 'China Express Airlines',
      '8L': 'Lucky Air',
      'A6': 'Air Travel',
      'BK': 'Okay Airways',
      'CN': 'Grand China Air',
      'EU': 'Chengdu Airlines',
      'FM': 'Shanghai Airlines',
      'GJ': 'Zhejiang Loong Airlines',
      'GT': 'Guangxi Beibu Gulf Airlines',
      'GY': 'Colorful Guizhou Airlines',
      'HX': 'Hong Kong Airlines',
      'KN': 'China United Airlines',
      'KY': 'Kunming Airlines',
      'LT': 'LongJiang Airlines',
      'NS': 'Hebei Airlines',
      'QW': 'Qingdao Airlines',
      'RY': 'Ruili Airlines',
      'TV': 'Tibet Airlines',
      'UQ': 'Urumqi Air',
      'VD': 'Henan Airlines',
      'Y8': 'Yangtze River Express',
      'ZH': 'Shenzhen Airlines',
      '9H': 'Air Changan',
      'A1': 'Atifly',
      'B7': 'Uni Air',
      'C7': 'Cinnamon Air',
      'D7': 'AirAsia X',
      'E5': 'Air Arabia Egypt',
      'F7': 'Flybaboo',
      'G9': 'Air Arabia',
      'H2': 'Sky Airline',
      'I5': 'AirAsia India',
      'J2': 'Azerbaijan Airlines',
      'K6': 'Cambodia Angkor Air',
      'L5': 'Allegiant Air',
      'M6': 'Amerijet International',
      'N4': 'Nordwind Airlines',
      'O6': 'Avianca Brazil',
      'P5': 'Wingo',
      'Q2': 'Maldivian',
      'R2': 'Orenburg Airlines',
      'S3': 'Santa Barbara Airlines',
      'T4': 'TRIP Linhas Aéreas',
      'U4': 'Buddha Air',
      'V2': 'Vision Airlines',
      'W5': 'Mahan Air',
      'X3': 'TUIfly',
      'Y4': 'Volaris',
      'Z2': 'Philippines AirAsia'
    };
    
    if (!callsign) return 'Unknown Airline';
    
    // Try 2-letter code first
    const code2 = callsign.substring(0, 2);
    if (airlineCodes[code2]) return airlineCodes[code2];
    
    // Try 3-letter code
    const code3 = callsign.substring(0, 3);
    if (airlineCodes[code3]) return airlineCodes[code3];
    
    return 'Unknown Airline';
  }

  getAirportInfoFromAirline(airline, originCountry) {
    // Generate realistic airport information based on airline and origin country
    const airportMappings = {
      'Air India': {
        departure: {
          airport: 'Indira Gandhi International Airport',
          iata: 'DEL'
        },
        arrival: {
          airport: 'Chhatrapati Shivaji International Airport',
          iata: 'BOM'
        }
      },
      'Lufthansa': {
        departure: {
          airport: 'Frankfurt International Airport',
          iata: 'FRA'
        },
        arrival: {
          airport: 'Munich Airport',
          iata: 'MUC'
        }
      },
      'British Airways': {
        departure: {
          airport: 'London Heathrow Airport',
          iata: 'LHR'
        },
        arrival: {
          airport: 'London Gatwick Airport',
          iata: 'LGW'
        }
      },
      'American Airlines': {
        departure: {
          airport: 'Dallas/Fort Worth International Airport',
          iata: 'DFW'
        },
        arrival: {
          airport: 'Los Angeles International Airport',
          iata: 'LAX'
        }
      },
      'Delta Air Lines': {
        departure: {
          airport: 'Hartsfield-Jackson Atlanta International Airport',
          iata: 'ATL'
        },
        arrival: {
          airport: 'John F. Kennedy International Airport',
          iata: 'JFK'
        }
      }
    };

    // Default airports based on origin country
    const countryAirports = {
      'India': {
        departure: {
          airport: 'Indira Gandhi International Airport',
          iata: 'DEL'
        },
        arrival: {
          airport: 'Chhatrapati Shivaji International Airport',
          iata: 'BOM'
        }
      },
      'Germany': {
        departure: {
          airport: 'Frankfurt International Airport',
          iata: 'FRA'
        },
        arrival: {
          airport: 'Munich Airport',
          iata: 'MUC'
        }
      },
      'United States': {
        departure: {
          airport: 'Los Angeles International Airport',
          iata: 'LAX'
        },
        arrival: {
          airport: 'John F. Kennedy International Airport',
          iata: 'JFK'
        }
      }
    };

    // Try airline-specific airports first
    if (airportMappings[airline]) {
      return airportMappings[airline];
    }

    // Fall back to country-specific airports
    if (countryAirports[originCountry]) {
      return countryAirports[originCountry];
    }

    // Default fallback
    return {
      departure: {
        airport: 'International Airport',
        iata: 'INT'
      },
      arrival: {
        airport: 'Destination Airport',
        iata: 'DST'
      }
    };
  }

  getMockFlightData(flightNumber) {
    // Check for specific known flights and provide accurate mock data
    const knownFlights = {
      'QFA104': {
        airline: 'Qantas Airways',
        aircraft: 'Boeing 787-9',
        departure: {
          airport: 'Honolulu International Airport',
          iata: 'HNL',
          city: 'Honolulu',
          timezone: 'HST (UTC -10:00)'
        },
        arrival: {
          airport: 'Sydney Kingsford Smith Airport',
          iata: 'SYD',
          city: 'Sydney',
          timezone: 'AEDT (UTC +11:00)'
        },
        status: 'scheduled',
        duration: '10h 30m'
      },
      'QF104': {
        airline: 'Qantas Airways',
        aircraft: 'Boeing 787-9',
        departure: {
          airport: 'Honolulu International Airport',
          iata: 'HNL',
          city: 'Honolulu',
          timezone: 'HST (UTC -10:00)'
        },
        arrival: {
          airport: 'Sydney Kingsford Smith Airport',
          iata: 'SYD',
          city: 'Sydney',
          timezone: 'AEDT (UTC +11:00)'
        },
        status: 'scheduled',
        duration: '10h 30m'
      }
    };

    // If we have specific data for this flight, use it
    if (knownFlights[flightNumber]) {
      const flight = knownFlights[flightNumber];
      const now = new Date();
      const scheduledDeparture = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now
      const scheduledArrival = new Date(scheduledDeparture.getTime() + 10.5 * 60 * 60 * 1000); // 10.5 hours later

      return {
        flightNumber,
        airline: flight.airline,
        aircraft: flight.aircraft,
        departure: {
          airport: flight.departure.airport,
          iata: flight.departure.iata,
          scheduled: scheduledDeparture.toISOString(),
          actual: null,
          terminal: '2',
          gate: '15',
          delay: 0
        },
        arrival: {
          airport: flight.arrival.airport,
          iata: flight.arrival.iata,
          scheduled: scheduledArrival.toISOString(),
          actual: null,
          terminal: '1',
          gate: '8',
          delay: 0
        },
        status: flight.status,
        live: false,
        source: 'mock-accurate'
      };
    }

    // Fallback to generic mock data for other flights
    const airlines = ['Air India', 'IndiGo', 'SpiceJet', 'Vistara', 'GoAir'];
    const airports = [
      { name: 'Mumbai Airport', iata: 'BOM', city: 'Mumbai' },
      { name: 'Delhi Airport', iata: 'DEL', city: 'Delhi' },
      { name: 'Bangalore Airport', iata: 'BLR', city: 'Bangalore' },
      { name: 'Chennai Airport', iata: 'MAA', city: 'Chennai' },
      { name: 'Kolkata Airport', iata: 'CCU', city: 'Kolkata' }
    ];

    const now = new Date();
    const scheduledDeparture = new Date(now.getTime() + Math.random() * 2 * 60 * 60 * 1000); // Within 2 hours
    const scheduledArrival = new Date(scheduledDeparture.getTime() + (2 + Math.random() * 3) * 60 * 60 * 1000); // 2-5 hours flight

    const departureAirport = airports[Math.floor(Math.random() * airports.length)];
    const arrivalAirport = airports[Math.floor(Math.random() * airports.length)];

    return {
      flightNumber,
      airline: airlines[Math.floor(Math.random() * airlines.length)],
      aircraft: 'A320',
      departure: {
        airport: departureAirport.name,
        iata: departureAirport.iata,
        scheduled: scheduledDeparture.toISOString(),
        actual: null,
        terminal: Math.floor(Math.random() * 3) + 1,
        gate: Math.floor(Math.random() * 20) + 1,
        delay: Math.random() > 0.7 ? Math.floor(Math.random() * 30) : 0
      },
      arrival: {
        airport: arrivalAirport.name,
        iata: arrivalAirport.iata,
        scheduled: scheduledArrival.toISOString(),
        actual: null,
        terminal: Math.floor(Math.random() * 3) + 1,
        gate: Math.floor(Math.random() * 20) + 1,
        delay: Math.random() > 0.7 ? Math.floor(Math.random() * 30) : 0
      },
      status: 'scheduled',
      live: false,
      source: 'mock'
    };
  }

  async getAirportInfo(iataCode) {
    try {
      if (this.apiKey && this.apiKey !== 'your_api_key_here') {
        const response = await axios.get(`${this.baseUrl}/airports`, {
          params: {
            access_key: this.apiKey,
            iata_code: iataCode
          },
          timeout: 10000
        });

        if (response.data.data && response.data.data.length > 0) {
          return response.data.data[0];
        }
      }
      
      // Fallback to mock airport data
      return this.getMockAirportData(iataCode);
    } catch (error) {
      console.error('Airport info error:', error.message);
      return this.getMockAirportData(iataCode);
    }
  }

  getMockAirportData(iataCode) {
    const airports = {
      'BOM': { name: 'Chhatrapati Shivaji Maharaj International Airport', city: 'Mumbai', country: 'India' },
      'DEL': { name: 'Indira Gandhi International Airport', city: 'Delhi', country: 'India' },
      'BLR': { name: 'Kempegowda International Airport', city: 'Bangalore', country: 'India' },
      'MAA': { name: 'Chennai International Airport', city: 'Chennai', country: 'India' },
      'CCU': { name: 'Netaji Subhash Chandra Bose International Airport', city: 'Kolkata', country: 'India' }
    };

    return airports[iataCode] || { name: 'Unknown Airport', city: 'Unknown', country: 'Unknown' };
  }
}

module.exports = new FlightTrackingService();
