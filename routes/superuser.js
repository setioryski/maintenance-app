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
        const division = await Division.findByIdAndDelete(req.params.id);
        if(division){
            await logActivity(req.session.userId, `deleted division: ${division.name}.`);
            req.session.message = { type: 'success', text: 'Division deleted.' };
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


// Floors & Zones
router.get('/floors-zones', async (req, res) => {
    const floors = await Floor.find({}).sort({ name: 1 });
    const allZones = await Zone.find({}).sort({ name: 1 });
    res.render('manageFloorsZones', { floors, allZones });
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
        const floor = await Floor.findByIdAndDelete(req.params.id);
        if(floor){
            await Zone.deleteMany({ floor: floor._id });
            await logActivity(req.session.userId, `deleted floor: ${floor.name} and its zones.`);
            req.session.message = { type: 'success', text: 'Floor and associated zones deleted.' };
        }
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error deleting floor.' };
    }
    res.redirect('/admin/floors-zones');
});


router.post('/zones', async (req, res) => {
    try {
        const { name, floorId } = req.body;
        await Zone.create({ name, floor: floorId });
        const floor = await Floor.findById(floorId);
        await logActivity(req.session.userId, `created zone "${name}" on floor "${floor.name}".`);
        req.session.message = { type: 'success', text: 'Zone created.' };
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error creating zone.' };
    }
    res.redirect('/admin/floors-zones');
});

router.post('/zones/:id/delete', async (req, res) => {
    try {
        const zone = await Zone.findByIdAndDelete(req.params.id).populate('floor');
        if(zone){
            await logActivity(req.session.userId, `deleted zone: ${zone.name} from floor ${zone.floor.name}.`);
            req.session.message = { type: 'success', text: 'Zone deleted.' };
        }
    } catch (err) {
        req.session.message = { type: 'error', text: 'Error deleting zone.' };
    }
    res.redirect('/admin/floors-zones');
});


module.exports = router;