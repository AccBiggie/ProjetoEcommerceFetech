const { isManagedAvatarPublicId, httpsUrl, GRACE_MS } = require('./mediaContract');
const id = value => /^[a-f\d]{24}$/i.test(String(value)) ? String(value) : null;
async function auditMedia(connection, { now = Date.now(), write = console.log } = {}) {
    const users = await connection.db.collection('users').find({}, { projection: { _id: 1, avatar: 1 } }).toArray();
    const intents = await connection.db.collection('mediauploadintents').find().toArray();
    const tasks = await connection.db.collection('mediacleanuptasks').find().toArray();
    const issues = [], refs = new Map(), tracked = new Set(intents.map(intent => intent.publicId));
    for (const user of users) {
        const avatar = user.avatar, publicId = avatar?.public_id;
        if (!publicId) { issues.push({ code: 'USER_AVATAR_MISSING_PUBLIC_ID', userId: id(user._id) }); continue; }
        if (!refs.has(publicId)) refs.set(publicId, []); refs.get(publicId).push(id(user._id));
        if (avatar.url === '/Profile.png') continue;
        if (!httpsUrl(avatar.url)) issues.push({ code: 'AVATAR_REMOTE_OR_INSECURE_URL', userId: id(user._id) });
        if (!isManagedAvatarPublicId(user._id, publicId)) issues.push({ code: 'AVATAR_PUBLIC_ID_OUTSIDE_MANAGED_NAMESPACE', classification: 'LEGACY_UNMANAGED_AVATAR', userId: id(user._id) });
        if (!tracked.has(publicId)) issues.push({ code: 'LEGACY_UNTRACKED_AVATAR', userId: id(user._id) });
    }
    for (const [publicId, ids] of refs) if (ids.length > 1 && publicId !== 'default-avatar' && !users.filter(u => u.avatar?.public_id === publicId).every(u => u.avatar?.url === '/Profile.png')) issues.push({ code: 'AVATAR_PUBLIC_ID_SHARED', userIds: ids });
    for (const intent of intents) {
        if (['PREPARED', 'UPLOADED', 'CLEANING', 'FAILED'].includes(intent.status) && intent.updatedAt instanceof Date && intent.updatedAt.getTime() <= now - GRACE_MS) issues.push({ code: 'MEDIA_UPLOAD_INTENT_STALE', intentId: id(intent._id) });
        if (intent.status === 'ATTACHED' && !refs.has(intent.publicId)) issues.push({ code: 'MEDIA_INTENT_ATTACHED_BUT_NOT_REFERENCED', intentId: id(intent._id) });
    }
    for (const task of tasks) if (['PENDING', 'BLOCKED'].includes(task.status)) issues.push({ code: task.status === 'PENDING' ? 'MEDIA_CLEANUP_PENDING' : 'MEDIA_CLEANUP_BLOCKED', cleanupTaskId: id(task._id) });
    const summary = { mode: 'READ_ONLY', users: users.length, intents: intents.length, cleanupTasks: tasks.length, issues: issues.length };
    write(JSON.stringify(summary)); issues.forEach(issue => write(JSON.stringify(issue))); return { summary, issues };
}
module.exports = { auditMedia };
