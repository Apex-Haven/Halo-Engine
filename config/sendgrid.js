// Try to load SendGrid, but don't fail if it's not installed
let sgMail = null;
try {
  sgMail = require('@sendgrid/mail');
} catch (error) {
  console.warn('⚠️ @sendgrid/mail package not installed. Run: npm install @sendgrid/mail');
  console.warn('⚠️ Email notifications will be disabled until SendGrid is installed.');
}

// Initialize SendGrid
const initializeSendGrid = () => {
  if (!sgMail) {
    console.warn('⚠️ SendGrid package not installed. Email notifications will be disabled.');
    return false;
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ SendGrid API key not configured. Email notifications will be disabled.');
    return false;
  }

  try {
    sgMail.setApiKey(apiKey);
    console.log('✅ SendGrid initialized successfully');
    return true;
  } catch (error) {
    console.warn('⚠️ Failed to initialize SendGrid:', error.message);
    return false;
  }
};

// Email templates
const EMAIL_TEMPLATES = {
  // Transfer created notification for client
  transferCreatedClient: (clientName, transferId, flightNo, departureAirport, arrivalAirport, departureTime, arrivalTime, pickupLocation, dropLocation) => ({
    subject: `🚗 Transfer Created - ${transferId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Transfer Created - HALO</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .highlight { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .info-row { margin: 10px 0; }
          .info-label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛬 Transfer Created</h1>
            <p>Your airport transfer has been created successfully!</p>
          </div>
          <div class="content">
            <h2>Hello ${clientName}!</h2>
            <p>A new transfer has been created for you. Here are the details:</p>
            
            <div class="highlight">
              <h3>📋 Transfer Information</h3>
              <div class="info-row">
                <span class="info-label">Transfer ID:</span> ${transferId}
              </div>
              <div class="info-row">
                <span class="info-label">Flight Number:</span> ${flightNo}
              </div>
              <div class="info-row">
                <span class="info-label">Route:</span> ${departureAirport} → ${arrivalAirport}
              </div>
              <div class="info-row">
                <span class="info-label">Departure Time:</span> ${departureTime}
              </div>
              <div class="info-row">
                <span class="info-label">Arrival Time:</span> ${arrivalTime}
              </div>
            </div>
            
            <div class="highlight">
              <h3>📍 Transfer Details</h3>
              <div class="info-row">
                <span class="info-label">Pickup Location:</span> ${pickupLocation}
              </div>
              <div class="info-row">
                <span class="info-label">Drop Location:</span> ${dropLocation || 'To be confirmed'}
              </div>
            </div>
            
            <p>Your transfer is being processed. You will receive another email once a driver is assigned.</p>
            
            <p>Please save this reference number (${transferId}) for your records.</p>
            
            <p>Safe travels! ✈️</p>
            
            <p><em>The HALO Team</em></p>
          </div>
          <div class="footer">
            <p>This is an automated message from HALO (Haven's AI Logistic Operator)</p>
            <p>For support, please contact us at support@halo-apex.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Transfer created notification for traveler
  transferCreatedTraveler: (travelerName, transferId, flightNo, departureAirport, arrivalAirport, departureTime, arrivalTime, pickupLocation, dropLocation) => ({
    subject: `✈️ Your Transfer Has Been Created - ${transferId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Transfer Created - HALO</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .highlight { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .info-row { margin: 10px 0; }
          .info-label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✈️ Transfer Created</h1>
            <p>Your airport transfer has been set up!</p>
          </div>
          <div class="content">
            <h2>Hello ${travelerName}!</h2>
            <p>A transfer has been created for your upcoming flight. Here are your transfer details:</p>
            
            <div class="highlight">
              <h3>📋 Transfer Information</h3>
              <div class="info-row">
                <span class="info-label">Transfer ID:</span> ${transferId}
              </div>
              <div class="info-row">
                <span class="info-label">Flight Number:</span> ${flightNo}
              </div>
              <div class="info-row">
                <span class="info-label">Route:</span> ${departureAirport} → ${arrivalAirport}
              </div>
              <div class="info-row">
                <span class="info-label">Departure Time:</span> ${departureTime}
              </div>
              <div class="info-row">
                <span class="info-label">Arrival Time:</span> ${arrivalTime}
              </div>
            </div>
            
            <div class="highlight">
              <h3>📍 Transfer Details</h3>
              <div class="info-row">
                <span class="info-label">Pickup Location:</span> ${pickupLocation}
              </div>
              <div class="info-row">
                <span class="info-label">Drop Location:</span> ${dropLocation || 'To be confirmed'}
              </div>
            </div>
            
            <p>Your transfer is being processed. You will receive another email once a driver is assigned with their contact details.</p>
            
            <p>Please save this reference number (${transferId}) for your records.</p>
            
            <p>We look forward to serving you! Safe travels! ✈️</p>
            
            <p><em>The HALO Team</em></p>
          </div>
          <div class="footer">
            <p>This is an automated message from HALO (Haven's AI Logistic Operator)</p>
            <p>For support, please contact us at support@halo-apex.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Send email using SendGrid
const sendEmail = async (to, subject, html, text = null) => {
  if (!sgMail) {
    console.warn(`⚠️ Email to ${to} skipped - SendGrid package not installed: ${subject}`);
    return {
      success: false,
      error: 'SendGrid package not installed'
    };
  }

  if (!initializeSendGrid()) {
    console.warn(`⚠️ Email to ${to} skipped - SendGrid not configured: ${subject}`);
    return {
      success: false,
      error: 'SendGrid not configured'
    };
  }

  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@halo-apex.com';
  const fromName = process.env.SENDGRID_FROM_NAME || 'HALO System';

  try {
    const msg = {
      to: to,
      from: {
        email: fromEmail,
        name: fromName
      },
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    const result = await sgMail.send(msg);
    
    console.log(`✅ Email sent to ${to}:`, result[0].statusCode);
    return {
      success: true,
      statusCode: result[0].statusCode,
      messageId: result[0].headers['x-message-id']
    };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    return {
      success: false,
      error: error.message
    };
  }
};

// Send templated email
const sendTemplatedEmail = async (to, templateName, templateData) => {
  try {
    const template = EMAIL_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Email template '${templateName}' not found`);
    }

    const emailData = typeof template === 'function' ? template(...templateData) : template;
    
    return await sendEmail(to, emailData.subject, emailData.html);
  } catch (error) {
    console.error(`❌ Failed to send templated email:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Validate email format
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

module.exports = {
  initializeSendGrid,
  EMAIL_TEMPLATES,
  sendEmail,
  sendTemplatedEmail,
  validateEmail
};
