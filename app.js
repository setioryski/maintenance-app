// app.js
const express = require('express');
const http = require('http'); // Native HTTP module
const socketIo = require('socket.io'); // Socket.io for real-time communication
const mongoose = require('mongoose');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const asyncLib = require('async');
const sharp = require('sharp');
const fs = require('fs');
require('dotenv').config();
const app = express();
const ChecklistAssignment = require('./models/ChecklistAssignment');
const router = express.Router();



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
app.use(express.urlencoded({
    extended: true
}));


// Configure body parser and session
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(session({
    secret: process.env.SESSION_SECRET || 'mysecret',
    resave: false,
    saveUninitialized: false
}));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));


// Import models
const Asset = require('./models/Asset');
const Checklist = require('./models/Checklist');
const User = require('./models/User');
const Division = require('./models/Division');
const AssetCategory = require('./models/AssetCategory');
const Floor = require('./models/Floor');
const Zone = require('./models/Zone');


// Configure Multer to store uploaded files in a folder
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, path.join(__dirname, 'public/uploads'));
    },
    filename: function(req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({
    storage: storage
});

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
            return res.status(404).json({
                error: 'Checklist not found'
            });
        }

        // If the user is a technician, restrict editable fields
        if (req.session.userRole === 'technician') {
            const allowedFields = ['functionalTest', 'measurement', 'visualCheck'];
            const submittedFields = Object.keys(req.body);

            // Check if the technician is only modifying allowed fields
            const isValidUpdate = submittedFields.every((field) => allowedFields.includes(field));

            if (!isValidUpdate) {
                return res.status(403).json({
                    error: 'Access denied: You can only modify Functional Test, Measurement, and Visual Check'
                });
            }
        }

        // Attach checklist to the request
        req.checklist = checklist;
        next();

    } catch (error) {
        console.error(`Error in ensureTechnicianCanFillChecklist: ${error.message}`);
        res.status(500).json({
            error: error.message
        });
    }
}

// Image Compression
const imageProcessingQueue = asyncLib.queue((task, callback) => {
    sharp(task.filePath)
        .rotate()
        .withMetadata()
        .resize({
            width: 600,
            withoutEnlargement: true
        })
        .jpeg({
            quality: 80,
            progressive: true, // Progressive JPEG can sometimes help
            mozjpeg: true // Use mozjpeg-based compression if available
        })
        .toFile(`processed/${path.basename(task.filePath)}`)
        .then(() => {
            // Delete the original file
            fs.unlink(task.filePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error('Error deleting original file:', unlinkErr);
                }
                callback(null);
            });
        })
        .catch((error) => {
            console.error('Image processing error:', error);
            callback(error);
        });
}, 2); // Limit concurrency to 2

const processedDir = path.join(__dirname, 'processed');
if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, {
        recursive: true
    });
}


// Serve the processed images folder as static
app.use('/processed', express.static(path.join(__dirname, 'processed')));

// Socket.io connection event
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('new-alert', (data) => {
        // Broadcast to SPVs and Managers
        io.emit('alert', data);
    });

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
        const {
            email,
            password
        } = req.body;
        const user = await User.findOne({
            email
        });
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
    res.render('newUser', {
        divisions
    });
});
app.post('/admin/users', ensureAuthenticated, ensureSuperuser, async (req, res) => {
    try {
        let {
            name,
            email,
            password,
            role,
            division
        } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        // For superuser and manager, set division to null
        if (role === 'superuser' || role === 'manager') {
            division = null;
        }
        const newUser = new User({
            name,
            email,
            password: hashedPassword,
            role,
            division: division || null
        });
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
        const {
            name
        } = req.body;
        const newDivision = new Division({
            name
        });
        await newDivision.save();
        res.redirect('/admin/divisions/new');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Create Asset (Superuser Only)
app.get('/admin/assets/new', ensureAuthenticated, ensureSuperuser, async (req, res) => {
    const assetCategories = await AssetCategory.find({});
    const floors = await Floor.find({});
    const zones = await Zone.find({});
    const divisions = await Division.find({});
    res.render('createAsset', {
        assetCategories,
        floors,
        zones,
        divisions,
        user: {
            role: 'superuser'
        }
    });
});
app.post('/admin/assets', ensureAuthenticated, ensureSuperuser, async (req, res) => {
    try {
        const {
            name,
            description,
            location,
            category,
            floor,
            zone,
            division
        } = req.body;
        const newAsset = new Asset({
            name,
            description,
            location,
            category,
            floor,
            zone,
            division
        });
        await newAsset.save();
        res.redirect('/admin/assets/new');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// (Other routes such as Manager Dashboard, SPV checklist creation, and Technician update would be implemented in a full version)
// Get the checklist edit form (only accessible by SPV who created the checklist)

// ---------- MANAGER ROUTE ----------//

// Manager: mark a completed checklist as verified by manager
app.post('/manager/report/:assignmentId/verify', ensureAuthenticated, ensureManager, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }
        await ChecklistAssignment.findByIdAndUpdate(
            req.params.assignmentId, {
                verifiedByManager: true,
                verifiedByManagerUser: req.session.userId,
                verifiedByManagerUserName: user.name,
                verifiedStatus: 'pending'
            }
        );
        res.json({ success: true, status: 'verified' });
    } catch (err) {
        console.error('Error verifying by manager:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Manager: reject a completed checklist
app.post('/manager/report/:assignmentId/reject', ensureAuthenticated, ensureManager, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }
        await ChecklistAssignment.findByIdAndUpdate(
            req.params.assignmentId, {
                verifiedStatus: 'rejected',
                rejectedBy: req.session.userId,
                rejectedByName: user.name,
                verifiedByManager: false
            }
        );
        res.json({ success: true, status: 'rejected' });
    } catch (err) {
        console.error('Error rejecting by manager:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});


app.get('/manager/dashboard', ensureAuthenticated, ensureManager, async (req, res) => {
    try {
        const filter = req.query.filter || 'all';
        const currentDivision = req.query.division || 'all';

        const matchCondition = {
            completedAt: { $ne: null }
        };

        if (filter !== 'all') {
            matchCondition.verifiedStatus = { $ne: 'rejected' };
            if (filter === 'verified_spv') {
                matchCondition.verifiedBySpv = true;
                matchCondition.verifiedByManager = false;
            } else if (filter === 'verified_manager') {
                matchCondition.verifiedByManager = true;
            } else if (filter === 'not_verified_spv') {
                matchCondition.verifiedBySpv = false;
            } else if (filter === 'has_alert') {
                matchCondition.hasAlert = true;
            }
        }
        
        if (filter === 'rejected') {
            matchCondition.verifiedStatus = 'rejected';
        }

        const divisions = await Division.find({});

        let assignments = await ChecklistAssignment.find(matchCondition)
            .populate('asset') // Ensure asset is populated
            .populate('submittedBy')
            .populate('verifiedBySpvUser')
            .populate('verifiedByManagerUser')
            .populate('rejectedBy');

        if (currentDivision !== 'all') {
            assignments = assignments.filter(a =>
                a.division.toString() === currentDivision
            );
        }

        res.render('managerDashboard', {
            assignments,
            currentFilter: filter,
            divisions,
            currentDivision
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Manager: Checklist Report Detail (GET)
app.get('/manager/report/:assignmentId/detail', ensureAuthenticated, ensureManager, async (req, res) => {
    try {
        const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
             // When populating, if the referenced 'asset' document is deleted,
             // `assignment.asset` will be null. This is the expected behavior.
            .populate({
                path: 'asset',
                // We populate the asset's relations if it still exists
                populate: ['floor', 'category', 'zone', 'division']
            })
            .populate('submittedBy')
            .populate('verifiedBySpvUser')
            .populate('verifiedByManagerUser')
            .populate('rejectedBy');

        if (!assignment || !assignment.completedAt) {
            return res.status(404).send('Checklist not found or not completed');
        }
        
        res.render('managerChecklistReportDetail', {
            assignment
        });
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});



// Maintenance History for SPV
app.get('/spv/report', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const query = {
            division: req.session.userDivision,
            completedAt: { $ne: null }
        };

        const filter = req.query.filter || 'all';
        if (filter !== 'all') {
            query.verifiedStatus = { $ne: 'rejected' };
            if (filter === 'verified_spv') {
                query.verifiedBySpv = true;
                query.verifiedByManager = false;
            } else if (filter === 'verified_manager') {
                query.verifiedByManager = true;
            } else if (filter === 'has_alert') {
                query.hasAlert = true;
            }
        }
        
        if (filter === 'rejected') {
            query.verifiedStatus = 'rejected';
        }

        const assignments = await ChecklistAssignment.find(query)
            .populate('asset') // FIX: Populate the asset reference
            .populate('submittedBy')
            .populate('rejectedBy');

        res.render('spvReport', {
            assignments,
            currentFilter: filter
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Verify checklist
// SPV: mark as verified
app.post('/spv/report/:assignmentId/verify', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }
        await ChecklistAssignment.findByIdAndUpdate(
            req.params.assignmentId, {
                verifiedBySpv: true,
                verifiedBySpvUser: req.session.userId,
                verifiedBySpvUserName: user.name,
                verifiedStatus: 'pending'
            }
        );
        res.json({ success: true, status: 'verified' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});


// Reject checklist
app.post('/spv/report/:assignmentId/reject', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found.' });
        }
        await ChecklistAssignment.findByIdAndUpdate(req.params.assignmentId, {
            verifiedStatus: 'rejected',
            rejectedBy: req.session.userId,
            rejectedByName: user.name,
            verifiedBySpv: false
        });
        res.json({ success: true, status: 'rejected' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// SPV View Checklist Report Detail
app.get('/spv/report/:assignmentId/detail', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
            .populate({
                path: 'asset',
                populate: ['floor', 'category', 'zone']
            })
            .populate('submittedBy')
            .populate('verifiedBySpvUser')
            .populate('verifiedByManagerUser')
            .populate('rejectedBy');

        if (!assignment || !assignment.completedAt) {
            return res.status(404).send('Checklist not completed or not found.');
        }

        res.render('spvChecklistReportDetail', {
            assignment
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});



// SPV dashboard: list checklists created by the logged-in SPV
app.get('/spv/dashboard', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        // Get checklists created by this SPV and calculate assignment count.
        const checklists = await Checklist.find({
            createdBy: req.session.userId
        }).sort({
            order: 1
        });
        const checklistData = await Promise.all(checklists.map(async checklist => {
            const count = await ChecklistAssignment.countDocuments({
                checklist: checklist._id,
                isTemplate: true
            });
            return { ...checklist.toObject(),
                assignmentCount: count
            };
        }));

        // Fetch assets belonging to the SPV's division.
        const assets = await Asset.find({
                division: req.session.userDivision
            })
            .populate('category')
            .populate('floor')
            .populate('zone');

        // Also fetch asset categories
        const assetCategories = await AssetCategory.find({});
        const floors = await Floor.find({});
        res.render('spvDashboard', {
            checklists: checklistData,
            assets,
            assetCategories,
            floors,
            user: req.session
        });

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
        res.render('createAsset', {
            assetCategories,
            floors,
            zones,
            user: req.session
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Contoh filter di route
app.get('/assets', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        // Hanya ambil aset yang division-nya sama dengan SPV
        const assets = await Asset.find({
            division: req.session.userDivision
        });
        const checklists = await Checklist.find({
            createdBy: req.session.userId
        });
        res.render('spvDashboard', {
            assets,
            checklists
        });

    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/assets', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const {
            name,
            description,
            location,
            category,
            floor,
            zone
        } = req.body;

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
        res.render('editAsset', {
            asset: req.asset,
            assetCategories,
            floors,
            zones
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// POST route: Handle edit asset submission
app.post('/assets/:id/edit', ensureAuthenticated, ensureSpv, ensureAssetBelongsToUser, async (req, res) => {
    try {
        const {
            name,
            description,
            location,
            category,
            floor,
            zone
        } = req.body;
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
        res.render('createChecklist', {
            existingChecklists
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});


// Process checklist creation
app.post('/checklists', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const {
            title,
            templateChecklist,
            taskDescriptions,
            taskInputTypes,
            taskExpectedUnits,
            taskMinRanges,
            taskMaxRanges
        } = req.body;

        let tasks = [];
        const descArr = Array.isArray(taskDescriptions) ? taskDescriptions : [taskDescriptions];
        const typeArr = Array.isArray(taskInputTypes) ? taskInputTypes : [taskInputTypes];
        const unitArr = Array.isArray(taskExpectedUnits) ? taskExpectedUnits : [taskExpectedUnits];
        const minArr = Array.isArray(taskMinRanges) ? taskMinRanges : [taskMinRanges];
        const maxArr = Array.isArray(taskMaxRanges) ? taskMaxRanges : [taskMaxRanges];

        for (let i = 0; i < descArr.length; i++) {
            tasks.push({
                description: descArr[i],
                inputType: typeArr[i],
                expectedUnit: unitArr[i] || '',
                minRange: minArr[i] ? Number(minArr[i]) : null,
                maxRange: maxArr[i] ? Number(maxArr[i]) : null,
            });
        }

        const newChecklist = new Checklist({
            title,
            tasks,
            createdBy: req.session.userId,
        });
        await newChecklist.save();

        res.redirect('/spv/dashboard');
    } catch (err) {
        res.status(500).send(err.message);
    }
});


app.get('/api/checklists/:id/tasks', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const checklist = await Checklist.findById(req.params.id);
        if (!checklist) {
            return res.status(404).json({
                error: 'Checklist not found'
            });
        }
        // Return only the tasks array in JSON
        res.json(checklist.tasks);
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

// ---------- SPV: EDIT CHECKLIST ----------
// Render form to edit an existing checklist (only if SPV is the creator)
app.get('/checklists/:id/edit', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const checklist = await Checklist.findById(req.params.id);
        if (!checklist) return res.status(404).send('Checklist not found');
        if (checklist.createdBy.toString() !== req.session.userId) {
            return res.status(403).send('Access denied: You can only edit your own checklist');
        }

        res.render('editChecklist', {
            checklist
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// POST the edits
app.post('/checklists/:id/edit', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const checklistId = req.params.id;
        const {
            title,
            taskDescriptions,
            taskInputTypes,
            taskExpectedUnits,
            taskMinRanges,
            taskMaxRanges
        } = req.body;

        // 1) Load & authorize
        const checklist = await Checklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).send('Checklist not found');
        }
        if (checklist.createdBy.toString() !== req.session.userId) {
            return res.status(403).send('Access denied: You can only edit your own checklist');
        }

        // 2) Update title & tasks
        checklist.title = title;
        const tasks = [];
        const descArr = Array.isArray(taskDescriptions) ? taskDescriptions : [taskDescriptions];
        const typeArr = Array.isArray(taskInputTypes) ? taskInputTypes : [taskInputTypes];
        const unitArr = Array.isArray(taskExpectedUnits) ? taskExpectedUnits : [taskExpectedUnits];
        const minArr = Array.isArray(taskMinRanges) ? taskMinRanges : [taskMinRanges];
        const maxArr = Array.isArray(taskMaxRanges) ? taskMaxRanges : [taskMaxRanges];

        if (descArr) {
            for (let i = 0; i < descArr.length; i++) {
                tasks.push({
                    description: descArr[i],
                    inputType: typeArr[i],
                    expectedUnit: unitArr[i] || '',
                    minRange: (minArr[i] !== null && minArr[i] !== '') ? Number(minArr[i]) : null,
                    maxRange: (maxArr[i] !== null && maxArr[i] !== '') ? Number(maxArr[i]) : null,
                });
            }
        }

        checklist.tasks = tasks;
        await checklist.save();

        // 3) Redirect back to SPV dashboard
        res.redirect('/spv/dashboard');
    } catch (err) {
        console.error('Error editing checklist:', err);
        res.status(500).send(err.message);
    }
});




// ---------- SPV: assign CHECKLIST ----------

//deleting an asset
app.get('/assets/:id/delete', ensureAuthenticated, ensureSpv, ensureAssetBelongsToUser, async (req, res) => {
    try {
        // The 'pre' hook on the Asset model will automatically clean up template assignments
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
        const assignments = await ChecklistAssignment.find({
            checklist: req.params.id,
            isTemplate: true
        });
        const assignedAssetIds = assignments.map(a => a.asset.toString());

        // Get all assets (or filter as needed)
        const assets = await Asset.find({
            division: req.session.userDivision
        });

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
        const checklistId = req.params.id;
        const { assetIds } = req.body;

        const checklist = await Checklist.findById(checklistId);
        if (!checklist) {
            return res.status(404).send('Checklist not found');
        }
        if (checklist.createdBy.toString() !== req.session.userId) {
            return res.status(403).send('Access denied: You can only assign your own checklists');
        }

        await ChecklistAssignment.deleteMany({
            checklist: checklistId,
            isTemplate: true
        });

        const assetsToAssign = Array.isArray(assetIds) ? assetIds : assetIds ? [assetIds] : [];

        const assets = await Asset.find({ '_id': { $in: assetsToAssign } }).populate('division');
        const assetMap = new Map(assets.map(asset => [asset._id.toString(), asset]));

        const newAssignments = assetsToAssign.map(assetId => {
            const asset = assetMap.get(assetId);
            return {
                checklist: checklistId,
                asset: assetId,
                isTemplate: true,
                checklistTitle: checklist.title,
                // We create a minimal snapshot for the template. This will be overwritten on submission.
                assetSnapshot: { name: asset.name },
                division: asset.division._id
            };
        });

        if (newAssignments.length > 0) {
            await ChecklistAssignment.insertMany(newAssignments);
        }

        res.redirect('/spv/dashboard');
    } catch (err) {
        console.error('Error in POST /checklists/:id/assign:', err);
        res.status(500).send(err.message);
    }
});

//spv delete checklist

// DELETE Checklist Route
// AFTER: use instance.remove() so pre('remove') fires
app.get('/checklists/:id/delete', ensureAuthenticated, ensureSpv, ensureChecklistBelongsToUser, async (req, res) => {
    try {
        // ensureChecklistBelongsToUser already loaded the checklist into req.checklist
        // The 'pre' hook on the Checklist model will clean up template assignments
        await Checklist.deleteOne({
            _id: req.params.id
        });
        res.redirect('/spv/dashboard');
    } catch (err) {
        res.status(500).send(err.message);
    }
});


//spv sort checklist
app.post('/checklists/sort', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const {
            order
        } = req.body; // Expects an array of checklist IDs in the new order
        // Loop through each checklist ID and update its order field
        for (let i = 0; i < order.length; i++) {
            await Checklist.findByIdAndUpdate(order[i], {
                order: i
            });
        }
        res.status(200).json({
            message: 'Checklist order updated successfully.'
        });
    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});




//assignment count

// ---------- technician ----------//
//technician dashboard
app.get('/technician/dashboard', ensureAuthenticated, ensureTechnician, async (req, res) => {
    try {
        // Get assets in the technician's division.
        const assets = await Asset.find({
                division: req.session.userDivision
            })
            .populate('floor')
            .populate('category');
        const assetIds = assets.map(a => a._id);

        // Fetch only checklist assignment templates (isTemplate: true) for those assets.
        const assignments = await ChecklistAssignment.find({
                asset: {
                    $in: assetIds
                },
                isTemplate: true
            })
            .populate('checklist')
            .populate({
                path: 'asset',
                populate: ['floor', 'category']
            });

        // Fetch floors and categories for filtering
        const floors = await Floor.find({});
        const assetCategories = await AssetCategory.find({});

        res.render('technicianDashboard', {
            assignments,
            floors,
            assetCategories
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});









app.get('/technician/checklist/:assignmentId', ensureAuthenticated, ensureTechnician, async (req, res) => {
    try {
        const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
            .populate('checklist')
            .populate({
                path: 'asset',
                populate: ['floor', 'category', 'zone']
            });
        if (!assignment) {
            return res.status(404).send('Checklist assignment not found.');
        }
        res.render('technicianChecklist', {
            assignment
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});



// POST /technician/checklist/:assignmentId/submit
app.post('/technician/checklist/:assignmentId/submit', ensureAuthenticated, ensureTechnician, upload.any(), async (req, res) => {
    try {
        const assignmentId = req.params.assignmentId;

        const templateAssignment = await ChecklistAssignment.findById(assignmentId)
            .populate('checklist')
            .populate({
                path: 'asset',
                populate: ['floor', 'category', 'zone', 'division'] // Populate all relations
            });
            
        if (!templateAssignment || !templateAssignment.asset) {
            return res.status(404).send('Checklist assignment or associated asset not found.');
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            return res.status(401).send('Submitting user not found.');
        }

        let hasAlert = false;

        const tasksSnapshot = templateAssignment.checklist.tasks.map(t => ({
            originalTaskId: t._id,
            description: t.description,
            inputType: t.inputType,
            expectedUnit: t.expectedUnit || '',
            minRange: t.minRange,
            maxRange: t.maxRange,
        }));

        const responses = { ...(req.body.results || {})
        };

        for (const task of tasksSnapshot) {
            if (task.inputType === 'functional' && responses[task.originalTaskId.toString()] === 'fail') {
                hasAlert = true;
                break; 
            } else if (task.inputType === 'measurement') {
                const value = parseFloat(responses[task.originalTaskId.toString()]);
                if (!isNaN(value) && task.minRange != null && task.maxRange != null) {
                    if (value < task.minRange || value > task.maxRange) {
                        hasAlert = true;
                        break; 
                    }
                }
            }
        }
        
        // --- NEW: Create the full asset snapshot ---
        const assetSnapshot = {
            name: templateAssignment.asset.name,
            description: templateAssignment.asset.description,
            location: templateAssignment.asset.location,
            // Safely access populated names, provide fallback
            category: templateAssignment.asset.category ? templateAssignment.asset.category.name : 'N/A',
            floor: templateAssignment.asset.floor ? templateAssignment.asset.floor.name : 'N/A',
            zone: templateAssignment.asset.zone ? templateAssignment.asset.zone.name : 'N/A',
            division: templateAssignment.asset.division ? templateAssignment.asset.division.name : 'N/A'
        };


        if (req.files && req.files.length > 0) {
            const filesByTask = {};
            req.files.forEach(file => {
                const match = file.fieldname.match(/^results\[(.+)\]$/);
                if (!match) return;
                const taskId = match[1];
                filesByTask[taskId] = filesByTask[taskId] || [];
                filesByTask[taskId].push(file.path);
            });

            const processingPromises = Object.entries(filesByTask).map(
                async ([taskId, filePaths]) => {
                    const processedUrls = await Promise.all(
                        filePaths.map(
                            filePath =>
                            new Promise((resolve, reject) => {
                                imageProcessingQueue.push({
                                    filePath
                                }, err => {
                                    if (err) return reject(err);
                                    const filename = path.basename(filePath);
                                    resolve(`/processed/${filename}`);
                                });
                            })
                        )
                    );
                    responses[taskId] = processedUrls;
                }
            );
            await Promise.all(processingPromises);
        }

        const maintenanceNote = req.body.note || '';

        const completedAssignment = new ChecklistAssignment({
            checklist: templateAssignment.checklist._id,
            checklistTitle: templateAssignment.checklist.title,
            asset: templateAssignment.asset._id, // Keep the original reference
            assetSnapshot: assetSnapshot, // Save the NEW snapshot
            division: templateAssignment.asset.division._id,
            assignedAt: templateAssignment.assignedAt,
            tasksSnapshot,
            responses,
            completedAt: new Date(),
            submittedBy: req.session.userId,
            submittedByName: user.name,
            isTemplate: false, // Mark as a completed report
            note: maintenanceNote,
            hasAlert: hasAlert
        });
        await completedAssignment.save();

        if (hasAlert) {
            io.emit('alert', {
                message: `Alert: Checklist for asset ${templateAssignment.asset.name} requires attention!`,
                assignmentId: completedAssignment._id
            })
        }

        res.redirect('/technician/dashboard');
    } catch (err) {
        console.error('Error submitting checklist:', err);
        res.status(500).send(err.message);
    }
});





//tehnician report
app.get('/technician/report', ensureAuthenticated, ensureTechnician, async (req, res) => {
    try {
        const assignments = await ChecklistAssignment.find({
                submittedBy: req.session.userId,
                completedAt: {
                    $ne: null
                }
            })
            .populate('asset') // Populate asset
            .populate('submittedBy');

        res.render('technicianReport', {
            assignments
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});




app.get('/technician/report/:assignmentId', ensureAuthenticated, ensureTechnician, async (req, res) => {
    try {
        const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
            .populate({
                path: 'asset', // Still attempt to populate the asset
                populate: ['floor', 'category', 'zone']
            })
            .populate('submittedBy')
            .populate('verifiedBySpvUser')
            .populate('verifiedByManagerUser')
            .populate('rejectedBy');
            
        if (!assignment || !assignment.completedAt) {
            return res.status(404).send('Completed checklist not found.');
        }

        res.render('technicianChecklistReportDetail', {
            assignment
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});




// Call the initialization function after connecting to MongoDB
mongoose.connection.once('open', () => {
    initializeAssetCategories().catch(err =>
        console.error('Error initializing asset categories:', err)
    );
});






// ------------------------------
// START SERVER WITH SOCKET.IO
// ------------------------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;