const Transfer = require('../models/Transfer');

// Intent patterns (regex) - order matters
const INTENTS = [
  {
    name: 'tracking_status',
    patterns: [
      /status\s+(?:of\s+)?(?:transfer\s+)?(APX[A-Z0-9]+)/i,
      /(?:what'?s?|what is)\s+(?:the\s+)?status\s+(?:of\s+)?(APX[A-Z0-9]+)/i,
      /(?:track|find|check|look\s+up)\s+(?:transfer\s+)?(APX[A-Z0-9]+)/i,
      /(APX[A-Z0-9]+)\s+(?:status|tracking)/i,
      /(?:where\s+is|where'?s)\s+(?:my\s+)?(?:transfer\s+)?(APX[A-Z0-9]+)/i,
      /(?:my\s+)?transfer\s+(APX[A-Z0-9]+)/i,
      /^(APX[A-Z0-9]+)$/i,
      /(?:when\s+is|when'?s)\s+(?:my\s+)?(?:pickup|pick\s*up)\s+(?:for\s+)?(APX[A-Z0-9]+)/i,
      /(?:who\s+is|who'?s)\s+(?:my\s+)?driver\s+(?:for\s+)?(APX[A-Z0-9]+)/i,
      /(?:pickup|pick\s*up)\s+time\s+(?:for\s+)?(APX[A-Z0-9]+)/i,
    ],
    extractId: (match) => match[1].toUpperCase(),
  },
  {
    name: 'tracking_by_company_traveler',
    patterns: [
      /(?:status|track|find|check)\s+(?:for\s+)?([^,]+),\s*([A-Za-z\s]{2,50})/i,
      /(?:status|track|find|check)\s+(?:for\s+)?(.+?)\s+-\s+([A-Za-z\s]{2,50})/i,
      /(?:company|at)\s+(.+?)\s+(?:traveler|person)\s+([A-Za-z\s]{2,50})/i,
      /^(.+?),\s*([A-Za-z\s]{2,50})$/,
    ],
    extractId: (match) => ({ company: match[1].trim(), traveler: match[2].trim() }),
  },
  {
    name: 'tracking_by_company',
    patterns: [
      /(?:status|track|find|check)\s+(?:for\s+)?company\s+([A-Za-z0-9\s&.,'-]{2,80})$/i,
      /(?:transfers?|transfer\s+status)\s+(?:for\s+)?company\s+([A-Za-z0-9\s&.,'-]{2,80})$/i,
    ],
    extractId: (match) => match[1].trim(),
  },
  {
    name: 'company_details_help',
    patterns: [
      /^company\s+details$/i,
      /^how\s+(?:do i\s+)?(?:get\s+)?company\s+details\??$/i,
    ],
    extractId: () => null,
  },
  {
    name: 'company_details',
    patterns: [
      /(?:company\s+)?details\s+(?:for\s+)?(?:company\s+)?([A-Za-z0-9\s&.,'-]{2,80})$/i,
      /(?:info|information)\s+(?:for\s+)?(?:company\s+)?([A-Za-z0-9\s&.,'-]{2,80})$/i,
      /(?:who\s+is|who'?s)\s+(?:the\s+)?contact\s+(?:for\s+)?(?:company\s+)?([A-Za-z0-9\s&.,'-]{2,80})$/i,
      /(?:company\s+)?([A-Za-z0-9\s&.,'-]{2,80})\s+(?:details|info|information|contact)/i,
    ],
    extractId: (match) => match[1].trim(),
  },
  {
    name: 'tracking_by_name',
    patterns: [
      /status\s+(?:of\s+)?(?:transfer\s+)?(?:for\s+)?([A-Za-z\s]{2,50})/i,
      /(?:what'?s?|what is)\s+(?:the\s+)?status\s+(?:for\s+)?([A-Za-z\s]{2,50})/i,
      /(?:track|find|check)\s+(?:transfer\s+)?(?:for\s+)?([A-Za-z\s]{2,50})/i,
      /(?:where\s+is|where'?s)\s+(?:my\s+)?transfer\s+(?:for\s+)?([A-Za-z\s]{2,50})/i,
      /(?:my\s+)?transfer\s+(?:for\s+)?([A-Za-z\s]{2,50})/i,
      /(?:when\s+is|when'?s)\s+(?:my\s+)?(?:pickup|pick\s*up)\s+(?:for\s+)?([A-Za-z\s]{2,50})/i,
      /(?:who\s+is|who'?s)\s+(?:my\s+)?driver\s+(?:for\s+)?([A-Za-z\s]{2,50})/i,
    ],
    extractId: (match) => match[1].trim(),
  },
  {
    name: 'help',
    patterns: [
      /^help$/i,
      /^what can you do$/i,
      /^hi$/i,
      /^hello$/i,
      /^hey$/i,
      /^good\s+morning$/i,
      /^good\s+afternoon$/i,
      /^good\s+evening$/i,
    ],
  },
];

function detectIntent(message) {
  const trimmed = (message || '').trim();
  if (!trimmed) return { intent: 'unknown', identifier: null };

  for (const intent of INTENTS) {
    for (const pattern of intent.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const identifier = intent.extractId ? intent.extractId(match) : null;
        return { intent: intent.name, identifier };
      }
    }
  }

  return { intent: 'unknown', identifier: null };
}

async function findTransferById(id) {
  const normalizedId = id.toUpperCase().trim();
  let transfer = await Transfer.findById(normalizedId);
  if (transfer) return transfer;

  // Try padded/unpadded variants for legacy APX IDs
  const digits = normalizedId.replace(/^APX/i, '');
  if (digits) {
    transfer = await Transfer.findById(`APX${digits.padStart(6, '0')}`);
    if (transfer) return transfer;
  }
  return null;
}

async function findTransferByName(name) {
  const searchName = name.trim();
  const transfers = await Transfer.find({
    $or: [
      { 'traveler_details.name': { $regex: searchName, $options: 'i' } },
      { 'customer_details.name': { $regex: searchName, $options: 'i' } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(1)
    .lean();

  return transfers[0] || null;
}

async function findTransferByCompanyAndTraveler(company, traveler) {
  const companyRegex = new RegExp(company.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const travelerRegex = new RegExp(traveler.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const transfers = await Transfer.find({
    $and: [
      {
        $or: [
          { 'customer_details.company_name': companyRegex },
          { 'traveler_details.company_name': companyRegex },
        ],
      },
      {
        $or: [
          { 'traveler_details.name': travelerRegex },
          { 'customer_details.name': travelerRegex },
        ],
      },
    ],
  })
    .sort({ createdAt: -1, create_time: -1 })
    .limit(1)
    .lean();
  return transfers[0] || null;
}

async function findTransferByCompany(company) {
  const companyRegex = new RegExp(company.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const transfers = await Transfer.find({
    $or: [
      { 'customer_details.company_name': companyRegex },
      { 'traveler_details.company_name': companyRegex },
    ],
  })
    .sort({ createdAt: -1, create_time: -1 })
    .limit(10)
    .lean();
  return transfers;
}

function getStatusDisplay(transfer) {
  const td = transfer.transfer_details || {};
  const onwardStatus = (td.transfer_status || td.status || 'pending').toLowerCase().replace(/\s/g, '_');
  const returnStatus = (transfer.return_transfer_details?.transfer_status || 'pending').toLowerCase().replace(/\s/g, '_');
  const hasVendor = !!transfer.vendor_details?.vendor_name || !!transfer.vendor_details?.vendor_id;
  const hasOnwardDriver = !!transfer.assigned_driver_details?.name || !!transfer.assigned_driver_details?.driver_name;
  const hasReturnTransfer = !!(transfer.return_transfer_details || transfer.return_flight_details);
  const onwardCompleted = onwardStatus === 'completed';
  const returnCompleted = returnStatus === 'completed';
  const returnInProgress = ['in_progress', 'enroute', 'waiting'].includes(returnStatus);
  const hasReturnDriver = !!transfer.return_assigned_driver_details?.name || !!transfer.return_assigned_driver_details?.driver_name;

  if (onwardStatus === 'cancelled' || returnStatus === 'cancelled') return { label: 'Cancelled', description: 'This transfer was cancelled.' };
  if (hasReturnTransfer && onwardCompleted && returnCompleted) return { label: 'Completed', description: 'Your round trip is complete. Thank you for traveling with us!' };
  if (hasReturnTransfer && onwardCompleted && returnInProgress) return { label: 'Return in progress', description: 'Your arrival is done. The driver is on the way for your return leg.' };
  if (hasReturnTransfer && onwardCompleted && !returnCompleted) return { label: 'Onward completed', description: 'Arrival done. We\'re arranging your return transfer.' };
  if (onwardCompleted) return { label: 'Completed', description: 'Transfer completed successfully.' };
  if (['in_progress', 'enroute', 'waiting'].includes(onwardStatus)) return { label: 'In progress', description: 'Your driver is on the way or waiting at the pickup point.' };
  if (hasReturnTransfer && onwardCompleted && !hasReturnDriver) return { label: 'Return driver pending', description: 'Your return leg is confirmed. A driver will be assigned shortly.' };
  if (!hasVendor) return { label: 'Vendor assignment pending', description: 'We\'re assigning a vendor for your transfer. It will be updated in the portal soon.' };
  if (!hasOnwardDriver) return { label: 'Driver assignment pending', description: 'Your vendor is confirmed. A driver will be assigned shortly.' };
  if (onwardStatus === 'assigned') return { label: 'Assigned', description: 'Your driver is assigned and ready for pickup.' };
  return { label: onwardStatus.replace(/_/g, ' '), description: 'Your transfer is being set up.' };
}

function formatDateTime(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}${day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'} ${month} ${year}, ${time}`;
}

function cleanValue(val, fallback = '—') {
  if (!val || val === 'TBD' || val === 'XX000') return null;
  const s = String(val).trim();
  if (s.endsWith('(TBD)')) return s.replace(/\s*\(TBD\)\s*$/, '').trim() || null;
  return s || null;
}

function buildTransferResponse(transfer) {
  const td = transfer.transfer_details || {};
  const fd = transfer.flight_details || {};
  const cd = transfer.customer_details || {};
  const trav = transfer.traveler_details || {};
  const driver = transfer.assigned_driver_details;
  const { label: statusLabel, description: statusDesc } = getStatusDisplay(transfer);

  const pickupLoc = cleanValue(td.pickup_location) || 'Airport';
  const dropLoc = cleanValue(td.drop_location) || 'Grand Hyatt';
  const hasRealFlight = fd.flight_no && fd.flight_no !== 'XX000' && fd.flight_no !== 'TBD';
  const airlineClean = fd.airline ? cleanValue(fd.airline) : null;
  const flightDisplay = hasRealFlight ? `${fd.flight_no}${airlineClean ? ` (${airlineClean})` : ''}` : null;

  const companyName = cleanValue(cd.company_name) || cleanValue(trav.company_name);
  const contactName = cleanValue(cd.name) || cleanValue(trav.name);
  const contactEmail = cleanValue(cd.email);
  const contactPhone = cleanValue(cd.contact_number) || cleanValue(cd.whatsapp_number);

  let text = `Here's your transfer status.\n\n`;
  text += `**${statusLabel}**\n`;
  text += `${statusDesc}\n\n`;
  if (companyName || contactName || contactEmail || contactPhone) {
    text += `**Company details**\n`;
    if (companyName) text += `Company: ${companyName}\n`;
    if (contactName) text += `Contact: ${contactName}\n`;
    if (contactEmail) text += `Email: ${contactEmail}\n`;
    if (contactPhone) text += `Phone: ${contactPhone}\n`;
    text += '\n';
  }
  text += `**Route:** ${pickupLoc} → ${dropLoc}\n`;
  if (td.estimated_pickup_time) {
    const pickupStr = formatDateTime(td.estimated_pickup_time);
    if (pickupStr) text += `**Pickup time:** ${pickupStr}\n`;
  }
  if (flightDisplay) {
    text += `**Flight:** ${flightDisplay}\n`;
  } else if (fd.flight_no && fd.flight_no !== 'XX000' && fd.flight_no !== 'TBD') {
    text += `**Flight:** ${fd.flight_no} (details to be confirmed)\n`;
  }
  if (driver) {
    const driverName = driver.name || driver.driver_name || 'Driver';
    text += `**Driver:** ${driverName}`;
    if (driver.vehicle_type) text += ` · ${driver.vehicle_type}`;
    if (driver.driver_phone || driver.contact_number) text += ` · ${driver.driver_phone || driver.contact_number}`;
    text += '\n';
  }
  text += `\n_Reference: ${transfer._id}_`;
  return text.trim();
}

function getCompanyDetailsHelpResponse() {
  return (
    `**Company details**\n\n` +
    `To get company info (contacts, email, phone), type:\n\n` +
    `**Company details for [Company Name]**\n\n` +
    `Replace [Company Name] with the actual company, e.g. "Acme Corp" or "ABC Ltd".`
  );
}

function getHelpResponse() {
  return (
    `**How can I help?**\n\n` +
    `I can look up your transfer status and company details. Try:\n\n` +
    `• **Company + Traveler:** "Status for [Company], [Traveler]" or "Track [Company] - [Traveler]"\n` +
    `• **Apex ID:** "APX123456" or "Status of APX123456"\n` +
    `• **Name:** "What's the status for John Smith"\n` +
    `• **Company details:** "Company details for [Company]" or "Details for [Company]"\n\n` +
    `Responses include company name, contact, email, and phone when available.`
  );
}

/**
 * POST /api/chat
 * Body: { message: string }
 */
const handleChat = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a message',
      });
    }

    const { intent, identifier } = detectIntent(message);

    if (intent === 'help') {
      return res.json({
        success: true,
        reply: getHelpResponse(),
        intent: 'help',
      });
    }

    if (intent === 'company_details_help') {
      return res.json({
        success: true,
        reply: getCompanyDetailsHelpResponse(),
        intent: 'company_details_help',
      });
    }

    if (intent === 'unknown') {
      return res.json({
        success: true,
        reply:
          `I didn't understand that. Try **company + traveler**, your **Apex ID**, or your **name**. Type **help** for more options.`,
        intent: 'unknown',
      });
    }

    let transfer = null;
    let displayIdentifier = identifier;

    if (intent === 'tracking_status') {
      const isApexId = /^APX[A-Z0-9]+$/i.test(identifier);
      if (isApexId) {
        transfer = await findTransferById(identifier);
      } else {
        transfer = await findTransferByName(identifier);
      }
    } else if (intent === 'tracking_by_company_traveler' && identifier && typeof identifier === 'object') {
      const { company, traveler } = identifier;
      transfer = await findTransferByCompanyAndTraveler(company, traveler);
      displayIdentifier = `${company} - ${traveler}`;
    } else if (intent === 'tracking_by_company') {
      const transfers = await findTransferByCompany(identifier);
      if (transfers.length === 1) {
        transfer = transfers[0];
      } else if (transfers.length > 1) {
        const travelerNames = [...new Set(
          transfers.flatMap(t => [
            t.traveler_details?.name,
            t.customer_details?.name,
          ].filter(Boolean))
        )].slice(0, 5);
        const suggestions = travelerNames.map(name =>
          `Status for ${identifier}, ${name}`
        );
        return res.json({
          success: true,
          reply: `I found ${transfers.length} transfers for **${identifier}**. Which traveler?`,
          intent,
          suggestions: suggestions.length > 0 ? suggestions : undefined,
        });
      }
    } else if (intent === 'tracking_by_name') {
      transfer = await findTransferByName(identifier);
    } else if (intent === 'company_details') {
      const transfers = await findTransferByCompany(identifier);
      if (transfers.length === 0) {
        return res.json({
          success: true,
          reply: `I couldn't find any transfers or company details for "${identifier}". Try a different company name or check the spelling.`,
          intent,
        });
      }
      const t = transfers[0];
      const cd = t.customer_details || {};
      const trav = t.traveler_details || {};
      const companyName = cleanValue(cd.company_name) || cleanValue(trav.company_name) || identifier;

      const contactMap = new Map();
      for (const x of transfers) {
        const c = x.customer_details || {};
        const name = cleanValue(c.name) || cleanValue(x.traveler_details?.name);
        const email = cleanValue(c.email);
        const phone = cleanValue(c.contact_number) || cleanValue(c.whatsapp_number);
        if (name || email || phone) {
          const key = `${name || ''}|${email || ''}|${phone || ''}`;
          if (!contactMap.has(key)) contactMap.set(key, { name, email, phone });
        }
      }
      const uniqueContacts = Array.from(contactMap.values());

      const travelerNames = [...new Set(
        transfers.flatMap(t => [
          t.traveler_details?.name,
          t.customer_details?.name,
        ].filter(Boolean))
      )].slice(0, 5);
      const suggestions = travelerNames.map(name =>
        `Status for ${identifier}, ${name}`
      );

      let reply = `**Company: ${companyName}**\n\n`;
      reply += `**Transfers:** ${transfers.length} found\n\n`;
      if (uniqueContacts.length > 0) {
        reply += `**Contacts:**\n`;
        uniqueContacts.slice(0, 5).forEach((c, i) => {
          reply += `${i + 1}. ${c.name || '—'}`;
          if (c.email) reply += ` · ${c.email}`;
          if (c.phone) reply += ` · ${c.phone}`;
          reply += '\n';
        });
      }
      return res.json({
        success: true,
        reply: reply.trim(),
        intent,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
      });
    }

    if (!transfer) {
      return res.json({
        success: true,
        reply: `I couldn't find a transfer for "${displayIdentifier}". Try your **company name** and **traveler name**, or your Apex ID. Visit the Tracking page to search.`,
        intent,
      });
    }

    const reply = buildTransferResponse(transfer);

    return res.json({
      success: true,
      reply,
      intent,
      transferId: transfer._id,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again.',
    });
  }
};

module.exports = {
  handleChat,
};
