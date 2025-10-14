// models/MaintenanceReport.js
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
  },
  minRange: {
    type: Number,
    default: null
  },
  maxRange: {
    type: Number,
    default: null
  }
}, { _id: false });

// Sub-schema to snapshot asset details at completion time
const AssetSnapshotSchema = new Schema({
  name: { type: String, required: true },
  description: String,
  location: String,
  category: String, // Storing category name as string
  floor: String,    // Storing floor name as string
  zone: String,     // Storing zone name as string
  division: String // Storing division name as string
}, { _id: false });


// Main schema for the maintenance report
const MaintenanceReportSchema = new Schema({
  assignment: {
    type: Schema.Types.ObjectId,
    ref: 'ChecklistAssignment',
    required: true,
    description: 'Reference to the original ChecklistAssignment'
  },
  checklistTitle: {
    type: String,
    required: true,
    description: 'The title of the checklist at the time of submission.'
  },
  assetSnapshot: {
      type: AssetSnapshotSchema,
      required: true,
      description: 'Snapshot of the asset details at the time of submission.'
  },
  division: {
      type: Schema.Types.ObjectId,
      ref: 'Division',
      required: true
  },
  tasksSnapshot: {
    type: [TaskSnapshotSchema],
    default: [],
    description: 'Copy of the Checklist.tasks when the report was submitted'
  },
  responses: {
    type: Schema.Types.Mixed,
    default: {},
    description: 'Map of task responses; keys are originalTaskId strings'
  },
  completedAt: {
    type: Date,
    default: Date.now,
    description: 'Timestamp when the technician submitted the report'
  },
  submittedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    description: 'User who completed and submitted this report'
  },
  submittedByName: {
    type: String,
    description: 'Name of the user who submitted the report at the time of submission.'
  },
  note: {
    type: String,
    default: '',
    description: 'Optional note entered by the technician'
  },
  verifiedBySpv: { type: Boolean, default: false },
  verifiedByManager: { type: Boolean, default: false },
  verifiedBySpvUser: { type: Schema.Types.ObjectId, ref: 'User' },
  verifiedByManagerUser: { type: Schema.Types.ObjectId, ref: 'User' },
  verifiedBySpvUserName: { type: String },
  verifiedByManagerUserName: { type: String },
  rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectedByName: { type: String },
  verifiedStatus: {
    type: String,
    enum: ['pending', 'rejected'],
    default: 'pending',
    description: 'Status set to "rejected" if an SPV or Manager rejects the report'
  },
  hasAlert: {
    type: Boolean,
    default: false,
    description: 'True if a measurement is out of range OR a functional test has failed.'
  }
});

module.exports = mongoose.model('MaintenanceReport', MaintenanceReportSchema);