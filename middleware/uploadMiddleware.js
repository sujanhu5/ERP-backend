const multer = require('multer');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const USE_SUPABASE_STORAGE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

let supabase;
if (USE_SUPABASE_STORAGE) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|svg/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) return cb(null, true);
  cb(new Error('Only image files (jpeg, jpg, png, webp, svg) are allowed.'));
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5) * 1024 * 1024 },
});

/**
 * After multer parses the file into memory, this middleware either:
 * - (production) uploads to Supabase Storage and replaces req.file with a public URL
 * - (dev fallback) writes to local disk as before
 */
async function persistUpload(req, res, next) {
  if (!req.file) return next();

  const orgId = req.user?.organizationId || 'unassigned';
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(req.file.originalname).toLowerCase();
  const fileName = `${req.file.fieldname}-${uniqueSuffix}${ext}`;
  const storagePath = `${orgId}/${fileName}`;

  if (USE_SUPABASE_STORAGE) {
    const { error } = await supabase.storage
      .from('erp-uploads')
      .upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (error) {
      return res.status(500).json({ success: false, message: `Storage error: ${error.message}` });
    }

    const { data } = supabase.storage.from('erp-uploads').getPublicUrl(storagePath);
    req.file.path = storagePath;
    req.file.publicUrl = data.publicUrl;
    req.uploadedUrl = data.publicUrl;
  } else {
    // Dev fallback: save to local disk
    const fs = require('fs');
    const localPath = require('path').join(
      process.env.UPLOAD_DIR || 'uploads',
      orgId,
    );
    if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
    const fullPath = require('path').join(localPath, fileName);
    fs.writeFileSync(fullPath, req.file.buffer);
    req.file.path = fullPath;
    req.uploadedUrl = `/uploads/${orgId}/${fileName}`;
  }

  next();
}

module.exports = { upload, persistUpload };
