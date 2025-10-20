// seed.js
// This script initializes default floors, specific zones per division/floor,
// asset categories, divisions, users, assets, and checklists.

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import models
const Floor = require(path.join(__dirname, 'models', 'Floor'));
const Zone = require(path.join(__dirname, 'models', 'Zone'));
const AssetCategory = require(path.join(__dirname, 'models', 'AssetCategory'));
const Division = require(path.join(__dirname, 'models', 'Division'));
const User = require(path.join(__dirname, 'models', 'User'));
const Asset = require(path.join(__dirname, 'models', 'Asset'));
const Checklist = require(path.join(__dirname, 'models', 'Checklist'));

// ——— Declare ObjectId alias here ———
const ObjectId = mongoose.Types.ObjectId;

// Default data
const defaultFloors = ['B', 'LM', 'G', 'UG', '1', '2', '3', '3A', '5']; // Updated Floor Order
const defaultCategories = ['AHU', 'CCTV', 'Elevator', 'Generator', 'Fire Alarm', 'Panoramic', 'Pump', 'Pillar'];

// Divisions must use `new ObjectId(...)`
const defaultDivisions = [
    { _id: new ObjectId('67d29e499ef538542714f83f'), name: 'ELEKTRONIK' },
    { _id: new ObjectId('67d29e4e9ef538542714f841'), name: 'ELEKTRIKAL' },
    { _id: new ObjectId('67d29e529ef538542714f843'), name: 'PLUMBING' },
    { _id: new ObjectId('67d29e5d9ef538542714f845'), name: 'MEKANIKAL' },
    { _id: new ObjectId('67d29e649ef538542714f847'), name: 'SIPIL' },
    { _id: new ObjectId('67d29e5d9ef538542714f846'), name: 'HVAC' }
];

// *** NEW: Define specific zones for divisions on floors ***
// IMPORTANT: Modify this structure to match your actual mall layout!
// Example: Creates 2 zones per division on each floor.
const divisionSpecificZones = {
    'ELEKTRONIK': ['Zone E1', 'Zone E2'],
    'ELEKTRIKAL': ['Zone K1', 'Zone K2', 'Zone K3', 'Zone K4'], // Example: 4 zones
    'PLUMBING': ['Zone P1', 'Zone P2', 'Zone P3', 'Zone P4', 'Zone P5', 'Zone P6', 'Zone P7', 'Zone P8', 'Zone P9'], // Example: 9 zones
    'MEKANIKAL': ['Zone M1', 'Zone M2'],
    'SIPIL': ['Zone S1', 'Zone S2'],
    'HVAC': ['Zone H1', 'Zone H2', 'Zone H3'] // Example: 3 zones for HVAC
};


// Pre-hashed passwords for seed users (same as before)
const defaultUsers = [
    // ... (user data remains the same) ...
     // ELEKTRONIK
    {
        name: 'zulham',
        email: 'zulham@delipark.com',
        password: '$2b$10$DCbIiB7.R1o7Qvyla2q9QellQWqNvjj54UFyQrz4M17ZUrqXvduBi',
        role: 'spv',
        division: '67d29e499ef538542714f83f'
    },
    {
        name: 'adhytiawan',
        email: 'adhytiawan@delipark.com',
        password: '$2b$10$t19va1NaYrZE.C68rG2HKeKK3Zy.3mQGT5RS4CgE0F/iQDMr.HKK.',
        role: 'technician',
        division: '67d29e499ef538542714f83f'
    },
    // ELEKTRIKAL
    {
        name: 'arif',
        email: 'arif@delipark.com',
        password: '$2b$10$kdZwUu1d.sDdsmoHpskfu.IoueX4m4j75Vt0j0X2eJC34NhBwIjlm',
        role: 'spv',
        division: '67d29e4e9ef538542714f841'
    },
    {
        name: 'rizki',
        email: 'rizki@delipark.com',
        password: '$2b$10$t19va1NaYrZE.C68rG2HKeKK3Zy.3mQGT5RS4CgE0F/iQDMr.HKK.',
        role: 'technician',
        division: '67d29e4e9ef538542714f841'
    },
    // PLUMBING
    {
        name: 'spv_plumbing',
        email: 'spv.plumbing@delipark.com',
        password: '$2b$10$DCbIiB7.R1o7Qvyla2q9QellQWqNvjj54UFyQrz4M17ZUrqXvduBi',
        role: 'spv',
        division: '67d29e529ef538542714f843'
    },
    {
        name: 'teknisi_plumbing',
        email: 'teknisi.plumbing@delipark.com',
        password: '$2b$10$t19va1NaYrZE.C68rG2HKeKK3Zy.3mQGT5RS4CgE0F/iQDMr.HKK.',
        role: 'technician',
        division: '67d29e529ef538542714f843'
    },
    // MEKANIKAL
    {
        name: 'spv_mekanikal',
        email: 'spv.mekanikal@delipark.com',
        password: '$2b$10$DCbIiB7.R1o7Qvyla2q9QellQWqNvjj54UFyQrz4M17ZUrqXvduBi',
        role: 'spv',
        division: '67d29e5d9ef538542714f845'
    },
    {
        name: 'teknisi_mekanikal',
        email: 'teknisi.mekanikal@delipark.com',
        password: '$2b$10$t19va1NaYrZE.C68rG2HKeKK3Zy.3mQGT5RS4CgE0F/iQDMr.HKK.',
        role: 'technician',
        division: '67d29e5d9ef538542714f845'
    },
    // SIPIL
    {
        name: 'spv_sipil',
        email: 'spv.sipil@delipark.com',
        password: '$2b$10$DCbIiB7.R1o7Qvyla2q9QellQWqNvjj54UFyQrz4M17ZUrqXvduBi',
        role: 'spv',
        division: '67d29e649ef538542714f847'
    },
    {
        name: 'teknisi_sipil',
        email: 'teknisi.sipil@delipark.com',
        password: '$2b$10$t19va1NaYrZE.C68rG2HKeKK3Zy.3mQGT5RS4CgE0F/iQDMr.HKK.',
        role: 'technician',
        division: '67d29e649ef538542714f847'
    },
    // HVAC (BARU)
    {
        name: 'spv_hvac',
        email: 'spv.hvac@delipark.com',
        password: '$2b$10$DCbIiB7.R1o7Qvyla2q9QellQWqNvjj54UFyQrz4M17ZUrqXvduBi',
        role: 'spv',
        division: '67d29e5d9ef538542714f846'
    },
    {
        name: 'teknisi_hvac',
        email: 'teknisi.hvac@delipark.com',
        password: '$2b$10$t19va1NaYrZE.C68rG2HKeKK3Zy.3mQGT5RS4CgE0F/iQDMr.HKK.',
        role: 'technician',
        division: '67d29e5d9ef538542714f846'
    },
    // General Users
    {
        name: 'eka',
        email: 'eka@delipark.com',
        password: '$2b$10$r42TXlD1dUVhBeM6ed0aAuMhkYUTqyS7HckZWSUH8CgM0wxx7aNle',
        role: 'manager',
        division: null
    },
    {
        name: 'admin',
        email: 'admin@test.com',
        password: '$2b$10$iPzLzzmwpOw2qOdGNI/xfeF3IO8YPtBZ3EqiiT70o1rqCeUYjoaDa',
        role: 'superuser',
        division: null
    }
];

// Dummy Assets for each division - Zone assignment will be done in seedAssets
const defaultAssets = [
    // ELEKTRONIK
    { name: 'CCTV Lt.1 Area Food Court', description: 'Kamera pengawas di area food court', location: 'Food Court', category: 'CCTV', floorName: '1', divisionName: 'ELEKTRONIK' },
    { name: 'Fire Alarm Panel Lt. G', description: 'Panel utama fire alarm', location: 'Lobby Utama', category: 'Fire Alarm', floorName: 'G', divisionName: 'ELEKTRONIK' },

    // ELEKTRIKAL
    { name: 'Generator Set 1', description: 'Genset utama gedung', location: 'Ruang Genset', category: 'Generator', floorName: 'B', divisionName: 'ELEKTRIKAL' },
    { name: 'Pillar Listrik P01', description: 'Pillar di area parkir B1', location: 'Parkir B1', category: 'Pillar', floorName: 'B', divisionName: 'ELEKTRIKAL' },

    // PLUMBING
    { name: 'Pompa Transfer 1', description: 'Pompa transfer air bersih', location: 'Ruang Pompa', category: 'Pump', floorName: 'B', divisionName: 'PLUMBING' },
    // { name: 'Tangki Air Lt. Atap', description: 'Tangki persediaan air', location: 'Atap', category: 'Pump', floorName: 'MO', divisionName: 'PLUMBING' }, // MO removed

    // MEKANIKAL
    { name: 'Elevator Service', description: 'Lift barang', location: 'Lobby Service', category: 'Elevator', floorName: 'G', divisionName: 'MEKANIKAL' },

    // HVAC
    { name: 'AHU Food Court', description: 'Air Handling Unit area food court', location: 'Food Court', category: 'AHU', floorName: '3A', divisionName: 'HVAC' },

    // SIPIL
    { name: 'Pintu Darurat Lt. 2', description: 'Pintu darurat di koridor', location: 'Koridor', category: 'Fire Alarm', floorName: '2', divisionName: 'SIPIL' },
    { name: 'Pengecatan Dinding Lobby', description: 'Pengecatan rutin dinding lobby', location: 'Lobby Utama', category: 'Panoramic', floorName: 'G', divisionName: 'SIPIL' }
];

// Dummy Checklists (same as before)
const defaultChecklists = [
    // ... (checklist data remains the same, using createdByEmail) ...
        // ELEKTRONIK
    {
        title: 'Pengecekan CCTV Harian',
        tasks: [
            { description: 'Pastikan kamera online', inputType: 'functional' },
            { description: 'Ukur suhu kamera (°C)', inputType: 'measurement', expectedUnit: '°C', minRange: 10, maxRange: 50 }
        ],
        createdByEmail: 'zulham@delipark.com' // Changed to email for lookup
    },
    // ELEKTRIKAL
    {
        title: 'Pengecekan Generator Mingguan',
        tasks: [
            { description: 'Test start generator', inputType: 'functional' }
        ],
        createdByEmail: 'arif@delipark.com'
    },
    // PLUMBING
    {
        title: 'Pengecekan Pompa Bulanan',
        tasks: [
            { description: 'Cek tekanan pompa (Bar)', inputType: 'measurement', expectedUnit: 'Bar', minRange: 2, maxRange: 5 },
            { description: 'Dengarkan suara abnormal dari pompa', inputType: 'functional' }
        ],
        createdByEmail: 'spv.plumbing@delipark.com'
    },
    // MEKANIKAL (Checklist Elevator Baru)
    {
        title: 'Inspeksi Elevator Bulanan',
        tasks: [
            { description: 'Cek fungsi tombol lantai', inputType: 'functional' },
            { description: 'Pastikan pintu terbuka dan tertutup dengan lancar', inputType: 'functional' }
        ],
        createdByEmail: 'spv.mekanikal@delipark.com'
    },
    // HVAC (Checklist AHU/AC Baru)
    {
        title: 'Pengecekan AHU Bulanan',
        tasks: [
            { description: 'Ukur suhu udara keluar (°C)', inputType: 'measurement', expectedUnit: '°C', minRange: 16, maxRange: 22 }
        ],
        createdByEmail: 'spv.hvac@delipark.com'
    },
    // SIPIL
    {
        title: 'Inspeksi Pintu Darurat Mingguan',
        tasks: [
            { description: 'Pastikan pintu mudah dibuka', inputType: 'functional' }
        ],
        createdByEmail: 'spv.sipil@delipark.com'
    }
];

// --- Seeding Functions ---

async function seedFloors() {
    console.log('Seeding floors...');
    let count = 0;
    for (const floorName of defaultFloors) {
        let floor = await Floor.findOne({ name: floorName });
        if (!floor) {
            floor = await Floor.create({ name: floorName });
            console.log(` -> Created floor: ${floorName}`);
            count++;
        }
    }
    console.log(`Floors seeding complete. ${count} new floors created.`);
}

// *** NEW: Seed Specific Zones ***
async function seedZones() {
    console.log('Seeding division-specific zones...');
    let count = 0;
    const floors = await Floor.find({});
    const divisions = await Division.find({});

    // Create maps for quick lookup
    const floorMap = new Map(floors.map(f => [f.name, f._id]));
    const divisionMap = new Map(divisions.map(d => [d.name, d._id]));

    for (const floorName of defaultFloors) {
        const floorId = floorMap.get(floorName);
        if (!floorId) {
            console.warn(` -> Skipping zones for floor "${floorName}" - Floor not found in DB.`);
            continue;
        }

        for (const [divisionName, zoneNames] of Object.entries(divisionSpecificZones)) {
            const divisionId = divisionMap.get(divisionName);
            if (!divisionId) {
                console.warn(` -> Skipping zones for division "${divisionName}" on floor "${floorName}" - Division not found in DB.`);
                continue;
            }

            for (const zoneName of zoneNames) {
                const exists = await Zone.findOne({ name: zoneName, floor: floorId, division: divisionId });
                if (!exists) {
                    await Zone.create({ name: zoneName, floor: floorId, division: divisionId });
                    console.log(` -> Created zone: ${zoneName} (Floor: ${floorName}, Division: ${divisionName})`);
                    count++;
                }
            }
        }
    }
    console.log(`Zones seeding complete. ${count} new zones created.`);
}


async function seedAssetCategories() {
    console.log('Seeding asset categories...');
    let count = 0;
    for (const categoryName of defaultCategories) {
        let cat = await AssetCategory.findOne({ name: categoryName });
        if (!cat) {
            await AssetCategory.create({ name: categoryName });
            console.log(` -> Created asset category: ${categoryName}`);
            count++;
        }
    }
     console.log(`Asset categories seeding complete. ${count} new categories created.`);
}

async function seedDivisions() {
    console.log('Seeding divisions...');
    let count = 0;
    for (const div of defaultDivisions) {
        // Use findById since we are using predefined ObjectIds
        const exists = await Division.findById(div._id);
        if (!exists) {
            await Division.create({
                _id: div._id, // Ensure _id is explicitly set
                name: div.name,
                spvs: [] // Initialize spvs array if needed by your model
            });
            console.log(` -> Created division: ${div.name} (ID: ${div._id})`);
            count++;
        }
    }
    console.log(`Divisions seeding complete. ${count} new divisions created.`);
}

async function seedUsers() {
    console.log('Seeding users...');
    let count = 0;
    for (const u of defaultUsers) {
        const exists = await User.findOne({ email: u.email });
        if (!exists) {
            // Convert division string ID to ObjectId if it exists
            const divisionObjectId = u.division ? new ObjectId(u.division) : null;
            await User.create({
                name: u.name,
                email: u.email,
                password: u.password, // Assuming pre-hashed
                role: u.role,
                division: divisionObjectId // Use ObjectId or null
            });
            console.log(` -> Created user: ${u.email}`);
            count++;
        }
    }
     console.log(`Users seeding complete. ${count} new users created.`);
}

async function seedAssets() {
    console.log('Seeding default assets...');
    let count = 0;
    for (const assetData of defaultAssets) {
        const exists = await Asset.findOne({ name: assetData.name });
        if (!exists) {
            const category = await AssetCategory.findOne({ name: assetData.category });
            const floor = await Floor.findOne({ name: assetData.floorName }); // Use floorName from data
            const division = await Division.findOne({ name: assetData.divisionName }); // Use divisionName from data

            // Check if essential references were found
            if (category && floor && division) {
                 // *** Find the first available zone for this floor and division ***
                 const firstZone = await Zone.findOne({ floor: floor._id, division: division._id });

                await Asset.create({
                    name: assetData.name,
                    description: assetData.description,
                    location: assetData.location,
                    category: category._id,
                    floor: floor._id,
                    zone: firstZone ? firstZone._id : null, // Assign first found zone or null
                    division: division._id
                });
                console.log(` -> Created asset: ${assetData.name} (Assigned Zone: ${firstZone ? firstZone.name : 'None'})`);
                count++;
            } else {
                console.warn(` -> Skipping asset "${assetData.name}" due to missing references (Category: ${!!category}, Floor: ${!!floor}, Division: ${!!division}).`);
            }
        }
    }
    console.log(`Assets seeding complete. ${count} new assets created.`);
}


async function seedChecklists() {
    console.log('Seeding default checklists...');
    let count = 0;
    for (const checklistData of defaultChecklists) {
        // Checklists are unique by title *within* a division, so we need the user's division
        const user = await User.findOne({ email: checklistData.createdByEmail });
        if (!user || !user.division) {
            console.warn(` -> Skipping checklist "${checklistData.title}" - Cannot find SPV user ${checklistData.createdByEmail} or user has no division.`);
            continue;
        }

        const exists = await Checklist.findOne({ title: checklistData.title, division: user.division });
        if (!exists) {
            await Checklist.create({
                title: checklistData.title,
                tasks: checklistData.tasks,
                createdBy: user._id,
                division: user.division // Assign checklist to the user's division
            });
            console.log(` -> Created checklist: ${checklistData.title} for division ${user.division}`);
            count++;
        }
    }
     console.log(`Checklists seeding complete. ${count} new checklists created.`);
}

// --- Main Execution ---
async function main() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/maintenance-app-socket'; // Ensure DB name matches your .env
    try {
        await mongoose.connect(uri);
        console.log('Connected to MongoDB for seeding:', uri);

        await seedFloors();
        await seedAssetCategories();
        await seedDivisions();
        await seedUsers();
        await seedZones(); // Seed zones after floors and divisions
        await seedAssets(); // Seed assets after zones
        await seedChecklists();

        console.log('\n--- Seeding completed successfully ---');
    } catch (err) {
        console.error('\n--- Seeding error: ---', err);
        process.exit(1); // Exit with error code
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

main(); // Run the main function