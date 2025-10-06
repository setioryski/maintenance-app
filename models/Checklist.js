// models/Checklist.js
const mongoose = require('mongoose');
// Require the assignment model so we can delete its docs in the hook
const ChecklistAssignment = require('./ChecklistAssignment');

const checklistItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  inputType: {
    type: String,
    enum: ['functional','measurement'/*,'visual'*/],
    required: true
  },
  expectedUnit: { type: String, default: '' },
  // Add these fields for optional measurement range
  minRange: { type: Number, default: null },
  maxRange: { type: Number, default: null },
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
  division: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' }, // BARIS DITAMBAHKAN
  createdAt: { type: Date, default: Date.now }
});

// MODIFY THIS HOOK
// This hook will now run before a `deleteOne()` operation on a Checklist.
// It ensures that only template assignments are deleted, preserving completed reports.
checklistSchema.pre('deleteOne', { document: false, query: true }, async function(next) {
  try {
    const checklistId = this.getQuery()['_id'];
    if (checklistId) {
      // Delete only the template assignments, not the completed ones.
      await ChecklistAssignment.deleteMany({
        checklist: checklistId,
        isTemplate: true
      });
    }
    next();
  } catch (err) {
    next(err);
  }
});


module.exports = mongoose.model('Checklist', checklistSchema);