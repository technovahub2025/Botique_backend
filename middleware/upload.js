const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = file.originalname.split('.').pop().toLowerCase();
    const isValidMime = allowed.test(file.mimetype);
    const isValidExt = allowed.test(ext);

    if (isValidMime && isValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

module.exports = upload;
