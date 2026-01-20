const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Add stealth plugin
puppeteer.use(StealthPlugin());

class PuppeteerImageExtractorService {
  constructor() {
    this.browser = null;
    this.isInitialized = false;
    this.initializationErrorLogged = false;
    this.chromeUnavailable = false;
  }

  /**
   * Initialize browser instance (reuse for performance)
   */
  async initializeBrowser() {
    if (this.browser && this.isInitialized) {
      return this.browser;
    }

    // Check if Puppeteer is disabled via environment variable
    if (process.env.DISABLE_PUPPETEER === 'true') {
      throw new Error('Puppeteer is disabled via DISABLE_PUPPETEER environment variable');
    }

    // Configure for Render.com environment
    const launchOptions = {
      headless: 'new', // Use new headless mode (better stealth)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--disable-blink-features=AutomationControlled', // Hide automation
        '--single-process', // Required for Render
        '--disable-software-rasterizer'
      ],
      ignoreHTTPSErrors: true
    };

    // For Render.com, configure for cloud environment
    if (process.env.RENDER || process.env.PUPPETEER_EXECUTABLE_PATH) {
      const fs = require('fs');
      
      // Use provided executable path if set (highest priority)
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        const configuredPath = process.env.PUPPETEER_EXECUTABLE_PATH;
        // Verify the path actually exists
        if (fs.existsSync(configuredPath)) {
          launchOptions.executablePath = configuredPath;
          console.log(`[Puppeteer] Using Chrome from PUPPETEER_EXECUTABLE_PATH: ${configuredPath}`);
        } else {
          console.warn(`[Puppeteer] PUPPETEER_EXECUTABLE_PATH is set to ${configuredPath} but file doesn't exist`);
          console.log('[Puppeteer] Will search for Chrome or download automatically');
          // Don't set executablePath - let it search or download
        }
      }
      
      // If executablePath not set yet, search for Chrome
      if (!launchOptions.executablePath && process.env.RENDER) {
        // On Render, try multiple locations
        const fs = require('fs');
        const path = require('path');
        
        console.log('[Puppeteer] Searching for Chrome on Render...');
        
        // Priority order: system Chrome > cache directory > home directory
        const possiblePaths = [
          '/usr/bin/chromium',           // System-wide Chromium (recommended)
          '/usr/bin/chromium-browser',   // Alternative system path
          '/usr/bin/google-chrome',       // Google Chrome if installed
          '/usr/bin/google-chrome-stable', // Stable Chrome
          '/opt/render/.cache/puppeteer/chrome/linux-143.0.7499.192/chrome-linux64/chrome', // Build cache
          process.env.HOME + '/.cache/puppeteer/chrome/linux-143.0.7499.192/chrome-linux64/chrome' // User cache
        ];
        
        let foundPath = null;
        for (const chromePath of possiblePaths) {
          try {
            if (fs.existsSync(chromePath)) {
              const stats = fs.statSync(chromePath);
              if (stats.isFile()) {
                foundPath = chromePath;
                console.log(`[Puppeteer] Found Chrome at: ${chromePath}`);
                break;
              }
            }
          } catch (e) {
            // Continue to next path
          }
        }
        
        // If not found in common paths, search cache directory recursively
        if (!foundPath) {
          const cacheDir = '/opt/render/.cache/puppeteer';
          if (fs.existsSync(cacheDir)) {
            console.log(`[Puppeteer] Searching recursively in: ${cacheDir}`);
            const findChrome = (dir, depth = 0) => {
              if (depth > 5) return null;
              try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                  const fullPath = path.join(dir, entry.name);
                  if (entry.isDirectory()) {
                    const found = findChrome(fullPath, depth + 1);
                    if (found) return found;
                  } else if (entry.name === 'chrome' && entry.isFile()) {
                    return fullPath;
                  }
                }
              } catch (e) {
                // Ignore errors
              }
              return null;
            };
            
            foundPath = findChrome(cacheDir);
            if (foundPath) {
              console.log(`[Puppeteer] Found Chrome by searching: ${foundPath}`);
            }
          }
        }
        
        if (foundPath) {
          launchOptions.executablePath = foundPath;
        } else {
          console.log('[Puppeteer] Chrome not found in any standard location');
          console.log('[Puppeteer] Puppeteer will automatically download Chrome on first use');
          // Don't set executablePath - let Puppeteer download Chrome automatically
          // It will use a writable cache directory at runtime
        }
      }
      
      // Log final executable path
      if (launchOptions.executablePath) {
        console.log(`[Puppeteer] Will use Chrome executable: ${launchOptions.executablePath}`);
      } else {
        console.log('[Puppeteer] No Chrome executable path set, Puppeteer will download Chrome automatically');
      }
    }

    try {
      this.browser = await puppeteer.launch(launchOptions);
      this.isInitialized = true;
      console.log('[Puppeteer] Browser initialized successfully');
      return this.browser;
    } catch (launchError) {
      // If Chrome not found and we're on Render, try to download it automatically
      if (launchError.message.includes('Could not find Chrome') && process.env.RENDER && !this.chromeUnavailable) {
        console.log('[Puppeteer] Chrome not found, attempting to download automatically...');
        try {
          const { execSync } = require('child_process');
          // Download Chrome using Puppeteer's browser installation
          execSync('npx puppeteer browsers install chrome', { 
            stdio: 'inherit',
            timeout: 300000 // 5 minutes timeout
          });
          console.log('[Puppeteer] Chrome downloaded successfully, retrying launch...');
          // Retry launch without executablePath to use downloaded Chrome
          delete launchOptions.executablePath;
          this.browser = await puppeteer.launch(launchOptions);
          this.isInitialized = true;
          console.log('[Puppeteer] Browser initialized successfully after auto-download');
          return this.browser;
        } catch (downloadError) {
          console.error('[Puppeteer] Failed to download Chrome automatically:', downloadError.message);
          this.chromeUnavailable = true;
          console.error('[Puppeteer] Set DISABLE_PUPPETEER=true to disable Puppeteer features');
          throw launchError; // Throw original error
        }
      }
      
      // Log error but don't spam logs - only log once per service instance
      if (!this.initializationErrorLogged) {
        console.error('[Puppeteer] Failed to launch browser:', launchError.message);
        
        // If Chrome download fails, provide helpful error message
        if (launchError.message.includes('Could not find Chrome')) {
          console.error('[Puppeteer] Chrome installation required. Puppeteer will try to download automatically on Render.');
          console.error('Or set DISABLE_PUPPETEER=true to disable Puppeteer features');
        }
        this.initializationErrorLogged = true;
      }
      
      throw launchError;
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

      // Check if Chrome is unavailable (from previous failed initialization)
      if (this.chromeUnavailable) {
        return {
          success: false,
          platform: this.detectPlatform(bookingLink),
          images: [],
          primaryImage: null,
          error: 'Chrome browser not available. Please install Chrome in the build process.'
        };
      }

      // Initialize browser
      let browser;
      try {
        browser = await this.initializeBrowser();
      } catch (error) {
        // If Chrome is not available, mark as unavailable and return graceful error
        if (error.message && error.message.includes('Could not find Chrome')) {
          this.chromeUnavailable = true;
          return {
            success: false,
            platform: this.detectPlatform(bookingLink),
            images: [],
            primaryImage: null,
            error: 'Chrome browser not installed. On Render, add to build command: npx puppeteer browsers install chrome'
          };
        }
        throw error;
      }
      
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

