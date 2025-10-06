// seed.js
// This script initializes default floors, zones, asset categories, divisions, users, assets, and checklists into the database.

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
const defaultFloors = ['B', 'LG', 'LM', 'G', 'UG', '1', '2', '3', '3A', '5', 'MO'];
const defaultZones = ['A', 'B', 'C', 'D'];
const defaultCategories = ['AHU', 'CCTV', 'Elevator', 'Generator', 'Fire Alarm', 'Panoramic', 'Pump', 'Pillar'];

// Divisions must use `new ObjectId(...)`
const defaultDivisions = [
    { _id: new ObjectId('67d29e499ef538542714f83f'), name: 'ELEKTRONIK' },
    { _id: new ObjectId('67d29e4e9ef538542714f841'), name: 'ELEKTRIKAL' },
    { _id: new ObjectId('67d29e529ef538542714f843'), name: 'PLUMBING' },
    { _id: new ObjectId('67d29e5d9ef538542714f845'), name: 'MEKANIKAL' },
    { _id: new ObjectId('67d29e649ef538542714f847'), name: 'SIPIL' },
    { _id: new ObjectId('67d29e5d9ef538542714f846'), name: 'HVAC' } // DIVISI BARU
];

// Pre-hashed passwords for seed users
const defaultUsers = [
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

// Dummy Assets for each division
const defaultAssets = [
    // ELEKTRONIK
    { name: 'CCTV Lt.1 Zona A', description: 'Kamera pengawas di area food court', location: 'Food Court', category: 'CCTV', floor: '1', zone: 'A', division: 'ELEKTRONIK' },
    { name: 'Fire Alarm Panel Lt. G', description: 'Panel utama fire alarm', location: 'Lobby Utama', category: 'Fire Alarm', floor: 'G', zone: 'A', division: 'ELEKTRONIK' },

    // ELEKTRIKAL
    { name: 'Generator Set 1', description: 'Genset utama gedung', location: 'Ruang Genset', category: 'Generator', floor: 'B', zone: 'A', division: 'ELEKTRIKAL' },
    { name: 'Pillar Listrik P01', description: 'Pillar di area parkir B1', location: 'Parkir B1', category: 'Pillar', floor: 'B', zone: 'A', division: 'ELEKTRIKAL' },

    // PLUMBING
    { name: 'Pompa Transfer 1', description: 'Pompa transfer air bersih', location: 'Ruang Pompa', category: 'Pump', floor: 'B', zone: 'B', division: 'PLUMBING' },
    { name: 'Tangki Air Lt. Atap', description: 'Tangki persediaan air', location: 'Atap', category: 'Pump', floor: 'MO', zone: 'A', division: 'PLUMBING' },

    // MEKANIKAL
    { name: 'Elevator Service', description: 'Lift barang', location: 'Lobby Service', category: 'Elevator', floor: 'G', zone: 'D', division: 'MEKANIKAL' },

    // HVAC (Aset AHU dipindahkan ke sini)
    { name: 'AHU Food Court', description: 'Air Handling Unit area food court', location: 'Food Court', category: 'AHU', floor: '3A', zone: 'C', division: 'HVAC' },
    
    // SIPIL
    { name: 'Pintu Darurat Lt. 2', description: 'Pintu darurat di koridor', location: 'Koridor', category: 'Fire Alarm', floor: '2', zone: 'B', division: 'SIPIL' },
    { name: 'Pengecatan Dinding Lobby', description: 'Pengecatan rutin dinding lobby', location: 'Lobby Utama', category: 'Panoramic', floor: 'G', zone: 'A', division: 'SIPIL' }
];

// Dummy Checklists for each division
const defaultChecklists = [
    // ELEKTRONIK
    {
        title: 'Pengecekan CCTV Harian',
        tasks: [
            { description: 'Pastikan kamera online', inputType: 'functional' },
            { description: 'Ukur suhu kamera (°C)', inputType: 'measurement', expectedUnit: '°C', minRange: 10, maxRange: 50 }
        ],
        createdBy: 'zulham@delipark.com'
    },
    // ELEKTRIKAL
    {
        title: 'Pengecekan Generator Mingguan',
        tasks: [
            { description: 'Test start generator', inputType: 'functional' }
        ],
        createdBy: 'arif@delipark.com'
    },
    // PLUMBING
    {
        title: 'Pengecekan Pompa Bulanan',
        tasks: [
            { description: 'Cek tekanan pompa (Bar)', inputType: 'measurement', expectedUnit: 'Bar', minRange: 2, maxRange: 5 },
            { description: 'Dengarkan suara abnormal dari pompa', inputType: 'functional' }
        ],
        createdBy: 'spv.plumbing@delipark.com'
    },
    // MEKANIKAL (Checklist Elevator Baru)
    {
        title: 'Inspeksi Elevator Bulanan',
        tasks: [
            { description: 'Cek fungsi tombol lantai', inputType: 'functional' },
            { description: 'Pastikan pintu terbuka dan tertutup dengan lancar', inputType: 'functional' }
        ],
        createdBy: 'spv.mekanikal@delipark.com'
    },
    // HVAC (Checklist AHU/AC Baru)
    {
        title: 'Pengecekan AHU Bulanan',
        tasks: [
            { description: 'Ukur suhu udara keluar (°C)', inputType: 'measurement', expectedUnit: '°C', minRange: 16, maxRange: 22 }
        ],
        createdBy: 'spv.hvac@delipark.com'
    },
    // SIPIL
    {
        title: 'Inspeksi Pintu Darurat Mingguan',
        tasks: [
            { description: 'Pastikan pintu mudah dibuka', inputType: 'functional' }
        ],
        createdBy: 'spv.sipil@delipark.com'
    }
];


async function seedFloorsAndZones() {
    for (const floorName of defaultFloors) {
        let floor = await Floor.findOne({ name: floorName });
        if (!floor) {
            floor = await Floor.create({ name: floorName });
            console.log(`Created floor: ${floorName}`);
        }
        for (const zoneName of defaultZones) {
            const exists = await Zone.findOne({ name: zoneName, floor: floor._id });
            if (!exists) {
                await Zone.create({ name: zoneName, floor: floor._id });
                console.log(`Created zone: ${zoneName} (floor ${floorName})`);
            }
        }
    }
}

async function seedAssetCategories() {
    for (const categoryName of defaultCategories) {
        let cat = await AssetCategory.findOne({ name: categoryName });
        if (!cat) {
            await AssetCategory.create({ name: categoryName });
            console.log(`Created asset category: ${categoryName}`);
        }
    }
}

async function seedDivisions() {
    for (const div of defaultDivisions) {
        const exists = await Division.findOne({ _id: div._id });
        if (!exists) {
            await Division.create({
                _id: div._id,
                name: div.name,
                spvs: []
            });
            console.log(`Created division: ${div.name}`);
        }
    }
}

async function seedUsers() {
    for (const u of defaultUsers) {
        const exists = await User.findOne({ email: u.email });
        if (!exists) {
            await User.create({
                name: u.name,
                email: u.email,
                password: u.password,
                role: u.role,
                division: u.division
            });
            console.log(`Created user: ${u.email}`);
        }
    }
}

async function seedAssets() {
    for (const assetData of defaultAssets) {
        const exists = await Asset.findOne({ name: assetData.name });
        if (!exists) {
            const category = await AssetCategory.findOne({ name: assetData.category });
            const floor = await Floor.findOne({ name: assetData.floor });
            const zone = await Zone.findOne({ name: assetData.zone, floor: floor._id });
            const division = await Division.findOne({ name: assetData.division });

            if (category && floor && zone && division) {
                await Asset.create({
                    name: assetData.name,
                    description: assetData.description,
                    location: assetData.location,
                    category: category._id,
                    floor: floor._id,
                    zone: zone._id,
                    division: division._id
                });
                console.log(`Created asset: ${assetData.name}`);
            } else {
                console.log(`Skipping asset "${assetData.name}" due to missing references.`);
            }
        }
    }
}

async function seedChecklists() {
    for (const checklistData of defaultChecklists) {
        const exists = await Checklist.findOne({ title: checklistData.title });
        if (!exists) {
            const user = await User.findOne({ email: checklistData.createdBy });
            if (user && user.division) { // Pastikan user ada dan punya divisi
                await Checklist.create({
                    title: checklistData.title,
                    tasks: checklistData.tasks,
                    createdBy: user._id,
                    division: user.division // Tambahkan division di sini
                });
                console.log(`Created checklist: ${checklistData.title}`);
            } else {
                console.log(`Skipping checklist "${checklistData.title}" due to missing user or division.`);
            }
        }
    }
}

async function main() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/maintenance-app-socket';
    await mongoose.connect(uri);
    console.log('Connected to MongoDB for seeding');

    await seedFloorsAndZones();
    await seedAssetCategories();
    await seedDivisions();
    await seedUsers();
    await seedAssets();
    await seedChecklists();

    console.log('Seeding completed');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
});