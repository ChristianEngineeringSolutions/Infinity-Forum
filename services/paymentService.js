'use strict';

function canReceivePayouts(account){
  // Check if payouts are enabled
  if (account.payouts_enabled !== true) {
    return false;
  }

  // Check payout capability status
  if (account.capabilities && account.capabilities.transfers !== 'active') {
    return false;
  }

  // Check if payouts are restricted
  if (account.payouts_enabled === true && account.requirements) {
    // Check for requirements that would block payouts
    if (account.requirements.disabled_reason) {
      return false;
    }

    // Check for past due requirements
    if (account.requirements.past_due?.length > 0) {
      return false;
    }

    // Check for currently due requirements
    if (account.requirements.currently_due?.length > 0) {
      return false;
    }
  }

  return true;
}

module.exports = {
  canReceivePayouts
};