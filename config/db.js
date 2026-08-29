require('dotenv').config();

const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    console.error('MONGODB_URI is not configured. Please set MONGODB_URI in your .env file.');
    return false;
  }

  try {
    mongoose.set('debug', process.env.NODE_ENV === 'development');

    const conn = await mongoose.connect(mongoURI);

    (`MongoDB connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    return false;
  }
};

module.exports = connectDB;
