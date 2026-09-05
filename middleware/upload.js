
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),

  // Maximum file size: 50 MB
  limits: {
    fileSize: 50 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    // Allowed file extensions
    const allowedImageExt = [
      'jpg',
      'jpeg',
      'jfif',
      'png',
      'gif',
      'webp',
      'bmp',
      'tiff',
      'tif',
    ];

    const allowedVideoExt = [
      'mp4',
      'webm',
      'mov',
      'm4v',
      'ogg',
      'ogv',
      'mpeg',
      'mpg',
    ];

    // Get extension safely
    const ext = file.originalname
      .split('.')
      .pop()
      .toLowerCase();

    const isImage = allowedImageExt.includes(ext);
    const isVideo = allowedVideoExt.includes(ext);

    // Accept based on extension.
    // Browsers may send JFIF as image/jpeg or application/octet-stream.
    if (isImage || isVideo) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Only JPG, JPEG, JFIF, PNG, GIF, WEBP, BMP, TIFF, MP4, WEBM, MOV, M4V, OGG and OGV files are allowed'
        ),
        false
      );
    }
  },
});

module.exports = upload;
```
