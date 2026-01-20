#!/usr/bin/env node
/**
 * Fix Vendor Password Script
 * Resets vendor@halo.com password to vendor123
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function fixVendorPassword() {
  console.log('🔧 Fixing vendor password...\n');

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

    const email = 'vendor@halo.com';
    const password = 'vendor123';

    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    }).select('+password');

    if (!user) {
      console.error(`❌ User with email "${email}" not found!`);
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('✅ Found vendor user:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Current password hash length: ${user.password ? user.password.length : 0}\n`);

    // Reset password with proper hashing
    console.log(`🔄 Resetting password to "${password}"...`);
    
    // Hash password directly (bypassing pre-save hook to ensure it works)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Update user
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
          isActive: true
        },
        $unset: {
          lockUntil: 1,
          loginAttempts: 1
        }
      }
    );

    // Verify the update
    const updatedUser = await User.findById(user._id).select('+password');
    console.log(`   New password hash length: ${updatedUser.password.length}`);
    
    // Test password
    const testMatch = await bcrypt.compare(password, updatedUser.password);
    console.log(`   Password test: ${testMatch ? '✅ MATCH' : '❌ NO MATCH'}\n`);

    if (testMatch) {
      console.log('✅ Password reset successfully!');
      console.log('\n📋 Updated Login Credentials:');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}`);
      console.log(`   Role: ${user.role}\n`);
    } else {
      console.error('❌ Password reset failed!');
    }

    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error fixing vendor password:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

fixVendorPassword();

