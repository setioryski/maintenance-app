// seed3.js
// This script initializes 100 assets for the ELEKTRONIK division,
// distributing them evenly across all floors and zones.

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import models
const Asset = require(path.join(__dirname, 'models', 'Asset'));
const Division = require(path.join(__dirname, 'models', 'Division'));
const AssetCategory = require(path.join(__dirname, 'models', 'AssetCategory'));
const Floor = require(path.join(__dirname, 'models', 'Floor'));
const Zone = require(path.join(__dirname, 'models', 'Zone'));

/**
 * Seeds the database with 100 assets for the ELEKTRONIK division,
 * distributing them across all floors and zones.
 */
async function seed100ElektronikAssets() {
    console.log('Starting to seed 100 assets for the ELEKTRONIK division...');

    try {
        // --- Get references for Division and Category ---
        const elektronikDivision = await Division.findOne({ name: 'ELEKTRONIK' });
        const cctvCategory = await AssetCategory.findOne({ name: 'CCTV' });

        if (!elektronikDivision || !cctvCategory) {
            console.error('Could not find necessary references (ELEKTRONIK Division or CCTV Category). Please run the initial seed script first.');
            return;
        }

        // --- Fetch all floors and their associated zones ---
        const floors = await Floor.find({}).populate('zones');
        if (!floors || floors.length === 0) {
            console.error('No floors found in the database. Please run the initial seed script first.');
            return;
        }

        const locations = [];
        floors.forEach(floor => {
            if (floor.zones && floor.zones.length > 0) {
                floor.zones.forEach(zone => {
                    locations.push({ floor: floor, zone: zone });
                });
            }
        });

        if (locations.length === 0) {
            console.error('No zones found for any of the floors. Please ensure zones are created and associated with floors.');
            return;
        }

        const assetsToCreate = [];
        let assetCounter = 1;

        for (let i = 0; i < 100; i++) {
            const locationIndex = i % locations.length;
            const { floor, zone } = locations[locationIndex];
            
            const assetName = `CCTV-E-${String(assetCounter).padStart(3, '0')}`;
            const existingAsset = await Asset.findOne({ name: assetName });

            if (existingAsset) {
                console.log(`Asset "${assetName}" already exists. Skipping.`);
                assetCounter++; // Ensure the next asset has a unique name
                i--; // Redo this iteration to ensure 100 assets are created
                continue;
            }

            assetsToCreate.push({
                name: assetName,
                description: `Kamera pengawas elektronik #${assetCounter}`,
                location: `Area ${assetCounter}`,
                category: cctvCategory._id,
                floor: floor._id,
                zone: zone._id,
                division: elektronikDivision._id
            });
            assetCounter++;
        }

        if (assetsToCreate.length > 0) {
            await Asset.insertMany(assetsToCreate);
            console.log(`✅ Successfully created ${assetsToCreate.length} new assets for the ELEKTRONIK division.`);
        } else {
            console.log('No new assets to create.');
        }

    } catch (error) {
        console.error('❌ Failed to create assets:', error);
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
        await seed100ElektronikAssets();
    } catch (err) {
        console.error('An error occurred during the seeding process:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Seeding process finished. Disconnected from MongoDB.');
    }
}

main();