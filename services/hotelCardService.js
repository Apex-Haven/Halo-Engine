/**
 * Hotel Card Service
 * Builds hotel cards from hotel API data for display in UI
 */
class HotelCardService {
  constructor() {
    this.defaultImage = '/images/hotel-placeholder.jpg';
  }

  /**
   * Build hotel card data from hotel object
   * @param {Object} hotel - Hotel data
   * @returns {Object} Card data object
   */
  buildCard(hotel) {
    if (!hotel) return null;

    // Extract rating - handle both object format { score: X, reviews: Y } and number format
    let rating = 0;
    let reviewCount = 0;
    if (hotel.rating) {
      if (typeof hotel.rating === 'object' && hotel.rating.score !== undefined) {
        rating = parseFloat(hotel.rating.score) || 0;
        reviewCount = parseInt(hotel.rating.reviews) || parseInt(hotel.reviewCount) || 0;
      } else if (typeof hotel.rating === 'number') {
        rating = hotel.rating;
        reviewCount = parseInt(hotel.reviewCount) || 0;
      }
    }
    
    // Ensure rating is a valid number
    rating = isNaN(rating) ? 0 : rating;

    // Extract price - handle both pricing.basePrice and price fields
    const price = hotel.pricing?.basePrice || hotel.price || 0;
    const currency = hotel.pricing?.currency || hotel.currency || 'USD';
    
    return {
      id: hotel.hotelId || hotel.id,
      name: hotel.name,
      address: hotel.address || hotel.location?.address || '',
      city: hotel.city,
      country: hotel.country || '',
      image: this.getPrimaryImage(hotel.images),
      images: hotel.images || [],
      rating: rating,
      reviewCount: reviewCount,
      price: price,
      currency: currency,
      prices: hotel.prices || {}, // Prices from all platforms
      bookingLinks: hotel.bookingLinks || {}, // Links from all platforms
      amenities: hotel.amenities || [],
      description: hotel.description || '',
      instantBooking: hotel.instantBooking || false,
      cancellation: hotel.cancellation,
      coordinates: hotel.coordinates || hotel.location?.coordinates,
      bestPrice: this.getBestPrice(hotel.prices),
      bestPlatform: this.getBestPlatform(hotel.prices),
      cardHtml: this.generateCardHtml(hotel),
      cardData: this.getCardData(hotel)
    };
  }

  /**
   * Get primary image from images array
   * @param {Array} images - Array of image URLs or image objects { url: "...", source: "..." }
   * @returns {string|Object} Primary image URL or image object
   */
  getPrimaryImage(images) {
    if (!images || images.length === 0) {
      return this.defaultImage;
    }
    
    const firstImage = Array.isArray(images) ? images[0] : images;
    
    // If it's already a string URL, return it
    if (typeof firstImage === 'string') {
      return firstImage;
    }
    
    // If it's an object with a url property, return the object (preserve source metadata)
    if (typeof firstImage === 'object' && firstImage.url) {
      return firstImage;
    }
    
    // Fallback to default
    return this.defaultImage;
  }

  /**
   * Get best price from all platforms
   * @param {Object} prices - Prices object with platform keys
   * @returns {Object|null} Best price object
   */
  getBestPrice(prices) {
    if (!prices || Object.keys(prices).length === 0) {
      return null;
    }

    let bestPrice = null;
    let bestAmount = Infinity;

    for (const [platform, priceData] of Object.entries(prices)) {
      const amount = typeof priceData === 'number' ? priceData : priceData.amount;
      if (amount && amount < bestAmount) {
        bestAmount = amount;
        bestPrice = {
          platform,
          amount,
          currency: typeof priceData === 'object' ? priceData.currency : 'USD'
        };
      }
    }

    return bestPrice;
  }

  /**
   * Get platform with best price
   * @param {Object} prices - Prices object
   * @returns {string|null} Platform name
   */
  getBestPlatform(prices) {
    const bestPrice = this.getBestPrice(prices);
    return bestPrice ? bestPrice.platform : null;
  }

  /**
   * Generate HTML for hotel card
   * @param {Object} hotel - Hotel data
   * @returns {string} HTML string
   */
  generateCardHtml(hotel) {
    const imageObj = this.getPrimaryImage(hotel.images);
    // Extract URL from image object if it's an object, otherwise use it as-is
    const imageUrl = typeof imageObj === 'object' && imageObj?.url ? imageObj.url : (typeof imageObj === 'string' ? imageObj : this.defaultImage);
    
    // Extract price - handle both pricing.basePrice and price fields
    const price = hotel.pricing?.basePrice || hotel.price || 0;
    const currency = hotel.pricing?.currency || hotel.currency || 'USD';
    
    // Extract rating - handle both object format { score: X, reviews: Y } and number format
    let rating = 0;
    let reviewCount = 0;
    if (hotel.rating) {
      if (typeof hotel.rating === 'object' && hotel.rating.score !== undefined) {
        rating = parseFloat(hotel.rating.score) || 0;
        reviewCount = parseInt(hotel.rating.reviews) || parseInt(hotel.reviewCount) || 0;
      } else if (typeof hotel.rating === 'number') {
        rating = hotel.rating;
        reviewCount = parseInt(hotel.reviewCount) || 0;
      }
    }
    
    // Ensure rating is a valid number
    rating = isNaN(rating) ? 0 : rating;

    return `
      <div class="hotel-card" data-hotel-id="${hotel.hotelId || hotel.id}">
        <div class="hotel-card-image">
          <img src="${imageUrl}" alt="${hotel.name}" onerror="this.src='${this.defaultImage}'" />
        </div>
        <div class="hotel-card-content">
          <h3 class="hotel-card-name">${this.escapeHtml(hotel.name)}</h3>
          <p class="hotel-card-address">${this.escapeHtml(hotel.address || hotel.city || '')}</p>
          <div class="hotel-card-rating">
            ${this.generateStars(rating)}
            <span class="rating-value">${rating.toFixed(1)}</span>
            <span class="review-count">(${reviewCount} reviews)</span>
          </div>
          <div class="hotel-card-price">
            <span class="price-amount">${currency} ${price.toFixed(2)}</span>
            <span class="price-period">per night</span>
          </div>
          ${this.generateBookingButtons(hotel.bookingLinks)}
        </div>
      </div>
    `;
  }

  /**
   * Generate star rating HTML
   * @param {number} rating - Rating value
   * @returns {string} Stars HTML
   */
  generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let starsHtml = '';

    for (let i = 0; i < fullStars; i++) {
      starsHtml += '<span class="star full">★</span>';
    }
    if (hasHalfStar) {
      starsHtml += '<span class="star half">★</span>';
    }
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      starsHtml += '<span class="star empty">★</span>';
    }

    return starsHtml;
  }

  /**
   * Generate booking buttons HTML
   * @param {Object} bookingLinks - Booking links object
   * @returns {string} Buttons HTML
   */
  generateBookingButtons(bookingLinks) {
    if (!bookingLinks || Object.keys(bookingLinks).length === 0) {
      return '<button class="book-button" disabled>No booking available</button>';
    }

    let buttonsHtml = '<div class="booking-buttons">';
    for (const [platform, url] of Object.entries(bookingLinks)) {
      buttonsHtml += `
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="book-button book-button-${platform}">
          Book on ${this.formatPlatformName(platform)}
        </a>
      `;
    }
    buttonsHtml += '</div>';

    return buttonsHtml;
  }

  /**
   * Format platform name for display
   * @param {string} platform - Platform identifier
   * @returns {string} Formatted name
   */
  formatPlatformName(platform) {
    const names = {
      'booking.com': 'Booking.com',
      'agoda': 'Agoda',
      'makemytrip': 'MakeMyTrip',
      'yatra': 'Yatra',
      'cleartrip': 'Cleartrip',
      'expedia': 'Expedia',
      'hotels.com': 'Hotels.com'
    };
    return names[platform.toLowerCase()] || platform;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * Get structured card data (for React components)
   * @param {Object} hotel - Hotel data
   * @returns {Object} Card data object
   */
  getCardData(hotel) {
    // Extract image - handle both object and string formats
    const imageObj = this.getPrimaryImage(hotel.images);
    const image = typeof imageObj === 'object' && imageObj?.url ? imageObj : imageObj;
    
    // Extract price - handle both pricing.basePrice and price fields
    const price = hotel.pricing?.basePrice || hotel.price || 0;
    const currency = hotel.pricing?.currency || hotel.currency || 'USD';
    
    // Extract rating - handle both object format { score: X, reviews: Y } and number format
    let rating = { score: 0, reviews: 0, platform: 'unknown' };
    if (hotel.rating) {
      if (typeof hotel.rating === 'object' && hotel.rating.score !== undefined) {
        rating = {
          score: parseFloat(hotel.rating.score) || 0,
          reviews: parseInt(hotel.rating.reviews) || parseInt(hotel.rating.count) || 0,
          platform: hotel.rating.platform || 'unknown'
        };
      } else if (typeof hotel.rating === 'number') {
        rating = {
          score: hotel.rating,
          reviews: parseInt(hotel.reviewCount) || 0,
          platform: 'unknown'
        };
      }
    }
    
    return {
      id: hotel.hotelId || hotel.id,
      name: hotel.name,
      address: hotel.address || hotel.location?.address || '',
      city: hotel.city,
      country: hotel.country,
      image: this.getPrimaryImage(hotel.images),
      images: hotel.images || [],
      rating: hotel.rating,
      reviewCount: hotel.reviewCount,
      price: hotel.price,
      currency: hotel.currency || 'USD',
      prices: hotel.prices || {},
      bookingLinks: hotel.bookingLinks || {},
      amenities: hotel.amenities || [],
      description: hotel.description,
      instantBooking: hotel.instantBooking,
      cancellation: hotel.cancellation,
      coordinates: hotel.coordinates,
      bestPrice: this.getBestPrice(hotel.prices),
      bestPlatform: this.getBestPlatform(hotel.prices)
    };
  }

  /**
   * Build multiple cards from hotel array
   * @param {Array} hotels - Array of hotel objects
   * @returns {Array} Array of card objects
   */
  buildCards(hotels) {
    if (!Array.isArray(hotels)) {
      return [];
    }

    return hotels
      .map(hotel => this.buildCard(hotel))
      .filter(card => card !== null);
  }
}

module.exports = new HotelCardService();

