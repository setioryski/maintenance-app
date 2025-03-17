// models/ChecklistAssignment.js
const mongoose = require('mongoose');

const checklistAssignmentSchema = new mongoose.Schema({
  checklist: { type: mongoose.Schema.Types.ObjectId, ref: 'Checklist', required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assignedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChecklistAssignment', checklistAssignmentSchema);
