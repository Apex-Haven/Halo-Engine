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

function formatStatus(status) {
  if (!status) return 'Pending';
  return String(status).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function buildTransferResponse(transfer) {
  const td = transfer.transfer_details || {};
  const fd = transfer.flight_details || {};
  const driver = transfer.assigned_driver_details;
  const status = td.transfer_status || td.status || 'pending';

  let text = `**Transfer ${transfer._id}**\n\n`;
  text += `**Status:** ${formatStatus(status)}\n\n`;
  text += `**Pickup:** ${td.pickup_location || '—'}\n`;
  text += `**Drop-off:** ${td.drop_location || '—'}\n`;
  if (td.estimated_pickup_time) {
    text += `**Pickup time:** ${formatDateTime(td.estimated_pickup_time)}\n`;
  }
  if (fd.flight_no && fd.flight_no !== 'XX000' && fd.flight_no !== 'TBD') {
    text += `**Flight:** ${fd.flight_no} (${fd.airline || '—'})\n`;
  }
  if (driver) {
    const driverName = driver.name || driver.driver_name || 'N/A';
    const driverPhone = driver.driver_phone || driver.contact_number;
    text += `**Driver:** ${driverName}`;
    if (driver.vehicle_type) text += ` · ${driver.vehicle_type}`;
    if (driverPhone) text += ` · ${driverPhone}`;
    text += '\n';
  }
  return text.trim();
}

function getHelpResponse() {
  return (
    `**How can I help?**\n\n` +
    `I can look up your transfer status. Try:\n\n` +
    `• "Status of APX123456" or "APX123456"\n` +
    `• "What's the status for John Smith"\n` +
    `• "Where is my transfer APX123456"\n` +
    `• "Track transfer for Jane Doe"\n\n` +
    `Use your **Apex ID** (e.g. APX123456) or your **name** as it appears in the booking.`
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

    if (intent === 'unknown') {
      return res.json({
        success: true,
        reply:
          `I didn't understand that. ` +
          `You can ask for transfer status using your Apex ID (e.g. APX123456) or your name. ` +
          `Type **help** for more options.`,
        intent: 'unknown',
      });
    }

    let transfer = null;

    if (intent === 'tracking_status') {
      const isApexId = /^APX[A-Z0-9]+$/i.test(identifier);
      if (isApexId) {
        transfer = await findTransferById(identifier);
      } else {
        transfer = await findTransferByName(identifier);
      }
    } else if (intent === 'tracking_by_name') {
      transfer = await findTransferByName(identifier);
    }

    if (!transfer) {
      return res.json({
        success: true,
        reply: `I couldn't find a transfer for "${identifier}". Please check your Apex ID or name and try again. You can also visit the Tracking page to search.`,
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
