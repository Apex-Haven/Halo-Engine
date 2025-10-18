const nodemailer = require('nodemailer');

// Create transporter only if credentials are provided
const createTransporter = () => {
  const hasEmailCredentials = process.env.EMAIL_USER && process.env.EMAIL_PASS;
  
  if (!hasEmailCredentials) {
    console.warn('⚠️ Email credentials not configured. Email notifications will be disabled.');
    return null;
  }

  try {
    const transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    console.log('✅ Email transporter initialized successfully');
    return transporter;
  } catch (error) {
    console.warn('⚠️ Failed to initialize email transporter:', error.message);
    return null;
  }
};

// Email templates
const EMAIL_TEMPLATES = {
  // Driver assignment notification
  driverAssigned: (customerName, driverName, vehicleType, vehicleNumber, pickupLocation, estimatedTime, apexId) => ({
    subject: `🚗 Your Airport Transfer is Confirmed - ${apexId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>HALO Transfer Confirmation</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .highlight { background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛬 HALO Transfer Confirmation</h1>
            <p>Your airport transfer is confirmed!</p>
          </div>
          <div class="content">
            <h2>Hello ${customerName}!</h2>
            <p>Your airport transfer has been confirmed. Here are your transfer details:</p>
            
            <div class="highlight">
              <h3>🚗 Driver Details</h3>
              <p><strong>Driver Name:</strong> ${driverName}</p>
              <p><strong>Vehicle:</strong> ${vehicleType}</p>
              <p><strong>Vehicle Number:</strong> ${vehicleNumber}</p>
            </div>
            
            <div class="highlight">
              <h3>📍 Pickup Information</h3>
              <p><strong>Location:</strong> ${pickupLocation}</p>
              <p><strong>Estimated Pickup Time:</strong> ${estimatedTime}</p>
            </div>
            
            <div class="highlight">
              <h3>📋 Transfer ID</h3>
              <p><strong>Reference Number:</strong> ${apexId}</p>
            </div>
            
            <p>Please save this reference number for your records. Your driver will contact you upon arrival.</p>
            
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

  // Flight status updates
  flightDelayed: (customerName, flightNo, delayMinutes, newArrivalTime, apexId) => ({
    subject: `⏰ Flight Update - ${flightNo} Delayed`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Flight Update - HALO</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .highlight { background: #fff3e0; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #ff9800; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⏰ Flight Update</h1>
            <p>Your flight schedule has changed</p>
          </div>
          <div class="content">
            <h2>Hello ${customerName}!</h2>
            <p>We have an important update regarding your flight:</p>
            
            <div class="highlight">
              <h3>✈️ Flight Information</h3>
              <p><strong>Flight Number:</strong> ${flightNo}</p>
              <p><strong>Delay:</strong> ${delayMinutes} minutes</p>
              <p><strong>New Arrival Time:</strong> ${newArrivalTime}</p>
            </div>
            
            <p>Don't worry! We will automatically adjust your pickup time to accommodate this delay. Your driver will be notified of the new schedule.</p>
            
            <p>We'll keep you updated with any further changes. Thank you for your patience!</p>
            
            <p><strong>Reference Number:</strong> ${apexId}</p>
            
            <p><em>The HALO Team</em></p>
          </div>
          <div class="footer">
            <p>This is an automated message from HALO (Haven's AI Logistic Operator)</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Flight landed notification
  flightLanded: (customerName, flightNo, driverName, vehicleType, pickupLocation, apexId) => ({
    subject: `🛬 Welcome! Your Flight Has Landed - ${apexId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Flight Landed - HALO</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .highlight { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #4caf50; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛬 Welcome!</h1>
            <p>Your flight has landed safely</p>
          </div>
          <div class="content">
            <h2>Hello ${customerName}!</h2>
            <p>Great news! Your flight ${flightNo} has landed safely.</p>
            
            <div class="highlight">
              <h3>🚗 Your Driver is On the Way</h3>
              <p><strong>Driver Name:</strong> ${driverName}</p>
              <p><strong>Vehicle:</strong> ${vehicleType}</p>
              <p><strong>Pickup Location:</strong> ${pickupLocation}</p>
            </div>
            
            <p>Please proceed to the designated pickup area. Your driver will contact you shortly.</p>
            
            <p>Welcome to your destination! We hope you had a pleasant flight.</p>
            
            <p><strong>Reference Number:</strong> ${apexId}</p>
            
            <p><em>The HALO Team</em></p>
          </div>
          <div class="footer">
            <p>This is an automated message from HALO (Haven's AI Logistic Operator)</p>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // Transfer completion
  transferCompleted: (customerName, dropLocation, apexId) => ({
    subject: `✅ Transfer Completed Successfully - ${apexId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Transfer Completed - HALO</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .highlight { background: #e8f5e8; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #4caf50; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Transfer Completed</h1>
            <p>Thank you for choosing HALO!</p>
          </div>
          <div class="content">
            <h2>Hello ${customerName}!</h2>
            <p>Your airport transfer has been completed successfully.</p>
            
            <div class="highlight">
              <h3>📍 Destination Reached</h3>
              <p><strong>Drop Location:</strong> ${dropLocation}</p>
              <p><strong>Status:</strong> Completed</p>
            </div>
            
            <p>We hope you had a pleasant and comfortable journey with HALO. Thank you for choosing us for your airport transfer needs.</p>
            
            <p>If you have any feedback about your experience, we'd love to hear from you!</p>
            
            <p><strong>Reference Number:</strong> ${apexId}</p>
            
            <p><em>The HALO Team</em></p>
          </div>
          <div class="footer">
            <p>This is an automated message from HALO (Haven's AI Logistic Operator)</p>
            <p>For support or feedback, please contact us at support@halo-apex.com</p>
          </div>
        </div>
      </body>
      </html>
    `
  })
};

// Send email
const sendEmail = async (to, subject, html, text = null) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.warn(`⚠️ Email to ${to} skipped - Email not configured: ${subject}`);
    return {
      success: false,
      error: 'Email not configured'
    };
  }

  try {
    const mailOptions = {
      from: `"HALO System" <${process.env.EMAIL_USER}>`,
      to: to,
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent to ${to}:`, result.messageId);
    return {
      success: true,
      messageId: result.messageId,
      response: result.response
    };
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error);
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
  createTransporter,
  EMAIL_TEMPLATES,
  sendEmail,
  sendTemplatedEmail,
  validateEmail
};
