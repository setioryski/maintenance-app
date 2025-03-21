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

//Parsing JSON Requests
app.use(express.json());
// Middleware to parse URL-encoded bodies (for forms)
app.use(express.urlencoded({ extended: true }));


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

// Configure Multer to store uploaded files in a folder
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, path.join(__dirname, 'public/uploads'));
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Middleware for authentication
function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login'); // Redirect unauthenticated users to login
}

// General role-based middleware to reduce redundancy
function ensureRole(role) {
  return (req, res, next) => {
    if (req.session && req.session.userRole === role) {
      return next();
    }
    console.warn(`Unauthorized access attempt by user ${req.session.userId} (Role: ${req.session.userRole})`);
    res.status(403).send(`Access denied: Only ${role}s allowed`);
  };
}

// Specific role-based middlewares using the generic function
const ensureSuperuser = ensureRole('superuser');
const ensureManager = ensureRole('manager');
const ensureSpv = ensureRole('spv');
const ensureTechnician = ensureRole('technician');

// Middleware to ensure the asset belongs to the user’s division
async function ensureAssetBelongsToUser(req, res, next) {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    if (asset.division.toString() !== req.session.userDivision) {
      console.warn(`Unauthorized asset access attempt by ${req.session.userId}`);
      return res.status(403).json({ error: 'Access denied: Asset is not in your division' });
    }

    req.asset = asset; // Store asset in request for further processing
    next();
  } catch (error) {
    console.error(`Error in ensureAssetBelongsToUser: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}

// Middleware to ensure the checklist belongs to the logged-in user
async function ensureChecklistBelongsToUser(req, res, next) {
  try {
    // Find the checklist by its ID from the database
    const checklist = await Checklist.findById(req.params.id);

    // If the checklist is not found, return a 404 error
    if (!checklist) {
      return res.status(404).json({ error: 'Checklist not found' });
    }

    // Check if the logged-in user is the checklist creator
    if (checklist.createdBy.toString() !== req.session.userId) {
      console.warn(`Unauthorized checklist modification attempt by ${req.session.userId}`);
      return res.status(403).json({ error: 'Access denied: You are not authorized to modify this checklist' });
    }

    // Attach the checklist to the request for further processing
    req.checklist = checklist;
    next(); // Proceed to the next middleware or route handler
  } catch (error) {
    console.error(`Error in ensureChecklistBelongsToUser: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
}


// Middleware untuk memastikan asset yang diakses milik divisi user
async function ensureAssetBelongsToUser(req, res, next) {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) {
      return res.status(404).send('Asset tidak ditemukan');
    }
    // Bandingkan asset.division dengan req.session.userDivision (yang diset saat login)
    if (asset.division.toString() !== req.session.userDivision) {
      return res.status(403).send('Akses ditolak: Aset ini tidak berada pada divisi Anda');
    }
    // Jika valid, simpan asset di req agar bisa dipakai di route berikutnya
    req.asset = asset;
    next();
  } catch (error) {
    res.status(500).send(error.message);
  }
}

async function ensureChecklistBelongsToUser(req, res, next) {
  try {
    const checklist = await Checklist.findById(req.params.id);
    if (!checklist) {
      return res.status(404).send('Checklist not found');
    }
    // Check if the logged-in user's ID matches the checklist's creator
    if (checklist.createdBy.toString() !== req.session.userId) {
      return res.status(403).send('Access denied: You are not authorized to modify this checklist');
    }
    // Optionally, attach the checklist to the request for later use:
    req.checklist = checklist;
    next();
  } catch (error) {
    res.status(500).send(error.message);
  }
}

async function ensureTechnicianCanFillChecklist(req, res, next) {
  try {
    const checklist = await Checklist.findById(req.params.id);

    if (!checklist) {
      return res.status(404).json({ error: 'Checklist not found' });
    }

    // If the user is a technician, restrict editable fields
    if (req.session.userRole === 'technician') {
      const allowedFields = ['functionalTest', 'measurement', 'visualCheck'];
      const submittedFields = Object.keys(req.body);

      // Check if the technician is only modifying allowed fields
      const isValidUpdate = submittedFields.every((field) => allowedFields.includes(field));

      if (!isValidUpdate) {
        return res.status(403).json({ error: 'Access denied: You can only modify Functional Test, Measurement, and Visual Check' });
      }
    }

    // Attach checklist to the request
    req.checklist = checklist;
    next();

  } catch (error) {
    console.error(`Error in ensureTechnicianCanFillChecklist: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
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

// Home page redirect to dashboard
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    // Log user access attempt
    console.log(`User ID: ${req.session.userId}, Role: ${req.session.userRole}`);

    // Redirect based on user role
    const dashboardRoutes = {
      superuser: '/superuser/dashboard',
      manager: '/manager/dashboard',
      spv: '/spv/dashboard',
      technician: '/technician/dashboard'
    };

    const userDashboard = dashboardRoutes[req.session.userRole];

    if (userDashboard) {
      return res.redirect(userDashboard);
    } else {
      console.warn(`Unknown role encountered: ${req.session.userRole}`);
      return res.redirect('/error?msg=Unknown+role'); // Better error handling
    }
  }

  // User is not logged in; redirect to login page
  res.redirect('/login');
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


// SPV dashboard: list checklists created by the logged-in SPV
app.get('/spv/dashboard', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    // Get checklists created by this SPV and calculate assignment count.
    const checklists = await Checklist.find({ createdBy: req.session.userId }).sort({ order: 1 });
    const checklistData = await Promise.all(checklists.map(async checklist => {
      const count = await ChecklistAssignment.countDocuments({ checklist: checklist._id, isTemplate: true });
      return { ...checklist.toObject(), assignmentCount: count };
    }));

    // Fetch assets belonging to the SPV's division.
    const assets = await Asset.find({ division: req.session.userDivision })
                              .populate('category')
                              .populate('floor')
                              .populate('zone');
    
    // Also fetch asset categories
    const assetCategories = await AssetCategory.find({});

    res.render('spvDashboard', { checklists: checklistData, assets, assetCategories });
  } catch (err) {
    res.status(500).send(err.message);
  }
});






// ---------- SPV: CREATE ASSET ----------//

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

// Contoh filter di route
app.get('/assets', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    // Hanya ambil aset yang division-nya sama dengan SPV
    const assets = await Asset.find({ division: req.session.userDivision });
    res.render('spvDashboard', { assets, checklists });

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
      zone,
      division: req.session.userDivision // Set division to the SPV's division
    });

    await newAsset.save();
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---------- SPV: EDIT ASET-------//
// GET route: Render the edit asset form
app.get('/assets/:id/edit', ensureAuthenticated, ensureSpv, ensureAssetBelongsToUser, async (req, res) => {
  try {
    // Fetch data needed for dropdowns
    const assetCategories = await AssetCategory.find({});
    const floors = await Floor.find({});
    const zones = await Zone.find({});
    // req.asset was populated in ensureAssetBelongsToUser middleware
    res.render('editAsset', { asset: req.asset, assetCategories, floors, zones });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// POST route: Handle edit asset submission
app.post('/assets/:id/edit', ensureAuthenticated, ensureSpv, ensureAssetBelongsToUser, async (req, res) => {
  try {
    const { name, description, location, category, floor, zone } = req.body;
    // Update the asset that was already validated
    req.asset.name = name;
    req.asset.description = description;
    req.asset.location = location;
    req.asset.category = category;
    req.asset.floor = floor;
    req.asset.zone = zone;
    await req.asset.save();
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

//deleting an asset
app.get('/assets/:id/delete', ensureAuthenticated, ensureSpv, ensureAssetBelongsToUser, async (req, res) => {
  try {
    await Asset.findByIdAndDelete(req.params.id);
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});


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
    const assets = await Asset.find({ division: req.session.userDivision });

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

    // Remove existing assignments for this checklist (if you want to replace them)
    await ChecklistAssignment.deleteMany({ checklist: checklistId });

    // Ensure assetIds is an array
    const assetsToAssign = Array.isArray(assetIds) ? assetIds : (assetIds ? [assetIds] : []);

    // Create a new assignment for each asset and mark it as a template
    const assignments = assetsToAssign.map(assetId => ({
      checklist: checklistId,
      asset: assetId,
      isTemplate: true
    }));

    if (assignments.length > 0) {
      await ChecklistAssignment.insertMany(assignments);
    }

    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

//spv delete checklist

// DELETE Checklist Route
app.get('/checklists/:id/delete', ensureAuthenticated, ensureSpv, ensureChecklistBelongsToUser, async (req, res) => {
  try {
    await Checklist.findByIdAndDelete(req.params.id);
    // Optionally: Remove related records from the ChecklistAssignment collection if needed.
    res.redirect('/spv/dashboard');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

//spv sort checklist
app.post('/checklists/sort', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    const { order } = req.body; // Expects an array of checklist IDs in the new order
    // Loop through each checklist ID and update its order field
    for (let i = 0; i < order.length; i++) {
      await Checklist.findByIdAndUpdate(order[i], { order: i });
    }
    res.status(200).json({ message: 'Checklist order updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




//assignment count
app.get('/spv/dashboard', ensureAuthenticated, ensureSpv, async (req, res) => {
  try {
    // Fetch checklists created by the logged-in SPV
    const checklists = await Checklist.find({ createdBy: req.session.userId }).sort({ order: 1 });
    
    // For each checklist, count the assignments using the junction collection
    // Alternatively, you can use an aggregation to do this in one query.
    const checklistData = await Promise.all(checklists.map(async checklist => {
      const count = await ChecklistAssignment.countDocuments({ checklist: checklist._id });
      // Attach assignmentCount to each checklist
      return { ...checklist.toObject(), assignmentCount: count };
    }));

    res.render('spvDashboard', { checklists: checklistData, assets: assets || [] });

  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ---------- technician ----------//
//technician dashboard
app.get('/technician/dashboard', ensureAuthenticated, ensureTechnician, async (req, res) => {
  try {
    // Get assets in the technician's division.
    const assets = await Asset.find({ division: req.session.userDivision });
    const assetIds = assets.map(a => a._id);
    
    // Fetch only checklist assignment templates (isTemplate: true) for those assets.
    const assignments = await ChecklistAssignment.find({
      asset: { $in: assetIds },
      isTemplate: true
    })
      .populate('checklist')
      .populate('asset');
    
    res.render('technicianDashboard', { assignments });
  } catch (err) {
    res.status(500).send(err.message);
  }
});









app.get('/technician/checklist/:assignmentId', ensureAuthenticated, ensureTechnician, async (req, res) => {
  try {
    const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
      .populate('checklist')
      .populate('asset');
    if (!assignment) {
      return res.status(404).send('Checklist assignment not found.');
    }
    res.render('technicianChecklist', { assignment });
  } catch (err) {
    res.status(500).send(err.message);
  }
});




app.post('/technician/checklist/:assignmentId/submit', ensureAuthenticated, ensureTechnician, upload.any(), async (req, res) => {
  try {
    const originalAssignmentId = req.params.assignmentId;
    
    // Find the original assignment (to copy checklist and asset references)
    const originalAssignment = await ChecklistAssignment.findById(originalAssignmentId)
      .populate('checklist')
      .populate('asset');
    
    if (!originalAssignment) {
      return res.status(404).send('Checklist assignment not found.');
    }
    
    // Build the responses object from form fields and file uploads.
    const resultsFromBody = req.body.results || {};
    const responses = { ...resultsFromBody };
    
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        const match = file.fieldname.match(/results\[(.+)\]/);
        if (match && match[1]) {
          const taskId = match[1];
          // Save file path (or URL) as the response for that task
          responses[taskId] = file.path;
        }
      });
    }
    
    // Create a new ChecklistAssignment record for this submission.
    // IMPORTANT: set isTemplate: false so it will not appear as a template.
    const newAssignment = new ChecklistAssignment({
      checklist: originalAssignment.checklist._id,
      asset: originalAssignment.asset._id,
      assignedAt: originalAssignment.assignedAt,
      responses: responses,
      completedAt: new Date(), // mark this new record as completed now
      submittedBy: req.session.userId,  // record the technician who submitted it
      isTemplate: false // mark this record as a submission, not as a template
    });
    
    await newAssignment.save();
    
    res.redirect('/technician/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});





//tehnician report
app.get('/technician/report', ensureAuthenticated, ensureTechnician, async (req, res) => {
  try {
    const assets = await Asset.find({ division: req.session.userDivision });
    const assetIds = assets.map(a => a._id);
    
    const assignments = await ChecklistAssignment.find({
      asset: { $in: assetIds },
      completedAt: { $ne: null }
    })
      .populate('checklist')
      .populate('asset')
      .populate('submittedBy');
    
    res.render('technicianReport', { assignments });
  } catch (err) {
    res.status(500).send(err.message);
  }
});




app.get('/technician/report/:assignmentId', ensureAuthenticated, ensureTechnician, async (req, res) => {
  try {
    const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
      .populate('checklist')
      .populate('asset')
      .populate('submittedBy');
    if (!assignment || !assignment.completedAt) {
      return res.status(404).send('Completed checklist not found.');
    }
    res.render('technicianChecklistReportDetail', { assignment });
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
  const defaultCategories = ['AHU', 'CCTV', 'Elevator', 'Generator', 'Fire Alarm', 'Panoramic'];

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
