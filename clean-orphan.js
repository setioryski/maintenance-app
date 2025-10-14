// cleanup-orphans.js
require('dotenv').config();
const mongoose = require('mongoose');
const MaintenanceReport = require('./models/MaintenanceReport');
const ChecklistAssignment = require('./models/ChecklistAssignment');

async function cleanup() {
  try {
    // Connect without deprecated flags
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for cleanup.');

    // Find all valid assignment IDs
    const validAssignmentIds = await ChecklistAssignment.find().distinct('_id');

    // Delete any reports where the assignment ref is null or not in the valid list
    const result = await MaintenanceReport.deleteMany({ 
      assignment: { $nin: validAssignmentIds } 
    });
    console.log(`Orphaned maintenance reports removed: ${result.deletedCount}`);

  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB. Exiting.');
    process.exit(0);
  }
}

cleanup();