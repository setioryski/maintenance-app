// models/Zone.js
const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  floor: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor', required: true },
  division: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: true } // Added division reference
});

// Optional: Add index for faster lookups based on floor and division
zoneSchema.index({ floor: 1, division: 1 });

module.exports = mongoose.model('Zone', zoneSchema);