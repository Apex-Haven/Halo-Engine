/**
 * Hotel Card Service
 * Builds hotel cards from CozyCozy API data for display in UI
 */
class HotelCardService {
  constructor() {
    this.defaultImage = '/images/hotel-placeholder.jpg';
  }

  /**
   * Build hotel card data from CozyCozy hotel object
   * @param {Object} hotel - Hotel data from CozyCozy
   * @returns {Object} Card data object
   */
  buildCard(hotel) {
    if (!hotel) return null;

    return {
      id: hotel.cozyCozyId || hotel.id,
      name: hotel.name,
      address: hotel.address,
      city: hotel.city,
      country: hotel.country,
      image: this.getPrimaryImage(hotel.images),
      images: hotel.images || [],
      rating: hotel.rating,
      reviewCount: hotel.reviewCount,
      price: hotel.price,
      currency: hotel.currency || 'USD',
      prices: hotel.prices || {}, // Prices from all platforms
      bookingLinks: hotel.bookingLinks || {}, // Links from all platforms
      amenities: hotel.amenities || [],
      description: hotel.description,
      instantBooking: hotel.instantBooking || false,
      cancellation: hotel.cancellation,
      coordinates: hotel.coordinates,
      bestPrice: this.getBestPrice(hotel.prices),
      bestPlatform: this.getBestPlatform(hotel.prices),
      cardHtml: this.generateCardHtml(hotel),
      cardData: this.getCardData(hotel)
    };
  }

  /**
   * Get primary image from images array
   * @param {Array} images - Array of image URLs
   * @returns {string} Primary image URL
   */
  getPrimaryImage(images) {
    if (!images || images.length === 0) {
      return this.defaultImage;
    }
    return Array.isArray(images) ? images[0] : images;
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
    const image = this.getPrimaryImage(hotel.images);
    const price = hotel.price || 0;
    const currency = hotel.currency || 'USD';
    const rating = hotel.rating || 0;
    const reviewCount = hotel.reviewCount || 0;

    return `
      <div class="hotel-card" data-hotel-id="${hotel.cozyCozyId || hotel.id}">
        <div class="hotel-card-image">
          <img src="${image}" alt="${hotel.name}" onerror="this.src='${this.defaultImage}'" />
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
    return {
      id: hotel.cozyCozyId || hotel.id,
      name: hotel.name,
      address: hotel.address,
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

