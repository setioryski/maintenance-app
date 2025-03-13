// models/Checklist.js
const mongoose = require('mongoose');

// Schema for each checklist task item
const checklistItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  inputType: {
    type: String,
    enum: ['voltage', 'pressure', 'temperature', 'text', 'number', 'other'],
    default: 'other'
  },
  expectedUnit: { type: String, default: '' },
  actualValue: { type: Number, default: null },
  note: { type: String, default: '' },
  materialUsed: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  photos: [{ type: String }] // Array to store photo file paths or URLs
});

// Main checklist schema
const checklistSchema = new mongoose.Schema({
  title: { type: String, required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
  tasks: [checklistItemSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // SPV that created the checklist
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Checklist', checklistSchema);
