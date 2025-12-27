# Fix MongoDB URI in Render.com

## Quick Fix Steps

Your deployment is failing because `MONGODB_URI` is set to `mongodb://localhost:27017/halo`, which won't work in a production environment.

### Step 1: Get MongoDB Atlas Connection String

1. **Go to MongoDB Atlas**: https://www.mongodb.com/cloud/atlas
2. **Sign in** or create a free account
3. **Create a Cluster** (if you don't have one):
   - Click "Build a Database"
   - Choose "M0 FREE" tier
   - Select a cloud provider and region
   - Click "Create"
4. **Create Database User**:
   - Go to "Database Access" → "Add New Database User"
   - Choose "Password" authentication
   - Create username and password (save these!)
   - Set privileges to "Atlas admin" or "Read and write to any database"
   - Click "Add User"
5. **Configure Network Access**:
   - Go to "Network Access" → "Add IP Address"
   - Click "Allow Access from Anywhere" (adds `0.0.0.0/0`)
   - Click "Confirm"
6. **Get Connection String**:
   - Go to "Database" → Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string (looks like):
     ```
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<username>` and `<password>` with your database user credentials
   - Add database name: Change `/?retryWrites=true` to `/halo?retryWrites=true`
   - Final format:
     ```
     mongodb+srv://yourusername:yourpassword@cluster0.xxxxx.mongodb.net/halo?retryWrites=true&w=majority
     ```

### Step 2: Update Environment Variable in Render.com

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Select your service** (e.g., `halo-engine` or `halo-backend`)
3. **Go to "Environment" tab** (in the left sidebar)
4. **Find `MONGODB_URI`** in the environment variables list
5. **Click on the value** to edit it
6. **Replace** `mongodb://localhost:27017/halo` with your MongoDB Atlas connection string:
   ```
   mongodb+srv://yourusername:yourpassword@cluster0.xxxxx.mongodb.net/halo?retryWrites=true&w=majority
   ```
7. **Click "Save Changes"**
8. **Render will automatically redeploy** your service

### Step 3: Verify Deployment

1. **Wait for deployment** to complete (check the "Events" tab)
2. **Check logs** - you should see:
   ```
   ✅ MongoDB Connected: cluster0-shard-00-00.xxxxx.mongodb.net
   ```
3. **Test health endpoint**:
   ```bash
   curl https://your-service.onrender.com/api/health
   ```

## Common Issues

### Connection Timeout
- **Check Network Access**: Ensure `0.0.0.0/0` is whitelisted in MongoDB Atlas
- **Check Username/Password**: Verify credentials are correct (no special characters need URL encoding)

### Authentication Failed
- **Verify Database User**: Ensure user has proper permissions
- **Check Connection String**: Make sure username and password are correctly inserted

### Still Seeing Localhost Error
- **Clear Browser Cache**: Sometimes Render dashboard shows cached values
- **Check All Environment Variables**: Make sure there's no duplicate `MONGODB_URI` variable
- **Manual Redeploy**: Go to "Manual Deploy" → "Deploy latest commit"

## Example Connection String Format

```
mongodb+srv://username:password@cluster0.abc123.mongodb.net/halo?retryWrites=true&w=majority
```

**Components:**
- `mongodb+srv://` - Protocol for MongoDB Atlas
- `username:password` - Your database user credentials
- `cluster0.abc123.mongodb.net` - Your cluster hostname
- `/halo` - Database name
- `?retryWrites=true&w=majority` - Connection options

## Need Help?

If you're still having issues:
1. Check Render deployment logs for specific error messages
2. Verify MongoDB Atlas cluster is running (status should be green)
3. Test connection string locally first:
   ```bash
   # In your local .env file, temporarily set:
   MONGODB_URI=your-atlas-connection-string
   # Then test: npm start
   ```

