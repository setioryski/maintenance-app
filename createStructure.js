const fs = require('fs');
const path = require('path');

// List of directories to create
const directories = [
  'maintenance-app-socket/models',
  'maintenance-app-socket/views',
  'maintenance-app-socket/public/uploads'
];

// Create directories recursively
directories.forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

// Files to create in each folder
const modelFiles = [
  'Asset.js',
  'Checklist.js',
  'User.js',
  'Division.js',
  'Floor.js',
  'Zone.js',
  'AssetType.js'
];

const viewFiles = [
  'index.ejs',
  'login.ejs',
  'register.ejs',
  'createAsset.ejs',
  'createChecklist.ejs',
  'checklist.ejs',
  'managerDashboard.ejs',
  'newFloor.ejs',
  'newZone.ejs',
  'newAssetType.ejs'
];

// Create model files
modelFiles.forEach(file => {
  fs.writeFileSync(path.join('maintenance-app-socket/models', file), '');
});

// Create view files
viewFiles.forEach(file => {
  fs.writeFileSync(path.join('maintenance-app-socket/views', file), '');
});

// Create root files
fs.writeFileSync('maintenance-app-socket/.env', '');
fs.writeFileSync('maintenance-app-socket/app.js', '');

console.log("Project structure created successfully.");
