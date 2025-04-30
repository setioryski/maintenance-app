// models/ChecklistAssignment.js
const mongoose = require('mongoose');

const checklistAssignmentSchema = new mongoose.Schema({
  checklist: { type: mongoose.Schema.Types.ObjectId, ref: 'Checklist', required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assignedAt: { type: Date, default: Date.now },
  responses: { type: Object },
  completedAt: { type: Date },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isTemplate: { type: Boolean, default: true },
  note: { type: String, default: '' },

  // 🔄 NEW VERIFICATION FIELDS
  verifiedBySpv: { type: Boolean, default: false },
  verifiedByManager: { type: Boolean, default: false }
});

module.exports = mongoose.model('ChecklistAssignment', checklistAssignmentSchema);
