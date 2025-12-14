// Twilio support removed - notifications disabled
// This file is kept for backward compatibility but all functions are stubs

// Message templates (kept for reference but not used)
const MESSAGE_TEMPLATES = {
  driverAssigned: () => '',
  flightDelayed: () => '',
  flightLanded: () => '',
  driverWaiting: () => '',
  transferCompleted: () => '',
  transferCancelled: () => '',
  pickupReminder: () => '',
  vendorDriverDispatch: () => '',
  vendorFlightUpdate: () => ''
};

// Stub functions that do nothing
const sendWhatsAppMessage = async (to, message, mediaUrl = null) => {
  console.log(`[Notification Disabled] WhatsApp message to ${to}: ${message}`);
  return {
    success: false,
    error: 'Notifications disabled - Twilio support removed'
  };
};

const sendSMSMessage = async (to, message) => {
  console.log(`[Notification Disabled] SMS to ${to}: ${message}`);
  return {
    success: false,
    error: 'Notifications disabled - Twilio support removed'
  };
};

const sendNotification = async (recipient, message, type = 'whatsapp', mediaUrl = null) => {
  console.log(`[Notification Disabled] ${type} to ${recipient}: ${message}`);
  return {
    success: false,
    error: 'Notifications disabled - Twilio support removed'
  };
};

const validatePhoneNumber = (phoneNumber) => {
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
};

const formatPhoneNumber = (phoneNumber) => {
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    cleaned = '+1' + cleaned;
  }
  return cleaned;
};

module.exports = {
  twilioClient: null,
  WHATSAPP_CONFIG: {},
  SMS_CONFIG: {},
  MESSAGE_TEMPLATES,
  sendWhatsAppMessage,
  sendSMSMessage,
  sendNotification,
  validatePhoneNumber,
  formatPhoneNumber
};
