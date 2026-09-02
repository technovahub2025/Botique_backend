const { getFileMetadata, downloadFileStream } = require('../utils/googleDrive');

const IMAGE_MIME_TYPES = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
  'image/svg+xml': 'image/svg+xml',
  'image/bmp': 'image/bmp',
  'image/tiff': 'image/tiff',
  'application/octet-stream': 'application/octet-stream',
};

const streamFile = (res, stream, mimeType, contentLength) => {
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  stream.on('error', (err) => {
    console.error('Stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Error streaming file');
    }
  });
  stream.pipe(res);
};

const getDriveImage = async (req, res, next) => {
  const { fileId } = req.params;

  if (!fileId) {
    return res.status(400).json({ success: false, message: 'File ID is required' });
  }

  try {
    let mimeType = req.query.mime || 'image/jpeg';

    if (mimeType in IMAGE_MIME_TYPES) {
      mimeType = IMAGE_MIME_TYPES[mimeType];
    }

    try {
      const metadata = await getFileMetadata(fileId);
      mimeType = metadata.mimeType || mimeType;
    } catch (metaErr) {
      if (metaErr.code !== 'DRIVE_FILE_NOT_FOUND' && metaErr.code !== 404) {
        console.error('Failed to fetch metadata:', metaErr.message);
      }
    }

    const stream = await downloadFileStream(fileId);
    streamFile(res, stream, mimeType);
  } catch (err) {
    if (err.code === 'DRIVE_FILE_NOT_FOUND' || err.code === 404) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }
    if (err.code === 403) {
      return res.status(403).json({ success: false, message: 'Access denied to file' });
    }
    console.error('Drive proxy error:', err.message);
    next(err);
  }
};

module.exports = { getDriveImage };
