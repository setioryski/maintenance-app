const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const { logActivity } = require('../utils/helpers');

const router = express.Router();

// Display login page
router.get('/login', (req, res) => {
    // If user is already logged in, redirect to dashboard
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.render('login');
});

// Handle login form submission
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            req.session.message = { type: 'error', text: 'Invalid email or password.' };
            return res.redirect('/login');
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            req.session.message = { type: 'error', text: 'Invalid email or password.' };
            return res.redirect('/login');
        }

        // Store user info in session
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userDivision = user.division ? user.division.toString() : null;

        await logActivity(req.session.userId, `logged in to the system.`);

        res.redirect('/');
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).send('An internal server error occurred.');
    }
});

// Handle user logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout Error:', err);
            return res.status(500).send('Could not log out.');
        }
        res.redirect('/login');
    });
});

module.exports = router;