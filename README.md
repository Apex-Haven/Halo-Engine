# HALO (Haven's AI Logistic Operator)

**HALO** is a comprehensive backend system for **Apex** that automates and tracks guest airport transfers during large-scale corporate events. It provides real-time flight tracking, automated notifications, and seamless coordination between drivers, vendors, and operations teams.

## 🚀 Features

### Core Capabilities
- **Real-Time Flight Tracking** - Automatic sync with flight APIs every 10 minutes
- **Automated Notifications** - WhatsApp, SMS, and email notifications based on flight status
- **Driver & Vendor Coordination** - Centralized system for managing assignments
- **Audit Trail** - Complete history of all transfer activities
- **Smart Scheduling** - Time-based notification preferences (day/night modes)

### Key Features
- ✅ **MongoDB Integration** with optimized indexes and schemas
- ✅ **Express.js API** with comprehensive validation
- ✅ **Twilio Integration** for WhatsApp and SMS notifications
- ✅ **Email Notifications** with beautiful HTML templates
- ✅ **Cron-based Automation** for flight sync and notifications
- ✅ **Request Validation** using Joi schemas
- ✅ **Error Handling** with detailed logging
- ✅ **Rate Limiting** and security middleware
- ✅ **Health Monitoring** and system checks

## 📋 Prerequisites

- **Node.js** (v18.0.0 or higher)
- **MongoDB** (v5.0 or higher) - Local or MongoDB Atlas
- **Twilio Account** (for WhatsApp/SMS notifications)
- **Email SMTP** (Gmail, Outlook, or custom SMTP)
- **Flight API Key** (AviationStack recommended)

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd halo-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
# Copy the example environment file
cp env.example .env

# Edit .env with your actual configuration
nano .env
```

### 4. Required Environment Variables

#### Database
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/halo
```

#### Twilio (WhatsApp & SMS)
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_PHONE_NUMBER=+1234567890
```

#### Email (SMTP)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

#### Flight API
```env
FLIGHT_API_KEY=your_aviationstack_api_key
```

### 5. Start the Server
```bash
# Development mode
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:0707`

## 📚 API Documentation

### Core Endpoints

#### Transfers
- `POST /api/transfers` - Create new transfer
- `GET /api/transfers` - Get all transfers (with filtering)
- `GET /api/transfers/:id` - Get transfer by Apex ID
- `PUT /api/transfers/:id` - Update transfer
- `PUT /api/transfers/:id/driver` - Assign driver
- `PUT /api/transfers/:id/driver/status` - Update driver status
- `DELETE /api/transfers/:id` - Delete transfer

#### Vendors
- `GET /api/vendors/:vendorId/transfers` - Get vendor transfers
- `GET /api/vendors/:vendorId/dashboard` - Get vendor dashboard
- `PUT /api/vendors/:vendorId/transfers/:transferId/driver` - Assign driver

#### Flights
- `GET /api/flights/:flight_no` - Get flight status
- `PUT /api/flights/transfers/:id/status` - Update flight status
- `POST /api/flights/transfers/:id/sync` - Sync flight from API
- `POST /api/flights/batch/sync` - Batch sync flights

#### Notifications
- `POST /api/notifications/:id/send` - Send manual notification
- `POST /api/notifications/:id/pickup-reminder` - Send pickup reminder
- `GET /api/notifications/:id/history` - Get notification history

### Example API Usage

#### Create a Transfer
```bash
curl -X POST http://localhost:0707/api/transfers \
  -H "Content-Type: application/json" \
  -d '{
    "_id": "APX123456",
    "customer_details": {
      "name": "Jane Doe",
      "contact_number": "+1234567890",
      "email": "jane@example.com",
      "no_of_passengers": 2,
      "luggage_count": 3
    },
    "flight_details": {
      "flight_no": "AI202",
      "airline": "Air India",
      "departure_airport": "DXB",
      "arrival_airport": "BOM",
      "departure_time": "2025-09-22T04:30:00Z",
      "arrival_time": "2025-09-22T09:00:00Z"
    },
    "transfer_details": {
      "pickup_location": "Mumbai International Airport - T2",
      "drop_location": "Grand Hyatt Hotel, Santacruz",
      "event_place": "Conference Hall A - Grand Hyatt",
      "estimated_pickup_time": "2025-09-22T09:30:00Z"
    },
    "vendor_details": {
      "vendor_id": "LV001",
      "vendor_name": "Le Vince Travels",
      "contact_person": "Mr. Ramesh",
      "contact_number": "+1234567890",
      "email": "vendor@example.com"
    }
  }'
```

#### Assign a Driver
```bash
curl -X PUT http://localhost:0707/api/transfers/APX123456/driver \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "DRV102",
    "name": "John Doe",
    "contact_number": "+1234567890",
    "vehicle_type": "Toyota Innova",
    "vehicle_number": "MH 01 AB 1234"
  }'
```

## 🤖 Automation & Cron Jobs

The system includes several automated processes:

### Flight Status Sync
- **Schedule**: Every 10 minutes
- **Purpose**: Sync flight statuses from external APIs
- **Action**: Updates transfer records and sends notifications

### Notification Processing
- **Schedule**: Every 5 minutes
- **Purpose**: Send scheduled notifications to customers
- **Action**: Processes pickup reminders and status updates

### Emergency Notifications
- **Schedule**: Every 2 minutes
- **Purpose**: Handle urgent situations
- **Action**: Alerts for landed flights without drivers, cancellations

### Vendor Reminders
- **Schedule**: Every 15 minutes
- **Purpose**: Remind vendors to dispatch drivers
- **Action**: Sends dispatch reminders 30 minutes before arrival

### Health Check
- **Schedule**: Every hour
- **Purpose**: Monitor system health
- **Action**: Identifies stuck transfers and system issues

### Data Cleanup
- **Schedule**: Daily at 2 AM
- **Purpose**: Maintain database performance
- **Action**: Cleans old notification history and audit logs

## 📊 Database Schema

### Transfer Document Structure
```javascript
{
  "_id": "APX123456", // Apex ID (unique)
  "customer_details": {
    "name": "Jane Doe",
    "contact_number": "+1234567890",
    "email": "jane@example.com",
    "no_of_passengers": 2,
    "luggage_count": 3
  },
  "flight_details": {
    "flight_no": "AI202",
    "airline": "Air India",
    "departure_airport": "DXB",
    "arrival_airport": "BOM",
    "departure_time": "2025-09-22T04:30:00Z",
    "arrival_time": "2025-09-22T09:00:00Z",
    "status": "on_time", // on_time | delayed | landed | cancelled
    "delay_minutes": 0,
    "gate": "A12",
    "terminal": "T2"
  },
  "transfer_details": {
    "pickup_location": "Mumbai International Airport - T2",
    "drop_location": "Grand Hyatt Hotel, Santacruz",
    "event_place": "Conference Hall A - Grand Hyatt",
    "estimated_pickup_time": "2025-09-22T09:30:00Z",
    "actual_pickup_time": null,
    "transfer_status": "pending" // pending | assigned | enroute | waiting | completed
  },
  "vendor_details": {
    "vendor_id": "LV001",
    "vendor_name": "Le Vince Travels",
    "contact_person": "Mr. Ramesh",
    "contact_number": "+1234567890",
    "email": "vendor@example.com"
  },
  "assigned_driver_details": {
    "driver_id": "DRV102",
    "name": "John Doe",
    "contact_number": "+1234567890",
    "vehicle_type": "Toyota Innova",
    "vehicle_number": "MH 01 AB 1234",
    "status": "assigned" // assigned | enroute | waiting | completed
  },
  "notifications": {
    "last_notification_sent": "2025-09-22T08:30:00Z",
    "next_scheduled_notification": "2025-09-22T08:45:00Z",
    "notification_preferences": {
      "day": "30_min_before",
      "night": ["60_min_before", "30_min_before"]
    },
    "notification_history": [...]
  },
  "audit_log": [
    {
      "action": "created",
      "timestamp": "2025-09-21T12:00:00Z",
      "by": "system",
      "details": "Transfer record created"
    }
  ],
  "create_time": "2025-09-21T12:00:00Z",
  "update_time": "2025-09-21T18:00:00Z"
}
```

## 🔧 Configuration

### Notification Preferences
- **Day Mode**: Single notification 30 minutes before arrival
- **Night Mode**: Multiple notifications (60 min and 30 min before)
- **Customizable**: Per-transfer notification preferences

### Flight API Integration
- **Primary**: AviationStack API (recommended)
- **Fallback**: Mock data for development
- **Batch Processing**: Efficient bulk updates

### Security Features
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Comprehensive Joi schemas
- **CORS Protection**: Configurable allowed origins
- **Helmet Security**: HTTP security headers

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
# Build and start
npm start

# Using PM2 (recommended)
npm install -g pm2
pm2 start server.js --name halo-backend
pm2 save
pm2 startup
```

### Docker (Optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 707
CMD ["npm", "start"]
```

### Environment Variables for Production
- Use strong, unique secrets
- Enable SSL/TLS
- Configure proper CORS origins
- Set up monitoring and logging
- Use managed database services

## 📱 Notification Templates

### WhatsApp/SMS Messages
- **Driver Assignment**: Confirmation with driver and vehicle details
- **Flight Delayed**: Updated arrival time and pickup adjustment
- **Flight Landed**: Driver enroute notification
- **Driver Waiting**: Pickup location and vehicle details
- **Transfer Completed**: Thank you message

### Email Templates
- **HTML Format**: Beautiful, responsive email templates
- **Branded**: HALO/Apex branding and styling
- **Informative**: Complete transfer details and contact information

## 🔍 Monitoring & Health Checks

### Health Endpoint
```bash
GET /health
```

### System Monitoring
- **Transfer Statistics**: Real-time counts and status distribution
- **Notification Metrics**: Success rates and delivery status
- **Flight Sync Status**: API connectivity and update frequency
- **Error Tracking**: Comprehensive error logging and reporting

## 🛠️ Development

### Project Structure
```
halo-backend/
├── config/           # Configuration files
├── controllers/      # Route controllers
├── middleware/       # Custom middleware
├── models/          # Mongoose models
├── routes/          # API routes
├── services/        # Business logic services
├── utils/           # Utility functions
├── server.js        # Main server file
└── package.json     # Dependencies
```

### Adding New Features
1. Create model in `models/`
2. Add controller in `controllers/`
3. Define routes in `routes/`
4. Add validation in `middleware/validation.js`
5. Update documentation

### Testing
```bash
# Run tests (when implemented)
npm test

# Lint code
npm run lint
npm run lint:fix
```

## 📞 Support

For technical support or questions:
- **Email**: support@halo-apex.com
- **Documentation**: Check API endpoints and examples
- **Issues**: Report bugs and feature requests

## 📄 License

This project is proprietary software developed for Apex. All rights reserved.

---

**HALO** - Making airport transfers seamless and automated for corporate events worldwide. ✈️🚗
