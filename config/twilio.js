const twilio = require('twilio');

// Initialize Twilio client only if credentials are provided
let twilioClient = null;
const hasTwilioCredentials = process.env.TWILIO_ACCOUNT_SID && 
                           process.env.TWILIO_AUTH_TOKEN && 
                           process.env.TWILIO_ACCOUNT_SID.startsWith('AC');

if (hasTwilioCredentials) {
  try {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    console.log('✅ Twilio client initialized successfully');
  } catch (error) {
    console.warn('⚠️ Failed to initialize Twilio client:', error.message);
    twilioClient = null;
  }
} else {
  console.warn('⚠️ Twilio credentials not configured. SMS/WhatsApp notifications will be disabled.');
}

// WhatsApp configuration
const WHATSAPP_CONFIG = {
  from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886', // Twilio Sandbox
  messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID
};

// SMS configuration
const SMS_CONFIG = {
  from: process.env.TWILIO_PHONE_NUMBER || '+1234567890'
};

// Message templates
const MESSAGE_TEMPLATES = {
  // Driver assignment notification
  driverAssigned: (customerName, driverName, vehicleType, vehicleNumber, pickupLocation, estimatedTime) => 
    `Hello ${customerName}! Your driver ${driverName} in ${vehicleType} (${vehicleNumber}) is assigned for your airport transfer. Pickup location: ${pickupLocation}. Estimated pickup time: ${estimatedTime}. Safe travels! 🚗✈️`,

  // Flight status updates
  flightDelayed: (customerName, flightNo, delayMinutes, newArrivalTime) =>
    `Hello ${customerName}! Your flight ${flightNo} has been delayed by ${delayMinutes} minutes. New arrival time: ${newArrivalTime}. We'll adjust your pickup time accordingly. Thank you for your patience! ⏰✈️`,

  flightLanded: (customerName, flightNo, driverName, vehicleType) =>
    `Hello ${customerName}! Your flight ${flightNo} has landed. Your driver ${driverName} in ${vehicleType} is on the way to pick you up. Please proceed to the designated pickup area. 🛬🚗`,

  driverWaiting: (customerName, driverName, vehicleType, vehicleNumber, pickupLocation) =>
    `Hello ${customerName}! Your driver ${driverName} in ${vehicleType} (${vehicleNumber}) is waiting at ${pickupLocation}. Please look for your vehicle. Safe journey! 🚗📍`,

  // Transfer completion
  transferCompleted: (customerName, dropLocation) =>
    `Hello ${customerName}! You have successfully arrived at ${dropLocation}. Thank you for choosing HALO for your airport transfer. We hope you had a pleasant journey! 🎉✨`,

  // Emergency/cancellation
  transferCancelled: (customerName, reason) =>
    `Hello ${customerName}! Unfortunately, your transfer has been cancelled due to: ${reason}. Please contact our support team for assistance. We apologize for any inconvenience. 📞❌`,

  // Reminder notifications
  pickupReminder: (customerName, flightNo, estimatedPickupTime) =>
    `Hello ${customerName}! Reminder: Your pickup for flight ${flightNo} is scheduled for ${estimatedPickupTime}. Please ensure you're ready at the designated pickup location. ⏰✈️`,

  // Vendor notifications
  vendorDriverDispatch: (vendorName, customerName, flightNo, arrivalTime, pickupLocation) =>
    `Dispatch Alert: Please assign a driver for ${customerName} (Flight: ${flightNo}). Arrival: ${arrivalTime}. Pickup: ${pickupLocation}. HALO System.`,

  vendorFlightUpdate: (vendorName, customerName, flightNo, status, details) =>
    `Flight Update: ${customerName} (Flight: ${flightNo}) - Status: ${status}. ${details}. Please adjust driver schedule accordingly. HALO System.`
};

// Send WhatsApp message
const sendWhatsAppMessage = async (to, message, mediaUrl = null) => {
  if (!twilioClient) {
    console.warn(`⚠️ WhatsApp message to ${to} skipped - Twilio not configured: ${message}`);
    return {
      success: false,
      error: 'Twilio not configured'
    };
  }

  try {
    const messageOptions = {
      from: WHATSAPP_CONFIG.from,
      to: `whatsapp:${to}`,
      body: message
    };

    if (mediaUrl) {
      messageOptions.mediaUrl = [mediaUrl];
    }

    const result = await twilioClient.messages.create(messageOptions);
    
    console.log(`✅ WhatsApp message sent to ${to}:`, result.sid);
    return {
      success: true,
      messageId: result.sid,
      status: result.status
    };
  } catch (error) {
    console.error(`❌ Failed to send WhatsApp message to ${to}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Send SMS message
const sendSMSMessage = async (to, message) => {
  if (!twilioClient) {
    console.warn(`⚠️ SMS to ${to} skipped - Twilio not configured: ${message}`);
    return {
      success: false,
      error: 'Twilio not configured'
    };
  }

  try {
    const result = await twilioClient.messages.create({
      from: SMS_CONFIG.from,
      to: to,
      body: message
    });

    console.log(`✅ SMS sent to ${to}:`, result.sid);
    return {
      success: true,
      messageId: result.sid,
      status: result.status
    };
  } catch (error) {
    console.error(`❌ Failed to send SMS to ${to}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Send notification based on preference
const sendNotification = async (recipient, message, type = 'whatsapp', mediaUrl = null) => {
  try {
    let result;
    
    switch (type.toLowerCase()) {
      case 'whatsapp':
        result = await sendWhatsAppMessage(recipient, message, mediaUrl);
        break;
      case 'sms':
        result = await sendSMSMessage(recipient, message);
        break;
      default:
        throw new Error(`Unsupported notification type: ${type}`);
    }

    return result;
  } catch (error) {
    console.error('❌ Notification sending failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Validate phone number format
const validatePhoneNumber = (phoneNumber) => {
  const phoneRegex = /^\+[1-9]\d{1,14}$/;
  return phoneRegex.test(phoneNumber);
};

// Format phone number for Twilio
const formatPhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters except +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // Ensure it starts with +
  if (!cleaned.startsWith('+')) {
    // Add country code if missing (assuming +1 for US/Canada)
    cleaned = '+1' + cleaned;
  }
  
  return cleaned;
};

module.exports = {
  twilioClient,
  WHATSAPP_CONFIG,
  SMS_CONFIG,
  MESSAGE_TEMPLATES,
  sendWhatsAppMessage,
  sendSMSMessage,
  sendNotification,
  validatePhoneNumber,
  formatPhoneNumber
};
