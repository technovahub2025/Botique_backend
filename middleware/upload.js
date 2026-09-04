const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),

  // Maximum file size: 50 MB
  limits: {
    fileSize: 50 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|webm|ogg/;

    const ext = file.originalname.split('.').pop().toLowerCase();

    const isValidMime = allowed.test(file.mimetype);
    const isValidExt = allowed.test(ext);

    if (isValidMime && isValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  },
});

module.exports = upload;