const mongoose = require('mongoose');
const Activity = mongoose.model('Activity');
const User = mongoose.model('User');
const Division = mongoose.model('Division');

// Function to log user activities
async function logActivity(userId, action, divisionId = null) {
    try {
        const user = await User.findById(userId).populate('division');
        if (!user) return;

        let divisionInfo = {};
        // If user is a manager/superuser and a specific division context is provided
        if (divisionId && ['manager', 'superuser'].includes(user.role)) {
            const division = await Division.findById(divisionId);
            if (division) {
                divisionInfo = { id: division._id, name: division.name };
            }
        }
        // Otherwise, use the user's own division
        else if (user.division) {
            divisionInfo = { id: user.division._id, name: user.division.name };
        }

        const newActivity = new Activity({
            user: { id: user._id, name: user.name },
            action,
            division: divisionInfo,
            role: user.role,
        });
        await newActivity.save();
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}

// Helper function to escape special characters for regex
function escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

module.exports = {
    logActivity,
    escapeRegex
};