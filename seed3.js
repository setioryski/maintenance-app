// seed3.js
// This script initializes 100 assets for every division on different floors and zones,
// with asset categories relevant to each division.

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import models
const Division = require(path.join(__dirname, 'models', 'Division'));
const Asset = require(path.join(__dirname, 'models', 'Asset'));
const Floor = require(path.join(__dirname, 'models', 'Floor'));
const Zone = require(path.join(__dirname, 'models', 'Zone'));
const AssetCategory = require(path.join(__dirname, 'models', 'AssetCategory'));

// Define which asset categories belong to which division
const divisionCategoryMap = {
    'ELEKTRONIK': ['CCTV', 'Fire Alarm', 'Panoramic'],
    'ELEKTRIKAL': ['Generator'],
    'PLUMBING': ['Pump'],
    'MEKANIKAL': ['Elevator'],
    'HVAC': ['AHU'],
    'SIPIL': ['Pillar']
};

/**
 * Seeds the database with 100 assets per division.
 */
async function seed100Assets() {
    console.log('Starting to seed 100 assets for each division...');

    const divisions = await Division.find({});
    const floors = await Floor.find({});
    const allZones = await Zone.find({});
    const allCategories = await AssetCategory.find({});

    if (divisions.length === 0 || floors.length === 0 || allZones.length === 0 || allCategories.length === 0) {
        console.error('Could not find divisions, floors, zones, or asset categories. Please run the initial seed script (seed.js) first.');
        return;
    }

    for (const division of divisions) {
        console.log(`\nSeeding assets for division: ${division.name}`);

        const categoryNames = divisionCategoryMap[division.name] || [];
        let categoriesForDivision = await AssetCategory.find({ name: { $in: categoryNames } });

        // If a division has no specific categories mapped, use a few general ones as a fallback.
        if (categoriesForDivision.length === 0) {
            console.log(`No specific categories found for ${division.name}, using general categories.`);
            categoriesForDivision = allCategories.slice(0, 2); // Fallback to first 2 categories
        }

        for (let i = 1; i <= 100; i++) {
            const floor = floors[i % floors.length];
            // Get zones specific to the selected floor
            const zonesForFloor = allZones.filter(z => z.floor.toString() === floor._id.toString());
            const zone = zonesForFloor.length > 0 ? zonesForFloor[i % zonesForFloor.length] : allZones[i % allZones.length];
            const category = categoriesForDivision[i % categoriesForDivision.length];

            const assetName = `${division.name} Asset #${i}`;

            const existingAsset = await Asset.findOne({ name: assetName, division: division._id });
            if (existingAsset) {
                // console.log(`Asset "${assetName}" already exists. Skipping.`);
                continue;
            }

            try {
                await Asset.create({
                    name: assetName,
                    description: `This is asset #${i} for the ${division.name} division, located on floor ${floor.name}.`,
                    location: `Area ${i % 10 + 1}`,
                    category: category._id,
                    floor: floor._id,
                    zone: zone._id,
                    division: division._id,
                });
                process.stdout.write(`✅ Created asset: "${assetName}"\r`);
            } catch (error) {
                console.error(`\n❌ Failed to create asset "${assetName}":`, error);
            }
        }
        console.log(`\nFinished seeding for division: ${division.name}`);
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
        await seed100Assets();
    } catch (err) {
        console.error('An error occurred during the seeding process:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nSeeding process finished. Disconnected from MongoDB.');
    }
}

main();