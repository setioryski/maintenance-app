// app.js
const express = require('express');
const http = require('http');           // Native HTTP module
const socketIo = require('socket.io');    // Socket.io for real-time communication
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
require('dotenv').config();
const app = express();
const ChecklistAssignment = require('./models/ChecklistAssignment');


// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const io = socketIo(server);

// Set up view engine and static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Configure body parser and session
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'mysecret',
  resave: false,
  saveUninitialized: false
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { 
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error(err));

// Import models
const Asset = require('./models/Asset');
const Checklist = require('./models/Checklist');
const User = require('./models/User');
const Division = require('./models/Division');

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'public/uploads/');
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Middleware for authentication and role-checking
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login');
}
function ensureSuperuser(req, res, next) {
  if (req.session && req.session.userRole === 'superuser') return next();
  res.send('Access denied: Only superusers allowed');
}
function ensureManager(req, res, next) {
  if (req.session && req.session.userRole === 'manager') return next();
  res.send('Access denied: Only managers allowed');
}
function ensureSpv(req, res, next) {
  if (req.session && req.session.userRole === 'spv') return next();
  res.send('Access denied: Only supervisors allowed');
}
function ensureTechnician(req, res, next) {
  if (req.session && req.session.userRole === 'technician') return next();
  res.send('Access denied: Only technicians allowed');
}

// Socket.io connection event
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// ------------------------------
// ROUTES (Superuser, Manager, etc.)
// ------------------------------

// Home page
app.get('/', (req, res) => {
  res.render('index', { user: req.session });
});

// ----- AUTHENTICATION ROUTES -----
// Login
app.get('/login', (req, res) => {
  res.render('login');
});
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.send('User not found');
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send('Incorrect password');
    req.session.userId = user._id;
    req.session.userRole = user.role;
    // Only SPV and Technician have divisions; others get null
    req.session.userDivision = (user.role === 'spv' || user.role === 'technician') && user.division ? user.division.toString() : null;
    // If Superuser, redirect to superuser dashboard
    if (user.role === 'superuser') {
      return res.redirect('/superuser/dashboard');
    }
    if (user.role === 'spv') return res.redirect('/spv/dashboard');
    res.redirect('/');
  } catch (err) {
    res.status(500).send(err.message);
  }
});
// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ----- SUPERUSER ROUTES -----
// Superuser Dashboard: Only for Superuser
app.get('/superuser/dashboard', ensureAuthenticated, ensureSuperuser, (req, res) => {
  res.render('superuserDashboard');
});

// Create New User (Registration by Superuser)
// Fetch divisions for the dropdown (only for SPV and Technician)
app.get('/admin/users/new', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  const divisions = await Division.find({});
  res.render('newUser', { divisions });
});
app.post('/admin/users', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    let { name, email, password, role, division } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    // For superuser and manager, set division to null
    if (role === 'superuser' || role === 'manager') {
      division = null;
    }
    const newUser = new User({ name, email, password: hashedPassword, role, division: division || null });
    await newUser.save();
    res.redirect('/admin/users/new');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Create Division (Superuser Only)
app.get('/admin/divisions/new', ensureAuthenticated, ensureSuperuser, (req, res) => {
  res.render('createDivision');
});
app.post('/admin/divisions', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    const { name } = req.body;
    const newDivision = new Division({ name });
    await newDivision.save();
    res.redirect('/admin/divisions/new');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Create Asset (Superuser Only)
app.get('/admin/assets/new', ensureAuthenticated, ensureSuperuser, (req, res) => {
  res.render('createAsset');
});
app.post('/admin/assets', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    const { name, description, location, type, floor, zone } = req.body;
    const newAsset = new Asset({ name, description, location, type, floor, zone });
    await newAsset.save();
    res.redirect('/admin/assets/new');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// (Other routes such as Manager Dashboard, SPV checklist creation, and Technician update would be implemented in a full version)
// Get the checklist edit form (only accessible by SPV who created the checklist)
// ---------- SPV: CREATE ASSET ----------

// SPV dashboard: list checklists created by the logged-in SPV
app.get('/spv/dashboard', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    // Find checklists created by the logged-in SPV and populate asset details
    const checklists = await Checklist.find({ createdBy: req.session.userId }).populate('asset');
    // Pass the checklists variable to the view
    res.render('spvDashboard', { checklists });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// SPV can create asset using this route
app.get('/assets/new', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const assetCategories = await AssetCategory.find({});
    const floors = await Floor.find({});
    const zones = await Zone.find({}); // Ensure zones is defined
    res.render('createAsset', { assetCategories, floors, zones });
  } catch (err) {
    res.status(500).send(err.message);
  }
});



app.post('/assets', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { name, description, location, category, floor, zone } = req.body;

    // If your schema references category as an ObjectId,
    // you must pass the category._id in the form (which you do if you used `value="<%= category._id %>"`).
    
    const newAsset = new Asset({
      name,
      description,
      location,
      category, // must match the field name in your model
      floor,
      zone
    });

    await newAsset.save();
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// ---------- SPV: CREATE CHECKLIST ----------
// Display form for creating checklist
app.get('/checklists/new', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    // Retrieve all checklists (or filter them if needed)
    const existingChecklists = await Checklist.find({});
    res.render('createChecklist', { existingChecklists });
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// Process checklist creation
app.post('/checklists', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { title, templateChecklist, taskDescriptions, taskInputTypes, taskExpectedUnits } = req.body;

    // If you'd like, you can handle logic for the selected template checklist:
    // e.g., copying tasks from the template if the user wants them, or ignoring if they've been overridden

    let tasks = [];
    // If there's only one task, these fields won't be arrays. Convert them to arrays for uniformity:
    const descArr = Array.isArray(taskDescriptions) ? taskDescriptions : [taskDescriptions];
    const typeArr = Array.isArray(taskInputTypes) ? taskInputTypes : [taskInputTypes];
    const unitArr = Array.isArray(taskExpectedUnits) ? taskExpectedUnits : [taskExpectedUnits];

    for (let i = 0; i < descArr.length; i++) {
      tasks.push({
        description: descArr[i],
        inputType: typeArr[i],
        expectedUnit: unitArr[i] || ''
      });
    }

    // Create the new checklist
    const newChecklist = new Checklist({
      title,
      tasks,
      createdBy: req.session.userId,
    });
    await newChecklist.save();

    // Redirect or render success
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});


app.get('/api/checklists/:id/tasks', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const checklist = await Checklist.findById(req.params.id);
    if (!checklist) {
      return res.status(404).json({ error: 'Checklist not found' });
    }
    // Return only the tasks array in JSON
    res.json(checklist.tasks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- SPV: EDIT CHECKLIST ----------
// Render form to edit an existing checklist (only if SPV is the creator)
app.get('/checklists/:id/edit', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const checklist = await Checklist.findById(req.params.id);
    if (!checklist) return res.send('Checklist not found');
    if (checklist.createdBy.toString() !== req.session.userId) {
      return res.send('Access denied: You can only edit your own checklist');
    }
    res.render('editChecklist', { checklist });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
app.post('/checklists/:id/edit', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { title, taskDescriptions, taskInputTypes, taskExpectedUnits } = req.body;
    const checklist = await Checklist.findById(req.params.id);
    if (!checklist) return res.send('Checklist not found');
    if (checklist.createdBy.toString() !== req.session.userId) {
      return res.send('Access denied: You can only edit your own checklist');
    }
    checklist.title = title;
    let tasks = [];
    if (!Array.isArray(taskDescriptions)) {
      tasks.push({
        description: taskDescriptions,
        inputType: taskInputTypes,
        expectedUnit: taskExpectedUnits,
      });
    } else {
      for (let i = 0; i < taskDescriptions.length; i++) {
        tasks.push({
          description: taskDescriptions[i],
          inputType: taskInputTypes[i],
          expectedUnit: taskExpectedUnits[i],
        });
      }
    }
    checklist.tasks = tasks;
    await checklist.save();
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});



// ---------- SPV: assign CHECKLIST ----------

// GET /checklists/:id/assign
app.get('/checklists/:id/assign', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const checklist = await Checklist.findById(req.params.id);
    if (!checklist) return res.status(404).send('Checklist not found');

    // Get assignments for this checklist from the junction collection
    const ChecklistAssignment = require('./models/ChecklistAssignment');
    const assignments = await ChecklistAssignment.find({ checklist: req.params.id });
    const assignedAssetIds = assignments.map(a => a.asset.toString());

    // Get all assets (or filter as needed)
    const assets = await Asset.find({});

    res.render('assignChecklist', {
      checklist,
      assets,
      assignedAssetIds
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});



// POST /checklists/:id/assign
app.post('/checklists/:id/assign', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { assetIds } = req.body; // assetIds can be a single string or an array of strings
    const checklistId = req.params.id;
    const ChecklistAssignment = require('./models/ChecklistAssignment');

    // Remove all existing assignments for this checklist
    await ChecklistAssignment.deleteMany({ checklist: checklistId });

    // Ensure assetIds is an array
    const assetsToAssign = Array.isArray(assetIds) ? assetIds : (assetIds ? [assetIds] : []);

    // Create a new assignment for each asset
    const assignments = assetsToAssign.map(assetId => ({
      checklist: checklistId,
      asset: assetId
    }));

    if (assignments.length > 0) {
      await ChecklistAssignment.insertMany(assignments);
    }

    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

//assignment count
app.get('/spv/dashboard', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    // Fetch checklists created by the logged-in SPV
    const checklists = await Checklist.find({ createdBy: req.session.userId });
    
    // For each checklist, count the assignments using the junction collection
    // Alternatively, you can use an aggregation to do this in one query.
    const checklistData = await Promise.all(checklists.map(async checklist => {
      const count = await ChecklistAssignment.countDocuments({ checklist: checklist._id });
      // Attach assignmentCount to each checklist
      return { ...checklist.toObject(), assignmentCount: count };
    }));

    res.render('spvDashboard', { checklists: checklistData });
  } catch (err) {
    res.status(500).send(err.message);
  }
});




//initialization
// In app.js (or a dedicated initialization file)
const Floor = require('./models/Floor');
const Zone = require('./models/Zone');

async function initializeFloorsAndZones() {
  const defaultFloors = ['B', 'LG', 'LM', 'G', 'UG', '1', '2', '3', '3A', '5', 'MO'];
  const defaultZones = ['A', 'B', 'C', 'D'];

  for (const floorName of defaultFloors) {
    let floor = await Floor.findOne({ name: floorName });
    if (!floor) {
      floor = await Floor.create({ name: floorName });
      console.log(`Created floor: ${floorName}`);
    }

    // For each floor, create default zones if not already created.
    for (const zoneName of defaultZones) {
      const zoneExists = await Zone.findOne({ name: zoneName, floor: floor._id });
      if (!zoneExists) {
        await Zone.create({ name: zoneName, floor: floor._id });
        console.log(`Created zone: ${zoneName} for floor: ${floorName}`);
      }
    }
  }
}

// Call the initialization function after connecting to MongoDB
initializeFloorsAndZones().catch(err => console.error('Error initializing floors and zones:', err));

const AssetCategory = require('./models/AssetCategory');

async function initializeAssetCategories() {
  // Define your default categories here. Adjust the list as needed.
  const defaultCategories = ['AHU', 'CCTV', 'Elevator', 'Generator', 'Fire Alarm'];

  for (const categoryName of defaultCategories) {
    let category = await AssetCategory.findOne({ name: categoryName });
    if (!category) {
      await AssetCategory.create({ name: categoryName });
      console.log(`Created asset category: ${categoryName}`);
    }
  }
}

// Call the initialization function after connecting to MongoDB
initializeAssetCategories().catch(err =>
  console.error('Error initializing asset categories:', err)
);



// ------------------------------
// START SERVER WITH SOCKET.IO
// ------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
