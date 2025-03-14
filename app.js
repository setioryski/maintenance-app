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
const expressLayouts = require('express-ejs-layouts');  // For layout support
require('dotenv').config();
const Floor = require('./models/Floor');
const Zone = require('./models/Zone');
const app = express();

// Create HTTP server and attach Socket.io
const server = http.createServer(app);
const io = socketIo(server);


app.use(expressLayouts);
app.set('layout', 'layout'); // refers to views/layout.ejs


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
  useNewUrlParser: true, 
  useUnifiedTopology: true 
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
// ROUTES
// ------------------------------

// Home Page
app.get('/', (req, res) => {
  res.render('index', { user: req.session, title: 'Home' });
});

// ---------- AUTHENTICATION ROUTES ----------
// Login
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
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
    // Only SPV and Technician have divisions; others set null
    req.session.userDivision = (user.role === 'spv' || user.role === 'technician') && user.division ? user.division.toString() : null;
    if (user.role === 'superuser') {
      return res.redirect('/superuser/dashboard');
    }
    if (user.role === 'spv') {
      return res.redirect('/spv/dashboard');
    }
    res.redirect('/');
  } catch (err) {
    res.status(500).send(err.message);
  }
});
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// ---------- SUPERUSER ROUTES ----------
// Create Asset (Superuser Only)
app.get('/admin/assets/new', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    const floors = await Floor.find().sort({ name: 1 });
    const zones = await Zone.find().sort({ name: 1 });
    res.render('createAsset', { 
      floors, 
      zones, 
      user: req.session, 
      title: 'Create Asset' 
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});


// Render form to create a new floor
app.get('/admin/floors/new', ensureAuthenticated, ensureSuperuser, (req, res) => {
  res.render('newFloor', { title: 'Create New Floor' });
});


// Handle form submission to create a new floor
app.post('/admin/floors', async (req, res) => {
  try {
    const { name } = req.body;
    await Floor.create({ name });
    res.redirect('/admin/floors'); // or wherever you want to redirect
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// Render form to create a new zone (Superuser)
app.get('/admin/zones/new', ensureAuthenticated, ensureSuperuser, (req, res) => {
  res.render('newZone', { title: 'Create New Zone' });
});

// Handle form submission to create a new zone
app.post('/admin/zones', async (req, res) => {
  try {
    const { name } = req.body;
    await Zone.create({ name });
    res.redirect('/admin/zones');
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// Superuser Dashboard
app.get('/superuser/dashboard', ensureAuthenticated, ensureSuperuser, (req, res) => {
  res.render('superuserDashboard', { title: 'Superuser Dashboard' });
});

app.post('/admin/floors', async (req, res) => {
  try {
    const { name } = req.body;
    await Floor.create({ name });
    res.redirect('/admin/floors/new');  // Redirect back to the form
  } catch (err) {
    res.status(500).send(err.message);
  }
});


app.get('/admin/floors', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    const floors = await Floor.find().sort({ name: 1 });
    res.render('floorList', { title: 'Floor List', floors });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/admin/zones', async (req, res) => {
  try {
    const { name } = req.body;
    await Zone.create({ name });
    // Redirect back to the zone creation form
    res.redirect('/admin/zones/new');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/admin/zones', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  try {
    const zones = await Zone.find().sort({ name: 1 });
    res.render('zoneList', { title: 'Zone List', zones });
  } catch (err) {
    res.status(500).send(err.message);
  }
});



// Render form to create a new floor (Superuser)
app.get('/admin/floors/new', ensureAuthenticated, ensureSuperuser, (req, res) => {
  res.render('newFloor', { title: 'Create New Floor' });
});



// Handle floor creation
app.post('/admin/floors', async (req, res) => {
  try {
    const { name } = req.body;
    await Floor.create({ name });
    res.redirect('/admin/floors'); // Adjust redirection as needed
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Handle zone creation
app.post('/admin/zones', async (req, res) => {
  try {
    const { name } = req.body;
    await Zone.create({ name });
    res.redirect('/admin/zones'); // Adjust redirection as needed
  } catch (err) {
    res.status(500).send(err.message);
  }
});




// Create New User (Registration by Superuser)
// Fetch divisions for the dropdown (only for SPV and Technician)
app.get('/admin/users/new', ensureAuthenticated, ensureSuperuser, async (req, res) => {
  const divisions = await Division.find({});
  res.render('newUser', { divisions, title: 'Create New User' });
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
  res.render('createDivision', { title: 'Create Division' });
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

// ---------- SPV ROUTES ----------
// SPV: List Assets for assigning checklists
app.get('/spv/assets', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const assets = await Asset.find({});
    res.render('assetList', { assets, title: 'Asset List' });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// SPV: Show form to assign a checklist to a given asset
app.get('/assets/:assetId/assign-checklist', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const assetId = req.params.assetId;
    // Find all checklists created by this SPV
    const checklists = await Checklist.find({ createdBy: req.session.userId });
    // Filter to only checklists that do not already include this assetId
    const availableChecklists = checklists.filter(chk => !chk.assets.includes(assetId));
    res.render('assignChecklist', { assetId, availableChecklists, title: 'Assign Checklist to Asset' });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post('/assets/:assetId/assign-checklist', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const assetId = req.params.assetId;
    const { checklistId } = req.body;
    const checklist = await Checklist.findById(checklistId);
    if (!checklist) return res.send('Checklist not found');
    if (!checklist.assets.includes(assetId)) {
      checklist.assets.push(assetId);
      await checklist.save();
    }
    res.redirect('/spv/assets');
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// SPV Dashboard - List checklists created by the logged-in SPV
app.get('/spv/dashboard', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const checklists = await Checklist.find({ createdBy: req.session.userId }).populate('assets');
    res.render('spvDashboard', { checklists, title: 'SPV Dashboard' });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// SPV: Create Asset
app.get('/assets/new', ensureAuthenticated, ensureSpv, (req, res) => {
  res.render('createAsset', { title: 'Create Asset', user: req.session });
});

app.post('/assets', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { name, description, location, type, floor, zone } = req.body;
    const newAsset = new Asset({ name, description, location, type, floor, zone });
    await newAsset.save();
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// SPV: Create Checklist
app.get('/checklists/new', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const assets = await Asset.find({});
    res.render('createChecklist', { assets, title: 'Create Checklist' });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
app.post('/checklists', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { title, assets, taskDescriptions, taskInputTypes, taskExpectedUnits, taskApprovalValues, taskNotes } = req.body;
    // Ensure assets is an array
    const assetArray = Array.isArray(assets) ? assets : [assets];

    let tasks = [];
    if (!Array.isArray(taskDescriptions)) {
      let actualVal = null;
      if (taskInputTypes === 'approval') {
        actualVal = taskApprovalValues || 'approve';
      }
      tasks.push({
        description: taskDescriptions,
        inputType: taskInputTypes,
        expectedUnit: taskInputTypes === 'approval' ? '' : taskExpectedUnits,
        actualValue: actualVal,
        note: taskNotes || ''
      });
    } else {
      for (let i = 0; i < taskDescriptions.length; i++) {
        let actualVal = null;
        if (taskInputTypes[i] === 'approval') {
          if (Array.isArray(taskApprovalValues)) {
            actualVal = taskApprovalValues[i] || 'approve';
          } else {
            actualVal = taskApprovalValues || 'approve';
          }
        }
        tasks.push({
          description: taskDescriptions[i],
          inputType: taskInputTypes[i],
          expectedUnit: taskInputTypes[i] === 'approval' ? '' : taskExpectedUnits[i],
          actualValue: actualVal,
          note: Array.isArray(taskNotes) ? taskNotes[i] : (taskNotes || '')
        });
      }
    }
    const newChecklist = new Checklist({ title, assets: assetArray, tasks, createdBy: req.session.userId });
    await newChecklist.save();
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});



// SPV: Edit Checklist
app.get('/checklists/:id/edit', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const checklist = await Checklist.findById(req.params.id);
    if (!checklist) return res.send('Checklist not found');
    if (checklist.createdBy.toString() !== req.session.userId) {
      return res.send('Access denied: You can only edit your own checklist');
    }
    res.render('editChecklist', { checklist, title: 'Edit Checklist' });
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




// ------------------------------
// START SERVER WITH SOCKET.IO
// ------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
