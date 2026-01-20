const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin
puppeteer.use(StealthPlugin());

class PuppeteerImageExtractorService {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
  }

  /**
   * Initialize browser instance (reuse for performance)
   */
  async initializeBrowser() {
    if (this.browser && this.isInitialized) {
      return this.browser;
    }

    try {
      this.browser = await puppeteer.launch({
        headless: 'new', // Use new headless mode (better stealth)
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled' // Hide automation
        ],
        ignoreHTTPSErrors: true
      });
      this.isInitialized = true;
      return this.browser;
    } catch (error) {
      console.error('[Puppeteer] Failed to launch browser:', error);
      throw error;
    }
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        this.browser = null;
        this.isInitialized = false;
      } catch (error) {
        console.error('[Puppeteer] Error closing browser:', error);
      }
    }
  }

  /**
   * Extract images from a booking link using Puppeteer
   * @param {string} bookingLink - Booking link URL
   * @returns {Promise<Object>} Object with success, images, primaryImage, platform
   */
  async extractImages(bookingLink) {
    let page = null;
    
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

      // Initialize browser
      const browser = await this.initializeBrowser();
      
      // Create new page
      page = await browser.newPage();
      
      // Set realistic viewport
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1
      });

      // Set user agent (more recent Chrome version)
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Remove webdriver property
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      });

      // Navigate to page
      await page.goto(bookingLink, {
        waitUntil: 'networkidle2', // Wait for network to be idle
        timeout: 30000 // 30 second timeout
      });

      // Get final URL after redirects
      const finalUrl = page.url();

      // Check if we hit a challenge page
      const challengeDetected = await page.evaluate(() => {
        return document.querySelector('#challenge-container') !== null ||
               document.body.textContent.includes('challenge') ||
               document.body.textContent.includes('Please wait');
      });

      if (challengeDetected) {
        // Wait for challenge to complete (up to 15 seconds)
        try {
          await Promise.race([
            page.waitForSelector('#photo_wrapper', { timeout: 15000 }),
            page.waitForSelector('#hotel_main_content', { timeout: 15000 }),
            page.waitForSelector('[data-testid="GalleryUnifiedDesktop-wrapper"]', { timeout: 15000 }),
            new Promise(resolve => setTimeout(resolve, 15000)) // Max wait
          ]);
        } catch (e) {
          // Continue even if challenge not fully resolved
        }
      }

      // Wait for page to be fully loaded (using Promise instead of deprecated waitForTimeout)
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for lazy-loaded images

      // Wait for specific selectors if they exist (Booking.com)
      const selectorsToWait = [
        '#photo_wrapper',
        '#hotel_main_content',
        '[data-testid="GalleryUnifiedDesktop-wrapper"]',
        'picture img',
        'img[src*="cf.bstatic.com"]'
      ];

      let foundSelector = null;
      for (const selector of selectorsToWait) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          foundSelector = selector;
          break;
        } catch (e) {
          // Continue to next selector
        }
      }

      // Wait additional time for images to load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Extract images using the same selectors as cheerio version
      const platform = this.detectPlatform(finalUrl);
      const images = await this.extractImagesFromPage(page, platform, finalUrl);

      return {
        success: true,
        platform,
        images: images.slice(0, 6), // Return up to 6 images
        primaryImage: images[0] || null,
        finalUrl
      };

    } catch (error) {
      console.error(`[Puppeteer] Error extracting images from ${bookingLink}:`, error.message);
      return {
        success: false,
        platform: this.detectPlatform(bookingLink),
        images: [],
        primaryImage: null,
        error: error.message
      };
    } finally {
      // Close page but keep browser open for reuse
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.error('[Puppeteer] Error closing page:', e);
        }
      }
    }
  }

  /**
   * Extract images from the page using selectors
   */
  async extractImagesFromPage(page, platform, baseUrl) {
    const images = [];

    // Check if we're still on a challenge page
    const isChallengePage = await page.evaluate(() => {
      return document.querySelector('#challenge-container') !== null ||
             document.body.textContent.includes('challenge') ||
             document.body.textContent.includes('Please wait') ||
             (!document.querySelector('#photo_wrapper') && !document.querySelector('#hotel_main_content'));
    });

    if (isChallengePage) {
      // Wait up to 10 more seconds for challenge to resolve
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Try to wait for actual content
      try {
        await Promise.race([
          page.waitForSelector('#photo_wrapper', { timeout: 10000 }),
          page.waitForSelector('#hotel_main_content', { timeout: 10000 }),
          page.waitForSelector('img[src*="cf.bstatic.com"]', { timeout: 10000 })
        ]);
      } catch (e) {
        // Continue even if challenge not fully resolved
      }
    }

    // Execute JavaScript in page context to extract images
    const extractedImages = await page.evaluate((platform, baseUrl) => {
      const images = [];
      
      // Check if challenge container still exists
      const challengeExists = document.querySelector('#challenge-container') !== null;
      if (challengeExists) {
        return images; // Return empty if challenge not resolved
      }
      
      // Booking.com selectors (priority order)
      const selectors = [
        '#photo_wrapper img',
        '#hotel_main_content img',
        '#photo_wrapper picture img',
        '#hotel_main_content picture img',
        '[data-testid="GalleryUnifiedDesktop-wrapper"] img',
        '[data-testid="GalleryUnifiedDesktop-wrapper"] picture img',
        'picture.b7a691c583 img',
        'picture img[src*="cf.bstatic.com"]',
        'img[src*="cf.bstatic.com"]',
        'img[src*="xdata/images/hotel"]'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        if (elements.length > 0) {
          elements.forEach((img) => {
            const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original');
            if (src) {
              // Decode HTML entities
              const decodedSrc = src.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
              
              // Validate image URL
              const isValid = decodedSrc.includes('cf.bstatic.com') || 
                            decodedSrc.includes('/images/hotel/') ||
                            decodedSrc.includes('/xdata/images/') ||
                            /\.(jpg|jpeg|png|webp|gif)/i.test(decodedSrc);
              
              if (isValid && !images.includes(decodedSrc)) {
                // Upgrade image quality if possible
                let finalUrl = decodedSrc;
                if (finalUrl.includes('max300')) {
                  finalUrl = finalUrl.replace('max300', 'max1024x768');
                } else if (finalUrl.includes('max500')) {
                  finalUrl = finalUrl.replace('max500', 'max1024x768');
                }
                images.push(finalUrl);
              }
            }
          });
          
          if (images.length > 0) {
            break; // Found images, stop searching
          }
        }
      }

      // If no images found, try Open Graph meta tag
      if (images.length === 0) {
        const ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.content) {
          images.push(ogImage.content);
        }
      }

      return images;
    }, platform, baseUrl);

    return extractedImages;
  }

  /**
   * Detect platform from URL
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
   * Extract images from multiple booking links
   */
  async extractImagesBatch(bookingLinks) {
    if (!Array.isArray(bookingLinks)) {
      throw new Error('bookingLinks must be an array');
    }

    const results = [];
    
    // Process links sequentially to avoid overwhelming the browser
    for (const link of bookingLinks) {
      const result = await this.extractImages(link);
      results.push({
        link,
        ...result
      });
      
      // Small delay between requests
      if (bookingLinks.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    return results;
  }
}

module.exports = PuppeteerImageExtractorService;

