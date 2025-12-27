#!/usr/bin/env node
/**
 * Check Admin Users Script
 * Lists all admin users to verify which one exists
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkAdminUsers() {
  console.log('🔍 Checking admin users in database...\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not configured');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ Connected to: ${mongoose.connection.host}\n`);

    // Find all users with admin email or username
    const adminUsers = await User.find({
      $or: [
        { email: /admin/i },
        { username: /admin/i },
        { role: { $in: ['SUPER_ADMIN', 'ADMIN'] } }
      ]
    }).select('+password');

    console.log(`Found ${adminUsers.length} admin-related user(s):\n`);

    adminUsers.forEach((user, index) => {
      console.log(`${index + 1}. User Details:`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Email: "${user.email}" (length: ${user.email.length})`);
      console.log(`   Username: "${user.username}"`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Active: ${user.isActive}`);
      console.log(`   Password hash exists: ${user.password ? 'Yes' : 'No'}`);
      console.log(`   Password hash length: ${user.password ? user.password.length : 0}`);
      console.log(`   Login attempts: ${user.loginAttempts || 0}`);
      console.log(`   Locked: ${user.isLocked || false}`);
      if (user.lockUntil) {
        console.log(`   Lock until: ${new Date(user.lockUntil).toLocaleString()}`);
      }
      console.log('');
    });

    // Test exact email lookup
    console.log('🔍 Testing exact email lookup:');
    const exactMatch = await User.findOne({ email: 'admin@halo.com' }).select('+password');
    if (exactMatch) {
      console.log('✅ Found user with exact email "admin@halo.com"');
    } else {
      console.log('❌ No user found with exact email "admin@halo.com"');
    }

    // Test case-insensitive lookup
    console.log('\n🔍 Testing case-insensitive email lookup:');
    const caseInsensitive = await User.findOne({ 
      email: { $regex: /^admin@halo\.com$/i } 
    }).select('+password');
    if (caseInsensitive) {
      console.log('✅ Found user with case-insensitive email match');
      console.log(`   Actual email in DB: "${caseInsensitive.email}"`);
    } else {
      console.log('❌ No user found with case-insensitive email match');
    }

    await mongoose.disconnect();
    console.log('\n✅ Check complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error checking users:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

checkAdminUsers();

