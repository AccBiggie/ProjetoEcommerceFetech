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
userSchema.set("toJSON", { transform: (doc, result) => {
    delete result.password;
    delete result.resetPasswordToken;
    delete result.resetPasswordExpire;
    return result;
} });
userSchema.pre("save", async function() {
    if (!this.isModified("password")) {
        return;
    }
    this.password = await bcrypt.hash(this.password, 10);
});
//JWT TOKEN
userSchema.methods.getJWTToken = function () {
    const { isValidVersion, invalidSession } = require("../utils/authSession");
    if (!isValidVersion(this.tokenVersion)) throw invalidSession();
    return jwt.sign({ id: this._id, tokenVersion: this.tokenVersion }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE,
    }); 
};
//Compare Password
userSchema.methods.comparePassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};
//Generating Password Reset Token
userSchema.methods.getResetPasswordToken = function() {
    //Generating Token
    const resetToken = crypto.randomBytes(20).toString("hex");
    //Hashing and adding resetPasswordToken to userSchema
    this.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    this.resetPasswordExpire = Date.now() + 15 * 60 * 1000;
    return resetToken;
};
module.exports = mongoose.model("User", userSchema);
