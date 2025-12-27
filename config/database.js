const mongoose = require('mongoose');

const connectDB = async () => {
  // Check if MongoDB URI is configured
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not found in environment variables.');
    console.error('❌ MongoDB connection is required. Please set MONGODB_URI in your environment variables.');
    console.error('📝 Example: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority');
    console.error('📝 For Render.com: Set MONGODB_URI in your service environment variables');
    process.exit(1);
  }

  // Check if MONGODB_URI is pointing to localhost (won't work in production/cluster)
  if (process.env.MONGODB_URI.includes('localhost') || process.env.MONGODB_URI.includes('127.0.0.1')) {
    console.error('❌ MONGODB_URI is set to localhost, which will not work in a cluster/production environment.');
    console.error('❌ Please set MONGODB_URI to a remote MongoDB instance (e.g., MongoDB Atlas).');
    console.error('📝 Example: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority');
    console.error('📝 Current MONGODB_URI:', process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')); // Hide credentials
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
    
    // Provide helpful error messages based on error type
    if (error.message.includes('ECONNREFUSED') || error.message.includes('localhost') || error.message.includes('127.0.0.1')) {
      console.error('');
      console.error('⚠️  Connection refused to localhost MongoDB.');
      console.error('⚠️  This usually means:');
      console.error('   1. MONGODB_URI is set to localhost (mongodb://localhost:27017/...)');
      console.error('   2. MONGODB_URI is not set and defaulting to localhost');
      console.error('   3. For production/cluster deployment, you MUST use a remote MongoDB (e.g., MongoDB Atlas)');
      console.error('');
      console.error('📝 To fix:');
      console.error('   1. Get a MongoDB Atlas connection string (or use another remote MongoDB service)');
      console.error('   2. Set MONGODB_URI in your cluster environment variables');
      console.error('   3. Format: mongodb+srv://username:password@cluster.mongodb.net/halo?retryWrites=true&w=majority');
      console.error('');
      if (process.env.MONGODB_URI) {
        const maskedUri = process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
        console.error('   Current MONGODB_URI:', maskedUri);
      }
    }
    
    process.exit(1);
  }
};

module.exports = connectDB;
