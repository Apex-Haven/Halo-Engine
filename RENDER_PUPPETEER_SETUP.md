# Puppeteer Setup for Render.com

## Problem
Puppeteer requires Chrome/Chromium to be installed. On Render.com, Chrome is not pre-installed, causing errors like:
```
Could not find Chrome (ver. 143.0.7499.192)
```

## Solution

### Option 1: Install Chrome During Build (Recommended)

1. Go to your Render dashboard → Your service → Settings
2. Update the **Build Command** to:
   ```bash
   npm install && npx puppeteer browsers install chrome
   ```
3. Save and redeploy

### Option 2: Use System Chrome (Alternative)

If Option 1 doesn't work, you can install Chrome system-wide:

1. Update **Build Command** to:
   ```bash
   npm install && apt-get update && apt-get install -y chromium-browser
   ```
2. Add environment variable:
   ```
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
   ```

### Option 3: Disable Puppeteer Feature (Fallback)

If Puppeteer is not critical, you can disable it:

1. Add environment variable:
   ```
   DISABLE_PUPPETEER=true
   ```
2. The service will gracefully handle missing Puppeteer

## Environment Variables

Add these to your Render environment variables:

```bash
# Optional: Set Puppeteer cache directory
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Optional: Disable Puppeteer if not needed
DISABLE_PUPPETEER=false
```

## Verify Installation

After deployment, check logs for:
- ✅ `[Puppeteer] Browser initialized successfully`
- ❌ `Could not find Chrome` (means installation failed)

## Troubleshooting

### Build Fails
- Check build logs for Chrome installation errors
- Ensure build command includes Chrome installation
- Try Option 2 (system Chrome)

### Runtime Errors
- Check if Chrome is in PATH: `which google-chrome-stable`
- Verify PUPPETEER_CACHE_DIR is writable
- Check disk space (Chrome takes ~200MB)

### Performance
- Chrome installation adds ~2-3 minutes to build time
- Consider using a Docker image with Chrome pre-installed

