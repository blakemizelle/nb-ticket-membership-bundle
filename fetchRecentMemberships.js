/**
 * NationBuilder Membership Bundle - RSVP Processing Script
 * 
 * This script runs on Google Apps Script and handles the automatic creation
 * of event RSVPs for membership bundle purchases. It monitors recent donations
 * with membership components and creates corresponding event RSVPs.
 * 
 * Required Environment Variables:
 * - API_TOKEN: NationBuilder API token
 * - SITE_SLUG: Your NationBuilder site slug
 * - SPREADSHEET_ID: Google Sheet ID for logging
 */

// Configuration constants - replace with your values
const CONFIG = {
  BASE_URL: 'https://SITE_SLUG.nationbuilder.com/api/v2',
  API_TOKEN: 'YOUR_API_TOKEN',
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  CHECK_PERIOD_HOURS: 24, // How far back to check for donations
  LOG_SHEET_NAME: 'Processing Log'
};

/**
 * Main function to fetch and process recent memberships
 * Triggered by time-based trigger (recommended: every 15 minutes)
 */
function fetchRecentMemberships() {
  // Initialize logging
  const sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.LOG_SHEET_NAME);
  
  // Calculate time period to check
  const checkFrom = new Date();
  checkFrom.setHours(checkFrom.getHours() - CONFIG.CHECK_PERIOD_HOURS);
  
  // Build API request parameters
  const params = {
    created_since: checkFrom.toISOString(),
    limit: 100,
    // Only fetch donations with membership components
    with_membership: true
  };

  try {
    // Fetch donations from NationBuilder API
    const donations = fetchDonationsFromAPI(params);
    Logger.log(`Found ${donations.length} donations to process`);

    // Process each donation
    donations.forEach(processDonation);

  } catch (error) {
    Logger.log(`Error in main process: ${error.toString()}`);
    // Log error to spreadsheet
    logToSheet(sheet, {
      timestamp: new Date(),
      status: 'ERROR',
      message: error.toString()
    });
  }
}

/**
 * Fetches donations from NationBuilder API
 * @param {Object} params - Query parameters for the API request
 * @returns {Array} Array of donation objects
 */
function fetchDonationsFromAPI(params) {
  const queryString = Object.entries(params)
    .map(([key, value]) => 
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  
  const url = `${CONFIG.BASE_URL}/donations?${queryString}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.API_TOKEN}`
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    throw new Error(`API returned status code ${responseCode}`);
  }

  return JSON.parse(response.getContentText()).data;
}

/**
 * Processes a single donation and creates RSVP if needed
 * @param {Object} donation - Donation object from NationBuilder API
 */
function processDonation(donation) {
  // Check for event RSVP data in custom fields
  if (!donation.attributes.custom_values?.event_rsvp_obj) {
    Logger.log(`No RSVP data found for donation ${donation.id}`);
    return;
  }

  try {
    // Parse the stored RSVP data
    const eventRsvpData = JSON.parse(
      donation.attributes.custom_values.event_rsvp_obj
    ).data;

    // Add required personal information to RSVP
    eventRsvpData.attributes = {
      ...eventRsvpData.attributes,
      first_name: donation.attributes.first_name,
      last_name: donation.attributes.last_name,
      email: donation.attributes.email
    };

    // Create the RSVP via API
    createRSVP(eventRsvpData, donation.id);

  } catch (error) {
    Logger.log(`Error processing RSVP for donation ${donation.id}: ${error}`);
  }
}

/**
 * Creates an RSVP in NationBuilder
 * @param {Object} rsvpData - Prepared RSVP data
 * @param {string} donationId - Associated donation ID for logging
 */
function createRSVP(rsvpData, donationId) {
  const url = `${CONFIG.BASE_URL}/event_rsvps`;
  
  const options = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.API_TOKEN}`
    },
    payload: JSON.stringify({ data: rsvpData }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  if (responseCode !== 201) {
    throw new Error(
      `Failed to create RSVP for donation ${donationId}: ${response.getContentText()}`
    );
  }

  Logger.log(`Successfully created RSVP for donation ${donationId}`);
}

/**
 * Logs an entry to the tracking spreadsheet
 * @param {Object} sheet - Google Sheet object
 * @param {Object} logEntry - Data to log
 */
function logToSheet(sheet, logEntry) {
  sheet.appendRow([
    logEntry.timestamp,
    logEntry.status,
    logEntry.message
  ]);
}