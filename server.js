require('dotenv').config();

const connectDB = require('./config/db');
const app = require('./app');
const ensureAdminExists = require('./utils/seedAdmin');
const { getDriveClient, ensureDriveAccess } = require('./utils/googleDrive');

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
    console.log('Google Drive storage configured: true');
    console.log('Google Drive folder:', process.env.GOOGLE_DRIVE_FOLDER_ID);
    console.log('Google Drive service account:', process.env.GOOGLE_CLIENT_EMAIL);
    try {
      const folderInfo = await ensureDriveAccess();
      console.log('Google Drive folder verified:', folderInfo.name);
    } catch (accessErr) {
      console.error('Google Drive folder access check FAILED:', accessErr.message);
      console.error('[Drive access diagnostic]', {
        errorName: accessErr.name,
        errorCode: accessErr.code,
        errorMessage: accessErr.message,
        folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
        serviceAccount: process.env.GOOGLE_CLIENT_EMAIL,
        hasProjectId: !!process.env.GOOGLE_PROJECT_ID,
        originalError: accessErr.originalError
          ? {
              code: accessErr.originalError.code,
              status: accessErr.originalError.status,
              statusText: accessErr.originalError.statusText,
              data: JSON.stringify(accessErr.originalError.data, null, 2),
              message: accessErr.originalError.message,
            }
          : 'none',
      });
      console.error('Check: service account email has been granted access to this folder.');
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
