// seed2.js
// This script initializes a comprehensive 50-item checklist for every division.

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import models
const Division = require(path.join(__dirname, 'models', 'Division'));
const User = require(path.join(__dirname, 'models', 'User'));
const Checklist = require(path.join(__dirname, 'models', 'Checklist'));

// --- Configuration ---
// Maps each division name to the email of the SPV who will be the creator of the checklist.
const divisionSpvMap = {
    'ELEKTRONIK': 'zulham@delipark.com',
    'ELEKTRIKAL': 'arif@delipark.com',
    'PLUMBING': 'spv.plumbing@delipark.com',
    'MEKANIKAL': 'spv.mekanikal@delipark.com',
    'SIPIL': 'spv.sipil@delipark.com',
    'HVAC': 'spv.hvac@delipark.com'
};

/**
 * Generates an array of 50 task items for a checklist.
 * @returns {Array<Object>} An array of 50 task objects.
 */
function generate50Tasks() {
    const tasks = [];
    for (let i = 1; i <= 50; i++) {
        // We can alternate task types for variety
        const isMeasurement = i % 3 === 0;
        tasks.push({
            description: `Standard Operating Procedure #${i}`,
            inputType: isMeasurement ? 'measurement' : 'functional',
            expectedUnit: isMeasurement ? 'N/A' : '',
            minRange: isMeasurement ? 0 : null,
            maxRange: isMeasurement ? 100 : null,
        });
    }
    return tasks;
}

/**
 * Seeds the database with one 50-item checklist per division.
 */
async function seedChecklistsWith50Tasks() {
    console.log('Starting to seed 50-item checklists for each division...');

    for (const [divisionName, spvEmail] of Object.entries(divisionSpvMap)) {
        try {
            const division = await Division.findOne({ name: divisionName });
            const user = await User.findOne({ email: spvEmail });

            if (!division || !user) {
                console.warn(`Skipping division "${divisionName}": Could not find division or SPV user (${spvEmail}).`);
                continue;
            }

            const checklistTitle = `Comprehensive 50-Point Checklist for ${divisionName}`;
            const existingChecklist = await Checklist.findOne({ title: checklistTitle });

            if (existingChecklist) {
                console.log(`Checklist "${checklistTitle}" already exists. Skipping.`);
                continue;
            }

            const tasks = generate50Tasks();

            await Checklist.create({
                title: checklistTitle,
                tasks: tasks,
                createdBy: user._id,
                division: division._id
            });

            console.log(`✅ Successfully created checklist: "${checklistTitle}"`);

        } catch (error) {
            console.error(`❌ Failed to create checklist for division "${divisionName}":`, error);
        }
    }
}

/**
 * Main function to connect to the database, run the seeder, and disconnect.
 */
async function main() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/maintenance-app-socket';
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB for seeding.');
        await seedChecklistsWith50Tasks();
    } catch (err) {
        console.error('An error occurred during the seeding process:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Seeding process finished. Disconnected from MongoDB.');
    }
}

main();