const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const SystemSettings = require('../models/SystemSettings');
const aviationstackService = require('../services/aviationstackService');

/**
 * @route   GET /api/settings
 * @desc    Get system settings (SUPER_ADMIN only)
 * @access  Private
 */
router.get('/', authenticate, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    // Never expose raw API key to frontend - only indicate if configured
    res.json({
      success: true,
      data: {
        aviationstack_api_key: settings.aviationstack_api_key ? '••••••••' : '',
        api_key_configured: !!settings.aviationstack_api_key,
        api_provider: settings.api_provider,
        api_plan: settings.api_plan,
        updated_at: settings.updated_at
      }
    });
  } catch (err) {
    console.error('Settings GET error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   PUT /api/settings
 * @desc    Update system settings (SUPER_ADMIN only)
 * @access  Private
 */
router.put('/', authenticate, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const { aviationstack_api_key, api_plan } = req.body;
    const settings = await SystemSettings.getSettings();

    if (aviationstack_api_key !== undefined) {
      settings.aviationstack_api_key = String(aviationstack_api_key || '').trim();
    }
    if (api_plan && ['free', 'paid'].includes(api_plan)) {
      settings.api_plan = api_plan;
    }
    settings.last_updated_by = req.user?.id || null;
    settings.updated_at = new Date();
    await settings.save();

    aviationstackService.invalidateSettingsCache();

    res.json({
      success: true,
      data: {
        api_key_configured: !!settings.aviationstack_api_key,
        api_provider: settings.api_provider,
        api_plan: settings.api_plan,
        updated_at: settings.updated_at
      }
    });
  } catch (err) {
    console.error('Settings PUT error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * @route   POST /api/settings/test-flight-api
 * @desc    Test Aviationstack API connection (SUPER_ADMIN only)
 * @access  Private
 */
router.post('/test-flight-api', authenticate, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const result = await aviationstackService.testConnection();
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
