// =================================================================
//                      IMPORTS & INITIALIZATION
// =================================================================
const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
require('dotenv').config();

const app = express();

// =================================================================
//                      DATABASE & MODELS
// =================================================================
// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit if DB connection fails
    });

// IMPORTANT: Register all models here so they are available throughout the app
require('./models/Asset');
require('./models/Checklist');
require('./models/User');
require('./models/Division');
require('./models/AssetCategory');
require('./models/Floor');
require('./models/Zone');
require('./models/Activity');
require('./models/ChecklistAssignment');
require('./models/MaintenanceReport');


// =================================================================
//                      SERVER & SOCKET.IO SETUP
// =================================================================
let server;
if (process.env.NODE_ENV === 'production') {
    console.log('Running in production mode (HTTP server).');
    server = http.createServer(app);
} else {
    console.log('Running in development mode (HTTPS server with mkcert).');
    try {
        const options = {
            key: fs.readFileSync('localhost+3-key.pem'),
            cert: fs.readFileSync('localhost+3.pem')
        };
        server = https.createServer(options, app);
    } catch (error) {
        console.error('Could not find SSL certificates for mkcert. Defaulting to HTTP.');
        server = http.createServer(app);
    }
}
const io = socketIo(server);

// Make io accessible to our routes via req object
app.use((req, res, next) => {
    req.io = io;
    next();
});

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.on('disconnect', () => console.log('User disconnected'));
});

// =================================================================
//                      MIDDLEWARE CONFIGURATION
// =================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from 'public' and 'processed' directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/processed', express.static(path.join(__dirname, 'processed')));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust proxy in production (e.g., behind Nginx)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Session management
app.use(session({
    secret: process.env.SESSION_SECRET || 'a_very_strong_secret_for_production',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
        maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
        secure: process.env.NODE_ENV === 'production'
    }
}));

// Flash message middleware
app.use((req, res, next) => {
    res.locals.message = req.session.message;
    delete req.session.message;
    next();
});

// =================================================================
//                            ROUTE IMPORTS
// =================================================================
const authRoutes = require('./routes/auth');
const superuserRoutes = require('./routes/superuser');
const managerRoutes = require('./routes/manager');
const spvRoutes = require('./routes/spv');
const technicianRoutes = require('./routes/technician');
const apiRoutes = require('./routes/api');

// =================================================================
//                            ROUTE USAGE
// =================================================================
app.use('/', authRoutes);
app.use('/admin', superuserRoutes); // Superuser routes are prefixed with /admin
app.use('/manager', managerRoutes);
app.use('/spv', spvRoutes);
app.use('/technician', technicianRoutes);
app.use('/api', apiRoutes);

// Root route to redirect logged-in users to their dashboard
app.get('/', (req, res) => {
    if (req.session && req.session.userId) {
        const roleDashboard = {
            superuser: '/admin/dashboard', // Corrected path
            manager: '/manager/dashboard',
            spv: '/spv/dashboard',
            technician: '/technician/dashboard'
        }[req.session.userRole];

        return res.redirect(roleDashboard || '/login');
    }
    res.redirect('/login');
});

// =================================================================
//                            START SERVER
// =================================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));

module.exports = app;