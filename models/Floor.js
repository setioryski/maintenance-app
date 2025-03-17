// models/Floor.js
const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
});

module.exports = mongoose.model('Floor', floorSchema);
