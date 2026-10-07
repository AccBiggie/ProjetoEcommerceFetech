const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    name_key: { type: String, required: true, unique: true, select: false },
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
}, { timestamps: true });
categorySchema.index({ parent_id: 1 });
categorySchema.set("toJSON", { transform: (doc, result) => { delete result.name_key; return result; } });

module.exports = mongoose.model("Category", categorySchema);
