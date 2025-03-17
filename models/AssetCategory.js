// models/AssetCategory.js
const mongoose = require('mongoose');

const assetCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
});

module.exports = mongoose.model('AssetCategory', assetCategorySchema);
