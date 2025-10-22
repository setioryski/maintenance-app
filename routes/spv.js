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
                  query['assetSnapshot.floor'] = floorDoc.name; // Filter on snapshot data
             }
        }
        // Zone filtering on snapshot data
        if (zone !== 'all') {
            const zoneDoc = await Zone.findById(zone); // Ensure this zone belongs to the division
            if(zoneDoc && zoneDoc.division.toString() === divisionId){
                 query['assetSnapshot.zone'] = zoneDoc.name; // Filter on snapshot data
            }
       }

        const totalReports = await MaintenanceReport.countDocuments(query);
        const totalPages = Math.ceil(totalReports / limit);

        const reports = await MaintenanceReport.find(query)
            .populate('submittedBy', 'name') // Populate for display
            .populate('rejectedBy', 'name') // Populate for display
            .sort({ completedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(); // Use lean for list views

        const [floorsData, zonesData, technicians] = await Promise.all([
            Floor.find({}).sort({ name: 1 }).lean(),
            Zone.find({ division: divisionId }).populate('floor', '_id').sort({ name: 1 }).lean(), // Only zones for this division, populate floor ID
            User.find({ role: 'technician', division: divisionId }).sort({ name: 1 }).lean()
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

        // Prevent rejecting an already manager-approved report from SPV side
        if (action === 'reject' && reportToUpdate.verifiedByManager) {
             const message = 'Cannot reject a report already approved by the manager.';
             if (req.headers.accept && req.headers.accept.includes('application/json')) {
                return res.status(400).json({ success: false, message: message });
             } else {
                req.session.message = { type: 'error', text: message };
                return res.redirect('back');
             }
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

        const report = await MaintenanceReport.findByIdAndUpdate(reportId, updateData, { new: true }); // Use new:true to get updated doc
        if (report) {
            await logActivity(user._id, `${action}d a report for asset: ${report.assetSnapshot.name}.`);
        } else {
             // Should not happen due to findOne check, but as a safeguard
             return res.status(404).json({ success: false, message: 'Report not found during update.' });
        }


        if (req.body.fromDetail === 'true') {
            req.session.message = { type: 'success', text: `Report ${action}d successfully.` };
            return res.redirect(`/spv/report/${reportId}/detail`);
        }
         // Check if request expects JSON (for AJAX calls from dashboard)
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
           return res.json({ success: true, status: action, report }); // Send back updated report status
        }
        // Fallback redirect if not AJAX and not from detail page
        req.session.message = { type: 'success', text: `Report ${action}d successfully.` };
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
            req.session.message = { type: 'error', text: 'Report not found or not accessible in your division.' };
            return res.redirect('/spv/report');
        }

        res.render('spvChecklistReportDetail', { assignment: report });
    } catch (err) {
        console.error("SPV Report Detail Error:", err);
        req.session.message = { type: 'error', text: `Error loading report detail: ${err.message}` };
        res.redirect('/spv/report');
    }
});


// =================================================================
//                      ASSET MANAGEMENT
// =================================================================

/**
 * GET /spv/assets/new
 * Displays the form to create a new asset.
 */
router.get('/assets/new', async (req, res) => {
    try {
        const [assetCategories, floors] = await Promise.all([
            AssetCategory.find({}).sort({ name: 1 }),
            Floor.find({}).sort({ name: 1 }),
            // Zones will be fetched dynamically via API based on floor selection
        ]);
        res.render('createAsset', {
             assetCategories,
             floors,
             // spvDivisionId is added by middleware and available in locals
        });
    } catch (err) {
        console.error("Create Asset Form Error:", err);
        req.session.message = { type: 'error', text: `Error loading asset creation form: ${err.message}` };
        res.redirect('/spv/dashboard'); // Redirect back to dashboard on error
    }
});


/**
 * POST /spv/assets
 * Handles the creation of a new asset.
 */
router.post('/assets', async (req, res) => {
    try {
        const { name, description, location, category, floor, zone } = req.body;
        const division = req.session.userDivision; // SPV's division

        // **Server-side validation**: Ensure the selected zone belongs to the SPV's division AND the selected floor
        if (!name || !category || !floor || !zone) {
            throw new Error("Name, Category, Floor, and Zone are required.");
        }

        const validZone = await Zone.findOne({ _id: zone, division: division, floor: floor });
        if (!validZone) {
             throw new Error("Invalid zone selected for the chosen floor and your division.");
        }

        const newAsset = new Asset({ name, description, location, category, floor, zone, division });
        await newAsset.save();

        await logActivity(req.session.userId, `created a new asset: ${name}.`);
        req.session.message = { type: 'success', text: 'Asset created successfully.' };
        res.redirect('/spv/dashboard'); // Redirect to dashboard after successful creation
    } catch (err) {
        console.error("Create Asset Error:", err);
        req.session.message = { type: 'error', text: `Error creating asset: ${err.message}` };
        // Redirect back to the form, repopulating requires fetching data again
        try {
             const [assetCategories, floors] = await Promise.all([
                 AssetCategory.find({}).sort({ name: 1 }),
                 Floor.find({}).sort({ name: 1 }),
             ]);
             res.render('createAsset', {
                  assetCategories,
                  floors,
                  // Pass back submitted data to repopulate form (optional, for better UX)
                  formData: req.body,
                  message: req.session.message // Show error message on the form
             });
             delete req.session.message; // Clear message after rendering
        } catch (fetchErr) {
             console.error("Error reloading create asset form:", fetchErr);
             res.redirect('/spv/assets/new'); // Fallback redirect
        }
    }
});

/**
 * GET /spv/assets/:id/edit
 * Displays the form to edit an existing asset.
 */
router.get('/assets/:id/edit', ensureAssetBelongsToUser, async (req, res) => {
    try {
        const divisionId = req.session.userDivision;
        // Use the asset attached by the middleware (req.asset)
        const assetToEdit = req.asset;
        const assetFloorId = assetToEdit.floor ? assetToEdit.floor.toString() : null;

        // Fetch necessary data for dropdowns
        const [assetCategories, floors, zonesForFloor] = await Promise.all([
            AssetCategory.find({}).sort({ name: 1 }).lean(),
            Floor.find({}).sort({ name: 1 }).lean(),
            assetFloorId ? Zone.find({ floor: assetFloorId, division: divisionId }).sort({ name: 1 }).lean() : [] // Fetch zones for the asset's current floor/division
        ]);

        res.render('editAsset', {
            asset: assetToEdit, // Send the asset object
            assetCategories,
            floors,
            zones: zonesForFloor, // Pass pre-fetched zones for the initial state
            // spvDivisionId added by middleware is available in locals
            filters: req.query // Pass query params for constructing the cancel/back link
        });
    } catch (err) {
        console.error("Edit Asset Form Error:", err);
        req.session.message = { type: 'error', text: `Error loading edit form: ${err.message}` };
        res.redirect('/spv/dashboard'); // Redirect on error
    }
});


/**
 * POST /spv/assets/:id/edit
 * Handles the update of an existing asset.
 */
router.post('/assets/:id/edit', ensureAssetBelongsToUser, async (req, res) => {
    // Construct redirect query parameters first, using hidden inputs from form
    const search = req.body.search || '';
    const floorFilter = req.body.floorFilterParam || 'all';
    const zoneFilter = req.body.zoneFilterParam || 'all';
    const categoryFilter = req.body.categoryFilterParam || 'all';
    const assetPage = req.body.assetPage || 1;
    const checklistPage = req.body.checklistPage || 1;
    const redirectQuery = new URLSearchParams({
        search, floor: floorFilter, zone: zoneFilter, category: categoryFilter, assetPage, checklistPage
    });
    const dashboardRedirectUrl = `/spv/dashboard?${redirectQuery.toString()}`;
    const editRedirectUrl = `/spv/assets/${req.params.id}/edit?${redirectQuery.toString()}`;

    try {
        const { name, description, location, category, floor, zone } = req.body;
        const division = req.session.userDivision; // SPV's division

        // **Server-side validation**
        if (!name || !category || !floor || !zone) {
            throw new Error("Name, Category, Floor, and Zone are required.");
        }
        const validZone = await Zone.findOne({ _id: zone, division: division, floor: floor });
        if (!validZone) {
             throw new Error("Invalid zone selected for the chosen floor and your division.");
        }

        // Update the asset (ensureAssetBelongsToUser already verified ownership)
        await Asset.findByIdAndUpdate(req.params.id, { name, description, location, category, floor, zone, division }); // Ensure division remains correct

        await logActivity(req.session.userId, `edited asset: ${name}.`);
        req.session.message = { type: 'success', text: 'Asset updated successfully.' };

        // Redirect back to the dashboard with original filters applied
        res.redirect(dashboardRedirectUrl);

    } catch (err) {
        console.error("Update Asset Error:", err);
        req.session.message = { type: 'error', text: `Error updating asset: ${err.message}` };
        // Redirect back to the edit page with filters on error
        res.redirect(editRedirectUrl);
    }
});

/**
 * POST /spv/assets/:id/duplicate
 * Creates a copy of an existing asset within the SPV's division.
 */
router.post('/assets/:id/duplicate', ensureAssetBelongsToUser, async (req, res) => {
    // Construct redirect query parameters first
    const { search, floor, zone, category, assetPage, checklistPage } = req.body;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (floor) query.append('floor', floor);
    if (zone) query.append('zone', zone);
    if (category) query.append('category', category);
    if (assetPage) query.append('assetPage', assetPage);
    if (checklistPage) query.append('checklistPage', checklistPage);
    const redirectUrl = `/spv/dashboard?${query.toString()}`;

    try {
        const originalAsset = req.asset; // Asset from middleware
        const baseName = originalAsset.name.replace(/ \(Copy( \d+)?\)$/, ''); // Clean base name

        // Search for existing copies *within the same division* to determine the next number
        const searchRegex = new RegExp(`^${escapeRegex(baseName)} \\(Copy(?: (\\d+))?\\)$`);
        const relatedAssets = await Asset.find({ name: { $regex: `^${escapeRegex(baseName)}` }, division: req.session.userDivision });

        let maxCopyNum = 0;
        relatedAssets.forEach(asset => {
            const match = asset.name.match(searchRegex);
            if (match) {
                // If match[1] exists, it's a numbered copy (e.g., " (Copy 2)")
                const num = match[1] ? parseInt(match[1].trim(), 10) : 1; // Treat "(Copy)" as 1
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
            zone: originalAsset.zone, // Duplicate keeps the original zone
            division: req.session.userDivision // Ensure assigned to current SPV's division
            // order field will default to 0 or can be set if needed
        });
        await newAsset.save();

        await logActivity(req.session.userId, `duplicated asset: ${originalAsset.name} to ${newName}.`);
        req.session.message = { type: 'success', text: `Asset duplicated as "${newName}".` };
    } catch (err) {
        console.error("Duplicate Asset Error:", err);
        req.session.message = { type: 'error', text: `Failed to duplicate asset: ${err.message}` };
    }
    // Redirect back to the dashboard with original filters
    res.redirect(redirectUrl);
});

/**
 * POST /spv/assets/:id/delete
 * Deletes an asset.
 */
router.post('/assets/:id/delete', ensureAssetBelongsToUser, async (req, res) => {
    // Construct redirect query parameters first
    const { search, floor, zone, category, assetPage, checklistPage } = req.body;
    const query = new URLSearchParams();
    if (search) query.append('search', search);
    if (floor) query.append('floor', floor);
    if (zone) query.append('zone', zone);
    if (category) query.append('category', category);
    if (assetPage) query.append('assetPage', assetPage);
    if (checklistPage) query.append('checklistPage', checklistPage);
    const redirectUrl = `/spv/dashboard?${query.toString()}`;

    try {
        const assetName = req.asset.name; // Get name before deleting
         // The pre-hook on the Asset model handles deleting associated ChecklistAssignments
        await Asset.findByIdAndDelete(req.params.id);

        await logActivity(req.session.userId, `deleted asset: ${assetName}.`);
        req.session.message = { type: 'success', text: 'Asset deleted successfully.' };

        res.redirect(redirectUrl);
    } catch (err) {
        console.error("Delete Asset Error:", err);
        req.session.message = { type: 'error', text: `Error deleting asset: ${err.message}` };
        res.redirect(redirectUrl); // Redirect even on error
    }
});


/**
 * GET /spv/asset/:id/qr
 * Generates and displays a QR code page for an asset.
 */
// QR code route (Updated to use populated asset and correct HTML structure)
router.get('/asset/:id/qr', ensureAssetBelongsToUser, async (req, res) => {
    try {
        // req.asset is populated by ensureAssetBelongsToUser middleware
        // Re-populate here to ensure floor and zone names are available for display
        const asset = await Asset.findById(req.params.id).populate('floor zone');
        if (!asset) {
            return res.status(404).send('Asset not found');
        }

        // Generate QR Code containing only the Asset ID
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

        // ** UPDATED HTML Generation **
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QR Code for ${asset.name}</title>
                <style>
                    body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; font-family: sans-serif; text-align: center; }
                    .qr-container { border: 1px solid #ccc; padding: 20px; background: white; margin-bottom: 1rem; }
                    img { display: block; margin: 0 auto; }
                    .asset-details { margin-top: 1rem; }
                    button { padding: 10px 20px; margin-top: 1rem; cursor: pointer; }
                    a { margin-top: 1rem; }
                    @media print {
                        body { justify-content: flex-start; min-height: auto;}
                        button, a { display: none; }
                        .qr-container { border: none; padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="qr-container">
                    <img src="${qrCodeDataUrl}" alt="QR Code for ${asset.name}"/>
                    <div class="asset-details">
                         <h2>${asset.name}</h2>
                         <p>Fl. ${asset.floor ? asset.floor.name : 'N/A'}, Zone ${asset.zone ? asset.zone.name : 'N/A'}<br>Loc: ${asset.location || 'N/A'}</p>
                    </div>
                </div>
                <p>Print this QR Code and attach it to the asset.</p>
                <button onclick="window.print()">Print QR Code</button>
                <br>
                <a href="/spv/dashboard?${query.toString()}">Back to Dashboard</a>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("QR Code Generation Error:", err); // Log the error
        res.status(500).send(`An error occurred while generating the QR code: ${err.message}`);
    }
});


/**
 * POST /spv/assets/sort
 * Updates the order of assets based on drag-and-drop.
 */
router.post('/assets/sort', async (req, res) => {
    try {
        const { order } = req.body; // Expects an array of asset IDs in the new order
        if (!Array.isArray(order)) {
            return res.status(400).json({ error: 'Invalid order data provided.' });
        }
        // Create an array of promises for updating each asset's order
        const updates = order.map((id, index) =>
            // Ensure we only update assets within the SPV's division for security
            Asset.findOneAndUpdate({ _id: id, division: req.session.userDivision }, { order: index })
        );
        // Execute all updates concurrently
        await Promise.all(updates);
        res.json({ message: 'Asset order updated successfully.' });
    } catch (err) {
        console.error("Asset Sort Error:", err);
        res.status(500).json({ error: `Failed to update asset order: ${err.message}` });
    }
});


// =================================================================
//                      CHECKLIST MANAGEMENT
// =================================================================

/**
 * GET /spv/checklists/new
 * Displays the form to create a new checklist.
 */
router.get('/checklists/new', async (req, res) => {
    try {
        // Fetch existing checklists only for the SPV's division to use as templates
        const existingChecklists = await Checklist.find({ division: req.session.userDivision }).sort({ title: 1 }).lean();
        res.render('createChecklist', { existingChecklists });
    } catch (err) {
        console.error("Create Checklist Form Error:", err);
        req.session.message = { type: 'error', text: `Error loading checklist form: ${err.message}` };
        res.redirect('/spv/dashboard');
    }
});

/**
 * POST /spv/checklists
 * Handles the creation of a new checklist.
 */
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
            const min = parseFloat(minRanges[i]);
            const max = parseFloat(maxRanges[i]);
            return {
                description: desc,
                inputType: inputTypes[i],
                expectedUnit: unit === 'other' ? (customUnit || '') : (unit || ''), // Use custom unit if 'other', default to empty string
                minRange: !isNaN(min) ? min : null, // Store as number or null
                maxRange: !isNaN(max) ? max : null, // Store as number or null
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
        console.error("Create Checklist Error:", err);
        // Handle potential duplicate key error (title unique per division)
        if (err.code === 11000 || (err.message && err.message.includes('duplicate key error'))) {
            req.session.message = { type: 'error', text: `A checklist with the title "${req.body.title}" already exists in your division.` };
        } else {
            req.session.message = { type: 'error', text: `Error creating checklist: ${err.message}` };
        }
        // Redirect back to the form, repopulating requires fetching data again
         try {
             const existingChecklists = await Checklist.find({ division: req.session.userDivision }).sort({ title: 1 }).lean();
             res.render('createChecklist', {
                existingChecklists,
                formData: req.body, // Pass submitted data back (optional)
                message: req.session.message
             });
             delete req.session.message;
         } catch(fetchErr) {
             console.error("Error reloading create checklist form:", fetchErr);
             res.redirect('/spv/checklists/new'); // Fallback
         }
    }
});


/**
 * GET /spv/checklists/:id/edit
 * Displays the form to edit an existing checklist.
 */
// Ensure checklist belongs to the division using middleware
router.get('/checklists/:id/edit', ensureChecklistBelongsToDivision, (req, res) => {
    // req.checklist is attached by the middleware
    res.render('editChecklist', { checklist: req.checklist });
});

/**
 * POST /spv/checklists/:id/edit
 * Handles the update of an existing checklist.
 */
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

        const tasks = descriptions.map((desc, i) => {
             const unit = expectedUnits[i];
             const customUnit = expectedUnitsCustom[i];
             const min = parseFloat(minRanges[i]);
             const max = parseFloat(maxRanges[i]);
             return {
                 description: desc,
                 inputType: inputTypes[i],
                 expectedUnit: unit === 'other' ? (customUnit || '') : (unit || ''),
                 minRange: !isNaN(min) ? min : null,
                 maxRange: !isNaN(max) ? max : null,
             };
         });

        // Update the checklist (ownership checked by middleware)
        await Checklist.findByIdAndUpdate(req.params.id, { title, tasks });

        await logActivity(req.session.userId, `edited checklist: ${title}.`);
        req.session.message = { type: 'success', text: 'Checklist updated successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
         console.error("Update Checklist Error:", err);
         if (err.code === 11000 || (err.message && err.message.includes('duplicate key error'))) {
             req.session.message = { type: 'error', text: `A checklist with the title "${req.body.title}" already exists in your division.` };
         } else {
             req.session.message = { type: 'error', text: `Error updating checklist: ${err.message}` };
         }
        // Redirect back to edit form on error
        res.redirect(`/spv/checklists/${req.params.id}/edit`);
    }
});

/**
 * GET /spv/checklists/:id/assign
 * Displays the page for assigning a checklist to assets within the SPV's division.
 */
router.get('/checklists/:id/assign', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const checklistId = req.params.id;
        const divisionId = req.session.userDivision;

        // Fetch assets (only for SPV's division), current assignments, floors, and zones concurrently
        const [assets, assignments, floors, zonesData] = await Promise.all([
            Asset.find({ division: divisionId })
                 .populate('category floor zone') // Populate needed details
                 .sort({ name: 1 }) // Sort assets alphabetically
                 .lean(),
            ChecklistAssignment.find({ checklist: checklistId, division: divisionId }, 'asset').lean(), // Get assignments for *this* checklist & division
            Floor.find({}).sort({ name: 1 }).lean(), // Fetch all floors for display structure
            Zone.find({ division: divisionId }).sort({ name: 1 }).lean() // Fetch zones only for this division
        ]);

        // Define the desired mall floor order for consistent display
        const mallFloorOrder = ['B', 'LM', 'G', 'UG', '1', '2', '3', '3A', '5']; // Add 'MO' if needed, ensure names match DB

        // Group assets by category -> floor -> zone for structured display
        const assetsByHierarchy = {};
        assets.forEach(asset => {
            const categoryName = asset.category?.name || 'Uncategorized';
            const floorName = asset.floor?.name || 'No Floor';
            const zoneName = asset.zone?.name || 'No Zone';

            if (!assetsByHierarchy[categoryName]) assetsByHierarchy[categoryName] = {};
            if (!assetsByHierarchy[categoryName][floorName]) assetsByHierarchy[categoryName][floorName] = {};
            if (!assetsByHierarchy[categoryName][floorName][zoneName]) assetsByHierarchy[categoryName][floorName][zoneName] = [];

            assetsByHierarchy[categoryName][floorName][zoneName].push(asset);
            // Assets within zone are already sorted by name due to the initial query sort
        });

        // Sort zones within each floor alphanumerically by name
        // Sort categories alphanumerically
        const sortedCategoryNames = Object.keys(assetsByHierarchy).sort();
        const sortedAssetsByHierarchy = {};
        sortedCategoryNames.forEach(categoryName => {
            const floorsInCategory = assetsByHierarchy[categoryName];
            Object.keys(floorsInCategory).forEach(floorName => {
                const zonesInFloor = floorsInCategory[floorName];
                const sortedZoneNames = Object.keys(zonesInFloor).sort(); // Sort zone names
                const sortedZonesObject = {};
                sortedZoneNames.forEach(zoneName => {
                    sortedZonesObject[zoneName] = zonesInFloor[zoneName]; // Assets already sorted
                });
                floorsInCategory[floorName] = sortedZonesObject; // Replace with sorted zones object
            });
            sortedAssetsByHierarchy[categoryName] = floorsInCategory;
        });


        const assignedAssetIds = assignments.map(a => a.asset.toString());

        res.render('assignChecklist', {
            checklist: req.checklist, // Checklist from middleware
            assetsByHierarchy: sortedAssetsByHierarchy, // Use the fully sorted hierarchy
            assignedAssetIds,
            floors, // Send all floor objects (used for floor ordering logic in EJS)
            zones: zonesData, // Send division-specific zones (might not be needed if hierarchy is built)
            mallFloorOrder // Send the defined floor order to the view
        });
    } catch (err) {
        console.error("Assign Checklist Form Error:", err);
        req.session.message = { type: 'error', text: `Error loading assignment page: ${err.message}` };
        res.redirect('/spv/dashboard');
    }
});


/**
 * POST /spv/checklists/:id/assign
 * Updates the assignments for a checklist.
 */
router.post('/checklists/:id/assign', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const checklistId = req.params.id;
        const divisionId = req.session.userDivision;
        // Ensure assetIds is always an array, even if only one or none are submitted
        const submittedAssetIds = Array.isArray(req.body.assetIds) ? req.body.assetIds : req.body.assetIds ? [req.body.assetIds] : [];

        // 1. Delete existing assignments for THIS checklist and THIS division only
        await ChecklistAssignment.deleteMany({ checklist: checklistId, division: divisionId });

        let assignedCount = 0;
        let skippedCount = 0;

        if (submittedAssetIds.length > 0) {
             // 2. Verify that all submitted assetIds actually belong to the SPV's division
             const validAssets = await Asset.find({ _id: { $in: submittedAssetIds }, division: divisionId }).select('_id').lean();
             const validAssetIds = validAssets.map(a => a._id.toString());

             skippedCount = submittedAssetIds.length - validAssetIds.length; // Calculate skipped count

            // 3. Create new assignments only for the valid assets
            if (validAssetIds.length > 0) {
                 const newAssignments = validAssetIds.map(assetId => ({
                     checklist: checklistId,
                     asset: assetId,
                     division: divisionId // Explicitly set division for the assignment
                 }));
                 await ChecklistAssignment.insertMany(newAssignments);
                 assignedCount = newAssignments.length;
            }
        }

        // Log and set appropriate message
        if (assignedCount > 0) {
            await logActivity(req.session.userId, `assigned checklist "${req.checklist.title}" to ${assignedCount} assets.`);
            req.session.message = { type: 'success', text: `Assignments updated (${assignedCount} assigned${skippedCount > 0 ? `, ${skippedCount} skipped (wrong division)` : ''}).` };
        } else if (submittedAssetIds.length === 0) {
            await logActivity(req.session.userId, `cleared assignments for checklist "${req.checklist.title}".`);
            req.session.message = { type: 'success', text: 'Assignments cleared successfully.' };
        } else { // Submitted IDs were provided, but none were valid for the division
             req.session.message = { type: 'warning', text: `No valid assets selected for assignment. ${skippedCount} asset(s) skipped (wrong division).` };
        }


        res.redirect('/spv/dashboard');
    } catch (err) {
        console.error("Error Assigning Checklist:", err);
        req.session.message = { type: 'error', text: `Error updating assignments: ${err.message}` };
        res.redirect(`/spv/checklists/${req.params.id}/assign`); // Redirect back to assign page on error
    }
});

/**
 * GET /spv/checklists/:id/delete
 * Deletes a checklist and its assignments.
 */
router.get('/checklists/:id/delete', ensureChecklistBelongsToDivision, async (req, res) => {
    try {
        const checklistTitle = req.checklist.title; // Get title before deleting
        // The pre-hook on the Checklist model handles deleting related ChecklistAssignments
        await Checklist.deleteOne({ _id: req.params.id }); // Middleware already confirmed ownership

        await logActivity(req.session.userId, `deleted checklist: ${checklistTitle}.`);
        req.session.message = { type: 'success', text: 'Checklist deleted successfully.' };
        res.redirect('/spv/dashboard');
    } catch (err) {
        console.error("Delete Checklist Error:", err);
        req.session.message = { type: 'error', text: `Error deleting checklist: ${err.message}` };
        res.redirect('/spv/dashboard'); // Redirect even on error
    }
});

/**
 * POST /spv/checklists/sort
 * Updates the order of checklists based on drag-and-drop.
 */
router.post('/checklists/sort', async (req, res) => {
    try {
        const { order } = req.body; // Expects an array of checklist IDs
        if (!Array.isArray(order)) {
            return res.status(400).json({ error: 'Invalid order data provided.' });
        }
        const updates = order.map((id, index) =>
            // Ensure we only update checklists within the SPV's division
            Checklist.findOneAndUpdate({ _id: id, division: req.session.userDivision }, { order: index })
        );
        await Promise.all(updates);
        res.json({ message: 'Checklist order updated successfully.' });
    } catch (err) {
        console.error("Checklist Sort Error:", err);
        res.status(500).json({ error: `Failed to update checklist order: ${err.message}` });
    }
});

module.exports = router;