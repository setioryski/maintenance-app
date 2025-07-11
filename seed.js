// seed.js
// This script initializes default floors, zones, asset categories, divisions, and users into the database.

require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// Import models
const Floor         = require(path.join(__dirname, 'models', 'Floor'));
const Zone          = require(path.join(__dirname, 'models', 'Zone'));
const AssetCategory = require(path.join(__dirname, 'models', 'AssetCategory'));
const Division      = require(path.join(__dirname, 'models', 'Division'));
const User          = require(path.join(__dirname, 'models', 'User'));

// ——— Declare ObjectId alias here ———
const ObjectId = mongoose.Types.ObjectId;

// Default data
const defaultFloors     = ['B', 'LG', 'LM', 'G', 'UG', '1', '2', '3', '3A', '5', 'MO'];
const defaultZones      = ['A', 'B', 'C', 'D'];
const defaultCategories = ['AHU', 'CCTV', 'Elevator', 'Generator', 'Fire Alarm', 'Panoramic'];

// Divisions must use `new ObjectId(...)`
const defaultDivisions = [
  { _id: new ObjectId('67d29e499ef538542714f83f'), name: 'ELEKTRONIK' },
  { _id: new ObjectId('67d29e4e9ef538542714f841'), name: 'ELEKTRIKAL' },
  { _id: new ObjectId('67d29e529ef538542714f843'), name: 'PLUMBING' },
  { _id: new ObjectId('67d29e5d9ef538542714f845'), name: 'MEKANIKAL' },
  { _id: new ObjectId('67d29e649ef538542714f847'), name: 'SIPIL' }
];

// Pre-hashed passwords for seed users
const defaultUsers = [
  {
    name: 'test',
    email: 'test@test.com',
    password: '$2b$10$DCbIiB7.R1o7Qvyla2q9QellQWqNvjj54UFyQrz4M17ZUrqXvduBi', // spv
    role: 'spv',
    division: '67d29e499ef538542714f83f'
  },
  {
    name: 'testteknisi',
    email: 'testteknisi@test.com',
    password: '$2b$10$t19va1NaYrZE.C68rG2HKeKK3Zy.3mQGT5RS4CgE0F/iQDMr.HKK.',
    role: 'technician',
    division: '67d29e499ef538542714f83f'
  },
  {
    name: 'test1',
    email: 'test1@test.com',
    password: '$2b$10$kdZwUu1d.sDdsmoHpskfu.IoueX4m4j75Vt0j0X2eJC34NhBwIjlm',
    role: 'spv',
    division: '67d29e4e9ef538542714f841'
  },
  {
    name: 'manager',
    email: 'manager@test.com',
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
        _id:  div._id,
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
        name:     u.name,
        email:    u.email,
        password: u.password,
        role:     u.role,
        division: u.division
      });
      console.log(`Created user: ${u.email}`);
    }
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/maintenance-app-socket';
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB for seeding');

  await seedFloorsAndZones();
  await seedAssetCategories();
  await seedDivisions();
  await seedUsers();

  console.log('Seeding completed');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Seeding error:', err);
  process.exit(1);
});
