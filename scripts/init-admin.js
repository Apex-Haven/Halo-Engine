#!/usr/bin/env node
/**
 * Initialize Admin User Script
 * Creates a default admin user if no users exist in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function initializeAdmin() {
  console.log('🔐 HALO Admin User Initialization\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not configured in .env file');
    process.exit(1);
  }

  try {
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`✅ Connected to database: ${mongoose.connection.name}\n`);

    // Check if any users exist
    const userCount = await User.countDocuments();
    
    if (userCount > 0) {
      console.log(`ℹ️  Database already has ${userCount} user(s)`);
      
      // Check if admin exists
      const admin = await User.findOne({ 
        $or: [
          { role: 'SUPER_ADMIN' },
          { role: 'ADMIN' },
          { email: 'admin@halo.com' },
          { username: 'admin' }
        ]
      });
      
      if (admin) {
        console.log('✅ Admin user already exists:');
        console.log(`   Email: ${admin.email}`);
        console.log(`   Username: ${admin.username}`);
        console.log(`   Role: ${admin.role}\n`);
        await mongoose.disconnect();
        process.exit(0);
      } else {
        console.log('⚠️  No admin user found. Creating default admin...\n');
      }
    } else {
      console.log('📝 No users found. Creating default admin user...\n');
    }

    // Create default admin user (password will be hashed by User model pre-save hook)
    const adminData = {
      username: 'admin',
      email: 'admin@halo.com',
      password: 'admin123', // Will be hashed by User model
      role: 'SUPER_ADMIN',
      profile: {
        firstName: 'Admin',
        lastName: 'User',
        phone: '+1234567890'
      },
      preferences: {
        notifications: {
          email: true,
          sms: true,
          whatsapp: true,
          push: true
        },
        language: 'en',
        timezone: 'UTC'
      },
      isActive: true,
      isLocked: false,
      loginAttempts: 0
    };

    // Check if admin already exists by email or username
    const existingAdmin = await User.findOne({
      $or: [
        { email: adminData.email },
        { username: adminData.username }
      ]
    });

    if (existingAdmin) {
      console.log('⚠️  Admin user with this email/username already exists');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Username: ${existingAdmin.username}`);
      console.log(`   Role: ${existingAdmin.role}\n`);
      await mongoose.disconnect();
      process.exit(0);
    }

    const admin = new User(adminData);
    await admin.save();

    console.log('✅ Admin user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Email: admin@halo.com');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Role: SUPER_ADMIN\n');
    console.log('⚠️  IMPORTANT: Change the password after first login!\n');

    await mongoose.disconnect();
    console.log('✅ Database connection closed\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error initializing admin user:');
    console.error(`   ${error.message}\n`);
    
    if (error.code === 11000) {
      console.log('ℹ️  Admin user may already exist with different credentials');
    }
    
    await mongoose.disconnect();
    process.exit(1);
  }
}

initializeAdmin();

