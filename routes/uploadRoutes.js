const express = require('express');
const fsPromises = require('fs').promises;
const upload = require('../middleware/upload');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const asyncHandler = require('../middleware/asyncHandler');
const { uploadBufferToDrive, deleteDriveFile } = require('../utils/googleDrive');
const { getDriveImage } = require('../controllers/uploadController');

const router = express.Router();

router.get('/drive/:fileId', getDriveImage);

router.use(protect, admin);

const isDriveConfigured = () => {
  return !!(
    process.env.GOOGLE_CLIENT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
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

    if (isDriveConfigured()) {
      try {
        const driveResult = await uploadBufferToDrive(buffer, originalname, mimetype);

        const base = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
        const proxyUrl = `${base}/api/uploads/drive/${driveResult.driveFileId}`;

        res.status(201).json({
          success: true,
          url: proxyUrl,
          filename: originalname,
          driveFileId: driveResult.driveFileId,
          originalName: driveResult.name,
          mimeType: driveResult.mimeType,
        });
        return;
      } catch (driveErr) {
        if (driveErr.code === 'DRIVE_CONFIG_ERROR' || driveErr.code === 'DRIVE_FOLDER_ERROR') {
          console.error('Google Drive upload skipped:', driveErr.message);
        } else {
          console.error('Google Drive upload failed, falling back to local:', driveErr.message);
        }
      }
    }

    const crypto = require('crypto');
    const path = require('path');
    const ext = path.extname(originalname);
    const localFilename = `${crypto.randomUUID()}${ext}`;
    const localPath = path.join(__dirname, '..', 'uploads', localFilename);
    await fsPromises.writeFile(localPath, buffer);

    const base = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const url = `${base}/uploads/${localFilename}`;
    res.status(201).json({ success: true, url, filename: localFilename });
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
        if (err.code !== 'DRIVE_FILE_NOT_FOUND') {
          console.error('Google Drive delete failed:', err.message);
        }
      }
    }

    const path = require('path');
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
