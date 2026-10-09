const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    _id: { type: String, default: 'category-hierarchy' },
    revision: { type: Number, default: 0, required: true },
    updatedAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false });
module.exports = mongoose.model('CategoryHierarchyState', schema);
