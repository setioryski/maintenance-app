// routes/superuser.js
const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { ensureAuthenticated, ensureSuperuser } = require('../middleware/auth');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// Apply middleware to all superuser routes
router.use(ensureAuthenticated, ensureSuperuser);

// Models
const User = mongoose.model('User');
const Division = mongoose.model('Division');
const AssetCategory = mongoose.model('AssetCategory');
const Floor = mongoose.model('Floor');
const Zone = mongoose.model('Zone');

// Superuser Dashboard
router.get('/dashboard', (req, res) => {
    res.render('superuserDashboard');
});

// --- USER MANAGEMENT ---
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({}).populate('division').sort({ name: 1 });
        res.render('ManageUsers', { users });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.get('/users/new', async (req, res) => {
    const divisions = await Division.find({}).sort({ name: 1 });
    res.render('newUser', { divisions });
});

router.post('/users', async (req, res) => {
    try {
        let { name, email, password, role, division } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        if (role === 'superuser' || role === 'manager') {
            division = null;
        }

        await User.create({ name, email, password: hashedPassword, role, division: division || null });

        await logActivity(req.session.userId, `created a new user: ${name} (${role}).`);
        req.session.message = { type: 'success', text: 'User created successfully.' };
        res.redirect('/admin/users');
    } catch (err) {
        req.session.message = { type: 'error', text: `Error creating user: ${err.message}` };
        res.redirect('/admin/users/new');
    }
});

router.get('/users/:id/edit', async (req, res) => {
    try {
        const userToEdit = await User.findById(req.params.id);
        const divisions = await Division.find({}).sort({ name: 1 });
        res.render('editUser', { userToEdit, divisions });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/users/:id/edit', async (req, res) => {
    try {
        let { name, email, role, division, password } = req.body;
        const updateData = {
            name,
            email,
            role,
            division: ['spv', 'technician'].includes(role) ? division : null
        };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await User.findByIdAndUpdate(req.params.id, updateData);
        await logActivity(req.session.userId, `updated user details for ${name}.`);
        req.session.message = { type: 'success', text: 'User updated successfully.' };
        res.redirect('/admin/users');
    } catch (err) {
        req.session.message = { type: 'error', text: `Error updating user: ${err.message}` };
        res.redirect(`/admin/users/${req.params.id}/edit`);
    }
});

router.post('/users/:id/delete', async (req, res) => {
    try {
        if (req.params.id.toString() === req.session.userId) {
            req.session.message = { type: 'error', text: "You cannot delete your own account." };
            return res.redirect('/admin/users');
        }
        const user = await User.findByIdAndDelete(req.params.id);
        if (user) {
            await logActivity(req.session.userId, `deleted user: ${user.name}.`);
            req.session.message = { type: 'success', text: 'User deleted successfully.' };
        }
        res.redirect('/admin/users');
    } catch (err) {
        res.status(500).send(err.message);
    }
});


// --- MASTER DATA MANAGEMENT ---
router.get('/manage-data', (req, res) => {
    res.render('superuserManageData');
});

// Divisions
router.get('/divisions', async (req, res) => {
    const divisions = await Division.find({}).sort({ name: 1 });
    res.render('manageDivisions', { divisions });
});

router.post('/divisions', async (req, res) => {
    try {
        await Division.create({ name: req.body.name });
        await logActivity(req.session.userId, `created a new division: ${req.body.name}.`);
        req.session.message = { type: 'success', text: 'Division created.' };
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error creating division.' };
    }
    res.redirect('/admin/divisions');
});

router.post('/divisions/:id/delete', async (req, res) => {
    try {
        const division = await Division.findById(req.params.id); // Find first to get name
        if(division){
            // Add check: Prevent deletion if zones or users are linked? (Optional but recommended)
            const zonesInDivision = await Zone.countDocuments({ division: division._id });
            const usersInDivision = await User.countDocuments({ division: division._id });

            if (zonesInDivision > 0 || usersInDivision > 0) {
                 req.session.message = { type: 'error', text: `Cannot delete division "${division.name}" as it still has ${zonesInDivision} zones or ${usersInDivision} users assigned.` };
                 return res.redirect('/admin/divisions');
            }

            await Division.findByIdAndDelete(req.params.id);
            await logActivity(req.session.userId, `deleted division: ${division.name}.`);
            req.session.message = { type: 'success', text: 'Division deleted.' };
        } else {
             req.session.message = { type: 'error', text: 'Division not found.' };
        }
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error deleting division.' };
    }
    res.redirect('/admin/divisions');
});


// Asset Categories
router.get('/asset-categories', async (req, res) => {
    const categories = await AssetCategory.find({}).sort({ name: 1 });
    res.render('manageAssetCategories', { categories });
});

router.post('/asset-categories', async (req, res) => {
    try {
        await AssetCategory.create({ name: req.body.name });
        await logActivity(req.session.userId, `created asset category: ${req.body.name}.`);
        req.session.message = { type: 'success', text: 'Category created.' };
    } catch (err) {
         req.session.message = { type: 'error', text: 'Error creating category.' };
    }
    res.redirect('/admin/asset-categories');
});

router.post('/asset-categories/:id/delete', async (req, res) => {
    try {
        // Add check: Prevent deletion if assets are linked? (Optional)
        const category = await AssetCategory.findByIdAndDelete(req.params.id);
        if(category){
            await logActivity(req.session.userId, `deleted asset category: ${category.name}.`);
            req.session.message = { type: 'success', text: 'Category deleted.' };
        }
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error deleting category.' };
    }
    res.redirect('/admin/asset-categories');
});


// Floors & Zones (Updated)
router.get('/floors-zones', async (req, res) => {
    try {
        const [floors, allZones, divisions] = await Promise.all([
            Floor.find({}).sort({ name: 1 }),
            Zone.find({}).populate('division', 'name').sort({ name: 1 }), // Populate division name
            Division.find({}).sort({ name: 1 }) // Fetch divisions for the form
        ]);
        res.render('manageFloorsZones', { floors, allZones, divisions }); // Pass divisions
    } catch (err) {
        console.error("Error fetching floors/zones/divisions:", err);
        req.session.message = { type: 'error', text: 'Error loading page data.' };
        res.render('manageFloorsZones', { floors: [], allZones: [], divisions: [] }); // Render with empty data on error
    }
});


router.post('/floors', async (req, res) => {
    try {
        await Floor.create({ name: req.body.name });
        await logActivity(req.session.userId, `created floor: ${req.body.name}.`);
        req.session.message = { type: 'success', text: 'Floor created.' };
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error creating floor.' };
    }
    res.redirect('/admin/floors-zones');
});

router.post('/floors/:id/delete', async (req, res) => {
    try {
        const floor = await Floor.findById(req.params.id); // Find first to get name
        if(floor){
             // Add check: Prevent deletion if zones exist? (Optional but recommended)
             const zonesOnFloor = await Zone.countDocuments({ floor: floor._id });
             if (zonesOnFloor > 0) {
                 req.session.message = { type: 'error', text: `Cannot delete floor "${floor.name}" as it still has ${zonesOnFloor} zones assigned.` };
                 return res.redirect('/admin/floors-zones');
             }
            await Floor.findByIdAndDelete(req.params.id);
            // Zones associated with this floor are implicitly removed if using ObjectId refs,
            // but explicitly deleting might be safer depending on schema design elsewhere.
            // await Zone.deleteMany({ floor: floor._id }); // Consider implications before enabling
            await logActivity(req.session.userId, `deleted floor: ${floor.name}.`);
            req.session.message = { type: 'success', text: 'Floor deleted.' };
        } else {
             req.session.message = { type: 'error', text: 'Floor not found.' };
        }
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error deleting floor.' };
    }
    res.redirect('/admin/floors-zones');
});


router.post('/zones', async (req, res) => {
    try {
        const { name, floorId, divisionId } = req.body; // Get divisionId from form
        if (!divisionId) {
            throw new Error('Division is required for a zone.');
        }
        await Zone.create({ name, floor: floorId, division: divisionId });
        const floor = await Floor.findById(floorId);
        const division = await Division.findById(divisionId);
        await logActivity(req.session.userId, `created zone "${name}" for division "${division.name}" on floor "${floor.name}".`);
        req.session.message = { type: 'success', text: 'Zone created.' };
    } catch (err) {
        req.session.message = { type: 'error', text: `Error creating zone: ${err.message}` };
    }
    res.redirect('/admin/floors-zones');
});

router.post('/zones/:id/delete', async (req, res) => {
    try {
         // Add check: Prevent deletion if assets are linked? (Optional)
        const zone = await Zone.findByIdAndDelete(req.params.id).populate('floor').populate('division');
        if(zone){
            await logActivity(req.session.userId, `deleted zone: ${zone.name} (Division: ${zone.division.name}) from floor ${zone.floor.name}.`);
            req.session.message = { type: 'success', text: 'Zone deleted.' };
        } else {
             req.session.message = { type: 'error', text: 'Zone not found.' };
        }
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error deleting zone.' };
    }
    res.redirect('/admin/floors-zones');
});


module.exports = router;