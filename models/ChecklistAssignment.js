// models/ChecklistAssignment.js
const mongoose = require('mongoose');

const checklistAssignmentSchema = new mongoose.Schema({
  checklist: { type: mongoose.Schema.Types.ObjectId, ref: 'Checklist', required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assignedAt: { type: Date, default: Date.now },
  responses: { type: Object },  // Menyimpan jawaban teknisi, keyed by taskId
  completedAt: { type: Date },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Flag untuk menandai record sebagai template (dibuat oleh SPV) atau submission (hasil pengisian teknisi)
  isTemplate: { type: Boolean, default: true }
});

module.exports = mongoose.model('ChecklistAssignment', checklistAssignmentSchema);
