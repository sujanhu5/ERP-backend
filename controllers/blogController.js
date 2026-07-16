const BlogModel = require('../models/blogModel');
const BlogImageModel = require('../models/blogImageModel');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { persistUpload } = require('../middleware/uploadMiddleware');
const { query } = require('../config/db');

// ── Public ──────────────────────────────────────────────────────────────────

const listPublic = asyncHandler(async (req, res) => {
  const { page = 1, limit = 12, category, tag, search, featured } = req.query;
  const { rows, total } = await BlogModel.findAll({
    page: +page, limit: +limit, status: 'published',
    category, tag, search,
    featured: featured === 'true' ? true : undefined,
  });
  res.json({ success: true, data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / +limit) } });
});

const getPublicPost = asyncHandler(async (req, res) => {
  const blog = await BlogModel.findBySlug(req.params.slug);
  if (!blog) throw new ApiError(404, 'Post not found.');
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  await BlogModel.incrementView(blog.id, ip, req.headers['user-agent']);
  const related = await BlogModel.related(blog.id, blog.category_id);
  res.json({ success: true, data: { ...blog, related } });
});

const toggleLike = asyncHandler(async (req, res) => {
  const blog = await BlogModel.findBySlug(req.params.slug);
  if (!blog) throw new ApiError(404, 'Post not found.');
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const result = await BlogModel.toggleLike(blog.id, ip);
  res.json({ success: true, data: result });
});

// ── Admin (platform_owner only) ──────────────────────────────────────────────

const adminList = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, category, tag, search } = req.query;
  const { rows, total } = await BlogModel.findAll({ page: +page, limit: +limit, status, category, tag, search });
  res.json({ success: true, data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / +limit) } });
});

const adminGetById = asyncHandler(async (req, res) => {
  const blog = await BlogModel.findById(req.params.id);
  if (!blog) throw new ApiError(404, 'Blog not found.');
  res.json({ success: true, data: blog });
});

const adminCreate = asyncHandler(async (req, res) => {
  const {
    title, excerpt, content, contentJson, featuredImage, categoryId,
    status, isPinned, isFeatured, publishedAt, scheduledAt,
    metaTitle, metaDescription, focusKeyword, tags,
  } = req.body;

  if (!title?.trim()) throw new ApiError(400, 'Title is required.');

  const blog = await BlogModel.create({
    title, excerpt, content,
    contentJson: contentJson ? JSON.parse(contentJson) : undefined,
    featuredImage: req.uploadedUrl || featuredImage,
    authorId: req.user.id,
    categoryId: categoryId || null,
    status: status || 'draft',
    isPinned: isPinned === 'true' || isPinned === true,
    isFeatured: isFeatured === 'true' || isFeatured === true,
    publishedAt: publishedAt || null,
    scheduledAt: scheduledAt || null,
    metaTitle, metaDescription, focusKeyword,
    tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
  });

  res.status(201).json({ success: true, data: blog });
});

const adminUpdate = asyncHandler(async (req, res) => {
  const existing = await BlogModel.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Blog not found.');

  const {
    title, excerpt, content, contentJson, featuredImage, categoryId,
    status, isPinned, isFeatured, publishedAt, scheduledAt,
    metaTitle, metaDescription, focusKeyword, tags,
  } = req.body;

  const updated = await BlogModel.update(req.params.id, {
    title, excerpt, content,
    contentJson: contentJson ? JSON.parse(contentJson) : undefined,
    featuredImage: req.uploadedUrl || featuredImage,
    categoryId: categoryId || null,
    status,
    isPinned: isPinned === 'true' || isPinned === true,
    isFeatured: isFeatured === 'true' || isFeatured === true,
    publishedAt: publishedAt || null,
    scheduledAt: scheduledAt || null,
    metaTitle, metaDescription, focusKeyword,
    tags: tags !== undefined ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : undefined,
  });

  res.json({ success: true, data: updated });
});

const adminDelete = asyncHandler(async (req, res) => {
  const blog = await BlogModel.findById(req.params.id);
  if (!blog) throw new ApiError(404, 'Blog not found.');
  await BlogModel.remove(req.params.id);
  res.json({ success: true, message: 'Blog deleted.' });
});

const adminBulkAction = asyncHandler(async (req, res) => {
  const { action, ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, 'No IDs provided.');
  if (action === 'delete') {
    await BlogModel.bulkDelete(ids);
    return res.json({ success: true, message: `${ids.length} post(s) deleted.` });
  }
  if (['published', 'draft'].includes(action)) {
    await BlogModel.bulkUpdateStatus(ids, action);
    return res.json({ success: true, message: `${ids.length} post(s) set to ${action}.` });
  }
  throw new ApiError(400, 'Invalid bulk action.');
});

const adminStats = asyncHandler(async (req, res) => {
  const stats = await BlogModel.stats();
  res.json({ success: true, data: stats });
});

// ── Media library ─────────────────────────────────────────────────────────────

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file && !req.uploadedUrl) throw new ApiError(400, 'No file uploaded.');
  const url = req.uploadedUrl || `/uploads/blog/${req.file.filename}`;
  const image = await BlogImageModel.create({
    filename: req.file?.originalname || url.split('/').pop(),
    url,
    sizeBytes: req.file?.size,
    mimeType: req.file?.mimetype,
    folder: req.body.folder || 'blog',
    uploadedBy: req.user.id,
  });
  res.status(201).json({ success: true, data: image });
});

const listImages = asyncHandler(async (req, res) => {
  const { folder, search, page = 1, limit = 30 } = req.query;
  const { rows, total } = await BlogImageModel.findAll({ folder, search, page: +page, limit: +limit });
  res.json({ success: true, data: rows, pagination: { page: +page, limit: +limit, total, totalPages: Math.ceil(total / +limit) } });
});

const deleteImage = asyncHandler(async (req, res) => {
  await BlogImageModel.remove(req.params.id);
  res.json({ success: true, message: 'Image deleted.' });
});

// ── Public comments ──────────────────────────────────────────────────────────

const getComments = asyncHandler(async (req, res) => {
  const blog = await BlogModel.findBySlug(req.params.slug);
  if (!blog) throw new ApiError(404, 'Post not found.');
  const { rows } = await query(
    `SELECT id, name, content, created_at
     FROM blog_comments
     WHERE blog_id = $1 AND is_approved = TRUE
     ORDER BY created_at ASC`,
    [blog.id]
  );
  res.json({ success: true, data: rows });
});

const addComment = asyncHandler(async (req, res) => {
  const blog = await BlogModel.findBySlug(req.params.slug);
  if (!blog) throw new ApiError(404, 'Post not found.');
  const { name, content } = req.body;
  if (!name?.trim())    throw new ApiError(400, 'Name is required.');
  if (!content?.trim()) throw new ApiError(400, 'Comment cannot be empty.');
  const { rows } = await query(
    `INSERT INTO blog_comments (blog_id, name, content, is_approved)
     VALUES ($1, $2, $3, TRUE)
     RETURNING id, name, content, created_at`,
    [blog.id, name.trim().slice(0, 100), content.trim().slice(0, 2000)]
  );
  res.status(201).json({ success: true, data: rows[0] });
});

module.exports = {
  listPublic, getPublicPost, toggleLike,
  getComments, addComment,
  adminList, adminGetById, adminCreate, adminUpdate, adminDelete, adminBulkAction, adminStats,
  uploadImage, listImages, deleteImage,
};
