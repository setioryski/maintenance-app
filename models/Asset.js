// models/Asset.js
const mongoose = require('mongoose');

// Example of a model referencing an AssetCategory
const assetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  location: String,
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', required: true },
  floor: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor' },
  zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }
});

module.exports = mongoose.model('Asset', assetSchema);

