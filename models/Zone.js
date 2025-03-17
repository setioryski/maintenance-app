// models/Zone.js
const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true },
  floor: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor', required: true }
});

module.exports = mongoose.model('Zone', zoneSchema);
