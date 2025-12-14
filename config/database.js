const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MongoDB URI is configured
    if (!process.env.MONGODB_URI) {
      console.warn('⚠️ MONGODB_URI not found in environment variables.');
      console.warn('⚠️ Using in-memory mode for demo purposes.');
      console.warn('⚠️ Data will not persist between server restarts.');
      console.warn('📝 To enable database: Create .env file and set MONGODB_URI');
      console.warn('📝 See MONGODB_SETUP_GUIDE.md for instructions\n');
      return null;
    }

    // Allow local MongoDB connections (for local development)
    // Only skip if it's the exact default localhost URI without actual setup

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.warn('⚠️ Database connection failed:', error.message);
    console.warn('⚠️ Running in demo mode without database persistence.');
    return null;
  }
};

module.exports = connectDB;
