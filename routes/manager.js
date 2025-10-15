const express = require('express');
const mongoose = require('mongoose');
const { ensureAuthenticated, ensureManager } = require('../middleware/auth');
const { logActivity } = require('../utils/helpers');

const router = express.Router();
router.use(ensureAuthenticated, ensureManager);

// Models
const MaintenanceReport = mongoose.model('MaintenanceReport');
const Division = mongoose.model('Division');
const Floor = mongoose.model('Floor');
const User = mongoose.model('User');
const Activity = mongoose.model('Activity');


// Manager Dashboard & Report List
router.get('/dashboard', async (req, res) => {
    try {
        const { filter = 'all', division = 'all', floor = 'all', submittedBy = 'all' } = req.query;
        const matchCondition = {};

        // Build filter conditions
        if (filter === 'rejected') {
            matchCondition.verifiedStatus = 'rejected';
        } else if (filter === 'verified_spv') {
            matchCondition.verifiedBySpv = true;
            matchCondition.verifiedByManager = false;
        } else if (filter === 'verified_manager') {
            matchCondition.verifiedByManager = true;
        } else if (filter === 'has_alert') {
            matchCondition.hasAlert = true;
        }

        if (filter !== 'all' && filter !== 'rejected') {
            matchCondition.verifiedStatus = { $ne: 'rejected' };
        }

        if (division !== 'all') matchCondition.division = division;
        if (submittedBy !== 'all') matchCondition.submittedBy = submittedBy;

        let reports = await MaintenanceReport.find(matchCondition)
            .populate('submittedBy', 'name')
            .populate('rejectedBy', 'name')
            .sort({ completedAt: -1 });
        
        // Filter by floor name after fetching from DB
        if (floor !== 'all') {
             const floorDoc = await Floor.findById(floor);
             if(floorDoc){
                  reports = reports.filter(r => r.assetSnapshot && r.assetSnapshot.floor === floorDoc.name);
             }
        }
        
        // Fetch all necessary data in parallel
        const [divisions, floors, technicians, activities] = await Promise.all([
            Division.find({}).sort({ name: 1 }),
            Floor.find({}).sort({ name: 1 }),
            User.find({ role: 'technician' }).sort({ name: 1 }),
            // Fetches all activities for the manager view
            Activity.find({}).sort({ timestamp: -1 }).limit(30).populate('division user.id')
        ]);

        res.render('managerDashboard', {
            assignments: reports,
            currentFilter: filter,
            divisions,
            currentDivision: division,
            floors,
            currentFloor: floor,
            technicians,
            currentSubmittedBy: submittedBy,
            activities // Pass activities to the view
        });
    } catch (err) {
        console.error('Manager Dashboard Error:', err);
        res.status(500).send(err.message);
    }
});

// ... (rest of the manager routes remain the same)
// Verify or Reject a Report (Consolidated Route)
router.post('/report/:reportId/:action(verify|reject)', async (req, res) => {
    try {
        const { reportId, action } = req.params;
        const user = await User.findById(req.session.userId);
        
        const isVerifying = action === 'verify';
        const updateData = isVerifying
            ? {
                verifiedByManager: true,
                verifiedByManagerUser: user._id,
                verifiedByManagerUserName: user.name,
                verifiedStatus: 'pending' 
            }
            : {
                verifiedStatus: 'rejected',
                rejectedBy: user._id,
                rejectedByName: user.name,
                verifiedByManager: false,
                verifiedBySpv: false // Also reset SPV verification on rejection
            };
        
        const report = await MaintenanceReport.findByIdAndUpdate(reportId, updateData);
        if (report) {
            await logActivity(req.session.userId, `${action}d a report for asset: ${report.assetSnapshot.name}.`, report.division);
        }

        if (req.headers.accept.includes('application/json')) {
            return res.json({ success: true, status: action });
        }

        req.session.message = { type: 'success', text: `Report ${action}d successfully.` };
        res.redirect(`/manager/report/${reportId}/detail`);

    } catch (err) {
        console.error(`Error ${req.params.action}ing by manager:`, err);
        if (req.headers.accept.includes('application/json')) {
            return res.status(500).json({ success: false, message: err.message });
        }
        res.redirect('back');
    }
});


// Report Detail View
router.get('/report/:reportId/detail', async (req, res) => {
    try {
        const report = await MaintenanceReport.findById(req.params.reportId)
            .populate('submittedBy', 'name')
            .populate('verifiedBySpvUser', 'name')
            .populate('verifiedByManagerUser', 'name')
            .populate('rejectedBy', 'name');

        if (!report) return res.status(404).send('Report not found');

        res.render('managerChecklistReportDetail', { assignment: report });
    } catch (err) {
        console.error('Manager Detail View Error:', err);
        res.status(500).send(err.message);
    }
});


module.exports = router;