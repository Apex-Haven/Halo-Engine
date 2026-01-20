#!/usr/bin/env node
/**
 * Test Vendor Login Script
 * Tests login for vendor@halo.com with vendor123 password
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function testVendorLogin() {
  console.log('🔐 Testing vendor login...\n');

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

    // Normalize email (exactly like login route)
    const normalizedEmail = email.toLowerCase().trim();
    console.log(`📧 Looking for user with email: "${normalizedEmail}"\n`);

    // Step 1: Find user by email (exactly like login route)
    const user = await User.findOne({ 
      email: normalizedEmail 
    }).select('+password');
    
    if (!user) {
      console.error('❌ User not found!');
      console.log('   Email might not exist in database');
      console.log('   Try checking if user exists with different email case\n');
      
      // Try case-insensitive search
      const caseInsensitive = await User.findOne({ 
        email: { $regex: new RegExp(`^${email}$`, 'i') }
      });
      
      if (caseInsensitive) {
        console.log('⚠️  Found user with different case:');
        console.log(`   Actual email in DB: "${caseInsensitive.email}"`);
        console.log(`   Searched for: "${normalizedEmail}"`);
      }
      
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user._id}`);
    console.log(`   Email: "${user.email}"`);
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

    // Step 2: Check if locked
    const isLocked = !!(user.lockUntil && user.lockUntil > Date.now());
    if (isLocked) {
      console.error('❌ Account is locked!');
      console.log(`   Lock until: ${new Date(user.lockUntil).toLocaleString()}`);
      console.log('\n💡 To unlock, run: node scripts/unlock-accounts.js vendor@halo.com');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log('✅ Account is not locked');

    // Step 3: Check if active
    if (!user.isActive) {
      console.error('❌ Account is not active!');
      console.log('\n💡 Account needs to be activated');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log('✅ Account is active\n');

    // Step 4: Verify password (exactly like login route)
    console.log(`🔐 Comparing password: "${password}"`);
    const isPasswordValid = await user.comparePassword(password);
    
    console.log(`   Result: ${isPasswordValid ? '✅ VALID' : '❌ INVALID'}\n`);

    if (!isPasswordValid) {
      console.error('❌ Password comparison failed!');
      
      // Try direct bcrypt comparison
      const directMatch = await bcrypt.compare(password, user.password);
      console.log(`   Direct bcrypt comparison: ${directMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
      
      if (!directMatch) {
        console.log('\n⚠️  Password hash does not match. Resetting password...');
        const salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(password, salt);
        await user.save();
        console.log('✅ Password reset. Testing again...');
        const newMatch = await user.comparePassword(password);
        console.log(`   New password match: ${newMatch ? '✅ YES' : '❌ NO'}`);
        
        if (newMatch) {
          console.log('\n✅ Password has been reset successfully!');
          console.log('   You can now login with:');
          console.log(`   Email: ${email}`);
          console.log(`   Password: ${password}\n`);
        }
      }
      
      await mongoose.disconnect();
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
    console.error('\n❌ Error testing vendor login:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testVendorLogin();

