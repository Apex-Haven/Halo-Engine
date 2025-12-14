const bcrypt = require('bcryptjs');

// Mock Hotel class for demo mode
class MockHotel {
  constructor(data) {
    this._id = data._id || `mock_hotel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.hotelId = data.hotelId || this.generateHotelId();
    this.name = data.name;
    this.city = data.city;
    this.state = data.state || '';
    this.country = data.country || 'India';
    this.location = data.location || {};
    this.starRating = data.starRating || 3;
    this.rating = data.rating || {};
    this.pricing = data.pricing || {};
    this.amenities = data.amenities || {};
    this.roomTypes = data.roomTypes || [];
    this.contact = data.contact || {};
    this.images = data.images || [];
    this.bookingDetails = data.bookingDetails || {};
    this.sources = data.sources || [];
    this.description = data.description || '';
    this.policies = data.policies || '';
    this.nearby = data.nearby || [];
    this.isAvailable = data.isAvailable !== undefined ? data.isAvailable : true;
    this.availability = data.availability || {};
    this.assignedToCustomers = data.assignedToCustomers || [];
    this.performance = data.performance || { totalBookings: 0, cancellationRate: 0, avgGuestRating: 0 };
    this.status = data.status || 'active';
    this.verified = data.verified || false;
    this.createdBy = data.createdBy;
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  generateHotelId() {
    const randomNum = Math.floor(Math.random() * 900000) + 100000;
    return `HTL${randomNum}`;
  }

  async save() {
    MockHotelService.hotels.set(this._id, this);
    return this;
  }

  static findById(id) {
    const hotel = MockHotelService.hotels.get(id);
    return hotel || null;
  }

  static async find(query = {}) {
    const results = [];
    for (const hotel of MockHotelService.hotels.values()) {
      let matches = true;
      
      if (query.city && hotel.city !== query.city.toUpperCase()) matches = false;
      if (query.starRating && hotel.starRating < query.starRating.$gte) matches = false;
      if (query.status && hotel.status !== query.status) matches = false;
      if (query.isAvailable !== undefined && hotel.isAvailable !== query.isAvailable) matches = false;
      
      if (matches) results.push(hotel);
    }
    return results;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    const hotel = MockHotelService.hotels.get(id);
    if (!hotel) return null;

    Object.assign(hotel, updateData);
    hotel.updatedAt = new Date();

    MockHotelService.hotels.set(id, hotel);
    return hotel;
  }

  static async findByIdAndDelete(id) {
    return MockHotelService.hotels.delete(id);
  }

  static async countDocuments(query = {}) {
    let count = 0;
    for (const hotel of MockHotelService.hotels.values()) {
      let matches = true;
      
      if (query.city && hotel.city !== query.city.toUpperCase()) matches = false;
      if (query.status && hotel.status !== query.status) matches = false;
      if (query.isAvailable !== undefined && hotel.isAvailable !== query.isAvailable) matches = false;
      
      if (matches) count++;
    }
    return count;
  }
}

class MockHotelService {
  static hotels = new Map();

  static async initializeMockHotels() {
    const cities = ['MUMBAI', 'DELHI', 'BANGALORE', 'GOA'];
    const defaultHotels = [];

    cities.forEach((city, cityIndex) => {
      // 5-star hotels
      defaultHotels.push({
        _id: `mock_hotel_${cityIndex + 1}_star5_1`,
        hotelId: `HTL${100000 + cityIndex * 10 + 1}`,
        name: `${city} Grand Plaza Hotel`,
        city: city,
        country: 'India',
        state: city === 'MUMBAI' ? 'Maharashtra' : city === 'DELHI' ? 'Delhi' : city === 'BANGALORE' ? 'Karnataka' : 'Goa',
        location: {
          address: `123 Luxury Boulevard, ${city}`,
          landmark: 'Near Airport',
          coordinates: {
            latitude: 19.0760 + cityIndex * 0.1,
            longitude: 72.8777 + cityIndex * 0.1
          },
          area: 'Downtown'
        },
        starRating: 5,
        rating: {
          score: 9.2,
          reviews: 1520,
          platform: 'combined'
        },
        pricing: {
          basePrice: 8500,
          currency: 'INR',
          perNight: true,
          discount: 15,
          taxIncluded: false,
          cancellationFree: false
        },
        amenities: {
          wifi: true,
          parking: true,
          pool: true,
          gym: true,
          spa: true,
          restaurant: true,
          bar: true,
          roomService: true,
          laundry: true,
          elevator: true,
          airConditioning: true,
          airportShuttle: true,
          businessCenter: true
        },
        roomTypes: [
          { type: 'Deluxe Room', maxOccupancy: 2, bedType: 'king', price: 8500, available: true },
          { type: 'Suite', maxOccupancy: 4, bedType: 'king', price: 12000, available: true }
        ],
        contact: {
          phone: '+91-22-12345678',
          email: `info@${city.toLowerCase()}grandplaza.com`,
          website: `www.${city.toLowerCase()}grandplaza.com`
        },
        images: [
          { url: 'https://via.placeholder.com/400x300?text=Grand+Plaza', type: 'exterior' },
          { url: 'https://via.placeholder.com/400x300?text=Hotel+Room', type: 'room' }
        ],
        bookingDetails: {
          checkIn: '14:00',
          checkOut: '11:00',
          minimumNights: 1,
          cancellationPolicy: 'flexible'
        },
        description: 'Luxury hotel in the heart of ' + city,
        isAvailable: true,
        status: 'active',
        verified: true,
        sources: [{
          platform: 'makemytrip',
          url: `https://makemytrip.com/hotels/${city.toLowerCase()}`,
          lastChecked: new Date(),
          price: 8500,
          available: true
        }]
      });

      // 4-star hotels
      defaultHotels.push({
        _id: `mock_hotel_${cityIndex + 1}_star4_1`,
        hotelId: `HTL${100000 + cityIndex * 10 + 2}`,
        name: `${city} Business Tower`,
        city: city,
        country: 'India',
        location: {
          address: `456 Business Road, ${city}`,
          coordinates: {
            latitude: 19.0522 + cityIndex * 0.1,
            longitude: 72.8780 + cityIndex * 0.1
          }
        },
        starRating: 4,
        rating: {
          score: 8.5,
          reviews: 890,
          platform: 'combined'
        },
        pricing: {
          basePrice: 5000,
          currency: 'INR',
          discount: 10,
          taxIncluded: false
        },
        amenities: {
          wifi: true,
          parking: true,
          gym: true,
          restaurant: true,
          businessCenter: true,
          conferenceRoom: true
        },
        roomTypes: [{ type: 'Standard Room', maxOccupancy: 2, price: 5000, available: true }],
        isAvailable: true,
        status: 'active',
        verified: true
      });

      // 3-star hotels
      defaultHotels.push({
        _id: `mock_hotel_${cityIndex + 1}_star3_1`,
        hotelId: `HTL${100000 + cityIndex * 10 + 3}`,
        name: `${city} Budget Inn`,
        city: city,
        country: 'India',
        location: {
          address: `789 Main Street, ${city}`,
          coordinates: {
            latitude: 18.9564 + cityIndex * 0.1,
            longitude: 72.8122 + cityIndex * 0.1
          }
        },
        starRating: 3,
        rating: {
          score: 7.2,
          reviews: 450,
          platform: 'combined'
        },
        pricing: {
          basePrice: 2500,
          currency: 'INR',
          discount: 5,
          taxIncluded: false
        },
        amenities: {
          wifi: true,
          parking: true,
          restaurant: true
        },
        roomTypes: [{ type: 'Standard Room', maxOccupancy: 2, price: 2500, available: true }],
        isAvailable: true,
        status: 'active',
        verified: false
      });
    });

    for (const hotelData of defaultHotels) {
      const hotel = new MockHotel(hotelData);
      await hotel.save();
    }

    console.log(`✅ Initialized ${defaultHotels.length} mock hotels`);
  }

  static isUsingMockData() {
    return !process.env.MONGODB_URI || process.env.MONGODB_URI === '';
  }

  static getHotelModel() {
    return MockHotelService.isUsingMockData() ? MockHotel : require('../models/Hotel');
  }
}

module.exports = { MockHotel, MockHotelService };
