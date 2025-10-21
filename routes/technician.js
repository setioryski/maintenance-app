// routes/technician.js
const express = require('express');
const mongoose = require('mongoose');
const path = require('path'); // Needed for path.basename
const { ensureAuthenticated, ensureTechnician } = require('../middleware/auth');
const { upload, imageProcessingQueue } = require('../middleware/fileUpload');
const { logActivity, escapeRegex } = require('../utils/helpers');

const router = express.Router();

// Apply ensureAuthenticated to all technician routes
router.use(ensureAuthenticated);

// --- Mongoose Models ---
const Asset = mongoose.model('Asset');
const Checklist = mongoose.model('Checklist');
const ChecklistAssignment = mongoose.model('ChecklistAssignment');
const MaintenanceReport = mongoose.model('MaintenanceReport');
const Floor = mongoose.model('Floor');
const AssetCategory = mongoose.model('AssetCategory');
const Zone = mongoose.model('Zone');
const Activity = mongoose.model('Activity');
const User = mongoose.model('User');

// --- Routes ---

/**
 * GET /technician/dashboard
 * Displays the main dashboard for the technician, showing all available assignments.
 */
router.get('/dashboard', async (req, res) => {
    try {
        const divisionId = req.session.userDivision;
        // Ensure divisionId exists, otherwise technician cannot see data.
        if (!divisionId) {
             console.error("Technician Dashboard Error: User division ID not found in session.");
             // Redirect to login or show an error page
             req.session.message = { type: 'error', text: 'Your user account is not properly configured with a division. Please contact an administrator.' };
             return res.redirect('/login');
        }

        const { page = 1, search = '', floor = 'all', zone = 'all', category = 'all' } = req.query;
        const limit = 10; // Number of assets per page
        const skip = (page - 1) * limit;

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

        // Find all assets within the technician's division with pagination
        const totalAssets = await Asset.countDocuments(assetFilter);
        const totalPages = Math.ceil(totalAssets / limit);
        // Populate necessary fields for display and filtering
        const assetsInDivision = await Asset.find(assetFilter)
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .populate('category floor zone') // Populate for display and JS filtering
            .lean();
        const assetIds = assetsInDivision.map(a => a._id);

        // Find all checklist assignments for those assets
        // Populate necessary fields
        const assignments = await ChecklistAssignment.find({ asset: { $in: assetIds }, division: divisionId }) // Filter assignments by division too
            .populate('checklist', 'title') // Only need title for display
            .populate({
                path: 'asset',
                // Select fields needed for display and grouping
                select: 'name location floor zone category',
                populate: [
                    { path: 'floor', select: 'name' },
                    { path: 'category', select: 'name' },
                    { path: 'zone', select: 'name _id floor' } // Ensure floor ID is populated within zone for data-* attribute
                ]
            })
            .lean(); // Use lean for performance

        // Get unique checklist IDs to fetch checklist data (if needed elsewhere, otherwise checklist title is populated)
        // const checklistIds = [...new Set(assignments.map(a => a.checklist?._id).filter(Boolean))];

        // Fetch all necessary data in parallel for efficiency
        const [floorsData, assetCategoriesData, zonesData, activitiesData /*, checklistsData*/] = await Promise.all([
            Floor.find({}).sort({ name: 1 }).lean(),
            AssetCategory.find({}).sort({ name: 1 }).lean(),
            // *** FIX: Fetch only zones relevant to the technician's division ***
             // Also populate floor ID for data-* attribute in the filter dropdown
            Zone.find({ division: divisionId }).populate('floor', '_id').sort({ name: 1 }).lean(),
            Activity.find({ $or: [{ 'division.id': divisionId }, { role: 'manager' }] }) // Show own division + manager activity
                .sort({ timestamp: -1 })
                .limit(20)
                .populate('user', 'name') // Populate user name from Activity model if needed
                .lean(),
            // Checklist.find({ _id: { $in: checklistIds } }).lean() // Only needed if more checklist data is required
        ]);

        // Group assignments by asset ID for easier rendering
        const groupedAssignments = {};
        assignments.forEach(assignment => {
            // Ensure asset exists (it should, based on query)
            if (!assignment.asset || !assignment.asset._id) return;

            const assetId = assignment.asset._id.toString();
            if (!groupedAssignments[assetId]) {
                // Store the fully populated asset object once
                groupedAssignments[assetId] = {
                    asset: assignment.asset,
                    checklists: []
                };
            }
            // Add the assignment (with populated checklist title)
            groupedAssignments[assetId].checklists.push(assignment);
        });

        // Convert groupedAssignments object to an array of assets with their checklists for rendering
        // Sort assets alphabetically by name before passing to the view
        const assetsForView = Object.values(groupedAssignments).sort((a, b) => {
             // Basic alphabetical sort
             if (!a.asset || !b.asset) return 0; // Safety check
             if (a.asset.name < b.asset.name) return -1;
             if (a.asset.name > b.asset.name) return 1;
             return 0;
             // Add more complex sorting based on floor/zone/order if needed later
         });


        // Pass toast message from session to locals and clear it
        const toastMessage = req.session.toastMessage;
        delete req.session.toastMessage; // Clear after retrieving

        res.render('technicianDashboard', {
            // assignments, // Pass grouped data instead
            assetsForView, // Pass the sorted array of assets with checklists
            floors: floorsData,
            assetCategories: assetCategoriesData,
            zones: zonesData, // Now contains only technician's division zones
            activities: activitiesData,
            // checklists: checklistsData,
            user: req.session, // Pass user session data to the view
            currentPage: page,
            totalPages,
            totalAssets, // Use totalAssets for pagination info if paginating assets
            limit,
            filters: { search, floor, zone, category },
            toastMessage: toastMessage // Pass toast message to the view
        });
    } catch (err) {
        console.error("Technician Dashboard Error:", err);
        res.status(500).send("An error occurred while loading the dashboard.");
    }
});

/**
 * GET /technician/checklist/:assignmentId
 * Displays a specific checklist for the technician to fill out.
 */
router.get('/checklist/:assignmentId', ensureTechnician, async (req, res) => {
    try {
        const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
            .populate('checklist')
            .populate({
                path: 'asset',
                populate: ['floor', 'category', 'zone', 'division']
            });

        if (!assignment) {
            req.session.message = { type: 'error', text: 'Checklist assignment not found.' };
            return res.redirect('/technician/dashboard');
        }

        // Ensure the assignment belongs to the technician's division
        // Check assignment's division field directly
        if (!assignment.division || assignment.division.toString() !== req.session.userDivision) {
             // Or check via the asset if assignment doesn't store division (though it should)
            // if (!assignment.asset || !assignment.asset.division || assignment.asset.division._id.toString() !== req.session.userDivision) {
                return res.status(403).send('Access Denied: This assignment is not in your division.');
            // }
        }


        res.render('technicianChecklist', { assignment });
    } catch (err) {
        console.error("View Checklist Error:", err);
        res.status(500).send("An error occurred while loading the checklist.");
    }
});

/**
 * POST /technician/checklist/:assignmentId/submit
 * Handles the submission of a completed checklist and creates a report.
 */
router.post('/checklist/:assignmentId/submit', ensureTechnician, upload.any(), async (req, res) => {
    try {
        const assignment = await ChecklistAssignment.findById(req.params.assignmentId)
            .populate('checklist')
            .populate({
                path: 'asset',
                populate: ['floor', 'category', 'zone', 'division']
            });

        if (!assignment || !assignment.asset) {
            return res.status(404).send('Assignment or associated asset not found.');
        }

        // Double-check division consistency
         if (!assignment.division || assignment.division.toString() !== req.session.userDivision ||
             !assignment.asset.division || assignment.asset.division._id.toString() !== req.session.userDivision) {
              console.error(`Division mismatch: User ${req.session.userDivision}, Assignment ${assignment.division}, Asset ${assignment.asset.division?._id}`);
              return res.status(403).send('Access Denied: Division mismatch during submission.');
         }

        const user = await User.findById(req.session.userId);
        let hasAlert = false;
        const responses = { ...req.body.results };

        // Process file uploads
        if (req.files && req.files.length > 0) {
            const processingPromises = req.files.map(file => {
                return new Promise((resolve, reject) => {
                    const taskIdMatch = file.fieldname.match(/\[(.*?)\]/);
                     if (!taskIdMatch || !taskIdMatch[1]) {
                          console.warn(`Could not extract task ID from fieldname: ${file.fieldname}`);
                          // Skip this file instead of rejecting all?
                          // return reject(new Error(`Invalid fieldname for file upload: ${file.fieldname}`));
                          return resolve(); // Resolve without adding if fieldname is bad
                     }
                    const taskId = taskIdMatch[1];
                    imageProcessingQueue.push({ filePath: file.path }, (err, processedPath) => {
                        if (err) {
                             console.error("Image processing error:", err);
                             // Decide if this should reject the whole submission
                             // For now, let's just skip adding the failed image path
                             return resolve(); // Resolve even on error to not block others
                             // return reject(err); // Or reject if one error should stop all
                        }
                        if (processedPath) { // Ensure path is valid
                            const webPath = `/processed/${path.basename(processedPath)}`;
                            if (!responses[taskId]) responses[taskId] = [];
                            responses[taskId].push(webPath);
                        }
                        resolve();
                    });
                });
            });
            await Promise.all(processingPromises);
        }
        
        // Snapshot tasks and check alerts
        const tasksSnapshot = assignment.checklist.tasks.map(task => {
            const responseValue = responses[task._id.toString()];
            if (task.inputType === 'functional' && responseValue === 'fail') {
                hasAlert = true;
            } else if (task.inputType === 'measurement' && responseValue != null && responseValue !== '') { // Check specifically for measurement responses
                const value = parseFloat(responseValue);
                // Check if min/max are defined AND if value is outside range
                if (!isNaN(value) && (task.minRange != null && task.maxRange != null) && (value < task.minRange || value > task.maxRange)) {
                    hasAlert = true;
                }
            }
            // Ensure task._id is included in the snapshot
            return {
                originalTaskId: task._id, description: task.description, inputType: task.inputType, expectedUnit: task.expectedUnit, minRange: task.minRange, maxRange: task.maxRange,
             };
        });

        // Asset snapshot
        const assetSnapshot = {
            name: assignment.asset.name, description: assignment.asset.description, location: assignment.asset.location, category: assignment.asset.category?.name || 'N/A', floor: assignment.asset.floor?.name || 'N/A', zone: assignment.asset.zone?.name || 'N/A', division: assignment.asset.division?.name || 'N/A' // Use populated division name
        };

        // Create report
        const newReport = new MaintenanceReport({
            assignment: assignment._id, checklistTitle: assignment.checklist.title, assetSnapshot: assetSnapshot, division: assignment.division, // Use division from assignment
            tasksSnapshot, responses, submittedBy: user._id, submittedByName: user.name, note: req.body.note || '', hasAlert: hasAlert, completedAt: new Date() // Explicitly set completion time
        });
        
        await newReport.save();
        await logActivity(user._id, `submitted a report for asset: ${assetSnapshot.name}.`);

        // Emit alert if needed
        if (hasAlert) {
            req.io.emit('alert', {
                message: `Alert: Checklist for asset ${assetSnapshot.name} requires attention!`,
                reportId: newReport._id,
                divisionId: assignment.division.toString() // Include division ID
            });
        }
        
        // *** SET SUCCESS TOAST MESSAGE ***
        req.session.toastMessage = { type: 'success', text: 'Checklist submitted successfully!' };
        
        res.redirect('/technician/dashboard');

    } catch (err) {
        console.error('Checklist Submission Error:', err);
        // *** SET ERROR TOAST MESSAGE ***
        req.session.toastMessage = { type: 'error', text: `Submission Error: ${err.message}` };
        res.redirect(`/technician/checklist/${req.params.assignmentId}`); // Redirect back to form
    }
});

/**
 * GET /technician/report
 * Displays a list of reports submitted by the technician.
 */
router.get('/report', ensureTechnician, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 15;
        const skip = (page - 1) * limit;
        const currentSubmittedBy = req.query.submittedBy || 'my'; // Default to 'my' reports
        const divisionId = req.session.userDivision;

        // Base query for reports submitted within the technician's division
        const query = { division: divisionId };

        if (currentSubmittedBy === 'my') {
            query.submittedBy = req.session.userId;
        } else if (currentSubmittedBy !== 'all') {
             // If a specific technician ID is provided
             // Optional: Ensure the selected technician is actually in the user's division for security?
             const technicianUser = await User.findOne({ _id: currentSubmittedBy, division: divisionId, role: 'technician' });
             if (technicianUser) {
                 query.submittedBy = new mongoose.Types.ObjectId(currentSubmittedBy);
             } else {
                  // If selected technician not valid, default back to 'my' reports? Or show error?
                  // For now, defaulting back to 'my' reports to avoid showing nothing.
                  query.submittedBy = req.session.userId;
                  req.session.message = { type: 'warning', text: 'Selected technician not found in your division. Showing your reports.' };
             }
        }
        // If 'all', the query remains { division: divisionId }, showing all reports in the division.


        const totalReports = await MaintenanceReport.countDocuments(query);
        const totalPages = Math.ceil(totalReports / limit);

        const reports = await MaintenanceReport.find(query)
            .sort({ completedAt: -1 })
            .skip(skip)
            .limit(limit)
             .populate('submittedBy', 'name') // Populate submitter name for display
             .populate('rejectedBy', 'name') // Populate rejecter name
             .lean(); // Use lean for performance in list views

        // Fetch technicians only from the current user's division
        const technicians = await User.find({ role: 'technician', division: divisionId }).sort({ name: 1 }).lean();

        res.render('technicianReport', {
            assignments: reports,
            technicians,
            currentSubmittedBy,
            currentPage: page,
            totalPages,
            totalReports,
            limit
        });
    } catch (err) {
        console.error("Technician Report List Error:", err);
        res.status(500).send("An error occurred while fetching your reports.");
    }
});

/**
 * GET /technician/report/:reportId
 * Displays the detail of a single submitted report.
 */
router.get('/report/:reportId', ensureTechnician, async (req, res) => {
    try {
        const report = await MaintenanceReport.findOne({_id: req.params.reportId, division: req.session.userDivision }) // Ensure report is in user's division
             .populate('submittedBy', 'name')
             .populate('verifiedBySpvUser', 'name')
             .populate('verifiedByManagerUser', 'name')
             .populate('rejectedBy', 'name');


        if (!report) {
            return res.status(404).send('Report not found or you do not have permission to view it.');
        }

        res.render('technicianChecklistReportDetail', { assignment: report });
    } catch (err) {
        console.error("Technician Report Detail Error:", err);
        res.status(500).send("An error occurred while fetching the report detail.");
    }
});


/**
 * GET /technician/asset/:id
 * Displays details for a specific asset, typically after a QR code scan.
 */
router.get('/asset/:id', ensureTechnician, async (req, res) => {
    try {
        const asset = await Asset.findOne({_id: req.params.id, division: req.session.userDivision }) // Ensure asset is in user's division
            .populate('floor category zone'); // Populate details

        if (!asset) {
            return res.status(404).send('Asset not found or not in your division.');
        }

        // Fetch assignments for this specific asset and division
        const assignments = await ChecklistAssignment.find({ asset: asset._id, division: req.session.userDivision })
            .populate('checklist', 'title'); // Populate checklist title

        res.render('assetDetail', { asset, assignments });
    } catch (err) {
        console.error("Asset Detail Error:", err);
        res.status(500).send("An error occurred while fetching asset details.");
    }
});


module.exports = router;