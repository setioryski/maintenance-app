// models/Activity.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const activitySchema = new Schema({
    user: {
        id: { type: Schema.Types.ObjectId, ref: 'User' },
        name: { type: String, required: true }
    },
    action: {
        type: String,
        required: true,
        description: 'Deskripsi aktivitas yang dilakukan'
    },
    division: {
        id: { type: Schema.Types.ObjectId, ref: 'Division' },
        name: { type: String }
    },
    role: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Activity', activitySchema);