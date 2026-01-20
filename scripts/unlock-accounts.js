#!/usr/bin/env node

/**
 * Script to unlock all locked user accounts
 * Usage: node scripts/unlock-accounts.js [email]
 * If email is provided, only that user will be unlocked
 * If no email is provided, all locked accounts will be unlocked
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function unlockAccounts() {
  console.log('🔓 Unlocking user accounts...\n');

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

    const email = process.argv[2];

    if (email) {
      // Unlock specific user
      console.log(`🔍 Looking for user with email: "${email}"\n`);
      const user = await User.findOne({ email: email.toLowerCase().trim() });

      if (!user) {
        console.error(`❌ User with email "${email}" not found!`);
        await mongoose.disconnect();
        process.exit(1);
      }

      console.log('✅ User found:');
      console.log(`   Email: ${user.email}`);
      console.log(`   Username: ${user.username}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Locked: ${user.isLocked || false}`);
      if (user.lockUntil) {
        console.log(`   Lock until: ${new Date(user.lockUntil).toLocaleString()}`);
      }
      console.log(`   Login attempts: ${user.loginAttempts || 0}\n`);

      if (!user.isLocked && (!user.lockUntil || user.lockUntil < Date.now())) {
        console.log('ℹ️  Account is not locked. No action needed.\n');
      } else {
        // Unlock the account
        await User.updateOne(
          { _id: user._id },
          {
            $unset: { lockUntil: 1, loginAttempts: 1 }
          }
        );

        console.log('✅ Account unlocked successfully!\n');
      }
    } else {
      // Unlock all locked accounts
      console.log('🔍 Finding all locked accounts...\n');

      const now = Date.now();
      const lockedUsers = await User.find({
        lockUntil: { $gt: now }
      });

      if (lockedUsers.length === 0) {
        console.log('ℹ️  No locked accounts found.\n');
      } else {
        console.log(`Found ${lockedUsers.length} locked account(s):\n`);

        lockedUsers.forEach((user, index) => {
          console.log(`${index + 1}. ${user.email} (${user.username})`);
          console.log(`   Lock until: ${new Date(user.lockUntil).toLocaleString()}`);
          console.log(`   Login attempts: ${user.loginAttempts || 0}\n`);
        });

        // Unlock all accounts
        const result = await User.updateMany(
          { lockUntil: { $gt: now } },
          {
            $unset: { lockUntil: 1, loginAttempts: 1 }
          }
        );

        console.log(`✅ Unlocked ${result.modifiedCount} account(s)!\n`);
      }
    }

    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    console.log('✅ Unlock operation completed!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error unlocking accounts:');
    console.error(error.message);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
unlockAccounts();

