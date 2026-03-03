#!/usr/bin/env node
/**
 * Fix Prolog Password Script
 * Resets prolog@halo.com password to prolog123
 *
 * Run against PRODUCTION database:
 *   MONGODB_URI="mongodb+srv://..." node scripts/fix-prolog-password.js
 *
 * Or set MONGODB_URI in .env to your production connection string.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function fixPrologPassword() {
  console.log('🔧 Fixing prolog password...\n');

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not configured');
    console.error('   Set it in .env or run: MONGODB_URI="your-connection-string" node scripts/fix-prolog-password.js\n');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
    });

    console.log(`✅ Connected to: ${mongoose.connection.host}\n`);

    const email = 'prolog@halo.com';
    const password = 'prolog123';

    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    }).select('+password');

    if (!user) {
      console.error(`❌ User with email "${email}" not found!`);
      console.error('   Create the user first via User Management in the portal.\n');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('✅ Found prolog user:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Role: ${user.role}\n`);

    console.log(`🔄 Resetting password to "${password}"...`);
    
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    
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

    const updatedUser = await User.findById(user._id).select('+password');
    const testMatch = await bcrypt.compare(password, updatedUser.password);
    
    if (testMatch) {
      console.log('✅ Password reset successfully!');
      console.log('\n📋 Updated Login Credentials:');
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${password}\n`);
    } else {
      console.error('❌ Password reset failed!');
    }

    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error fixing prolog password:');
    console.error(error.message);
    process.exit(1);
  }
}

fixPrologPassword();
