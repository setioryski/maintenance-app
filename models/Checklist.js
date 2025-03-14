// models/Checklist.js
const mongoose = require('mongoose');

// Schema for each checklist task item
const checklistItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  inputType: {
    type: String,
    // Added "approval" as an option
    enum: ['voltage', 'pressure', 'temperature', 'text', 'number', 'other', 'approval'],
    default: 'other'
  },
  expectedUnit: { type: String, default: '' },
  actualValue: { type: mongoose.Schema.Types.Mixed, default: null },
  note: { type: String, default: '' },
  materialUsed: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  photos: [{ type: String }]
});

// Main checklist schema – note "assets" is an array
const checklistSchema = new mongoose.Schema({
  title: { type: String, required: true },
  assets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  tasks: [checklistItemSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Checklist', checklistSchema);
