#!/usr/bin/env node
/**
 * Database Browser Script
 * Shows database structure, collections, and document counts
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function browseDatabase() {
  console.log('🔍 HALO Database Browser\n');

  // Check if MongoDB URI is configured
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not configured');
    process.exit(1);
  }

  try {
    console.log('⏳ Connecting to MongoDB...\n');
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    const db = mongoose.connection.db;
    const dbName = db.databaseName;

    console.log(`✅ Connected to database: ${dbName}\n`);
    console.log('═'.repeat(60));

    // Get all collections
    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log('\n📊 No collections found yet.');
      console.log('   Collections will be created automatically when you:');
      console.log('   - Login/create users');
      console.log('   - Create transfers');
      console.log('   - Add vendors');
      console.log('   - Add hotels\n');
    } else {
      console.log(`\n📊 Collections (${collections.length}):\n`);

      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        const collection = db.collection(collectionName);
        
        // Get document count
        const count = await collection.countDocuments();
        
        console.log(`📁 ${collectionName}`);
        console.log(`   Documents: ${count}`);

        if (count > 0) {
          // Get a sample document to show structure
          const sample = await collection.findOne({});
          
          console.log(`   Structure:`);
          const fields = Object.keys(sample).filter(k => !k.startsWith('_'));
          fields.slice(0, 10).forEach(field => {
            const value = sample[field];
            const type = Array.isArray(value) ? 'Array' : typeof value;
            const preview = typeof value === 'object' && value !== null 
              ? (Array.isArray(value) ? `[${value.length} items]` : '{...}')
              : String(value).substring(0, 30);
            console.log(`     • ${field}: ${type} ${preview.length > 30 ? preview + '...' : preview}`);
          });
          if (fields.length > 10) {
            console.log(`     ... and ${fields.length - 10} more fields`);
          }
        }
        console.log('');
      }

      // Show detailed view if requested
      if (process.argv.includes('--detailed')) {
        console.log('═'.repeat(60));
        console.log('\n📋 Detailed Collection Information:\n');
        
        for (const collectionInfo of collections) {
          const collectionName = collectionInfo.name;
          const collection = db.collection(collectionName);
          const sample = await collection.findOne({});
          
          if (sample) {
            console.log(`\n📁 ${collectionName.toUpperCase()}:`);
            console.log(JSON.stringify(sample, null, 2));
          }
        }
      }
    }

    // Database statistics
    console.log('═'.repeat(60));
    const stats = await db.stats();
    console.log('\n💾 Database Statistics:');
    console.log(`   Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Storage: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Indexes: ${stats.indexes}`);
    console.log(`   Total Documents: ${stats.objects}\n`);

    await mongoose.connection.close();
    console.log('✅ Database browser closed\n');
    
  } catch (error) {
    console.error('\n❌ Error browsing database:', error.message);
    process.exit(1);
  }
}

// Run the browser
browseDatabase();
