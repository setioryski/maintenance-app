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
  division: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' }
});

// ADD THIS HOOK
// Before an asset is deleted, remove all of its template checklist assignments.
assetSchema.pre('findOneAndDelete', async function(next) {
  try {
    const assetId = this.getQuery()['_id'];
    if (assetId) {
      await ChecklistAssignment.deleteMany({ asset: assetId, isTemplate: true });
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Asset', assetSchema);