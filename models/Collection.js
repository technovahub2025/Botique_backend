const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    heroImage: { type: String, default: '' },
    heroImageMetadata: {
      driveFileId: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
    heroVideo: { type: String, default: '' },
    heroVideoMetadata: {
      driveFileId: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
    bannerImage: { type: String, default: '' },
    bannerImageMetadata: {
      driveFileId: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
    bannerVideo: { type: String, default: '' },
    bannerVideoMetadata: {
      driveFileId: { type: String },
      originalName: { type: String },
      mimeType: { type: String },
    },
    featured: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Collection', collectionSchema);
