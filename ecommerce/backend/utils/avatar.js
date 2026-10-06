const cloudinary = require("cloudinary");
const ErrorHander = require("./errorHander");

module.exports = async avatar => {
    if (!avatar || avatar === "undefined") return null;
    if (!process.env.CLOUDINARY_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        throw new ErrorHander("Upload de avatar indisponível. Configure o Cloudinary ou continue sem foto.", 503);
    }
    const image = await cloudinary.v2.uploader.upload(avatar, { folder: "avatars", width: 150, crop: "scale" });
    return { public_id: image.public_id, url: image.secure_url };
};
