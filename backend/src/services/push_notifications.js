// Push notification stubs — logs intent without integrating with a provider
function sendSosPush(userIds = [], triggeredBy = {}, location = {}) {
  const total = Array.isArray(userIds) ? userIds.length : 0;
  const payload = {
    triggeredBy,
    location,
    recipients: total
  };
  console.log(`[push] SOS push stub — would send to ${total} users`, payload);
}

module.exports = { sendSosPush };
