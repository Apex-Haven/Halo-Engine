// Try to load Puppeteer service (required)
let PuppeteerImageExtractorService = null;
try {
  PuppeteerImageExtractorService = require('./puppeteerImageExtractorService');
} catch (error) {
  console.error('[ImageExtractor] Puppeteer service is required but not available:', error.message);
  throw error;
}

class HotelImageExtractorService {
  constructor() {
    // Initialize Puppeteer service
    this.puppeteerService = null;
    if (PuppeteerImageExtractorService) {
      try {
        this.puppeteerService = new PuppeteerImageExtractorService();
      } catch (error) {
        console.error('[ImageExtractor] Failed to initialize Puppeteer service:', error.message);
        throw error;
      }
    } else {
      throw new Error('Puppeteer service is required but not available');
    }
  }

  /**
   * Detect booking platform from URL
   */
  detectPlatform(url) {
    if (!url) return 'unknown';
    
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('booking.com')) return 'booking';
    if (lowerUrl.includes('agoda.com')) return 'agoda';
    if (lowerUrl.includes('makemytrip.com')) return 'makemytrip';
    if (lowerUrl.includes('goibibo.com')) return 'goibibo';
    if (lowerUrl.includes('expedia.com')) return 'expedia';
    if (lowerUrl.includes('hotels.com')) return 'hotels';
    
    return 'generic';
  }

  /**
   * Extract images from a booking link
   * @param {string} bookingLink - Booking link URL
   * @returns {Promise<Object>} Object with success, images, primaryImage, platform
   */
  async extractImages(bookingLink) {
    try {
      if (!bookingLink || typeof bookingLink !== 'string') {
        throw new Error('Invalid booking link');
      }

      // Validate URL
      try {
        new URL(bookingLink);
      } catch (e) {
        throw new Error('Invalid URL format');
      }

      // Use Puppeteer for all platforms (handles JS, lazy loading, bot detection)
      if (!this.puppeteerService) {
        throw new Error('Puppeteer service not available');
      }

      try {
        const result = await this.puppeteerService.extractImages(bookingLink);
        
        if (result.success) {
          return result;
        } else {
          // If Puppeteer fails (e.g., Chrome not installed), return graceful error
          console.warn(`[ImageExtractor] Puppeteer extraction failed for ${bookingLink}: ${result.error}`);
          throw new Error(result.error || 'Failed to extract images');
        }
      } catch (error) {
        // If Chrome is not installed, provide helpful error message
        if (error.message && error.message.includes('Could not find Chrome')) {
          console.error('[ImageExtractor] Chrome not installed. On Render, add to build command:');
          console.error('  npx puppeteer browsers install chrome');
          return {
            success: false,
            platform: this.detectPlatform(bookingLink),
            images: [],
            primaryImage: null,
            error: 'Chrome browser not installed. Please install Chrome in the build process.'
          };
        }
        throw error;
      }

    } catch (error) {
      console.error(`Error extracting images from ${bookingLink}:`, error.message);
      const platform = this.detectPlatform(bookingLink);
      return {
        success: false,
        platform,
        images: [],
        primaryImage: null,
        error: error.message
      };
    }
  }

  /**
   * Cleanup method to close Puppeteer browser
   */
  async cleanup() {
    if (this.puppeteerService) {
      try {
        await this.puppeteerService.closeBrowser();
      } catch (error) {
        console.error('[ImageExtractor] Error cleaning up Puppeteer:', error);
      }
    }
  }

  /**
   * Extract images from multiple booking links
   */
  async extractImagesBatch(bookingLinks) {
    if (!Array.isArray(bookingLinks)) {
      throw new Error('bookingLinks must be an array');
    }

    const results = [];
    
    // Process links sequentially to avoid rate limiting
    for (const link of bookingLinks) {
      const result = await this.extractImages(link);
      results.push({
        link,
        ...result
      });
      
      // Small delay between requests
      if (bookingLinks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }
}

module.exports = HotelImageExtractorService;
