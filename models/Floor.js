// models/Floor.js
const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
}, {
  // Opsi untuk menyertakan virtuals saat data diubah menjadi JSON
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// -- TAMBAHKAN BLOK INI --
// Membuat field 'zones' virtual yang tidak disimpan di database
floorSchema.virtual('zones', {
  ref: 'Zone', // Model yang akan dihubungkan
  localField: '_id', // Field dari model Floor (saat ini)
  foreignField: 'floor' // Field dari model Zone yang cocok
});

module.exports = mongoose.model('Floor', floorSchema);