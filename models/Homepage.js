const mongoose = require('mongoose');

const homepageSectionSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: true },
  data: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const homepageSchema = new mongoose.Schema(
  {
    sections: [homepageSectionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Homepage', homepageSchema);
