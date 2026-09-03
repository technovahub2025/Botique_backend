require('dotenv').config();

const connectDB = require('./config/db');
const app = require('./app');
const ensureAdminExists = require('./utils/seedAdmin');
const {
  isOAuthConfigured,
  isDriveAuthorized,
  ensureDriveAccess,
  normalizeFolderId,
} = require('./utils/googleDrive');

const startServer = async () => {
  const dbConnected = await connectDB();
  if (!dbConnected) {
    console.error('Cannot start server: database connection failed.');
    process.exit(1);
  }

  await ensureAdminExists();

  const oauthConfigured = isOAuthConfigured();

  if (!oauthConfigured) {
    console.log('Google Drive OAuth storage: not configured');
    console.log('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GOOGLE_DRIVE_FOLDER_ID to enable.');
  } else {
    console.log('Google Drive OAuth configured: true');
    console.log('Google Drive folder ID:', normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID));

    if (!isDriveAuthorized()) {
      console.log('Google Drive authorization: not yet authorized');
      console.log('Visit /api/google-drive/auth to authorize Google Drive access.');
    } else {
      console.log('Google Drive authorization: refresh token available');
      try {
        const folderInfo = await ensureDriveAccess();
        console.log('Google Drive folder verified:', folderInfo.name);
      } catch (accessErr) {
        console.error('Google Drive folder access check FAILED:', accessErr.message);
        console.error('[Drive access diagnostic]', {
          errorName: accessErr.name,
          errorCode: accessErr.code,
          folderId: normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID),
          originalError: accessErr.originalError
            ? {
                code: accessErr.originalError.code,
                status: accessErr.originalError.status,
                statusText: accessErr.originalError.statusText,
                data: accessErr.originalError.data,
                message: accessErr.originalError.message,
              }
            : 'none',
        });
      }
    }
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
