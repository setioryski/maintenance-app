const Asset = require('mongoose').model('Asset');
const Checklist = require('mongoose').model('Checklist');

const ensureAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    req.session.message = { type: 'error', text: 'Please log in to continue.' };
    res.redirect('/login');
};

const ensureRole = (role) => {
    return (req, res, next) => {
        if (req.session && req.session.userRole === role) {
            return next();
        }
        res.status(403).send(`Access Denied: This page is for ${role} users only.`);
    };
};

// Middleware to ensure the asset being accessed belongs to the user's division
const ensureAssetBelongsToUser = async (req, res, next) => {
    try {
        const asset = await Asset.findById(req.params.id);
        if (!asset) {
            return res.status(404).send('Asset not found');
        }
        if (asset.division.toString() !== req.session.userDivision) {
            return res.status(403).send('Access denied: This asset is not in your division');
        }
        req.asset = asset; // Attach asset to request object for later use
        next();
    } catch (error) {
        res.status(500).send(error.message);
    }
};

// Middleware to ensure the checklist being accessed belongs to the user's division
const ensureChecklistBelongsToDivision = async (req, res, next) => {
    try {
        const checklist = await Checklist.findById(req.params.id);
        if (!checklist) {
            return res.status(404).send('Checklist not found');
        }
        if (checklist.division.toString() !== req.session.userDivision) {
            return res.status(403).send('Access denied: You are not authorized to modify this checklist');
        }
        req.checklist = checklist; // Attach checklist to request object
        next();
    } catch (error) {
        res.status(500).send(error.message);
    }
};


module.exports = {
    ensureAuthenticated,
    ensureRole,
    ensureSuperuser: ensureRole('superuser'),
    ensureManager: ensureRole('manager'),
    ensureSpv: ensureRole('spv'),
    ensureTechnician: ensureRole('technician'),
    ensureAssetBelongsToUser,
    ensureChecklistBelongsToDivision
};