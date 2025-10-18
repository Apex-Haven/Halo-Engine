const Joi = require('joi');

// Common validation schemas
const commonSchemas = {
  apexId: Joi.string()
    .pattern(/^APX\d{6}$/)
    .uppercase()
    .required()
    .messages({
      'string.pattern.base': 'Apex ID must be in format APX followed by 6 digits (e.g., APX123456)'
    }),

  phoneNumber: Joi.string()
    .pattern(/^\+[1-9]\d{1,14}$/)
    .required()
    .messages({
      'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)'
    }),

  email: Joi.string()
    .email()
    .lowercase()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address'
    }),

  flightNumber: Joi.string()
    .pattern(/^[A-Z]{2,3}\d{1,4}$/)
    .uppercase()
    .required()
    .messages({
      'string.pattern.base': 'Flight number must be in format like AI202, EK501, etc.'
    }),

  airportCode: Joi.string()
    .length(3)
    .uppercase()
    .pattern(/^[A-Z]{3}$/)
    .required()
    .messages({
      'string.length': 'Airport code must be exactly 3 characters',
      'string.pattern.base': 'Airport code must contain only letters'
    }),

  dateTime: Joi.date()
    .iso()
    .required()
    .messages({
      'date.format': 'Date must be in ISO format'
    }),

  vendorId: Joi.string()
    .alphanum()
    .min(3)
    .max(20)
    .required()
    .messages({
      'string.alphanum': 'Vendor ID must contain only alphanumeric characters'
    }),

  driverId: Joi.string()
    .alphanum()
    .min(3)
    .max(20)
    .required()
    .messages({
      'string.alphanum': 'Driver ID must contain only alphanumeric characters'
    })
};

// Transfer creation schema
const createTransferSchema = Joi.object({
  _id: commonSchemas.apexId,
  
  customer_details: Joi.object({
    name: Joi.string()
      .trim()
      .min(2)
      .max(100)
      .required()
      .messages({
        'string.min': 'Customer name must be at least 2 characters long',
        'string.max': 'Customer name cannot exceed 100 characters'
      }),
    
    contact_number: commonSchemas.phoneNumber,
    email: commonSchemas.email,
    
    no_of_passengers: Joi.number()
      .integer()
      .min(1)
      .max(20)
      .required()
      .messages({
        'number.min': 'Number of passengers must be at least 1',
        'number.max': 'Number of passengers cannot exceed 20'
      }),
    
    luggage_count: Joi.number()
      .integer()
      .min(0)
      .max(50)
      .required()
      .messages({
        'number.min': 'Luggage count cannot be negative',
        'number.max': 'Luggage count cannot exceed 50'
      })
  }).required(),

  flight_details: Joi.object({
    flight_no: commonSchemas.flightNumber,
    airline: Joi.string()
      .trim()
      .min(2)
      .max(50)
      .required(),
    
    departure_airport: commonSchemas.airportCode,
    arrival_airport: commonSchemas.airportCode,
    
    departure_time: commonSchemas.dateTime,
    arrival_time: commonSchemas.dateTime,
    
    status: Joi.string()
      .valid('on_time', 'delayed', 'landed', 'cancelled', 'boarding', 'departed')
      .default('on_time'),
    
    delay_minutes: Joi.number()
      .integer()
      .min(0)
      .default(0),
    
    gate: Joi.string()
      .trim()
      .max(10)
      .allow('', null),
    
    terminal: Joi.string()
      .trim()
      .max(10)
      .allow('', null)
  }).required(),

  transfer_details: Joi.object({
    pickup_location: Joi.string()
      .trim()
      .min(5)
      .max(200)
      .required()
      .messages({
        'string.min': 'Pickup location must be at least 5 characters long'
      }),
    
    drop_location: Joi.string()
      .trim()
      .min(5)
      .max(200)
      .required()
      .messages({
        'string.min': 'Drop location must be at least 5 characters long'
      }),
    
    event_place: Joi.string()
      .trim()
      .min(5)
      .max(200)
      .required()
      .messages({
        'string.min': 'Event place must be at least 5 characters long'
      }),
    
    estimated_pickup_time: commonSchemas.dateTime,
    
    special_notes: Joi.string()
      .trim()
      .max(500)
      .allow('', null)
      .messages({
        'string.max': 'Special notes cannot exceed 500 characters'
      })
  }).required(),

  vendor_details: Joi.object({
    vendor_id: commonSchemas.vendorId,
    vendor_name: Joi.string()
      .trim()
      .min(2)
      .max(100)
      .required(),
    
    contact_person: Joi.string()
      .trim()
      .min(2)
      .max(100)
      .required(),
    
    contact_number: commonSchemas.phoneNumber,
    email: commonSchemas.email
  }).required(),

  priority: Joi.string()
    .valid('low', 'normal', 'high', 'vip')
    .default('normal'),

  internal_notes: Joi.string()
    .trim()
    .max(1000)
    .allow('', null)
    .messages({
      'string.max': 'Internal notes cannot exceed 1000 characters'
    })
});

// Driver assignment schema
const assignDriverSchema = Joi.object({
  driver_id: commonSchemas.driverId,
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required(),
  
  contact_number: commonSchemas.phoneNumber,
  
  vehicle_type: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required(),
  
  vehicle_number: Joi.string()
    .trim()
    .min(2)
    .max(20)
    .required(),
  
  location: Joi.object({
    latitude: Joi.number()
      .min(-90)
      .max(90)
      .allow(null),
    
    longitude: Joi.number()
      .min(-180)
      .max(180)
      .allow(null),
    
    address: Joi.string()
      .trim()
      .max(200)
      .allow('', null)
  }).allow(null)
});

// Update driver status schema
const updateDriverStatusSchema = Joi.object({
  status: Joi.string()
    .valid('assigned', 'enroute', 'waiting', 'completed', 'cancelled')
    .required(),
  
  location: Joi.object({
    latitude: Joi.number()
      .min(-90)
      .max(90)
      .allow(null),
    
    longitude: Joi.number()
      .min(-180)
      .max(180)
      .allow(null),
    
    address: Joi.string()
      .trim()
      .max(200)
      .allow('', null)
  }).allow(null)
});

// Notification schema
const sendNotificationSchema = Joi.object({
  type: Joi.string()
    .valid('whatsapp', 'sms', 'email')
    .required(),
  
  message: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .required()
    .messages({
      'string.min': 'Message cannot be empty',
      'string.max': 'Message cannot exceed 1000 characters'
    }),
  
  media_url: Joi.string()
    .uri()
    .allow('', null)
    .messages({
      'string.uri': 'Media URL must be a valid URL'
    })
});

// Flight status update schema
const updateFlightStatusSchema = Joi.object({
  status: Joi.string()
    .valid('on_time', 'delayed', 'landed', 'cancelled', 'boarding', 'departed')
    .required(),
  
  delay_minutes: Joi.number()
    .integer()
    .min(0)
    .default(0),
  
  gate: Joi.string()
    .trim()
    .max(10)
    .allow('', null),
  
  terminal: Joi.string()
    .trim()
    .max(10)
    .allow('', null)
});

// Query parameters schema
const queryParamsSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10),
  
  status: Joi.string()
    .valid('pending', 'assigned', 'enroute', 'waiting', 'in_progress', 'completed', 'cancelled'),
  
  vendor_id: commonSchemas.vendorId.optional(),
  
  driver_id: commonSchemas.driverId.optional(),
  
  flight_no: commonSchemas.flightNumber.optional(),
  
  date_from: Joi.date()
    .iso()
    .allow('', null),
  
  date_to: Joi.date()
    .iso()
    .allow('', null),
  
  search: Joi.string()
    .trim()
    .max(100)
    .allow('', null)
});

// Validation middleware factory
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'query' ? req.query : req.body;
    
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    // Replace the original data with validated and sanitized data
    if (source === 'query') {
      req.query = value;
    } else {
      req.body = value;
    }

    next();
  };
};

// Specific validation middlewares
const validateTransfer = validate(createTransferSchema);
const validateDriverAssignment = validate(assignDriverSchema);
const validateDriverStatusUpdate = validate(updateDriverStatusSchema);
const validateNotification = validate(sendNotificationSchema);
const validateFlightStatusUpdate = validate(updateFlightStatusSchema);
const validateQueryParams = validate(queryParamsSchema, 'query');

// Parameter validation middleware
const validateApexId = (req, res, next) => {
  const { error } = commonSchemas.apexId.validate(req.params.id);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Apex ID format',
      error: error.details[0].message
    });
  }
  
  next();
};

const validateFlightNumber = (req, res, next) => {
  const { error } = commonSchemas.flightNumber.validate(req.params.flight_no);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid flight number format',
      error: error.details[0].message
    });
  }
  
  next();
};

const validateVendorId = (req, res, next) => {
  const { error } = commonSchemas.vendorId.validate(req.params.vendorId);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid vendor ID format',
      error: error.details[0].message
    });
  }
  
  next();
};

module.exports = {
  validate,
  validateTransfer,
  validateDriverAssignment,
  validateDriverStatusUpdate,
  validateNotification,
  validateFlightStatusUpdate,
  validateQueryParams,
  validateApexId,
  validateFlightNumber,
  validateVendorId,
  commonSchemas,
  createTransferSchema,
  assignDriverSchema,
  updateDriverStatusSchema,
  sendNotificationSchema,
  updateFlightStatusSchema,
  queryParamsSchema
};
