const express = require('express');
const fsPromises = require('fs').promises;
const path = require('path');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const asyncHandler = require('../middleware/asyncHandler');
const { uploadBufferToDrive, deleteDriveFile, loadGoogleDriveCredentials } = require('../utils/googleDrive');
const { getDriveImage } = require('../controllers/uploadController');

const router = express.Router();

router.get('/drive/:fileId', getDriveImage);

router.use(protect, admin);

const isDriveConfigured = () => {
  const { clientEmail, privateKey } = loadGoogleDriveCredentials();
  return Boolean(
    clientEmail &&
    privateKey &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
};

const logDriveEnvCheck = () => {
  const { clientEmail } = loadGoogleDriveCredentials();
  console.error('[Drive env check]', {
    hasProjectId: !!process.env.GOOGLE_PROJECT_ID,
    hasClientEmail: !!process.env.GOOGLE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
    hasFolderId: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
    clientEmail: clientEmail,
    folderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
  });
};

const logDriveError = (err) => {
  console.error('[Drive upload diagnostic]', {
    errorName: err.name,
    errorMessage: err.message,
    errorCode: err.code,
    status: err.status,
    responseStatus: err.response?.status,
    responseStatusText: err.response?.statusText,
    responseData: JSON.stringify(err.response?.data, null, 2),
    errorKeys: Object.keys(err).filter(k => k !== 'response').join(', '),
    responseKeys: err.response ? Object.keys(err.response).join(', ') : 'none',
    originalError: err.originalError
      ? {
          code: err.originalError.code,
          status: err.originalError.status,
          statusText: err.originalError.statusText,
          data: JSON.stringify(err.originalError.data),
          message: err.originalError.message,
        }
      : 'none',
  });
};

router.post(
  '/',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      const error = new Error('No image uploaded');
      error.statusCode = 400;
      throw error;
    }

    const { originalname, mimetype, buffer } = req.file;
    const base = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;

    if (!isDriveConfigured()) {
      logDriveEnvCheck();
      console.error('Google Drive not configured. Cannot upload images.');
      const error = new Error('Google Drive storage is not configured on the server.');
      error.statusCode = 503;
      throw error;
    }

    let driveResult;
    try {
      driveResult = await uploadBufferToDrive(buffer, originalname, mimetype);
    } catch (driveErr) {
      logDriveError(driveErr);
      logDriveEnvCheck();
      throw new Error('Failed to upload image to Google Drive. Please check server configuration and try again.');
    }

    const proxyUrl = `${base}/api/upload/drive/${driveResult.driveFileId}`;

    res.status(201).json({
      success: true,
      url: proxyUrl,
      filename: originalname,
      driveFileId: driveResult.driveFileId,
      originalName: driveResult.name,
      mimeType: driveResult.mimeType,
    });
  })
);

router.delete(
  '/:fileId',
  asyncHandler(async (req, res) => {
    const { fileId } = req.params;

    if (!fileId) {
      const error = new Error('File ID is required');
      error.statusCode = 400;
      throw error;
    }

    if (isDriveConfigured()) {
      try {
        await deleteDriveFile(fileId);
        res.status(200).json({ success: true, message: 'File deleted from Google Drive' });
        return;
      } catch (err) {
        if (err.code === 'DRIVE_FILE_NOT_FOUND' || err.code === 404) {
          res.status(200).json({ success: true, message: 'File already deleted' });
          return;
        }
        console.error('Google Drive delete failed:', err.message);
        throw err;
      }
    }

    const localFile = path.join(__dirname, '..', 'uploads', fileId);
    try {
      await fsPromises.unlink(localFile);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }

    res.status(200).json({ success: true, message: 'File deleted' });
  })
);

module.exports = router;
