const HotelImageExtractorService = require('../services/hotelImageExtractorService');
const axios = require('axios');

const imageExtractor = new HotelImageExtractorService();

/**
 * Extract hotel images from booking links
 * POST /api/hotel-pdf/extract-images
 * Body: { links: string[] }
 */
const extractHotelImages = async (req, res) => {
  try {
    const { links } = req.body;

    // Validate input
    if (!links) {
      return res.status(400).json({
        success: false,
        message: 'Links array is required'
      });
    }

    if (!Array.isArray(links)) {
      return res.status(400).json({
        success: false,
        message: 'Links must be an array'
      });
    }

    if (links.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one link is required'
      });
    }

    // Limit number of links per request
    if (links.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 10 links allowed per request'
      });
    }

    // Validate URLs
    const invalidLinks = [];
    links.forEach((link, index) => {
      if (!link || typeof link !== 'string') {
        invalidLinks.push(`Link at index ${index} is invalid`);
      } else {
        try {
          new URL(link);
        } catch (e) {
          invalidLinks.push(`Link at index ${index} is not a valid URL: ${link}`);
        }
      }
    });

    if (invalidLinks.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid links found',
        errors: invalidLinks
      });
    }

    // Extract images
    const results = await imageExtractor.extractImagesBatch(links);

    // Format response
    const response = {
      success: true,
      results: results.map(result => ({
        link: result.link,
        platform: result.platform,
        success: result.success,
        primaryImage: result.primaryImage,
        images: result.images,
        error: result.error || null
      }))
    };

    res.json(response);
  } catch (error) {
    console.error('Error extracting hotel images:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to extract hotel images',
      error: error.message
    });
  }
};

/**
 * Proxy image to avoid CORS issues
 * GET /api/hotel-pdf/proxy-image?url=...
 */
const proxyImage = async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'Image URL is required'
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid URL format'
      });
    }

    // Fetch image
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': new URL(url).origin
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // Accept redirects and client errors
    });

    // Determine content type
    const contentType = response.headers['content-type'] || 'image/jpeg';
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(Buffer.from(response.data));
  } catch (error) {
    console.error('Error proxying image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to proxy image',
      error: error.message
    });
  }
};

/**
 * Health check endpoint
 * GET /api/hotel-pdf/health
 */
const healthCheck = async (req, res) => {
  res.json({
    success: true,
    message: 'Hotel PDF service is running',
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  extractHotelImages,
  proxyImage,
  healthCheck
};

