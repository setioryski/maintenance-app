// models/ChecklistAssignment.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Main schema for checklist assignments
const ChecklistAssignmentSchema = new Schema({
  checklist: {
    type: Schema.Types.ObjectId,
    ref: 'Checklist',
    required: true,
    description: 'Reference to the checklist template'
  },
  asset: {
    type: Schema.Types.ObjectId,
    ref: 'Asset',
    required: true,
    description: 'Reference to the asset this assignment belongs to'
  },
  division: {
      type: Schema.Types.ObjectId,
      ref: 'Division',
      required: true
  },
  assignedAt: {
    type: Date,
    default: Date.now,
    description: 'Timestamp when this assignment was created'
  }
});

// Index for efficient lookups
ChecklistAssignmentSchema.index({ checklist: 1, asset: 1 });

module.exports = mongoose.model('ChecklistAssignment', ChecklistAssignmentSchema);