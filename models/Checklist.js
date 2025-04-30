// models/Checklist.js
const mongoose = require('mongoose');
// Require the assignment model so we can delete its docs in the hook
const ChecklistAssignment = require('./ChecklistAssignment');

const checklistItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  inputType: {
    type: String,
    enum: ['functional','measurement','visual'],
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
  order: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// ←── Add this pre-remove hook:
checklistSchema.pre('remove', async function(next) {
  try {
    // Delete all assignments referencing this checklist
    await ChecklistAssignment.deleteMany({ checklist: this._id });
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Checklist', checklistSchema);
