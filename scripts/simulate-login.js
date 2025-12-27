#!/usr/bin/env node
/**
 * Simulate Login Script
 * Exactly replicates the login route logic to debug
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function simulateLogin() {
  console.log('🔐 Simulating login route logic...\n');

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

    const email = 'admin@halo.com';
    const password = 'admin123';

    console.log(`📧 Looking for user with email: "${email}"\n`);

    // Step 1: Find user by email (exactly like login route)
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      console.error('❌ User not found!');
      console.log('   This is the problem - user lookup is failing');
      process.exit(1);
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Email: "${user.email}"`);
    console.log(`   Username: "${user.username}"`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Active: ${user.isActive}`);
    console.log(`   Password hash: ${user.password ? user.password.substring(0, 30) + '...' : 'MISSING'}\n`);

    // Step 2: Check if locked
    const isLocked = !!(user.lockUntil && user.lockUntil > Date.now());
    if (isLocked) {
      console.error('❌ Account is locked!');
      console.log(`   Lock until: ${new Date(user.lockUntil).toLocaleString()}`);
      process.exit(1);
    }
    console.log('✅ Account is not locked');

    // Step 3: Check if active
    if (!user.isActive) {
      console.error('❌ Account is not active!');
      process.exit(1);
    }
    console.log('✅ Account is active\n');

    // Step 4: Verify password (exactly like login route)
    console.log(`🔐 Comparing password: "${password}"`);
    const isPasswordValid = await user.comparePassword(password);
    
    console.log(`   Result: ${isPasswordValid ? '✅ VALID' : '❌ INVALID'}\n`);

    if (!isPasswordValid) {
      console.error('❌ Password comparison failed!');
      console.log('   This is the problem - password does not match');
      
      // Try direct bcrypt comparison
      const bcrypt = require('bcryptjs');
      const directMatch = await bcrypt.compare(password, user.password);
      console.log(`   Direct bcrypt comparison: ${directMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
      
      if (!directMatch) {
        console.log('\n⚠️  Password hash might be corrupted. Resetting...');
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        console.log('✅ Password reset. Testing again...');
        const newMatch = await user.comparePassword(password);
        console.log(`   New password match: ${newMatch ? '✅ YES' : '❌ NO'}`);
      }
      
      process.exit(1);
    }

    console.log('✅ All checks passed! Login should work.\n');
    console.log('📋 Summary:');
    console.log('   ✅ User found');
    console.log('   ✅ Account not locked');
    console.log('   ✅ Account active');
    console.log('   ✅ Password valid\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error simulating login:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

simulateLogin();

