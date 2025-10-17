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

// Add a compound index to ensure checklist titles are unique per division
checklistSchema.index({ title: 1, division: 1 }, { unique: true });

// MODIFIED HOOK: When a checklist is deleted, remove all assignments that use it.
// This will NOT delete the historical MaintenanceReports.
checklistSchema.pre('deleteOne', { document: false, query: true }, async function(next) {
  try {
    const checklistId = this.getQuery()['_id'];
    if (checklistId) {
      // Delete only the template assignments, not the completed reports.
      await ChecklistAssignment.deleteMany({
        checklist: checklistId
      });
    }
    next();
  } catch (err) {
    next(err);
  }
});


module.exports = mongoose.model('Checklist', checklistSchema);