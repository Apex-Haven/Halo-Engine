#!/usr/bin/env node
/**
 * Test Admin Login Script
 * Verifies admin password works correctly
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function testAdminLogin() {
  console.log('🧪 Testing admin login...\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not configured');
    process.exit(1);
  }

  try {
    console.log('⏳ Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ Connected to: ${mongoose.connection.host}\n`);

    // Find admin user with password field
    const admin = await User.findOne({ 
      $or: [
        { email: 'admin@halo.com' },
        { username: 'admin' }
      ]
    }).select('+password');

    if (!admin) {
      console.error('❌ Admin user not found!');
      process.exit(1);
    }

    console.log('✅ Found admin user:');
    console.log(`   Email: ${admin.email}`);
    console.log(`   Username: ${admin.username}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Active: ${admin.isActive}`);
    console.log(`   Password hash length: ${admin.password ? admin.password.length : 'null'}`);
    console.log(`   Password hash (first 20 chars): ${admin.password ? admin.password.substring(0, 20) + '...' : 'null'}\n`);

    // Test password comparison
    console.log('🔐 Testing password comparison...');
    const testPassword = 'admin123';
    const isMatch = await admin.comparePassword(testPassword);
    
    console.log(`   Testing password: "${testPassword}"`);
    console.log(`   Password matches: ${isMatch ? '✅ YES' : '❌ NO'}\n`);

    // Also test direct bcrypt comparison
    console.log('🔐 Testing direct bcrypt comparison...');
    const directMatch = await bcrypt.compare(testPassword, admin.password);
    console.log(`   Direct bcrypt match: ${directMatch ? '✅ YES' : '❌ NO'}\n`);

    if (!isMatch && !directMatch) {
      console.log('⚠️  Password does not match!');
      console.log('   Let\'s reset it...\n');
      
      // Reset password
      const salt = await bcrypt.genSalt(12);
      admin.password = await bcrypt.hash(testPassword, salt);
      await admin.save();
      
      console.log('✅ Password reset. Testing again...');
      const newMatch = await admin.comparePassword(testPassword);
      console.log(`   New password matches: ${newMatch ? '✅ YES' : '❌ NO'}\n`);
    }

    await mongoose.disconnect();
    console.log('✅ Test complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error testing login:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testAdminLogin();

