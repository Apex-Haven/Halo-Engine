# Debug Login Issue

## Problem
Login returns "Invalid credentials" even though password is correct.

## Verified
✅ Password works correctly in local tests
✅ User exists in MongoDB Atlas
✅ Password hash is correct (60 characters, bcrypt)
✅ Account is active and unlocked

## Possible Causes

### 1. Render.com Using Wrong MongoDB URI
**Check:** Go to Render.com dashboard → Your service → Environment
- Verify `MONGODB_URI` is set to: `mongodb+srv://s76652_db_user:YZmFFMPRmWk0BSnx@cluster0.51lqb2g.mongodb.net/halo?retryWrites=true&w=majority`
- If it's still `mongodb://localhost:27017/halo`, that's the problem!

### 2. Server Not Restarted After Password Reset
**Fix:** Go to Render.com dashboard → Your service → Manual Deploy → Deploy latest commit

### 3. Email Case Sensitivity (FIXED)
- Added email normalization in login route
- Code pushed to GitHub
- Render will auto-deploy

### 4. Rate Limiter Still Blocking
**Check:** If you see "Too many authentication attempts", wait 15 minutes

## Steps to Fix

1. **Verify MONGODB_URI in Render.com:**
   ```
   mongodb+srv://s76652_db_user:YZmFFMPRmWk0BSnx@cluster0.51lqb2g.mongodb.net/halo?retryWrites=true&w=majority
   ```

2. **Force Redeploy:**
   - Render.com → Your service → Manual Deploy → Deploy latest commit
   - Wait for deployment to complete

3. **Wait for Rate Limit (if applicable):**
   - If you see rate limit error, wait 15 minutes
   - Or use a different IP address

4. **Test Login:**
   ```bash
   curl 'https://halo-engine.onrender.com/api/auth/login' \
     -H 'content-type: application/json' \
     --data-raw '{"email":"admin@halo.com","password":"admin123"}'
   ```

## Test Scripts Available

Run these locally to verify database:
```bash
# Test password
MONGODB_URI="your-atlas-uri" node scripts/test-admin-login.js

# Simulate login
MONGODB_URI="your-atlas-uri" node scripts/simulate-login.js

# Check all admin users
MONGODB_URI="your-atlas-uri" node scripts/check-admin-users.js
```

