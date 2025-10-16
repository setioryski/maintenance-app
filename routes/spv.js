const express = require('express');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const { ensureAuthenticated, ensureSpv, ensureAssetBelongsToUser, ensureChecklistBelongsToDivision } = require('../middleware/auth');
const { logActivity, escapeRegex } = require('../utils/helpers');

const router = express.Router();

// Apply middleware to all SPV routes to ensure the user is an authenticated SPV
router.use(ensureAuthenticated, ensureSpv);

// --- Mongoose Models ---
const Asset = mongoose.model('Asset');
const Checklist = mongoose.model('Checklist');
const ChecklistAssignment = mongoose.model('ChecklistAssignment');
const MaintenanceReport = mongoose.model('MaintenanceReport');
const AssetCategory = mongoose.model('AssetCategory');
const Floor = mongoose.model('Floor');
const Zone = mongoose.model('Zone');
const Activity = mongoose.model('Activity');
const User = mongoose.model('User');

// =================================================================
//                      DASHBOARD & REPORTS
// =================================================================

/**
 * GET /spv/dashboard
 * Displays the main dashboard for the SPV, showing checklists, assets, and activities.
 */
router.get('/dashboard', async (req, res) => {
    try {
        const divisionId = req.session.userDivision;
        const page = parseInt(req.query.page) || 1;
        const limit = 10; // Assets per page
        const skip = (page - 1) * limit;

        // Fetch all necessary data in parallel for better performance
        const [checklists, totalAssets, assets, assetCategories, floors, activities] = await Promise.all([
            Checklist.find({ division: divisionId }).sort({ order: 1 }).lean(),
            Asset.countDocuments({ division: divisionId }),
            Asset.find({ division: divisionId }).sort({ order: 1 }).skip(skip).limit(limit).populate('category floor zone').lean(),
            AssetCategory.find({}).sort({ name: 1 }).lean(),
            Floor.find({}).sort({ name: 1 }).lean(),
            Activity.find({ $or: [{ 'division.id': divisionId }, { role: 'manager' }] })
                .sort({ timestamp: -1 })
                .limit(20)
                .populate('user', 'name') // Populate user name from Activity model
                .lean()
        ]);
        
        const totalPages = Math.ceil(totalAssets / limit);

        // Augment checklists with the count of assets they are assigned to
        const checklistData = await Promise.all(checklists.map(async c => ({
            ...c,
            assignmentCount: await ChecklistAssignment.countDocuments({ checklist: c._id })
        })));

        res.render('spvDashboard', {
            checklists: checklistData,
            assets,
            assetCategories,
            floors,
            activities,
            user: req.session, // Pass session info to the view
            currentPage: page,
            totalPages,
            totalAssets,
            limit
        });
    } catch (err) {
        console.error("SPV Dashboard Error:", err);
        res.status(500).send("An error occurred while loading the dashboard.");
    }
});

/**
 * GET /spv/report
 * Displays a list of maintenance reports for the SPV's division with filtering.
 */
router.get('/report', async (req, res) => {
    try {
        const { filter = 'all', floor = 'all', submittedBy = 'all' } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;

        const query = { division: req.session.userDivision };

        // Build filter conditions based on query parameters
        if (filter === 'rejected') query.verifiedStatus = 'rejected';
        else if (filter === 'verified_spv') { query.verifiedBySpv = true; query.verifiedByManager = false; }
        else if (filter === 'verified_manager') query.verifiedByManager = true;
        else if (filter === 'has_alert') query.hasAlert = true;
        
        if (filter !== 'all' && filter !== 'rejected') {
            query.verifiedStatus = { $ne: 'rejected' };
        }
        if (submittedBy !== 'all') query.submittedBy = new mongoose.Types.ObjectId(submittedBy);
        
        if (floor !== 'all') {
             const floorDoc = await Floor.findById(floor);
             if(floorDoc){
                  query['assetSnapshot.floor'] = floorDoc.name;
             }
        }

        const totalReports = await MaintenanceReport.countDocuments(query);
        const totalPages = Math.ceil(totalReports / limit);

        const reports = await MaintenanceReport.find(query)
            .populate('submittedBy', 'name')
            .populate('rejectedBy', 'name')
            .sort({ completedAt: -1 })
            .skip(skip)
            .limit(limit);

        const [floors, technicians] = await Promise.all([
            Floor.find({}).sort({ name: 1 }),
            User.find({ role: 'technician', division: req.session.userDivision }).sort({ name: 1 })
        ]);

        res.render('spvReport', {
            assignments: reports,
            currentFilter: filter,
            floors,
            currentFloor: floor,
            technicians,
            currentSubmittedBy: submittedBy,
            currentPage: page,
            totalPages,
            totalReports,
            limit
        });
    } catch (err) {
        console.error("SPV Report Error:", err);
        res.status(500).send(err.message);
    }
});

/**
 * POST /spv/report/:reportId/:action(verify|reject)
 * Verifies or rejects a submitted maintenance report.
 */
router.post('/report/:reportId/:action(verify|reject)', async (req, res) => {
    try {
        const { reportId, action } = req.params;
        const user = await User.findById(req.session.userId);

        if (!['verify', 'reject'].includes(action)) {
             return res.status(400).json({ success: false, message: 'Invalid action.' });
        }
        
        const isVerifying = action === 'verify';
        const updateData = isVerifying
            ? {
                verifiedBySpv: true,
                verifiedBySpvUser: user._id,
                verifiedBySpvUserName: user.name,
                verifiedStatus: 'pending' 
            }
            : {
                verifiedStatus: 'rejected',
                rejectedBy: user._id,
                rejectedByName: user.name,
                verifiedBySpv: false,
                verifiedByManager: false
            };

        const report = await MaintenanceReport.findByIdAndUpdate(reportId, updateData);
        if (report) {
            await logActivity(user._id, `${action}d a report for asset: ${report.assetSnapshot.name}.`);
        }

        if (req.body.fromDetail) {
            req.session.message = { type: 'success', text: `Report ${action}d successfully.` };
            return res.redirect(`/spv/report/${reportId}/detail`);
        }
        res.json({ success: true, status: action });

    } catch (err) {
        console.error(`Error ${req.params.action}ing by SPV:`, err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /spv/report/:reportId/detail
 * Displays the detail view of a single maintenance report.
 */
router.get('/report/:reportId/detail', async (req, res) => {
    try {
        const report = await MaintenanceReport.findById(req.params.reportId)
            .populate('submittedBy', 'name')
            .populate('verifiedBySpvUser', 'name')
            .populate('verifiedByManagerUser', 'name')
            .populate('rejectedBy', 'name');

        if (!report || report.division.toString() !== req.session.userDivision) {
            return res.status(404).send('Report not found or not in your division.');
        }

        res.render('spvChecklistReportDetail', { assignment: report });
    } catch (err) {
        res.status(500).send(err.message);
    }
});


// =================================================================
//                      ASSET MANAGEMENT
// =================================================================

router.get('/assets/new', async (req, res) => {
    try {
        const [assetCategories, floors, zones] = await Promise.all([
            AssetCategory.find({}).sort({ name: 1 }),
            Floor.find({}).sort({ name: 1 }),
            Zone.find({}).sort({ name: 1 })
        ]);
        res.render('createAsset', { assetCategories, floors, zones });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/assets', async (req, res) => {
    try {
        const { name, description, location, category, floor, zone } = req.body;
        const division = req.session.userDivision;

        const newAsset = new Asset({ name, description, location, category, floor, zone, division });
        await newAsset.save();

        await logActivity(req.session.userId, `created a new asset: ${name}.`);
        req.session.message = { type: 'success', text: 'Asset created successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        req.session.message = { type: 'error', text: `Error creating asset: ${err.message}` };
        res.redirect('/spv/assets/new');
    }
});

router.get('/assets/:id/edit', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const [assetCategories, floors, zones] = await Promise.all([
            AssetCategory.find({}).sort({ name: 1 }),
            Floor.find({}).sort({ name: 1 }),
            Zone.find({}).sort({ name: 1 })
        ]);
        res.render('editAsset', { asset: req.asset, assetCategories, floors, zones });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/assets/:id/edit', ensureAssetBelongsToUser, async (req, res) => {
    try {
        await Asset.findByIdAndUpdate(req.params.id, req.body);
        await logActivity(req.session.userId, `edited asset: ${req.body.name}.`);
        req.session.message = { type: 'success', text: 'Asset updated successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        req.session.message = { type: 'error', text: `Error updating asset: ${err.message}` };
        res.redirect(`/spv/assets/${req.params.id}/edit`);
    }
});

router.post('/assets/:id/duplicate', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const originalAsset = req.asset;
        const baseName = originalAsset.name.replace(/ \(Copy( \d+)?\)$/, '');
        const searchRegex = new RegExp(`^${escapeRegex(baseName)} \\(Copy( \\d+)?\\)$`);
        
        const relatedAssets = await Asset.find({ name: { $regex: `^${escapeRegex(baseName)}` }, division: req.session.userDivision });
        
        let maxCopyNum = 0;
        relatedAssets.forEach(asset => {
            if (asset.name === `${baseName} (Copy)`) {
                if (1 > maxCopyNum) maxCopyNum = 1;
            }
            const match = asset.name.match(searchRegex);
            if (match && match[1]) {
                const num = parseInt(match[1].trim(), 10);
                if (num > maxCopyNum) maxCopyNum = num;
            }
        });
        
        const newName = `${baseName} (Copy${maxCopyNum > 0 ? ` ${maxCopyNum + 1}` : ''})`;

        const newAsset = new Asset({
            name: newName,
            description: originalAsset.description,
            location: originalAsset.location,
            category: originalAsset.category,
            floor: originalAsset.floor,
            zone: originalAsset.zone,
            division: originalAsset.division
        });
        await newAsset.save();

        await logActivity(req.session.userId, `duplicated asset: ${originalAsset.name} to ${newName}.`);
        req.session.message = { type: 'success', text: `Asset duplicated as "${newName}".` };
    } catch (err) {
        req.session.message = { type: 'error', text: 'Failed to duplicate asset.' };
    }
    res.redirect('/spv/dashboard');
});


router.get('/assets/:id/delete', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const assetName = req.asset.name;
        // The pre-hook on the Asset model will handle deleting related assignments
        await Asset.findByIdAndDelete(req.params.id);

        await logActivity(req.session.userId, `deleted asset: ${assetName}.`);
        req.session.message = { type: 'success', text: 'Asset deleted successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        res.status(500).send(err.message);
    }
});


router.get('/asset/:id/qr', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const qrCodeDataUrl = await qrcode.toDataURL(req.params.id, { errorCorrectionLevel: 'H' });
        res.send(`
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
                <h2>${req.asset.name}</h2>
                <img src="${qrCodeDataUrl}" alt="QR Code for ${req.asset.name}" style="margin: 2rem;"/>
                <p>Print this QR Code and attach it to the asset.</p>
            </div>
        `);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/assets/sort', async (req, res) => {
    try {
        const { order } = req.body; // Expects an array of asset IDs
        const updates = order.map((id, index) => 
            Asset.findByIdAndUpdate(id, { order: index })
        );
        await Promise.all(updates);
        res.json({ message: 'Asset order updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =================================================================
//                      CHECKLIST MANAGEMENT
// =================================================================

router.get('/checklists/new', async (req, res) => {
    try {
        const existingChecklists = await Checklist.find({ division: req.session.userDivision }).sort({ title: 1 });
        res.render('createChecklist', { existingChecklists });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/checklists', async (req, res) => {
    try {
        const { title, taskDescriptions, taskInputTypes, taskExpectedUnits, taskMinRanges, taskMaxRanges, taskExpectedUnitsCustom } = req.body;
        const descriptions = Array.isArray(taskDescriptions) ? taskDescriptions : [taskDescriptions];

        const tasks = descriptions.map((desc, i) => {
            const unit = Array.isArray(taskExpectedUnits) ? taskExpectedUnits[i] : taskExpectedUnits;
            const customUnit = Array.isArray(taskExpectedUnitsCustom) ? taskExpectedUnitsCustom[i] : taskExpectedUnitsCustom;
            return {
                description: desc,
                inputType: Array.isArray(taskInputTypes) ? taskInputTypes[i] : taskInputTypes,
                expectedUnit: unit === 'other' ? customUnit : unit,
                minRange: (Array.isArray(taskMinRanges) ? taskMinRanges[i] : taskMinRanges) || null,
                maxRange: (Array.isArray(taskMaxRanges) ? taskMaxRanges[i] : taskMaxRanges) || null,
            };
        });

        await Checklist.create({ title, tasks, createdBy: req.session.userId, division: req.session.userDivision });
        await logActivity(req.session.userId, `created a new checklist: ${title}.`);
        req.session.message = { type: 'success', text: 'Checklist created successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        req.session.message = { type: 'error', text: `Error creating checklist: ${err.message}` };
        res.redirect('/spv/checklists/new');
    }
});


router.get('/checklists/:id/edit', ensureChecklistBelongsToDivision, (req, res) => {
    res.render('editChecklist', { checklist: req.checklist });
});

router.post('/checklists/:id/edit', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const { title, taskDescriptions, taskInputTypes, taskExpectedUnits, taskMinRanges, taskMaxRanges } = req.body;
        const tasks = (Array.isArray(taskDescriptions) ? taskDescriptions : [taskDescriptions]).map((desc, i) => ({
            description: desc,
            inputType: taskInputTypes[i],
            expectedUnit: taskExpectedUnits[i],
            minRange: taskMinRanges[i] || null,
            maxRange: taskMaxRanges[i] || null,
        }));
        
        await Checklist.findByIdAndUpdate(req.params.id, { title, tasks });
        await logActivity(req.session.userId, `edited checklist: ${title}.`);
        req.session.message = { type: 'success', text: 'Checklist updated successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        req.session.message = { type: 'error', text: `Error updating checklist: ${err.message}` };
        res.redirect(`/spv/checklists/${req.params.id}/edit`);
    }
});

router.get('/checklists/:id/assign', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const [assets, assignments] = await Promise.all([
            Asset.find({ division: req.session.userDivision }).populate('category').sort({ name: 1 }),
            ChecklistAssignment.find({ checklist: req.params.id }, 'asset')
        ]);

        const assetsByCategory = assets.reduce((acc, asset) => {
            const categoryName = asset.category ? asset.category.name : 'Uncategorized';
            if (!acc[categoryName]) {
                acc[categoryName] = [];
            }
            acc[categoryName].push(asset);
            return acc;
        }, {});

        const assignedAssetIds = assignments.map(a => a.asset.toString());
        res.render('assignChecklist', { checklist: req.checklist, assetsByCategory, assignedAssetIds });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/checklists/:id/assign', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const checklistId = req.params.id;
        const assetIds = Array.isArray(req.body.assetIds) ? req.body.assetIds : req.body.assetIds ? [req.body.assetIds] : [];
        
        await ChecklistAssignment.deleteMany({ checklist: checklistId });

        if (assetIds.length > 0) {
            const newAssignments = assetIds.map(assetId => ({
                checklist: checklistId,
                asset: assetId,
                division: req.session.userDivision
            }));
            await ChecklistAssignment.insertMany(newAssignments);
        }
        
        await logActivity(req.session.userId, `assigned checklist "${req.checklist.title}" to ${assetIds.length} assets.`);
        req.session.message = { type: 'success', text: 'Assignments updated successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.get('/checklists/:id/delete', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        // The pre-hook on the Checklist model will handle deleting assignments
        await Checklist.deleteOne({ _id: req.params.id });
        await logActivity(req.session.userId, `deleted checklist: ${req.checklist.title}.`);
        req.session.message = { type: 'success', text: 'Checklist deleted successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/checklists/sort', async (req, res) => {
    try {
        const { order } = req.body;
        const updates = order.map((id, index) =>
            Checklist.findByIdAndUpdate(id, { order: index })
        );
        await Promise.all(updates);
        res.json({ message: 'Checklist order updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;