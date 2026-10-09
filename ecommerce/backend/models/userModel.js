const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const userSchema = new mongoose.Schema ( {
    name: {
        type: String,
        required: [true, "Please Enter Your Name"],
        maxLength: [30, "Name canoot exceed 30 characters"],
        minLength: [4, "Name should have more than 4 characters"],
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        required: [true, "Please enter Your Email"],
        unique: [true],
        validate: [validator.isEmail, "Please enter a valid email"],
    },
    password: {
        type: String,
        required: [true, "Please Enter your password"],
        minLength: [8, "Password should be greater than 8 characters"],
        select: false,
    },
    avatar: {
        public_id: {
            type: String,
            required: true,
        },
        url: {
            type: String,
            require: true,
        },
    },
    avatarRevision: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
    role: {
        type: String,
        enum: ["user", "admin"],
        default: "user",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    accountStatus: { type: String, enum: ['ACTIVE', 'DEACTIVATED'], default: 'ACTIVE' },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Geração interna do lock administrativo; nunca aceita pelo body público.
    adminMutationFence: { type: Number, default: 0, select: false },
    tokenVersion: {
        type: Number,
        default: 0,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
        validate: {
            validator: Number.isSafeInteger,
            message: "Versão de autenticação inválida.",
        },
    },
});
require('../utils/queryIndexes').add(userSchema, 'users');
userSchema.set("toJSON", { transform: (doc, result) => {
    delete result.password;
    delete result.avatarRevision;
    delete result.resetPasswordToken;
    delete result.resetPasswordExpire;
    delete result.adminMutationFence;
    delete result.deactivatedBy;
    delete result.deactivatedAt;
    return result;
} });
userSchema.pre('validate', function () {
    if (this.accountStatus === 'ACTIVE' && (this.deactivatedAt != null || this.deactivatedBy != null)) this.invalidate('accountStatus', 'Active account metadata must be null');
    if (this.accountStatus === 'DEACTIVATED' && (!(this.deactivatedAt instanceof Date) || !Number.isFinite(this.deactivatedAt.getTime()) || !this.deactivatedBy)) this.invalidate('accountStatus', 'Deactivation metadata required');
});
userSchema.pre("save", async function() {
    if (!this.isModified("password")) {
        return;
    }
    this.password = await bcrypt.hash(this.password, 10);
});
//JWT TOKEN
userSchema.methods.getJWTToken = function () {
    const { isValidVersion, invalidSession } = require("../utils/authSession");
    if (!isValidVersion(this.tokenVersion) || !require('../utils/userLifecycle').isActive(this)) throw invalidSession();
    return jwt.sign({ id: this._id, tokenVersion: this.tokenVersion }, require('../config/runtimeConfig').getRuntimeConfig().jwt.secret, {
        expiresIn: require('../config/runtimeConfig').getRuntimeConfig().jwt.expiresIn,
    }); 
};
//Compare Password
userSchema.methods.comparePassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};
//Generating Password Reset Token
userSchema.methods.getResetPasswordToken = function() {
    if (!require('../utils/userLifecycle').isActive(this)) throw require('../utils/authSession').invalidSession();
    //Generating Token
    const resetToken = crypto.randomBytes(20).toString("hex");
    //Hashing and adding resetPasswordToken to userSchema
    this.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    return resetToken;
};
function forbidPhysicalDelete() {
    const error = new Error('User physical deletion is forbidden');
    error.code = 'USER_PHYSICAL_DELETE_FORBIDDEN';
    error.statusCode = 405;
    throw error;
}
for (const operation of ['findOneAndDelete', 'deleteOne', 'deleteMany', 'remove', 'findOneAndRemove']) {
    userSchema.pre(operation, { query: true, document: false }, forbidPhysicalDelete);
}
userSchema.pre('deleteOne', { document: true, query: false }, forbidPhysicalDelete);
// The raw database driver remains outside this model's guard (isolated fixtures/DB operations).
// Replacement writes through the commercial model would also discard identity.
userSchema.pre('bulkWrite', function (operations) {
    if (operations.some(operation => operation.deleteOne || operation.deleteMany || operation.replaceOne)) forbidPhysicalDelete();
});
for (const operation of ['replaceOne', 'findOneAndReplace']) userSchema.pre(operation, forbidPhysicalDelete);
userSchema.pre('aggregate', function () {
    if (this.pipeline().some(stage => stage.$out || stage.$merge)) forbidPhysicalDelete();
});
const User = mongoose.model('User', userSchema);
for (const operation of ['deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne', 'findOneAndReplace']) User.collection[operation] = async () => forbidPhysicalDelete();
const bulkWrite = User.collection.bulkWrite.bind(User.collection);
User.collection.bulkWrite = async (operations, ...options) => {
    if (operations.some(operation => operation.deleteOne || operation.deleteMany || operation.replaceOne)) forbidPhysicalDelete();
    return bulkWrite(operations, ...options);
};
module.exports = User;
