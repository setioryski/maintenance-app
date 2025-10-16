const express = require('express');
const mongoose = require('mongoose');
const { ensureAuthenticated, ensureTechnician, ensureSpv } = require('../middleware/auth');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// --- Mongoose Models ---
const Asset = mongoose.model('Asset');
const Checklist = mongoose.model('Checklist');
const ChecklistAssignment = mongoose.model('ChecklistAssignment');
const MaintenanceReport = mongoose.model('MaintenanceReport');
const User = mongoose.model('User');

// =================================================================
//                      TECHNICIAN SYNC ROUTES
// =================================================================

/**
 * GET /api/technician/sync-data
 * API for technician to sync all necessary data (assets, assignments, checklists) for offline use.
 */
router.get('/technician/sync-data', ensureAuthenticated, ensureTechnician, async (req, res) => {
    try {
        const divisionId = req.session.userDivision;
        const assets = await Asset.find({ division: divisionId })
            .populate('floor').populate('category').populate('zone').lean();
        const assetIds = assets.map(a => a._id);

        const assignments = await ChecklistAssignment.find({ asset: { $in: assetIds } })
            .populate('checklist')
            .populate({ path: 'asset', select: '_id name' }) // Keep it light for sync
            .lean();

        const checklistIds = [...new Set(assignments.map(a => a.checklist?._id).filter(Boolean))];
        const checklists = await Checklist.find({ _id: { $in: checklistIds } }).lean();

        res.json({ assets, assignments, checklists });
    } catch (error) {
        console.error("Sync data API error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch sync data." });
    }
});

/**
 * POST /api/sync/checklist
 * API for the service worker to submit offline-saved checklist reports.
 */
router.post('/sync/checklist', async (req, res) => {
    try {
        const { assignmentId, results, note } = req.body;

        const assignment = await ChecklistAssignment.findById(assignmentId)
            .populate('checklist')
            .populate({
                path: 'asset',
                populate: ['floor', 'category', 'zone', 'division']
            });

        if (!assignment || !assignment.asset) {
            return res.status(404).json({ success: false, message: 'Original assignment not found.' });
        }
        
        // Find a technician from the asset's division to attribute the submission to
        const user = await User.findOne({ division: assignment.asset.division._id, role: 'technician' });
        if (!user) {
             return res.status(401).json({ success: false, message: 'No technician found for this division to attribute sync to.' });
        }

        let hasAlert = false;
        const tasksSnapshot = assignment.checklist.tasks.map(t => {
            const responseValue = results[t._id.toString()];
             if (t.inputType === 'functional' && responseValue === 'fail') {
                hasAlert = true;
            } else if (t.inputType === 'measurement' && responseValue) {
                const value = parseFloat(responseValue);
                if (!isNaN(value) && (t.minRange != null && t.maxRange != null) && (value < t.minRange || value > t.maxRange)) {
                    hasAlert = true;
                }
            }
            return {
                originalTaskId: t._id,
                description: t.description,
                inputType: t.inputType,
                expectedUnit: t.expectedUnit || '',
                minRange: t.minRange,
                maxRange: t.maxRange,
            };
        });

        const assetSnapshot = {
            name: assignment.asset.name,
            location: assignment.asset.location,
            category: assignment.asset.category?.name || 'N/A',
            floor: assignment.asset.floor?.name || 'N/A',
            zone: assignment.asset.zone?.name || 'N/A',
            division: assignment.asset.division?.name || 'N/A'
        };

        const newReport = new MaintenanceReport({
            assignment: assignment._id,
            checklistTitle: assignment.checklist.title,
            assetSnapshot,
            division: assignment.asset.division._id,
            tasksSnapshot,
            responses: results,
            submittedBy: user._id,
            submittedByName: user.name, // MODIFIED: Removed "(Synced Offline)"
            note: note || '',
            hasAlert
        });

        await newReport.save();
        await logActivity(user._id, `synced an offline report for asset: ${assetSnapshot.name}.`);

        if (hasAlert) {
            req.io.emit('alert', {
                message: `Alert (from offline sync): Checklist for asset ${assetSnapshot.name} requires attention!`,
                reportId: newReport._id
            });
        }

        res.status(200).json({ success: true, message: 'Sync successful.' });

    } catch (err) {
        console.error('Error during background sync submission:', err);
        res.status(500).json({ success: false, message: 'Internal server error during sync.' });
    }
});

// =================================================================
//                      SPV CHECKLIST TEMPLATE ROUTE
// =================================================================

/**
 * GET /api/checklists/:id/tasks
 * [NEW] Fetches the tasks for a specific checklist template.
 * This is used in the "Create Checklist" page to populate tasks when a template is selected.
 */
router.get('/checklists/:id/tasks', ensureAuthenticated, ensureSpv, async (req, res) => {
    try {
        const checklist = await Checklist.findById(req.params.id);

        // Security check: ensure the checklist exists and belongs to the SPV's division
        if (!checklist || checklist.division.toString() !== req.session.userDivision) {
            return res.status(404).json({ error: 'Checklist template not found or not in your division.' });
        }

        res.json(checklist.tasks);
    } catch (err) {
        console.error('API Fetch Checklist Tasks Error:', err);
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;