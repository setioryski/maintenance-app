// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // Roles: superuser, manager, spv, technician
  role: { type: String, enum: ['superuser', 'manager', 'spv', 'technician'], required: true },
  // Division applies only for SPV and Technician
  division: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' }
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
