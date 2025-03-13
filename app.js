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
app.get('/assets/new', ensureAuthenticated, ensureSpv, (req, res) => {
  res.render('createAsset');
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

// ---------- SPV: CREATE CHECKLIST ----------
// Display form for creating checklist
app.get('/checklists/new', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const assets = await Asset.find({});
    res.render('createChecklist', { assets });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
// Process checklist creation
app.post('/checklists', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { title, asset, taskDescriptions, taskInputTypes, taskExpectedUnits } = req.body;
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
    const newChecklist = new Checklist({ title, asset, tasks, createdBy: req.session.userId });
    await newChecklist.save();
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
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





// ------------------------------
// START SERVER WITH SOCKET.IO
// ------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
