const express = require('express');
const mongoose = require('mongoose');
const { ensureAuthenticated, ensureTechnician } = require('../middleware/auth');
const { upload, imageProcessingQueue } = require('../middleware/fileUpload');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// Apply middleware to all technician routes to ensure the user is an authenticated technician
router.use(ensureAuthenticated, ensureTechnician);

// --- Mongoose Models ---
const Asset = mongoose.model('Asset');
const Checklist = mongoose.model('Checklist');
const ChecklistAssignment = mongoose.model('ChecklistAssignment');
const MaintenanceReport = mongoose.model('MaintenanceReport');
const Floor = mongoose.model('Floor');
const AssetCategory = mongoose.model('AssetCategory');
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

        // Find all assets within the technician's division
        const assetsInDivision = await Asset.find({ division: divisionId }, '_id').lean();
        const assetIds = assetsInDivision.map(a => a._id);

        // Find all checklist assignments for those assets (no longer filtering by status)
        const assignments = await ChecklistAssignment.find({ asset: { $in: assetIds } })
            .populate('checklist')
            .populate({
                path: 'asset',
                populate: ['floor', 'category', 'zone']
            });

        // Get unique checklist IDs to fetch checklist data
        const checklistIds = [...new Set(assignments.map(a => a.checklist?._id).filter(Boolean))];

        // Fetch all necessary data in parallel for efficiency
        const [floors, assetCategories, activities, checklists] = await Promise.all([
            Floor.find({}).sort({ name: 1 }).lean(),
            AssetCategory.find({}).sort({ name: 1 }).lean(),
            Activity.find({ $or: [{ 'division.id': divisionId }, { role: 'manager' }] })
                .sort({ timestamp: -1 })
                .limit(20)
                .lean(),
            Checklist.find({ _id: { $in: checklistIds } }).lean()
        ]);

        res.render('technicianDashboard', {
            assignments,
            floors,
            assetCategories,
            activities,
            checklists
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
router.get('/checklist/:assignmentId', async (req, res) => {
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
        if (assignment.asset.division._id.toString() !== req.session.userDivision) {
            return res.status(403).send('Access Denied: This assignment is not in your division.');
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
router.post('/checklist/:assignmentId/submit', upload.any(), async (req, res) => {
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

        const user = await User.findById(req.session.userId);
        let hasAlert = false;
        const responses = { ...req.body.results };

        // Process file uploads and add them to responses
        if (req.files && req.files.length > 0) {
            const processingPromises = req.files.map(file => {
                return new Promise((resolve, reject) => {
                    const taskId = file.fieldname.match(/\[(.*?)\]/)[1];
                    imageProcessingQueue.push({ filePath: file.path }, (err, processedPath) => {
                        if (err) return reject(err);
                        if (!responses[taskId]) responses[taskId] = [];
                        responses[taskId].push(processedPath);
                        resolve();
                    });
                });
            });
            await Promise.all(processingPromises);
        }
        
        // Snapshot the tasks and check for alerts
        const tasksSnapshot = assignment.checklist.tasks.map(task => {
            const responseValue = responses[task._id.toString()];
            if (task.inputType === 'functional' && responseValue === 'fail') {
                hasAlert = true;
            } else if (task.inputType === 'measurement' && responseValue) {
                const value = parseFloat(responseValue);
                if (!isNaN(value) && (task.minRange != null && task.maxRange != null) && (value < task.minRange || value > task.maxRange)) {
                    hasAlert = true;
                }
            }
            return {
                originalTaskId: task._id,
                description: task.description,
                inputType: task.inputType,
                expectedUnit: task.expectedUnit,
                minRange: task.minRange,
                maxRange: task.maxRange,
            };
        });

        // Create a snapshot of the asset's state at the time of submission
        const assetSnapshot = {
            name: assignment.asset.name,
            description: assignment.asset.description,
            location: assignment.asset.location,
            category: assignment.asset.category?.name || 'N/A',
            floor: assignment.asset.floor?.name || 'N/A',
            zone: assignment.asset.zone?.name || 'N/A',
            division: assignment.asset.division?.name || 'N/A'
        };

        // Create the maintenance report
        const newReport = new MaintenanceReport({
            assignment: assignment._id,
            checklistTitle: assignment.checklist.title,
            assetSnapshot: assetSnapshot,
            division: assignment.asset.division._id,
            tasksSnapshot,
            responses,
            submittedBy: user._id,
            submittedByName: user.name,
            note: req.body.note || '',
            hasAlert: hasAlert
        });
        
        // Save the new report. The assignment itself is not modified.
        await newReport.save();
        await logActivity(user._id, `submitted a report for asset: ${assetSnapshot.name}.`);

        // Emit a socket event if there's an alert
        if (hasAlert) {
            req.io.emit('alert', {
                message: `Alert: Checklist for asset ${assetSnapshot.name} requires attention!`,
                reportId: newReport._id
            });
        }
        
        req.session.message = { type: 'success', text: 'Checklist submitted successfully!' };
        res.redirect('/technician/dashboard');

    } catch (err) {
        console.error('Checklist Submission Error:', err);
        res.status(500).send("An error occurred during submission.");
    }
});

/**
 * GET /technician/report
 * Displays a list of reports submitted by the technician.
 */
router.get('/report', async (req, res) => {
    try {
        // Only show reports submitted by the currently logged-in technician
        const reports = await MaintenanceReport.find({ submittedBy: req.session.userId })
            .sort({ completedAt: -1 });

        // Pass the current user to the template for the filter dropdown
        const currentUser = await User.findById(req.session.userId).lean();

        res.render('technicianReport', {
            assignments: reports,
            technicians: [currentUser], 
            currentSubmittedBy: 'all' 
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
router.get('/report/:reportId', async (req, res) => {
    try {
        const report = await MaintenanceReport.findById(req.params.reportId);

        // Security check: ensure the report belongs to the user trying to view it
        if (!report || report.submittedBy.toString() !== req.session.userId) {
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
router.get('/asset/:id', async (req, res) => {
    try {
        const asset = await Asset.findById(req.params.id)
            .populate('floor category zone');

        if (!asset || asset.division.toString() !== req.session.userDivision) {
            return res.status(404).send('Asset not found or not in your division.');
        }

        const assignments = await ChecklistAssignment.find({ asset: asset._id })
            .populate('checklist');

        res.render('assetDetail', { asset, assignments });
    } catch (err) {
        console.error("Asset Detail Error:", err);
        res.status(500).send("An error occurred while fetching asset details.");
    }
});


module.exports = router;