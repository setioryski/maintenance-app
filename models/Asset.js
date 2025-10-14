// models/Asset.js
const mongoose = require('mongoose');
const ChecklistAssignment = require('./ChecklistAssignment'); // Ensure this is required

// Example of a model referencing an AssetCategory
const assetSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  location: String,
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetCategory', required: true },
  floor: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor' },
  zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
  division: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' },
  order: { type: Number, default: 0 }, // Add this line
  qrCode: { type: String } // Add this line for QR Code
});

// UPDATED HOOK
// Before an asset is deleted, this hook now also deletes associated Maintenance Reports.
assetSchema.pre('findOneAndDelete', async function(next) {
  try {
    const assetId = this.getQuery()['_id'];
    if (assetId) {
      await ChecklistAssignment.deleteMany({ asset: assetId });
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Asset', assetSchema);