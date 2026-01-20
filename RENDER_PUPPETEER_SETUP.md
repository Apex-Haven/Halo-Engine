# Puppeteer Setup for Render.com

## Problem
Puppeteer requires Chrome/Chromium to be installed. On Render.com, Chrome is not pre-installed, causing errors like:
```
Could not find Chrome (ver. 143.0.7499.192)
```

## Solution

### Option 1: Install Chrome During Build (Recommended)

1. Go to your Render dashboard → Your service → Settings → Build & Deploy
2. Find the **Build Command** field
3. **Clear the existing command completely** (delete everything)
4. Enter exactly this command (copy-paste):
   ```bash
   npm install && npx puppeteer browsers install chrome
   ```
   **⚠️ CRITICAL**: 
   - Make sure there are NO extra spaces or characters
   - The command should be on a SINGLE line
   - Do NOT add anything after `chrome`
   - Do NOT concatenate with other commands
   - Verify the command shows: `chromenpm install` = WRONG ❌
   - Verify the command shows: `chrome` = CORRECT ✅
5. Click **Save Changes**
6. Go to **Manual Deploy** → **Deploy latest commit**
7. Watch the build logs to verify Chrome installation:
   - Look for: `chrome@<version> <path>` in build logs
   - If you see errors, Chrome installation failed

**Alternative Build Command** (if above doesn't work):
```bash
npm install && PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false npx puppeteer browsers install chrome@stable
```

### Option 2: Install Chrome System-Wide (Recommended for Render)

The cache directory doesn't persist on Render's free tier. Install Chrome system-wide instead:

1. Update **Build Command** to:
   ```bash
   npm install && apt-get update && apt-get install -y chromium chromium-sandbox
   ```
2. Add environment variable in Render → Environment:
   ```
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
   ```
3. Save and redeploy

**Note**: This installs Chromium system-wide, which persists across deployments.

### Option 3: Disable Puppeteer Feature (Temporary Workaround)

If Chrome installation keeps failing, you can temporarily disable Puppeteer:

1. Go to Render dashboard → Your service → Environment
2. Add environment variable:
   ```
   DISABLE_PUPPETEER=true
   ```
3. Save and redeploy
4. The service will gracefully handle missing Puppeteer
5. Image extraction will return empty results but won't error

**Note**: This is a temporary workaround. Image extraction won't work, but the rest of the app will function normally.

## Environment Variables

Add these to your Render environment variables:

```bash
# Required: Set Chrome executable path (after Chrome is installed)
# Get this from build logs: chrome@143.0.7499.192 /opt/render/.cache/puppeteer/chrome/linux-143.0.7499.192/chrome-linux64/chrome
PUPPETEER_EXECUTABLE_PATH=/opt/render/.cache/puppeteer/chrome/linux-143.0.7499.192/chrome-linux64/chrome

# Optional: Set Puppeteer cache directory
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Optional: Disable Puppeteer if not needed
DISABLE_PUPPETEER=false
```

**⚠️ IMPORTANT**: After Chrome is installed, copy the path from build logs and set `PUPPETEER_EXECUTABLE_PATH` environment variable in Render.

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

