const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

async function seedSuperAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/halo';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ email: 'superadmin@halo.com' });
    
    if (existingSuperAdmin) {
      console.log('ℹ️  Super Admin already exists, updating protection flag...');
      existingSuperAdmin.isProtected = true;
      existingSuperAdmin.role = 'SUPER_ADMIN';
      await existingSuperAdmin.save();
      console.log('✅ Super Admin updated with protection flag');
    } else {
      // Create super admin
      const superAdmin = new User({
        username: 'superadmin',
        email: 'superadmin@halo.com',
        password: 'superadmin123',
        role: 'SUPER_ADMIN',
        profile: {
          firstName: 'Super',
          lastName: 'Admin',
          phone: '+1234567890'
        },
        isProtected: true,
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

      await superAdmin.save();
      console.log('✅ Super Admin created successfully!');
      console.log('   Email: superadmin@halo.com');
      console.log('   Password: superadmin123');
      console.log('   Role: SUPER_ADMIN');
      console.log('   Protected: true');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run seed
seedSuperAdmin();

