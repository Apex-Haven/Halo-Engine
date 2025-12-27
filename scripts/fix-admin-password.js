#!/usr/bin/env node
/**
 * Fix Admin Password Script
 * Resets admin@halo.com password to 'admin123' in MongoDB Atlas
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function fixAdminPassword() {
  console.log('🔧 Fixing admin password in MongoDB Atlas...\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not configured');
    console.error('📝 Set MONGODB_URI in your .env file or environment variables');
    process.exit(1);
  }

  // Check if it's Atlas (not localhost)
  if (process.env.MONGODB_URI.includes('localhost') || process.env.MONGODB_URI.includes('127.0.0.1')) {
    console.error('❌ This script is for MongoDB Atlas, not localhost');
    console.error('📝 Set MONGODB_URI to your Atlas connection string');
    process.exit(1);
  }

  try {
    console.log('⏳ Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ Connected to: ${mongoose.connection.host}\n`);

    // Find admin user
    const admin = await User.findOne({ 
      $or: [
        { email: 'admin@halo.com' },
        { username: 'admin' }
      ]
    });

    if (!admin) {
      console.log('⚠️  Admin user not found. Creating admin@halo.com...\n');
      
      // Create admin user
      const newAdmin = new User({
        username: 'admin',
        email: 'admin@halo.com',
        password: 'admin123', // Will be hashed by pre-save hook
        role: 'ADMIN',
        profile: {
          firstName: 'Admin',
          lastName: 'User',
          phone: '+1234567890'
        },
        isActive: true,
        isEmailVerified: true,
        preferences: {
          notifications: {
            email: true,
            sms: true,
            whatsapp: true,
            push: true
          },
          language: 'en',
          timezone: 'UTC'
        }
      });

      await newAdmin.save();
      console.log('✅ Admin user created successfully!');
      console.log('\n📋 Login Credentials:');
      console.log('   Email: admin@halo.com');
      console.log('   Password: admin123');
      console.log('   Role: ADMIN\n');
    } else {
      console.log('✅ Found admin user:');
      console.log(`   Email: ${admin.email}`);
      console.log(`   Username: ${admin.username}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Active: ${admin.isActive}\n`);

      // Reset password
      console.log('🔄 Resetting password to "admin123"...');
      // Mark password as modified to ensure pre-save hook runs
      admin.password = 'admin123'; // Will be hashed by pre-save hook
      admin.markModified('password'); // Explicitly mark as modified
      admin.isActive = true;
      admin.loginAttempts = 0;
      admin.lockUntil = undefined;
      
      await admin.save();
      
      // Verify password was hashed
      if (admin.password === 'admin123') {
        console.log('⚠️  WARNING: Password was not hashed! Trying direct hash...');
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(12);
        admin.password = await bcrypt.hash('admin123', salt);
        await admin.save();
        console.log('✅ Password manually hashed and saved');
      } else {
        console.log('✅ Password hashed successfully (length: ' + admin.password.length + ')');
      }
      
      console.log('✅ Password reset successfully!');
      console.log('\n📋 Updated Login Credentials:');
      console.log('   Email: admin@halo.com');
      console.log('   Password: admin123');
      console.log('   Role: ' + admin.role);
    }

    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    console.log('✅ Admin password fixed! You can now login.\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error fixing admin password:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
fixAdminPassword();

