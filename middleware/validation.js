const Joi = require('joi');

// Common validation schemas
const commonSchemas = {
  apexId: Joi.string()
    .pattern(/^APX\d{4,6}$/) // Allow 4-6 digits for flexibility with existing transfers
    .uppercase()
    .required()
    .messages({
      'string.pattern.base': 'Apex ID must be in format APX followed by 4-6 digits (e.g., APX123456 or APX67774)'
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
    .pattern(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Vendor ID must be a valid MongoDB ObjectId (24 hex characters)'
    }),

  driverId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .messages({
      'string.pattern.base': 'Driver ID must be a valid MongoDB ObjectId (24 hex characters)'
    })
};

// Transfer creation schema
const createTransferSchema = Joi.object({
  _id: commonSchemas.apexId,
  
  // Customer and Vendor IDs (ObjectId strings)
  customer_id: Joi.alternatives()
    .try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
        'string.pattern.base': 'customer_id must be a valid MongoDB ObjectId'
      }),
      Joi.string().min(1).required()
    )
    .messages({
      'any.required': 'customer_id is required',
      'alternatives.match': 'customer_id must be a valid MongoDB ObjectId string'
    }),
  
  vendor_id: Joi.alternatives()
    .try(
      Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
        'string.pattern.base': 'vendor_id must be a valid MongoDB ObjectId'
      }),
      Joi.string().min(1).required()
    )
    .messages({
      'any.required': 'vendor_id is required',
      'alternatives.match': 'vendor_id must be a valid MongoDB ObjectId string'
    }),
  
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

  // Driver assignment (optional)
  assigned_driver_details: Joi.object({
    driver_id: Joi.string().allow('', null).optional(),
    name: Joi.string().trim().min(2).max(100).optional(),
    contact_number: Joi.string().pattern(/^\+[1-9]\d{1,14}$/).allow('', null).optional(),
    vehicle_type: Joi.string().trim().max(50).allow('', null).optional(),
    vehicle_number: Joi.string().trim().max(20).allow('', null).optional(),
    status: Joi.string().valid('assigned', 'enroute', 'waiting', 'completed', 'cancelled').default('assigned')
  }).optional(),

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
}).unknown(true); // Allow additional fields like assigned_driver_details

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

// Driver confirm action schema
const confirmDriverActionSchema = Joi.object({
  action: Joi.string()
    .valid('pickup', 'drop')
    .required()
    .messages({
      'any.only': 'Action must be either "pickup" or "drop"',
      'any.required': 'Action is required'
    })
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

// Vendor creation schema
const createVendorSchema = Joi.object({
  vendorId: Joi.string()
    .pattern(/^VEN\d{6}$/)
    .uppercase()
    .optional()
    .messages({
      'string.pattern.base': 'Vendor ID must be in format VEN followed by 6 digits (e.g., VEN123456)'
    }),

  companyName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Company name must be at least 2 characters long',
      'string.max': 'Company name cannot exceed 100 characters'
    }),

  contactPerson: Joi.object({
    firstName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .required(),
    
    lastName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .required(),
    
    email: commonSchemas.email,
    
    phone: commonSchemas.phoneNumber
  }).required(),

  businessDetails: Joi.object({
    licenseNumber: Joi.string()
      .trim()
      .min(1)
      .required(),
    
    taxId: Joi.string()
      .trim()
      .min(1)
      .required(),
    
    address: Joi.object({
      street: Joi.string().trim().required(),
      city: Joi.string().trim().required(),
      state: Joi.string().trim().required(),
      zipCode: Joi.string().trim().required(),
      country: Joi.string().trim().required()
    }).required(),
    
    website: Joi.alternatives()
      .try(
        Joi.string().uri().messages({
          'string.uri': 'Website must be a valid URL'
        }),
        Joi.string().allow('', null)
      )
      .optional()
  }).required(),

  services: Joi.object({
    airportTransfers: Joi.object({
      enabled: Joi.boolean().default(true),
      vehicleTypes: Joi.array().items(
        Joi.string().valid('sedan', 'suv', 'van', 'bus', 'luxury', 'electric')
      ).default([]),
      capacity: Joi.object({
        min: Joi.number().min(1).default(1),
        max: Joi.number().min(1).default(8)
      }).default({}),
      coverage: Joi.array().items(
        Joi.string().pattern(/^[A-Z]{3}$/).uppercase()
      ).default([])
    }).default({}),
    
    hotelTransfers: Joi.object({
      enabled: Joi.boolean().default(true),
      vehicleTypes: Joi.array().items(
        Joi.string().valid('sedan', 'suv', 'van', 'bus', 'luxury', 'electric')
      ).default([]),
      coverage: Joi.array().items(Joi.string().trim()).default([])
    }).default({}),
    
    cityTours: Joi.object({
      enabled: Joi.boolean().default(false),
      vehicleTypes: Joi.array().items(
        Joi.string().valid('sedan', 'suv', 'van', 'bus', 'luxury', 'electric')
      ).default([]),
      languages: Joi.array().items(
        Joi.string().valid('en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko')
      ).default([])
    }).default({})
  }).default({}),

  pricing: Joi.object({
    baseRate: Joi.number()
      .min(0)
      .required()
      .messages({
        'number.min': 'Base rate cannot be negative'
      }),
    
    currency: Joi.string()
      .uppercase()
      .valid('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR')
      .required(),
    
    perKmRate: Joi.number()
      .min(0)
      .default(0),
    
    waitingTimeRate: Joi.number()
      .min(0)
      .default(0),
    
    nightSurcharge: Joi.number()
      .min(0)
      .default(0)
  }).required(),

  preferences: Joi.object({
    workingHours: Joi.object({
      start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).default('06:00'),
      end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).default('22:00'),
      timezone: Joi.string().default('UTC')
    }).default({}),
    
    notificationSettings: Joi.object({
      email: Joi.boolean().default(true),
      sms: Joi.boolean().default(true),
      whatsapp: Joi.boolean().default(true),
      push: Joi.boolean().default(true)
    }).default({}),
    
    autoAcceptBookings: Joi.boolean().default(false),
    maxAdvanceBookingDays: Joi.number().min(1).max(365).default(30)
  }).default({}),

  notes: Joi.string()
    .trim()
    .max(1000)
    .allow('', null)
    .messages({
      'string.max': 'Notes cannot exceed 1000 characters'
    })
});

// Vendor assignment schema
const vendorAssignmentSchema = Joi.object({
  customerId: Joi.string()
    .required()
    .messages({
      'any.required': 'Customer ID is required'
    }),
  
  notes: Joi.string()
    .trim()
    .max(500)
    .allow('', null)
    .messages({
      'string.max': 'Notes cannot exceed 500 characters'
    })
});

// User creation schema
const createUserSchema = Joi.object({
  username: Joi.string()
    .trim()
    .min(3)
    .max(30)
    .alphanum()
    .required()
    .messages({
      'string.min': 'Username must be at least 3 characters long',
      'string.max': 'Username cannot exceed 30 characters',
      'string.alphanum': 'Username must contain only alphanumeric characters'
    }),

  email: commonSchemas.email,

  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      'string.min': 'Password must be at least 6 characters long',
      'string.max': 'Password cannot exceed 128 characters'
    }),

  profile: Joi.object({
    firstName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .required(),
    
    lastName: Joi.string()
      .trim()
      .min(1)
      .max(50)
      .required(),
    
    phone: Joi.string()
      .pattern(/^\+[1-9]\d{1,14}$/)
      .required()
      .messages({
        'string.pattern.base': 'Phone number must be in E.164 format (e.g., +1234567890)'
      })
  }).required(),

  preferences: Joi.object({
    notifications: Joi.object({
      email: Joi.boolean().default(true),
      sms: Joi.boolean().default(true),
      whatsapp: Joi.boolean().default(true),
      push: Joi.boolean().default(true)
    }).default({}),
    
    language: Joi.string()
      .valid('en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ko')
      .default('en'),
    
    timezone: Joi.string()
      .default('UTC')
  }).default({})
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
      stripUnknown: false, // Don't strip unknown fields - we want to preserve customer_id and vendor_id
      convert: true,
      allowUnknown: true // Allow unknown fields to pass through
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
    // But preserve important fields that might not be in the validated value
    if (source === 'query') {
      req.query = { ...data, ...value }; // Merge original and validated
      req.query = value; // Use validated values primarily
    } else {
      // Preserve customer_id and vendor_id from original if they exist
      const merged = { ...value };
      if (data.customer_id) {
        merged.customer_id = data.customer_id;
      }
      if (data.vendor_id) {
        merged.vendor_id = data.vendor_id;
      }
      if (data.assigned_driver_details) {
        merged.assigned_driver_details = data.assigned_driver_details;
      }
      req.body = merged;
    }

    next();
  };
};

// Specific validation middlewares
const validateTransfer = validate(createTransferSchema);
const validateDriverAssignment = validate(assignDriverSchema);
const validateDriverStatusUpdate = validate(updateDriverStatusSchema);
const validateDriverConfirmAction = validate(confirmDriverActionSchema);
const validateNotification = validate(sendNotificationSchema);
const validateFlightStatusUpdate = validate(updateFlightStatusSchema);
const validateUser = validate(createUserSchema);
const validateVendor = validate(createVendorSchema);
const validateVendorAssignment = validate(vendorAssignmentSchema);
const validateQueryParams = validate(queryParamsSchema, 'query');

// Parameter validation middleware
const validateApexId = (req, res, next) => {
  const id = req.params.id;
  
  // Normalize to uppercase
  const normalizedId = id ? id.toUpperCase().trim() : '';
  
  // Check format: APX followed by 4-6 digits (flexible for existing transfers)
  // But prefer 6 digits for new transfers
  const apexIdPattern = /^APX\d{4,6}$/;
  
  if (!apexIdPattern.test(normalizedId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Apex ID format',
      error: `Apex ID must be in format APX followed by 4-6 digits (e.g., APX123456). Received: ${id}`
    });
  }
  
  // Normalize ID in params for use in controllers
  req.params.id = normalizedId;
  
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
  validateDriverConfirmAction,
  validateNotification,
  validateFlightStatusUpdate,
  validateUser,
  validateVendor,
  validateVendorAssignment,
  validateQueryParams,
  validateApexId,
  validateFlightNumber,
  validateVendorId,
  commonSchemas,
  createTransferSchema,
  assignDriverSchema,
  updateDriverStatusSchema,
  confirmDriverActionSchema,
  sendNotificationSchema,
  updateFlightStatusSchema,
  createUserSchema,
  createVendorSchema,
  vendorAssignmentSchema,
  queryParamsSchema
};
