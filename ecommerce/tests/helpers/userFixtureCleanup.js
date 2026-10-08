// Only tests own this destructive fixture cleanup. There is no runtime bypass.
module.exports = async function clearUserFixtures(User) {
    if (!/^fetech_[a-z][a-z0-9_]*_\d+_\d+$/.test(User.db.name) || !process.env.FETECH_TEST_MONGO_BASE ||
        !User.db.name.includes('_' + process.pid + '_')) throw new Error('Unsafe fixture database');
    await User.db.db.collection('users').deleteMany({});
};
