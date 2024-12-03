const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    title: { type: String, required: true },       
    description: { type: String, required: true },
    salary:String,
    company: { type: String, required: true },     
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    shortlisted: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    interviewed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    placed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now }, 
});

module.exports = mongoose.model('Job', jobSchema);
