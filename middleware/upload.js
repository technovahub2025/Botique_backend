const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),

  // Maximum file size: 50 MB
  limits: {
    fileSize: 50 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const allowedImageMime = /jpeg|jpg|png|gif|webp|bmp|tiff/;
    const allowedVideoMime = /mp4|webm|quicktime|ogg|mpeg/;
    const allowedExt = /jpeg|jpg|png|gif|webp|bmp|tiff|mp4|webm|mov|m4v|ogg|ogv/;

    const ext = file.originalname.split('.').pop().toLowerCase();

    const isImageMime = allowedImageMime.test(file.mimetype);
    const isVideoMime = allowedVideoMime.test(file.mimetype);
    const isValidExt = allowedExt.test(ext);

    if ((isImageMime || isVideoMime) && isValidExt) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  },
});

module.exports = upload;