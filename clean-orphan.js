// cleanup-orphans.js
require('dotenv').config();
const mongoose = require('mongoose');
const ChecklistAssignment = require('./models/ChecklistAssignment');

async function cleanup() {
  try {
    // Connect without deprecated flags
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for cleanup.');

    // Delete any assignments whose checklist ref is null
    const result = await ChecklistAssignment.deleteMany({ checklist: null });
    console.log(`Orphan assignments removed: ${result.deletedCount}`);
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB. Exiting.');
    process.exit(0);
  }
}

cleanup();
