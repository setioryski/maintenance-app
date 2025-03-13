// models/Asset.js
const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  location: String,
  type: { type: String, required: true }, // e.g., Elektrikal, Mekanis, etc.
  floor: { type: String },                // Lantai
  zone: { type: String }                  // Zona
});

module.exports = mongoose.model('Asset', assetSchema);
