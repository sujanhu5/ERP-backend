const express = require('express');
const router = express.Router();
const blogCtrl = require('../controllers/blogController');
const catCtrl = require('../controllers/blogCategoryController');
const tagCtrl = require('../controllers/blogTagController');
const { protect } = require('../middleware/authMiddleware');
const { requirePlatformOwner } = require('../middleware/tenantMiddleware');
const { upload, persistUpload } = require('../middleware/uploadMiddleware');

// ── Public routes ──────────────────────────────────────────────────────────
// All published blog data — no auth required
router.get('/public/posts',                       blogCtrl.listPublic);
router.get('/public/posts/:slug',                 blogCtrl.getPublicPost);
router.post('/public/posts/:slug/like',           blogCtrl.toggleLike);
router.get('/public/posts/:slug/comments',        blogCtrl.getComments);
router.post('/public/posts/:slug/comments',       blogCtrl.addComment);
router.get('/public/categories',                  catCtrl.list);
router.get('/public/tags',                        tagCtrl.list);

// ── Platform-owner-only routes ─────────────────────────────────────────────
const admin = express.Router();
admin.use(protect, requirePlatformOwner);

// Stats dashboard
admin.get('/stats',                 blogCtrl.adminStats);

// Blog CRUD
admin.get('/posts',                 blogCtrl.adminList);
admin.get('/posts/:id',             blogCtrl.adminGetById);
admin.post('/posts',
  upload.single('featuredImage'), persistUpload,
  blogCtrl.adminCreate
);
admin.put('/posts/:id',
  upload.single('featuredImage'), persistUpload,
  blogCtrl.adminUpdate
);
admin.delete('/posts/:id',          blogCtrl.adminDelete);
admin.post('/posts/bulk',           blogCtrl.adminBulkAction);

// Categories
admin.get('/categories',            catCtrl.list);
admin.post('/categories',           catCtrl.create);
admin.put('/categories/:id',        catCtrl.update);
admin.delete('/categories/:id',     catCtrl.remove);

// Tags
admin.get('/tags',                  tagCtrl.list);
admin.delete('/tags/:id',           tagCtrl.remove);

// Comment management
admin.get('/posts/:id/comments',    blogCtrl.adminGetPostComments);
admin.delete('/comments/:id',       blogCtrl.deleteComment);

// Media library
admin.get('/images',                blogCtrl.listImages);
admin.post('/images',
  upload.single('image'), persistUpload,
  blogCtrl.uploadImage
);
admin.delete('/images/:id',         blogCtrl.deleteImage);

router.use('/admin', admin);

module.exports = router;
