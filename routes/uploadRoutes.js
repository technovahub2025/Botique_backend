const express = require('express');
const fsPromises = require('fs').promises;
const path = require('path');
const upload = require('../middleware/upload');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const asyncHandler = require('../middleware/asyncHandler');
const {
  uploadBufferToDrive,
  deleteDriveFile,
  loadGoogleDriveCredentials,
} = require('../utils/googleDrive');
const { getDriveImage } = require('../controllers/uploadController');

const router = express.Router();

router.get('/drive/:fileId', getDriveImage);

router.use(protect, admin);

const isDriveConfigured = () => {
  const { clientEmail, privateKey } = loadGoogleDriveCredentials();

  return !!(
    clientEmail &&
    privateKey &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
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
      console.error('Google Drive not configured. Cannot upload images.');
      const error = new Error('Google Drive storage is not configured on the server.');
      error.statusCode = 503;
      throw error;
    }

    let driveResult;
    try {
      driveResult = await uploadBufferToDrive(buffer, originalname, mimetype);
    } catch (driveErr) {
      console.error('Google Drive upload failed:', {
        message: driveErr.message,
        code: driveErr.code,
        status: driveErr.response?.status,
        statusText: driveErr.response?.statusText,
        responseData: JSON.stringify(driveErr.response?.data),
      });
      const error = new Error(
        driveErr.code === 'DRIVE_CONFIG_ERROR' || driveErr.code === 'DRIVE_AUTH_ERROR'
          ? driveErr.message
          : 'Failed to upload image to Google Drive. Please check server configuration and try again.'
      );
      error.statusCode = 503;
      throw error;
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
