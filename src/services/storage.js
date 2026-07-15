const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

const BUCKET_NAME = process.env.SUPABASE_BUCKET || 'firmwares';
const FIRMWARE_DIR = path.join(__dirname, '../../firmware_storage');

class LocalStorage {
    async save(sourcePath, deviceType, filename) {
        const targetDir = path.join(FIRMWARE_DIR, deviceType);
        this._ensureDir(targetDir);
        const finalPath = path.join(targetDir, filename);
        fs.renameSync(sourcePath, finalPath);
        return finalPath;
    }

    async delete(storagePath) {
        if (fs.existsSync(storagePath)) {
            fs.unlinkSync(storagePath);
        }
    }

    getLocalPath(storagePath) {
        return storagePath;
    }

    async getDownloadUrl() {
        return null;
    }

    exists(storagePath) {
        return fs.existsSync(storagePath);
    }

    _ensureDir(dir) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

class SupabaseStorage {
    constructor() {
        if (!supabase) {
            throw new Error('Supabase client not initialized. Check SUPABASE_URL and SUPABASE_SERVICE_KEY.');
        }
        this.supabase = supabase;
        this.bucket = BUCKET_NAME;
    }

    async save(sourcePath, deviceType, filename) {
        const storagePath = `${deviceType}/${filename}`;
        const fileBuffer = fs.readFileSync(sourcePath);

        const { error } = await this.supabase.storage
            .from(this.bucket)
            .upload(storagePath, fileBuffer, {
                contentType: 'application/octet-stream',
                upsert: true
            });

        if (error) throw error;

        if (fs.existsSync(sourcePath)) {
            fs.unlinkSync(sourcePath);
        }

        return storagePath;
    }

    async delete(storagePath) {
        const { error } = await this.supabase.storage
            .from(this.bucket)
            .remove([storagePath]);

        if (error) {
            console.error('Supabase delete error:', error);
        }
    }

    getLocalPath() {
        return null;
    }

    async getDownloadUrl(storagePath) {
        const { data, error } = await this.supabase.storage
            .from(this.bucket)
            .createSignedUrl(storagePath, 3600);

        if (error) throw error;
        return data.signedUrl;
    }

    exists() {
        return true;
    }
}

class DualStorage {
    constructor() {
        this.local = new LocalStorage();
        this.supabaseClient = supabase;
        this.bucketName = BUCKET_NAME;
    }

    async save(sourcePath, deviceType, filename) {
        const fileBuffer = fs.readFileSync(sourcePath);
        const localPath = await this.local.save(sourcePath, deviceType, filename);

        try {
            const storagePath = `${deviceType}/${filename}`;
            const { error } = await this.supabaseClient.storage
                .from(this.bucketName)
                .upload(storagePath, fileBuffer, {
                    contentType: 'application/octet-stream',
                    upsert: true
                });
            if (error) throw error;
        } catch (err) {
            console.error('Supabase upload failed (local copy preserved):', err.message);
        }

        return localPath;
    }

    async delete(storagePath) {
        await this.local.delete(storagePath);
        try {
            const storagePathRelative = path.relative(FIRMWARE_DIR, storagePath);
            const { error } = await this.supabaseClient.storage
                .from(this.bucketName)
                .remove([storagePathRelative]);
            if (error) throw error;
        } catch (err) {
            console.error('Supabase delete failed (local copy preserved):', err.message);
        }
    }

    getLocalPath(storagePath) {
        return this.local.getLocalPath(storagePath);
    }

    async getDownloadUrl(storagePath) {
        const storagePathRelative = path.relative(FIRMWARE_DIR, storagePath);
        try {
            const { data, error } = await this.supabaseClient.storage
                .from(this.bucketName)
                .createSignedUrl(storagePathRelative, 3600);
            if (error) throw error;
            return data.signedUrl;
        } catch (err) {
            console.error('Supabase signed URL failed:', err.message);
            return null;
        }
    }

    exists(storagePath) {
        return this.local.exists(storagePath);
    }
}

let instance = null;

function getStorage() {
    if (instance) return instance;
    instance = supabase ? new DualStorage() : new LocalStorage();
    return instance;
}

module.exports = { getStorage };
