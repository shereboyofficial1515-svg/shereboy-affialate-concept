// routes/adminRoutes.js
// The dashboard's API. Every route needs a signed-in administrator, and each
// names the permission it requires (see ROLE_PERMISSIONS in middleware/auth.js).

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { requireAuth, requirePermission: can } = require('../middleware/auth');
const media = require('../controllers/mediaController');
const products = require('../controllers/productAdminController');
const site = require('../controllers/siteAdminController');
const ai = require('../controllers/aiAdminController');
const { MAX_UPLOAD } = require('../services/mediaService');

const router = express.Router();
router.use(requireAuth);
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,12}$/.test(id)) return res.status(404).json({ success: false, message: 'Not found.' });
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD, files: 1, fields: 10 } }).single('file');
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 } }).single('file');

// Per person, not per address: each generation costs money
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_PER_MINUTE) || 20,
  keyGenerator: (req) => req.user.email,
  validate: false,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many AI requests. Please wait a minute and try again.' }
});

// ---------- Media ----------
router.get('/media', can('media.manage'), media.list);
router.post('/media/upload', can('media.manage'), upload, media.upload);
router.post('/media/import-existing', can('media.manage'), media.importExisting);
router.get('/media/folders', can('media.manage'), media.listFolders);
router.post('/media/folders', can('media.manage'), media.createFolder);
router.patch('/media/folders/:id', can('media.manage'), media.renameFolder);
router.delete('/media/folders/:id', can('media.manage'), media.deleteFolder);
router.patch('/media/:id', can('media.manage'), media.update);
router.get('/media/:id/usage', can('media.manage'), media.usage);
router.delete('/media/:id', can('media.manage'), media.remove);

// ---------- Products ----------
router.get('/products', can('products.edit'), products.list);
router.post('/products', can('products.edit'), products.create);
router.get('/products/:id', can('products.edit'), products.get);
router.get('/products/:id/preview', can('products.edit'), products.preview);
router.put('/products/:id/draft', can('products.edit'), products.saveDraft);
router.delete('/products/:id/draft', can('products.edit'), products.discardDraft);
router.post('/products/:id/publish', can('products.publish'), products.publish);
router.post('/products/:id/status', can('products.edit'), products.setStatus);
router.delete('/products/:id', can('products.publish'), products.remove);

// ---------- Settings, content ----------
router.get('/settings', can('content.edit'), site.getSettings);
router.put('/settings/homepage', can('content.publish'), (req, res, next) => { req.params.group = 'homepage'; next(); }, site.saveSettings);
router.post('/settings/appearance/preview', can('settings.manage'), site.previewTheme);
router.put('/settings/:group', can('settings.manage'), site.saveSettings);

router.get('/pages', can('content.edit'), site.listPages);
router.put('/pages/:slug', can('content.edit'), site.savePage);
router.post('/pages/:slug/publish', can('content.publish'), site.publishPage);

router.get('/banners', can('content.edit'), site.listBanners);
router.post('/banners', can('content.publish'), site.createBanner);
router.put('/banners/:id', can('content.publish'), site.updateBanner);
router.delete('/banners/:id', can('content.publish'), site.deleteBanner);

// ---------- AI ----------
router.get('/ai/available', can('ai.use'), ai.availableActions);
router.post('/ai/generate', can('ai.use'), aiLimiter, ai.generate);
router.get('/ai/config', can('ai.manage'), ai.getConfig);
router.put('/ai/config', can('ai.manage'), ai.saveConfig);
router.post('/ai/test', can('ai.manage'), aiLimiter, ai.testConnection);
router.put('/ai/key', can('ai.keys'), ai.saveKey);
router.delete('/ai/key/:provider', can('ai.keys'), ai.deleteKey);
router.get('/ai/instructions', can('ai.manage'), ai.listInstructions);
router.post('/ai/instructions', can('ai.manage'), ai.createInstruction);
router.post('/ai/instructions/preview', can('ai.manage'), aiLimiter, ai.previewInstructions);
router.put('/ai/instructions/:id', can('ai.manage'), ai.updateInstruction);
router.delete('/ai/instructions/:id', can('ai.manage'), ai.deleteInstruction);
router.get('/ai/knowledge', can('ai.manage'), ai.listKnowledge);
router.post('/ai/knowledge', can('ai.manage'), ai.createKnowledge);
router.post('/ai/knowledge/upload', can('ai.manage'), documentUpload, ai.uploadKnowledge);
router.put('/ai/knowledge/:id', can('ai.manage'), ai.updateKnowledge);
router.delete('/ai/knowledge/:id', can('ai.manage'), ai.deleteKnowledge);
router.get('/ai/activity', can('ai.manage'), ai.activity);

// ---------- System ----------
router.get('/users', can('users.manage'), site.listUsers);
router.put('/users', can('users.manage'), site.saveUser);
router.delete('/users/:email', can('users.manage'), site.deleteUser);
router.get('/audit', can('audit.view'), site.listAudit);
router.get('/analytics', can('audit.view'), site.analytics);
router.get('/health', can('system.view'), site.health);

module.exports = router;
