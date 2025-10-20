// routes/spv.js
const express = require('express');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const { ensureAuthenticated, ensureSpv, ensureAssetBelongsToUser, ensureChecklistBelongsToDivision } = require('../middleware/auth');
const { logActivity, escapeRegex } = require('../utils/helpers');

const router = express.Router();

// Apply middleware to all SPV routes to ensure the user is an authenticated SPV
router.use(ensureAuthenticated, ensureSpv);

// Add middleware to make divisionId available in locals for ALL SPV routes using these views
router.use((req, res, next) => {
  if (req.session && req.session.userDivision) {
    res.locals.spvDivisionId = req.session.userDivision;
  }
  next();
});

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
        const { assetPage = 1, checklistPage = 1, search = '', floor = 'all', zone = 'all', category = 'all' } = req.query;
        const assetLimit = 10; // Assets per page
        const checklistLimit = 10; // Checklists per page
        const assetSkip = (assetPage - 1) * assetLimit;
        const checklistSkip = (checklistPage - 1) * checklistLimit;

        const assetFilter = { division: divisionId };
        if (search) {
            assetFilter.name = { $regex: new RegExp(escapeRegex(search), 'i') };
        }
        if (floor !== 'all') {
            assetFilter.floor = floor;
        }
        if (zone !== 'all') {
            assetFilter.zone = zone;
        }
        if (category !== 'all') {
            assetFilter.category = category;
        }

        // Fetch all necessary data in parallel for better performance
        const [totalChecklists, checklists, totalAssets, assets, assetCategories, floors, zonesData, activities] = await Promise.all([
            Checklist.countDocuments({ division: divisionId }),
            Checklist.find({ division: divisionId }).sort({ order: 1 }).skip(checklistSkip).limit(checklistLimit).lean(),
            Asset.countDocuments(assetFilter),
            Asset.find(assetFilter).sort({ order: 1 }).skip(assetSkip).limit(assetLimit).populate('category floor zone').lean(), // Keep populate here for display
            AssetCategory.find({}).sort({ name: 1 }).lean(),
            Floor.find({}).sort({ name: 1 }).lean(),
            Zone.find({ division: divisionId }).sort({ name: 1 }).lean(), // Fetch zones relevant to SPV's division for filters
            Activity.find({ $or: [{ 'division.id': divisionId }, { role: 'manager' }] })
                .sort({ timestamp: -1 })
                .limit(20)
                .populate('user', 'name') // Populate user name from Activity model
                .lean()
        ]);

        const totalAssetPages = Math.ceil(totalAssets / assetLimit);
        const totalChecklistPages = Math.ceil(totalChecklists / checklistLimit);

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
            zones: zonesData, // Pass division-specific zones
            activities,
            user: req.session, // Pass session info to the view
            assetPagination: {
                currentPage: assetPage,
                totalPages: totalAssetPages,
                totalItems: totalAssets,
                limit: assetLimit
            },
            checklistPagination: {
                currentPage: checklistPage,
                totalPages: totalChecklistPages,
                totalItems: totalChecklists,
                limit: checklistLimit
            },
            filters: { search, floor, zone, category }
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
        const { filter = 'all', floor = 'all', zone = 'all', submittedBy = 'all' } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;
        const divisionId = req.session.userDivision;

        const query = { division: divisionId };

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
        // Zone filtering might need adjustment if zone names are not unique across divisions
        // A better approach might be to filter assets first, then find reports for those assets.
        // For simplicity now, we assume zone names + floor names are unique enough or filter by ID if possible.
        if (zone !== 'all') {
            const zoneDoc = await Zone.findById(zone); // Ensure this zone belongs to the division
            if(zoneDoc && zoneDoc.division.toString() === divisionId){
                 query['assetSnapshot.zone'] = zoneDoc.name;
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

        const [floorsData, zonesData, technicians] = await Promise.all([
            Floor.find({}).sort({ name: 1 }),
            Zone.find({ division: divisionId }).sort({ name: 1 }), // Only zones for this division
            User.find({ role: 'technician', division: divisionId }).sort({ name: 1 })
        ]);

        res.render('spvReport', {
            assignments: reports,
            currentFilter: filter,
            floors: floorsData,
            currentFloor: floor,
            zones: zonesData,
            currentZone: zone,
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

        const reportToUpdate = await MaintenanceReport.findOne({_id: reportId, division: req.session.userDivision });
        if (!reportToUpdate) {
             return res.status(404).json({ success: false, message: 'Report not found in your division.' });
        }

        const isVerifying = action === 'verify';
        const updateData = isVerifying
            ? {
                verifiedBySpv: true,
                verifiedBySpvUser: user._id,
                verifiedBySpvUserName: user.name,
                // Do NOT set verifiedStatus here, let manager set final approval/pending
            }
            : {
                verifiedStatus: 'rejected', // Explicitly reject
                rejectedBy: user._id,
                rejectedByName: user.name,
                verifiedBySpv: false, // Reset SPV verification
                verifiedByManager: false // Reset Manager verification
            };

        const report = await MaintenanceReport.findByIdAndUpdate(reportId, updateData, { new: true }); // Use new:true to get updated doc if needed
        if (report) {
            await logActivity(user._id, `${action}d a report for asset: ${report.assetSnapshot.name}.`);
        } else {
             // Should not happen due to findOne check, but as a safeguard
             return res.status(404).json({ success: false, message: 'Report not found during update.' });
        }


        if (req.body.fromDetail) {
            req.session.message = { type: 'success', text: `Report ${action}d successfully.` };
            return res.redirect(`/spv/report/${reportId}/detail`);
        }
         // Check if request expects JSON (for AJAX calls from dashboard)
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
           return res.json({ success: true, status: action, report }); // Send back updated report status
        }
        // Fallback redirect if not AJAX
        res.redirect('/spv/report');


    } catch (err) {
        console.error(`Error ${req.params.action}ing by SPV:`, err);
         if (req.headers.accept && req.headers.accept.includes('application/json')) {
             return res.status(500).json({ success: false, message: err.message });
         }
        req.session.message = { type: 'error', text: `Error processing report: ${err.message}` };
        res.redirect('back'); // Redirect back if error occurs
    }
});


/**
 * GET /spv/report/:reportId/detail
 * Displays the detail view of a single maintenance report.
 */
router.get('/report/:reportId/detail', async (req, res) => {
    try {
        const report = await MaintenanceReport.findOne({ _id: req.params.reportId, division: req.session.userDivision }) // Ensure it's in SPV's division
            .populate('submittedBy', 'name')
            .populate('verifiedBySpvUser', 'name')
            .populate('verifiedByManagerUser', 'name')
            .populate('rejectedBy', 'name');

        if (!report) {
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
        const [assetCategories, floors] = await Promise.all([
            AssetCategory.find({}).sort({ name: 1 }),
            Floor.find({}).sort({ name: 1 }),
            // Zones will be fetched dynamically via API
        ]);
        res.render('createAsset', {
             assetCategories,
             floors,
             // spvDivisionId is added by middleware
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});


router.post('/assets', async (req, res) => {
    try {
        const { name, description, location, category, floor, zone } = req.body;
        const division = req.session.userDivision; // SPV's division

        // Optional: Validate that the selected zone belongs to the SPV's division
        if (zone) {
            const validZone = await Zone.findOne({ _id: zone, division: division });
            if (!validZone) {
                 throw new Error("Invalid zone selected for your division.");
            }
        }


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

// Pass division ID and pre-fetch zones for the asset's floor/division
router.get('/assets/:id/edit', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const divisionId = req.session.userDivision;
        const assetFloorId = req.asset.floor ? req.asset.floor.toString() : null;

        const [assetCategories, floors, zonesForFloor] = await Promise.all([
            AssetCategory.find({}).sort({ name: 1 }),
            Floor.find({}).sort({ name: 1 }),
            assetFloorId ? Zone.find({ floor: assetFloorId, division: divisionId }).sort({ name: 1 }) : [] // Fetch zones for current floor/division
        ]);
        res.render('editAsset', {
            asset: req.asset,
            assetCategories,
            floors,
            zones: zonesForFloor, // Pass pre-fetched zones
            // spvDivisionId added by middleware
            filters: req.query // Pass query params for back link
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});


router.post('/assets/:id/edit', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const { name, description, location, category, floor, zone } = req.body;
        const division = req.session.userDivision;

         // Optional: Validate that the selected zone belongs to the SPV's division
        if (zone) {
            const validZone = await Zone.findOne({ _id: zone, division: division });
            if (!validZone) {
                 throw new Error("Invalid zone selected for your division.");
            }
        }

        await Asset.findByIdAndUpdate(req.params.id, { name, description, location, category, floor, zone, division }); // Ensure division is set
        await logActivity(req.session.userId, `edited asset: ${name}.`);
        req.session.message = { type: 'success', text: 'Asset updated successfully.' };

        // --- Corrected Redirect Logic ---
        // Get filter params from hidden inputs or default
        const search = req.body.search || '';
        const floorFilter = req.body.floorFilterParam || 'all';
        const zoneFilter = req.body.zoneFilterParam || 'all';
        const categoryFilter = req.body.categoryFilterParam || 'all';
        const assetPage = req.body.assetPage || 1;
        const checklistPage = req.body.checklistPage || 1;

        const query = new URLSearchParams({
            search,
            floor: floorFilter,
            zone: zoneFilter,
            category: categoryFilter,
            assetPage,
            checklistPage
        });
        res.redirect(`/spv/dashboard?${query.toString()}`);

    } catch (err) {
        req.session.message = { type: 'error', text: `Error updating asset: ${err.message}` };
        // --- Redirect back to edit page with original filters ---
         const search = req.body.search || '';
         const floorFilter = req.body.floorFilterParam || 'all';
         const zoneFilter = req.body.zoneFilterParam || 'all';
         const categoryFilter = req.body.categoryFilterParam || 'all';
         const assetPage = req.body.assetPage || 1;
         const checklistPage = req.body.checklistPage || 1;

        const query = new URLSearchParams({
            search,
            floor: floorFilter,
            zone: zoneFilter,
            category: categoryFilter,
            assetPage,
            checklistPage
        });
        res.redirect(`/spv/assets/${req.params.id}/edit?${query.toString()}`);
    }
});

// Duplicate route remains largely the same, ensures new asset gets SPV's division
router.post('/assets/:id/duplicate', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const originalAsset = req.asset;
        const baseName = originalAsset.name.replace(/ \(Copy( \d+)?\)$/, '');
        // Search for copies only within the same division
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
            zone: originalAsset.zone, // Keep original zone, SPV can edit later if needed
            division: req.session.userDivision // Ensure it's assigned to the current SPV's division
        });
        await newAsset.save();

        await logActivity(req.session.userId, `duplicated asset: ${originalAsset.name} to ${newName}.`);
        req.session.message = { type: 'success', text: `Asset duplicated as "${newName}".` };
    } catch (err) {
        req.session.message = { type: 'error', text: 'Failed to duplicate asset.' };
    }
    // Redirect logic remains the same
    const { search, floor, zone, category, assetPage, checklistPage } = req.body;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (floor) query.append('floor', floor);
    if (zone) query.append('zone', zone);
    if (category) query.append('category', category);
    if (assetPage) query.append('assetPage', assetPage);
    if (checklistPage) query.append('checklistPage', checklistPage);
    res.redirect(`/spv/dashboard?${query.toString()}`);
});

// Delete route remains the same
router.post('/assets/:id/delete', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const assetName = req.asset.name;
         // The pre-hook on Asset model handles related ChecklistAssignment deletion
        await Asset.findByIdAndDelete(req.params.id);

        await logActivity(req.session.userId, `deleted asset: ${assetName}.`);
        req.session.message = { type: 'success', text: 'Asset deleted successfully.' };
        
        // Redirect logic remains the same
        const { search, floor, zone, category, assetPage, checklistPage } = req.body;
        const query = new URLSearchParams();
        if (search) query.append('search', search);
        if (floor) query.append('floor', floor);
        if (zone) query.append('zone', zone);
        if (category) query.append('category', category);
        if (assetPage) query.append('assetPage', assetPage);
        if (checklistPage) query.append('checklistPage', checklistPage);
        res.redirect(`/spv/dashboard?${query.toString()}`);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// QR code route remains the same
router.get('/asset/:id/qr', ensureAssetBelongsToUser, async (req, res) => {
    try {
        // Generate QR Code containing only the Asset ID for simplicity
        const qrCodeDataUrl = await qrcode.toDataURL(req.params.id, { errorCorrectionLevel: 'H', margin: 2, width: 250 });

        // Get filter params from query for the back link
        const { search, floor, zone, category, assetPage, checklistPage } = req.query;
        const query = new URLSearchParams();
        if (search) query.append('search', search);
        if (floor) query.append('floor', floor);
        if (zone) query.append('zone', zone);
        if (category) query.append('category', category);
        if (assetPage) query.append('assetPage', assetPage);
        if (checklistPage) query.append('checklistPage', checklistPage);

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QR Code for ${req.asset.name}</title>
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; font-family: sans-serif; text-align: center; }
                    img { margin: 2rem; border: 1px solid #ccc; padding: 10px; background: white; }
                    button { padding: 10px 20px; margin-top: 1rem; cursor: pointer; }
                    a { margin-top: 1rem; }
                    @media print {
                        body { justify-content: flex-start; min-height: auto;}
                        button, a { display: none; }
                        img { margin: 1rem; }
                    }
                </style>
            </head>
            <body>
                <h2>${req.asset.name}</h2>
                <p>Fl. ${req.asset.floor ? req.asset.floor.name : 'N/A'}, Zone ${req.asset.zone ? req.asset.zone.name : 'N/A'}, Loc: ${req.asset.location || 'N/A'}</p>
                <img src="${qrCodeDataUrl}" alt="QR Code for ${req.asset.name}"/>
                <p>Print this QR Code and attach it to the asset.</p>
                <button onclick="window.print()">Print QR Code</button>
                <br>
                <a href="/spv/dashboard?${query.toString()}">Back to Dashboard</a>
            </body>
            </html>
        `);
    } catch (err) {
        res.status(500).send(err.message);
    }
});


// Sort route remains the same
router.post('/assets/sort', async (req, res) => {
    try {
        const { order } = req.body; // Expects an array of asset IDs
        const updates = order.map((id, index) =>
            // Ensure we only update assets within the SPV's division
            Asset.findOneAndUpdate({ _id: id, division: req.session.userDivision }, { order: index })
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

// Create Checklist Routes remain the same (Checklists are already division-specific)
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
        // Handle cases where only one task is submitted (req.body fields won't be arrays)
        const descriptions = Array.isArray(taskDescriptions) ? taskDescriptions : (taskDescriptions ? [taskDescriptions] : []);
        const inputTypes = Array.isArray(taskInputTypes) ? taskInputTypes : (taskInputTypes ? [taskInputTypes] : []);
        const expectedUnits = Array.isArray(taskExpectedUnits) ? taskExpectedUnits : (taskExpectedUnits ? [taskExpectedUnits] : []);
        const minRanges = Array.isArray(taskMinRanges) ? taskMinRanges : (taskMinRanges ? [taskMinRanges] : []);
        const maxRanges = Array.isArray(taskMaxRanges) ? taskMaxRanges : (taskMaxRanges ? [taskMaxRanges] : []);
        const expectedUnitsCustom = Array.isArray(taskExpectedUnitsCustom) ? taskExpectedUnitsCustom : (taskExpectedUnitsCustom ? [taskExpectedUnitsCustom] : []);


        if (descriptions.length === 0) {
             throw new Error("Checklist must have at least one task.");
        }

        const tasks = descriptions.map((desc, i) => {
            const unit = expectedUnits[i];
            const customUnit = expectedUnitsCustom[i];
            return {
                description: desc,
                inputType: inputTypes[i],
                expectedUnit: unit === 'other' ? (customUnit || '') : (unit || ''), // Use custom unit if 'other', default to empty string
                minRange: minRanges[i] || null, // Default to null if empty
                maxRange: maxRanges[i] || null, // Default to null if empty
            };
        });

        const newChecklist = new Checklist({
             title,
             tasks,
             createdBy: req.session.userId,
             division: req.session.userDivision // Assign to SPV's division
         });
        await newChecklist.save();

        await logActivity(req.session.userId, `created a new checklist: ${title}.`);
        req.session.message = { type: 'success', text: 'Checklist created successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        // Handle potential duplicate key error for checklist title within the same division
        if (err.code === 11000 || err.message.includes('duplicate key error')) {
            req.session.message = { type: 'error', text: `A checklist with the title "${req.body.title}" already exists in your division.` };
        } else {
            req.session.message = { type: 'error', text: `Error creating checklist: ${err.message}` };
        }
        // Redirect back to the form to show the error
        // Need to pass existingChecklists again if the form requires it
         try {
             const existingChecklists = await Checklist.find({ division: req.session.userDivision }).sort({ title: 1 });
             res.render('createChecklist', { existingChecklists, message: req.session.message });
             delete req.session.message; // Clear message after rendering
         } catch(fetchErr) {
             console.error("Error fetching existing checklists for redirect:", fetchErr);
             res.redirect('/spv/checklists/new'); // Fallback redirect
         }
    }
});


// Edit Checklist Routes remain the same
router.get('/checklists/:id/edit', ensureChecklistBelongsToDivision, (req, res) => {
    res.render('editChecklist', { checklist: req.checklist });
});

router.post('/checklists/:id/edit', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const { title, taskDescriptions, taskInputTypes, taskExpectedUnits, taskMinRanges, taskMaxRanges, taskExpectedUnitsCustom } = req.body;
        // Handle single task submission case again
        const descriptions = Array.isArray(taskDescriptions) ? taskDescriptions : (taskDescriptions ? [taskDescriptions] : []);
        const inputTypes = Array.isArray(taskInputTypes) ? taskInputTypes : (taskInputTypes ? [taskInputTypes] : []);
        const expectedUnits = Array.isArray(taskExpectedUnits) ? taskExpectedUnits : (taskExpectedUnits ? [taskExpectedUnits] : []);
        const minRanges = Array.isArray(taskMinRanges) ? taskMinRanges : (taskMinRanges ? [taskMinRanges] : []);
        const maxRanges = Array.isArray(taskMaxRanges) ? taskMaxRanges : (taskMaxRanges ? [taskMaxRanges] : []);
        const expectedUnitsCustom = Array.isArray(taskExpectedUnitsCustom) ? taskExpectedUnitsCustom : (taskExpectedUnitsCustom ? [taskExpectedUnitsCustom] : []);

        if (descriptions.length === 0) {
             throw new Error("Checklist must have at least one task.");
        }

        const tasks = descriptions.map((desc, i) => ({
            description: desc,
            inputType: inputTypes[i],
            expectedUnit: expectedUnits[i] === 'other' ? (expectedUnitsCustom[i] || '') : (expectedUnits[i] || ''),
            minRange: minRanges[i] || null,
            maxRange: maxRanges[i] || null,
        }));

        await Checklist.findByIdAndUpdate(req.params.id, { title, tasks });
        await logActivity(req.session.userId, `edited checklist: ${title}.`);
        req.session.message = { type: 'success', text: 'Checklist updated successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
         if (err.code === 11000 || err.message.includes('duplicate key error')) {
             req.session.message = { type: 'error', text: `A checklist with the title "${req.body.title}" already exists in your division.` };
         } else {
             req.session.message = { type: 'error', text: `Error updating checklist: ${err.message}` };
         }
        res.redirect(`/spv/checklists/${req.params.id}/edit`);
    }
});

// Assign Checklist - Pass mallFloorOrder for correct display
router.get('/checklists/:id/assign', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const divisionId = req.session.userDivision;
        // Fetch data concurrently
        const [assets, assignments, floors, zonesData] = await Promise.all([
            Asset.find({ division: divisionId }).populate('category floor zone').sort({ name: 1 }),
            ChecklistAssignment.find({ checklist: req.params.id, division: divisionId }, 'asset'), // Ensure assignments are also filtered by division
            Floor.find().sort({ name: 1 }),
            Zone.find({ division: divisionId }).sort({ name: 1 }) // Only zones for this SPV's division
        ]);

        // Define the desired mall floor order
        const mallFloorOrder = ['B', 'LM', 'G', 'UG', '1', '2', '3', '3A', '5', 'MO'];

        // Group assets by category -> floor -> zone
        const assetsByHierarchy = {};
        assets.forEach(asset => {
            const categoryName = asset.category ? asset.category.name : 'Uncategorized';
            const floorName = asset.floor ? asset.floor.name : 'No Floor';
            const zoneName = asset.zone ? asset.zone.name : 'No Zone';

            if (!assetsByHierarchy[categoryName]) assetsByHierarchy[categoryName] = {};
            if (!assetsByHierarchy[categoryName][floorName]) assetsByHierarchy[categoryName][floorName] = {};
            if (!assetsByHierarchy[categoryName][floorName][zoneName]) assetsByHierarchy[categoryName][floorName][zoneName] = [];

            assetsByHierarchy[categoryName][floorName][zoneName].push(asset);
        });

        // Sort assets within each zone alphanumerically by name
        // Sort zones within each floor alphanumerically by name
        Object.keys(assetsByHierarchy).forEach(categoryName => {
            Object.keys(assetsByHierarchy[categoryName]).forEach(floorName => {
                const zonesInFloor = assetsByHierarchy[categoryName][floorName];
                const sortedZoneNames = Object.keys(zonesInFloor).sort(); // Sort zone names
                const sortedZones = {};
                sortedZoneNames.forEach(zoneName => {
                    zonesInFloor[zoneName].sort((a, b) => a.name.localeCompare(b.name)); // Sort assets in zone
                    sortedZones[zoneName] = zonesInFloor[zoneName];
                });
                assetsByHierarchy[categoryName][floorName] = sortedZones; // Replace with sorted zones object
            });
        });

        // Sort category names alphanumerically
        const sortedCategoryNames = Object.keys(assetsByHierarchy).sort();
        const sortedAssetsByHierarchy = {};
        sortedCategoryNames.forEach(catName => {
            sortedAssetsByHierarchy[catName] = assetsByHierarchy[catName];
        });


        const assignedAssetIds = assignments.map(a => a.asset.toString());

        res.render('assignChecklist', {
            checklist: req.checklist,
            assetsByHierarchy: sortedAssetsByHierarchy, // Use the category-sorted hierarchy
            assignedAssetIds,
            floors, // Send all floor objects
            zones: zonesData, // Send division-specific zones
            mallFloorOrder // *** SEND THE DEFINED FLOOR ORDER TO THE VIEW ***
        });
    } catch (err) {
        console.error("Assign Checklist Error:", err);
        res.status(500).send(err.message);
    }
});


// Assign POST route remains the same logic, but ensures assignments are division-specific
router.post('/checklists/:id/assign', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const checklistId = req.params.id;
        const divisionId = req.session.userDivision;
        const assetIds = Array.isArray(req.body.assetIds) ? req.body.assetIds : req.body.assetIds ? [req.body.assetIds] : [];

        // Delete only assignments for THIS checklist and THIS division
        await ChecklistAssignment.deleteMany({ checklist: checklistId, division: divisionId });

        if (assetIds.length > 0) {
             // Optional: Verify selected assetIds belong to the SPV's division before inserting
             const validAssets = await Asset.find({ _id: { $in: assetIds }, division: divisionId }).select('_id');
             const validAssetIds = validAssets.map(a => a._id.toString());

            const newAssignments = validAssetIds.map(assetId => ({
                checklist: checklistId,
                asset: assetId,
                division: divisionId // Ensure division is saved with assignment
            }));
            if (newAssignments.length > 0) {
                 await ChecklistAssignment.insertMany(newAssignments);
            }
             const assignedCount = newAssignments.length;
             const skippedCount = assetIds.length - validAssetIds.length;
             await logActivity(req.session.userId, `assigned checklist "${req.checklist.title}" to ${assignedCount} assets.`);
             req.session.message = { type: 'success', text: `Assignments updated successfully (${assignedCount} assigned${skippedCount > 0 ? `, ${skippedCount} skipped (wrong division)` : ''}).` };

        } else {
             await logActivity(req.session.userId, `cleared assignments for checklist "${req.checklist.title}".`);
             req.session.message = { type: 'success', text: 'Assignments cleared successfully.' };
        }

        res.redirect('/spv/dashboard');
    } catch (err) {
        console.error("Error assigning checklist:", err);
        req.session.message = { type: 'error', text: `Error updating assignments: ${err.message}` };
        res.redirect(`/spv/checklists/${req.params.id}/assign`); // Redirect back on error
    }
});

// Delete Checklist route remains the same
router.get('/checklists/:id/delete', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        // The pre-hook on the Checklist model handles deleting related assignments
        await Checklist.deleteOne({ _id: req.params.id, division: req.session.userDivision }); // Extra safety check for division
        await logActivity(req.session.userId, `deleted checklist: ${req.checklist.title}.`);
        req.session.message = { type: 'success', text: 'Checklist deleted successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// Sort Checklist route remains the same
router.post('/checklists/sort', async (req, res) => {
    try {
        const { order } = req.body;
        const updates = order.map((id, index) =>
            // Ensure we only update checklists within the SPV's division
            Checklist.findOneAndUpdate({ _id: id, division: req.session.userDivision }, { order: index })
        );
        await Promise.all(updates);
        res.json({ message: 'Checklist order updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;