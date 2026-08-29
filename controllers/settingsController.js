const SettingsModel = require('../models/Settings');
const asyncHandler = require('../middleware/asyncHandler');

const getSettings = asyncHandler(async (req, res) => {
  let settings = await SettingsModel.findOne();
  if (!settings) {
    settings = await SettingsModel.create({});
  }
  res.status(200).json({ success: true, settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const { general, orders, inventory, notifications, security } = req.body;

  let settings = await SettingsModel.findOne();
  if (!settings) {
    settings = await SettingsModel.create({});
  }

  if (general) {
    Object.assign(settings.general, general);
  }
  if (orders) {
    Object.assign(settings.orders, orders);
  }
  if (inventory) {
    Object.assign(settings.inventory, inventory);
  }
  if (notifications) {
    Object.assign(settings.notifications, notifications);
  }
  if (security) {
    Object.assign(settings.security, security);
  }

  await settings.save();

  res.status(200).json({
    success: true,
    message: 'Settings updated',
    settings,
  });
});

module.exports = { getSettings, updateSettings };
