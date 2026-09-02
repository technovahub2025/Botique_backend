require('dotenv').config();

const connectDB = require('./config/db');
const app = require('./app');
const ensureAdminExists = require('./utils/seedAdmin');
const { getDriveClient } = require('./utils/googleDrive');

const startServer = async () => {
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.error('Cannot start server: database connection failed.');
    process.exit(1);
  }

  await ensureAdminExists();

  if (
    process.env.GOOGLE_CLIENT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  ) {
    try {
      getDriveClient();
      console.log('Google Drive storage configured.');
    } catch (err) {
      console.error('Google Drive storage configured with errors:', err.message);
    }
  } else {
    console.log('Google Drive storage not configured. Falling back to local uploads.');
  }

  const PORT = process.env.PORT || 8000;
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (${process.env.NODE_ENV})`);
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
