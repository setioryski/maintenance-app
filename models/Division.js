// models/Division.js
const mongoose = require('mongoose');

const divisionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Optionally, store list of SPV IDs
  spvs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Division', divisionSchema);
