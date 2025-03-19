// models/Checklist.js
const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  inputType: {
    type: String,
    enum: ['visual', 'measurement', 'functional'],
    required: true
  },
  expectedUnit: { type: String, default: '' },
  actualValue: { type: Number, default: null },
  note: { type: String, default: '' },
  materialUsed: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  photos: [{ type: String }]
});

const checklistSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tasks: [checklistItemSchema],
  // New field to store the order/position
  order: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Checklist', checklistSchema);
