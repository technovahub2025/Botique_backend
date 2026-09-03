require('dotenv').config();

const connectDB = require('./config/db');
const app = require('./app');
const ensureAdminExists = require('./utils/seedAdmin');
const { getDriveClient, ensureDriveAccess, loadGoogleDriveCredentials } = require('./utils/googleDrive');

const startServer = async () => {
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.error('Cannot start server: database connection failed.');
    process.exit(1);
  }

  await ensureAdminExists();

  const { clientEmail, privateKey } = loadGoogleDriveCredentials();
  if (clientEmail && privateKey && process.env.GOOGLE_DRIVE_FOLDER_ID) {
    try {
      getDriveClient();
      console.log('Google Drive storage configured: true');
      console.log('Google Drive folder:', process.env.GOOGLE_DRIVE_FOLDER_ID);
      try {
        const folderInfo = await ensureDriveAccess();
        console.log('Google Drive folder verified:', folderInfo.name);
      } catch (accessErr) {
        console.warn('Google Drive folder access check warning:', accessErr.message);
      }
    } catch (err) {
      console.error('Google Drive storage configured with errors:', err.message);
    }
  } else {
    console.log('Google Drive storage not configured. Uploads will fail.');
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
