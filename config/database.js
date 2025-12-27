const mongoose = require('mongoose');

const connectDB = async () => {
  // Check if MongoDB URI is configured
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables.');
    console.error('❌ MongoDB connection is required. Please set MONGODB_URI in your .env file.');
    console.error('📝 Example: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 10000, // Keep trying to send operations for 10 seconds
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
    console.error('❌ Database connection failed:', error.message);
    console.error('❌ MongoDB connection is required. Please check your MONGODB_URI and ensure MongoDB is accessible.');
    process.exit(1);
  }
};

module.exports = connectDB;
