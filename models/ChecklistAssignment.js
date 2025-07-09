// models/ChecklistAssignment.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Sub-schema to snapshot tasks at completion time
const TaskSnapshotSchema = new Schema({
  originalTaskId: {
    type: Schema.Types.ObjectId,
    required: true,
    description: 'The ID of the task in the original Checklist document'
  },
  description: {
    type: String,
    required: true,
    description: 'The description of the task'
  },
  inputType: {
    type: String,
    enum: ['functional', 'measurement', 'visual'],
    required: true,
    description: 'The type of input expected for this task'
  },
  expectedUnit: {
    type: String,
    default: '',
    description: 'The unit expected for measurement tasks'
  }
}, { _id: false });

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
  assignedAt: {
    type: Date,
    default: Date.now,
    description: 'Timestamp when this assignment was created'
  },
  // Immutable snapshot of tasks at submission time
  tasksSnapshot: {
    type: [TaskSnapshotSchema],
    default: [],
    description: 'Copy of the Checklist.tasks when the assignment was completed'
  },
  // Responses keyed by originalTaskId
  responses: {
    type: Schema.Types.Mixed,
    default: {},
    description: 'Map of task responses; keys are originalTaskId strings'
  },
  completedAt: {
    type: Date,
    description: 'Timestamp when the technician submitted the assignment'
  },
  submittedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    description: 'User who completed and submitted this assignment'
  },
  isTemplate: {
    type: Boolean,
    default: true,
    description: 'True if this is a template (unfilled) assignment'
  },
  note: {
    type: String,
    default: '',
    description: 'Optional note entered by the technician'
  },
  verifiedBySpv: {
    type: Boolean,
    default: false,
    description: 'Flag indicating SPV has verified this completed assignment'
  },
  verifiedByManager: {
    type: Boolean,
    default: false,
    description: 'Flag indicating Manager has verified this completed assignment'
  },
  verifiedStatus: {
    type: String,
    enum: ['pending', 'rejected'],
    default: 'pending',
    description: 'Status set to "rejected" if SPV rejects the assignment'
  }
});

// Index for efficient template vs. completed lookups
ChecklistAssignmentSchema.index({ checklist: 1, isTemplate: 1 });

module.exports = mongoose.model('ChecklistAssignment', ChecklistAssignmentSchema);
