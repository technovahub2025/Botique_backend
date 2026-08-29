require('dotenv').config();

const connectDB = require('./config/db');
const app = require('./app');
const ensureAdminExists = require('./utils/seedAdmin');

const startServer = async () => {
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.error('Cannot start server: database connection failed.');
    process.exit(1);
  }

  await ensureAdminExists();

  const PORT = process.env.PORT || 8000;
  const server = app.listen(PORT, () => {
    (`Server running on port ${PORT} (${process.env.NODE_ENV})`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other process or change PORT.`);
      process.exit(1);
    }
    throw error;
  });
};

startServer();
