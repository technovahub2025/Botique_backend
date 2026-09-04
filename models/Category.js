const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    image: { type: String, default: '' },
    imageMetadata: {
      driveFileId: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
    video: { type: String, default: '' },
    videoMetadata: {
      driveFileId: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Category', categorySchema);
