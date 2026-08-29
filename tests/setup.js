const mongoose = require('mongoose');
const connectDB = require('../config/db');

beforeAll(async () => {
  await connectDB();
});

afterAll(async () => {
  await mongoose.disconnect();
  if (global.__mongoMemoryInstance) {
    await global.__mongoMemoryInstance.stop();
  }
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
