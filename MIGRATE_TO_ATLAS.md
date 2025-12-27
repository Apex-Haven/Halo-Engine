# Migrate Local MongoDB Data to MongoDB Atlas

This guide will help you export your local MongoDB data and import it into MongoDB Atlas.

## Prerequisites

1. **MongoDB Atlas cluster** set up and ready (see `RENDER_MONGODB_SETUP.md`)
2. **MongoDB Database Tools** installed on your local machine:
   - `mongodump` - for exporting databases
   - `mongorestore` - for importing databases
   
   If not installed:
   ```bash
   # macOS (using Homebrew)
   brew install mongodb-database-tools
   
   # Or download from: https://www.mongodb.com/try/download/database-tools
   ```

## Method 1: Full Database Migration (Recommended)

This exports and imports the entire database.

### Step 1: Export from Local MongoDB

```bash
# Navigate to your project directory
cd /Users/stalin/Workspace/Halo/halo-engine

# Export the entire 'halo' database
mongodump --uri="mongodb://localhost:27017/halo" --out=./mongodb-backup

# This creates a folder: ./mongodb-backup/halo/
```

**What this does:**
- Exports all collections from your local `halo` database
- Creates BSON files (binary format) for each collection
- Preserves indexes and metadata

### Step 2: Import to MongoDB Atlas

```bash
# Get your Atlas connection string (from MongoDB Atlas dashboard)
# Format: mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority

# Import to Atlas
mongorestore --uri="mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority" ./mongodb-backup/halo/

# Replace username, password, and cluster with your actual Atlas credentials
```

**What this does:**
- Imports all collections to your Atlas database
- Preserves indexes and document structure
- If collections already exist, it will merge/overwrite (use `--drop` to replace)

### Step 3: Verify Import

1. **Check in MongoDB Atlas Dashboard:**
   - Go to your cluster → "Browse Collections"
   - Verify all collections are present
   - Check document counts

2. **Or use MongoDB Compass:**
   - Connect to your Atlas cluster
   - Browse collections and verify data

## Method 2: Selective Collection Migration

If you only want to migrate specific collections:

### Export Specific Collections

```bash
# Export only specific collections
mongodump --uri="mongodb://localhost:27017/halo" \
  --collection=users \
  --collection=transfers \
  --collection=clienttravelpreferences \
  --out=./mongodb-backup
```

### Import Specific Collections

```bash
mongorestore --uri="mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority" \
  ./mongodb-backup/halo/users.bson \
  ./mongodb-backup/halo/transfers.bson \
  ./mongodb-backup/halo/clienttravelpreferences.bson
```

## Method 3: Using MongoDB Compass (GUI Method)

If you prefer a visual interface:

### Export from Local MongoDB

1. **Open MongoDB Compass**
2. **Connect to local MongoDB**: `mongodb://localhost:27017`
3. **Select the `halo` database**
4. **For each collection:**
   - Click on the collection
   - Click "Export Collection" (top right)
   - Choose format: JSON or CSV
   - Save the file

### Import to MongoDB Atlas

1. **Connect MongoDB Compass to Atlas:**
   - Use your Atlas connection string: `mongodb+srv://username:password@cluster.mongodb.net/halo`
2. **For each exported file:**
   - Select the database/collection
   - Click "Add Data" → "Import File"
   - Select your exported JSON/CSV file
   - Configure import options
   - Click "Import"

**Note:** This method is slower for large datasets but easier for beginners.

## Common Collections in HALO

If you want to migrate specific collections, here are the main ones:

```bash
# Core collections
- users
- transfers
- vendors
- clienttravelpreferences
- hotels
- hotellinks
- securityauditlogs
- notifications
```

## Advanced Options

### Drop Existing Collections Before Import

If you want to replace existing data:

```bash
mongorestore --uri="mongodb+srv://..." --drop ./mongodb-backup/halo/
```

### Exclude Specific Collections

```bash
# Export all except certain collections
mongodump --uri="mongodb://localhost:27017/halo" \
  --excludeCollection=securityauditlogs \
  --excludeCollection=notifications \
  --out=./mongodb-backup
```

### Compress Backup

```bash
# Create compressed backup
mongodump --uri="mongodb://localhost:27017/halo" --gzip --archive=halo-backup.gz

# Restore from compressed backup
mongorestore --uri="mongodb+srv://..." --gzip --archive=halo-backup.gz
```

## Troubleshooting

### Connection Issues

**Error: "authentication failed"**
- Verify username and password in connection string
- Check database user has proper permissions in Atlas

**Error: "network access denied"**
- Ensure your IP is whitelisted in Atlas Network Access
- Or use `0.0.0.0/0` to allow from anywhere (for migration only)

### Import Errors

**Error: "duplicate key error"**
- Collections already exist with conflicting IDs
- Use `--drop` to replace, or `--noIndexRestore` to skip indexes

**Error: "index already exists"**
```bash
# Skip index restoration
mongorestore --uri="..." --noIndexRestore ./mongodb-backup/halo/
```

### Large Dataset Issues

For very large databases (>1GB):
- Use `--numParallelCollections=4` for faster import
- Consider using Atlas Data Import tool (in Atlas dashboard)

## Verify Migration Success

### Check Collection Counts

```bash
# Connect to Atlas and verify
mongosh "mongodb+srv://username:password@cluster.mongodb.net/halo"

# In MongoDB shell:
use halo
db.users.countDocuments()
db.transfers.countDocuments()
db.vendors.countDocuments()
# ... check other collections
```

### Compare Local vs Atlas

```bash
# Count local
mongosh "mongodb://localhost:27017/halo" --eval "db.users.countDocuments()"

# Count Atlas
mongosh "mongodb+srv://..." --eval "db.users.countDocuments()"
```

## After Migration

1. **Update Render.com environment variable:**
   - Set `MONGODB_URI` to your Atlas connection string
   - Redeploy your service

2. **Test your application:**
   - Verify all data is accessible
   - Test login with existing users
   - Check that all features work correctly

3. **Keep local backup:**
   - Don't delete `./mongodb-backup` folder immediately
   - Keep it until you've verified everything works in production

## Quick Migration Script

Save this as `migrate-to-atlas.sh`:

```bash
#!/bin/bash

# Configuration
LOCAL_URI="mongodb://localhost:27017/halo"
ATLAS_URI="mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority"
BACKUP_DIR="./mongodb-backup"

echo "📦 Exporting from local MongoDB..."
mongodump --uri="$LOCAL_URI" --out="$BACKUP_DIR"

echo "☁️  Importing to MongoDB Atlas..."
mongorestore --uri="$ATLAS_URI" "$BACKUP_DIR/halo/"

echo "✅ Migration complete!"
echo "📝 Verify data in MongoDB Atlas dashboard"
```

Make it executable and run:
```bash
chmod +x migrate-to-atlas.sh
./migrate-to-atlas.sh
```

## Next Steps

After successful migration:
1. ✅ Update `MONGODB_URI` in Render.com
2. ✅ Test your deployed application
3. ✅ Verify all features work with Atlas data
4. ✅ Consider keeping local MongoDB for development
5. ✅ Set up regular backups in Atlas (Atlas provides automatic backups)

