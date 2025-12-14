const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

const OLD_ROLES = ['OPERATIONS_MANAGER', 'VENDOR_MANAGER', 'CUSTOMER'];

async function migrateRoles() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/halo';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Delete users with old roles
    console.log('\n🗑️  Deleting users with old roles...');
    const deleteResult = await User.deleteMany({
      role: { $in: OLD_ROLES }
    });
    console.log(`✅ Deleted ${deleteResult.deletedCount} users with old roles: ${OLD_ROLES.join(', ')}`);

    // Update DRIVER users if needed (keep them but ensure structure is correct)
    console.log('\n🔄 Checking DRIVER users...');
    const driverUsers = await User.find({ role: 'DRIVER' });
    console.log(`✅ Found ${driverUsers.length} DRIVER users (kept as-is)`);

    // Clean up any orphaned references
    console.log('\n🧹 Cleaning up orphaned references...');
    await User.updateMany(
      { assignedClients: { $exists: true } },
      { $set: { assignedClients: [] } }
    );
    await User.updateMany(
      { assignedVendors: { $exists: true } },
      { $set: { assignedVendors: [] } }
    );
    console.log('✅ Cleaned up orphaned references');

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateRoles();

