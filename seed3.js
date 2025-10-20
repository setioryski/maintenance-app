// seed3.js
// This script ensures each division has exactly 100 assets (excluding Panoramic),
// distributed across relevant categories, floors, and zones.
// It also creates 3 specific Panoramic assets.
// Assumes seed.js has already run and created Floors, Divisions, Categories, and Zones.

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import models
const Division = require(path.join(__dirname, 'models', 'Division'));
const Asset = require(path.join(__dirname, 'models', 'Asset'));
const Floor = require(path.join(__dirname, 'models', 'Floor'));
const Zone = require(path.join(__dirname, 'models', 'Zone'));
const AssetCategory = require(path.join(__dirname, 'models', 'AssetCategory'));

// --- Configuration ---
const TARGET_ASSETS_PER_DIVISION = 100;

// Define which asset categories belong to which division (used to find relevant categories)
const divisionCategoryMap = {
    'ELEKTRONIK': ['CCTV', 'Fire Alarm'], // Panoramic handled separately
    'ELEKTRIKAL': ['Generator', 'Pillar'],
    'PLUMBING': ['Pump'],
    'MEKANIKAL': ['Elevator'],
    'HVAC': ['AHU'],
    'SIPIL': ['Fire Alarm', 'Pillar'] // Panoramic handled separately
};

// Define the specific floors to iterate over
const defaultFloors = ['B', 'LM', 'G', 'UG', '1', '2', '3', '3A', '5'];

// Specific Panoramic assets to create
const panoramicAssetsToCreate = [
    { name: 'p 10', description: 'Panoramic Asset 10', location: 'Specific Location P10', floorName: 'G', divisionName: 'SIPIL' },
    { name: 'p 16', description: 'Panoramic Asset 16', location: 'Specific Location P16', floorName: 'G', divisionName: 'SIPIL' },
    { name: 'p 20', description: 'Panoramic Asset 20', location: 'Specific Location P20', floorName: 'G', divisionName: 'SIPIL' },
];


/**
 * Seeds the database ensuring asset coverage per category/floor/zone up to the target count.
 */
async function seedAssetsPerDivisionTarget() {
    console.log(`Starting asset seeding (Target: ${TARGET_ASSETS_PER_DIVISION} per division + Panoramic)...`);

    // Fetch necessary data from DB
    const floors = await Floor.find({ name: { $in: defaultFloors } });
    const divisions = await Division.find({});
    const categories = await AssetCategory.find({});
    const zones = await Zone.find({}); // Fetch all zones

    // Create maps for easy lookup
    const floorMap = new Map(floors.map(f => [f.name, f]));
    const divisionMap = new Map(divisions.map(d => [d.name, d]));
    const categoryMap = new Map(categories.map(c => [c.name, c]));
    // const zoneMap = new Map(zones.map(z => [z._id.toString(), z])); // May not be needed if filtering

    // Get the Panoramic Category ID if it exists
    const panoramicCategory = categoryMap.get('Panoramic');

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    // 1. Handle Special Panoramic Assets
    if (panoramicCategory) {
        console.log('\nProcessing Panoramic Assets...');
        const panoramicDivision = divisionMap.get('SIPIL'); // Assuming SIPIL
        const panoramicFloor = floorMap.get('G'); // Assuming Floor G

        if (panoramicDivision && panoramicFloor) {
            // Find the first available zone for SIPIL on Floor G
            const targetZone = zones.find(z =>
                z.floor.equals(panoramicFloor._id) && z.division.equals(panoramicDivision._id)
            );

            if (targetZone) {
                for (const panoAssetData of panoramicAssetsToCreate) {
                     const assetName = panoAssetData.name;
                     // Check if this specific asset already exists in the target division
                    const existingAsset = await Asset.findOne({ name: assetName, division: panoramicDivision._id });
                    if (existingAsset) {
                        console.log(` -> Panoramic Asset "${assetName}" already exists. Skipping.`);
                        totalSkipped++;
                        continue;
                    }
                     try {
                        await Asset.create({
                            name: assetName,
                            description: panoAssetData.description,
                            location: panoAssetData.location,
                            category: panoramicCategory._id,
                            floor: panoramicFloor._id,
                            zone: targetZone._id, // Assign to the found zone
                            division: panoramicDivision._id,
                        });
                        console.log(` -> ✅ Created Panoramic asset: "${assetName}" in Zone ${targetZone.name}`);
                        totalCreated++;
                    } catch (error) {
                        console.error(`\n -> ❌ Failed to create Panoramic asset "${assetName}":`, error.message);
                        totalErrors++;
                    }
                }
            } else {
                 console.warn(` -> Skipping Panoramic assets - No zone found for division "${panoramicDivision.name}" on floor "${panoramicFloor.name}".`);
            }
        } else {
             console.warn(` -> Skipping Panoramic assets - Division "SIPIL" or Floor "G" not found.`);
        }
    } else {
        console.warn(' -> Skipping Panoramic assets - Category "Panoramic" not found.');
    }


    // 2. Handle Other Categories per Division up to TARGET_ASSETS_PER_DIVISION
    console.log(`\nProcessing assets for other divisions (Target ${TARGET_ASSETS_PER_DIVISION} each)...`);
    for (const division of divisions) {
        console.log(`\nProcessing Division: ${division.name}`);
        let divisionAssetCount = 0; // Counter for this division
        const relevantCategoryNames = (divisionCategoryMap[division.name] || []).filter(cat => cat !== 'Panoramic'); // Exclude Panoramic

        // Check if target is already met (e.g., from previous runs or manual additions)
        // Note: This counts ALL assets, including potentially existing Panoramic if division is SIPIL
        // If strict 100 *non-panoramic* is needed, adjust the query.
        divisionAssetCount = await Asset.countDocuments({ division: division._id });
        if (divisionAssetCount >= TARGET_ASSETS_PER_DIVISION && division.name !== 'SIPIL') { // Allow SIPIL to exceed due to Panoramic
             console.log(`  -> Target of ${TARGET_ASSETS_PER_DIVISION} assets already met or exceeded (${divisionAssetCount}). Skipping.`);
             continue;
        }
         // Adjust count for SIPIL if Panoramic were created
         if (division.name === 'SIPIL' && panoramicCategory) {
              const panoCount = await Asset.countDocuments({ division: division._id, category: panoramicCategory._id });
              // Effectively, we want 100 non-panoramic + the specific panoramic ones
              // So, we adjust the current count *down* by the number of panoramic assets already counted.
              divisionAssetCount -= panoCount;
         }


        // Loop structure to distribute assets until target is met
        // Using nested loops with breaks for control
        floorLoop:
        for (const floorName of defaultFloors) {
            const floor = floorMap.get(floorName);
            if (!floor) continue; // Skip if floor doesn't exist

            // Find zones specific to this division AND this floor
            const zonesForDivisionFloor = zones.filter(z =>
                z.division.equals(division._id) && z.floor.equals(floor._id)
            );
            if (zonesForDivisionFloor.length === 0) continue; // Skip floor if no zones for this division

            for (const zone of zonesForDivisionFloor) {
                for (const categoryName of relevantCategoryNames) {
                    const category = categoryMap.get(categoryName);
                    if (!category) continue; // Skip if category doesn't exist

                    // Check if target is met before creating
                    if (divisionAssetCount >= TARGET_ASSETS_PER_DIVISION) {
                        console.log(`  -> Target of ${TARGET_ASSETS_PER_DIVISION} reached for ${division.name}. Moving to next division.`);
                        break floorLoop; // Break out of all inner loops for this division
                    }

                    // Create a unique asset name including the division count
                    const assetName = `${division.name} Asset #${divisionAssetCount + 1} - ${category.name}`;
                    const existingAsset = await Asset.findOne({ name: assetName, division: division._id }); // Check name uniqueness within division

                    if (existingAsset) {
                        // This might happen if script is run multiple times; could indicate need to increment counter differently
                        console.warn(`      -> Asset named "${assetName}" potentially exists. Skipping to avoid duplicates.`);
                        totalSkipped++;
                        // Don't increment divisionAssetCount here if skipping
                        continue; // Try next category/zone/floor combination
                    }

                    try {
                        await Asset.create({
                            name: assetName,
                            description: `Asset #${divisionAssetCount + 1} for ${division.name}, Category ${category.name}, in Zone ${zone.name}, Floor ${floor.name}.`,
                            location: `Area ${divisionAssetCount % 10 + 1}`, // Example location diversification
                            category: category._id,
                            floor: floor._id,
                            zone: zone._id,
                            division: division._id,
                        });
                       // Use process.stdout for less verbose logging during loops
                       if (divisionAssetCount % 20 === 0 || divisionAssetCount === TARGET_ASSETS_PER_DIVISION -1) { // Log progress periodically
                            process.stdout.write(`    -> Creating assets for ${division.name}... (${divisionAssetCount + 1}/${TARGET_ASSETS_PER_DIVISION})\r`);
                       }
                        divisionAssetCount++; // Increment count ONLY after successful creation
                        totalCreated++;
                    } catch (error) {
                         process.stdout.write("\n"); // Newline before error
                        console.error(`    -> ❌ Failed to create asset "${assetName}":`, error.message);
                        totalErrors++;
                        // Optionally break or continue based on error handling preference
                    }
                } // End category loop
            } // End zone loop
        } // End floor loop
         process.stdout.write("\n"); // Ensure newline after finishing a division
         console.log(`  -> Finished seeding for ${division.name}. Final count (excluding Panoramic): ${divisionAssetCount}`);
    } // End division loop

     console.log(`\n--- Asset Seeding Summary ---`);
     console.log(`Total Created: ${totalCreated}`);
     console.log(`Total Skipped (already exist/name conflict): ${totalSkipped}`);
     console.log(`Total Errors: ${totalErrors}`);
     console.log(`------------------------------`);
}

/**
 * Main function to connect to the database, run the seeder, and disconnect.
 */
async function main() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/maintenance-app-socket';
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB for seeding:', uri);
        await seedAssetsPerDivisionTarget();
    } catch (err) {
        console.error('\nAn error occurred during the seeding process:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\nSeeding process finished. Disconnected from MongoDB.');
    }
}

main();