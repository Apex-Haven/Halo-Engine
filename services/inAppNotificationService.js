const InAppNotification = require('../models/InAppNotification');
const User = require('../models/User');

/**
 * Create in-app notification(s) for one or more users.
 * @param {string|string[]} userIds - Single user id or array of user ids (ObjectId or string)
 * @param {string} type - transfer_created | vendor_assigned | driver_assigned
 * @param {string} transferId - Transfer APEX id
 * @param {string} title - Short title
 * @param {string} [message] - Optional longer message
 * @param {object} [metadata] - Optional extra data for action link
 */
async function createInAppNotification(userIds, type, transferId, title, message = '', metadata = null) {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  if (ids.length === 0) return [];
  const docs = ids.map(uid => ({
    user_id: uid,
    type,
    transfer_id: transferId,
    title,
    message,
    read: false,
    metadata: metadata || undefined
  }));
  const created = await InAppNotification.insertMany(docs);
  return created;
}

/**
 * Notify admins that a new transfer was created (by client).
 */
async function notifyAdminsTransferCreated(transfer) {
  const admins = await User.find(
    { role: { $in: ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS_MANAGER'] }, isActive: true },
    { _id: 1 }
  ).lean();
  const adminIds = admins.map(a => a._id);
  if (adminIds.length === 0) return [];
  const customerName = transfer.customer_details?.name || 'A client';
  return createInAppNotification(
    adminIds,
    'transfer_created',
    transfer._id,
    'New transfer created',
    `${customerName} created transfer ${transfer._id}. Assign a vendor when ready.`,
    { action: 'assign_vendor' }
  );
}

/**
 * Notify client that a vendor was assigned to their transfer.
 */
async function notifyClientVendorAssigned(transfer) {
  const customerId = transfer.customer_id;
  if (!customerId) return [];
  const vendorName = transfer.vendor_details?.vendor_name || 'A vendor';
  return createInAppNotification(
    customerId,
    'vendor_assigned',
    transfer._id,
    'Vendor assigned to your transfer',
    `${vendorName} has been assigned to transfer ${transfer._id}. They will assign a driver soon.`,
    { action: 'view_transfer' }
  );
}

/**
 * Notify vendor that they were assigned to a transfer (admin assigned them).
 */
async function notifyVendorAssignedToTransfer(transfer, vendorUserId) {
  if (!vendorUserId) return [];
  const customerName = transfer.customer_details?.name || 'Customer';
  return createInAppNotification(
    vendorUserId,
    'vendor_assigned',
    transfer._id,
    'You were assigned to a transfer',
    `You have been assigned to transfer ${transfer._id} for ${customerName}. Please assign a driver.`,
    { action: 'assign_driver' }
  );
}

/**
 * Notify client that a driver was assigned to their transfer.
 */
async function notifyClientDriverAssigned(transfer) {
  const customerId = transfer.customer_id;
  if (!customerId) return [];
  const driverName = transfer.assigned_driver_details?.name || transfer.assigned_driver_details?.driver_name || 'A driver';
  return createInAppNotification(
    customerId,
    'driver_assigned',
    transfer._id,
    'Driver assigned to your transfer',
    `${driverName} has been assigned to your transfer ${transfer._id}.`,
    { action: 'view_transfer' }
  );
}

module.exports = {
  createInAppNotification,
  notifyAdminsTransferCreated,
  notifyClientVendorAssigned,
  notifyVendorAssignedToTransfer,
  notifyClientDriverAssigned
};
