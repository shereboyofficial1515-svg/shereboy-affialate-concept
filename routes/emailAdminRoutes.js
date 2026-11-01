// routes/emailAdminRoutes.js
// Everything here requires an administrator session.
const express = require('express');
const controller = require('../controllers/emailAdminController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.param('id', (req, res, next, id) => {
  if (!/^\d{1,12}$/.test(id)) return res.status(404).json({ success: false, message: 'Not found.' });
  next();
});

router.get('/status', controller.status);

router.get('/subscribers', controller.listSubscribers);
router.post('/subscribers/confirm-all-pending', controller.confirmAllPending);
router.post('/subscribers/:id/resend-confirmation', controller.resendConfirmation);
router.post('/subscribers/:id/unsubscribe', controller.unsubscribeSubscriber);
router.delete('/subscribers/:id', controller.deleteSubscriber);

router.get('/campaigns', controller.listCampaigns);
router.post('/campaigns', controller.createCampaign);
router.get('/campaigns/:id', controller.getCampaign);
router.put('/campaigns/:id', controller.updateCampaign);
router.delete('/campaigns/:id', controller.deleteCampaign);
router.post('/campaigns/:id/test', controller.testCampaign);
router.post('/campaigns/:id/send', controller.sendCampaign);
router.post('/campaigns/:id/resume', controller.resumeCampaign);

router.get('/logs', controller.listLogs);

module.exports = router;
