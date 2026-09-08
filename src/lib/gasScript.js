/**
 * gasScript.js | Canonical Gmail Drafts Bridge script (single source of truth)
 *
 * Displayed in RepSettingsModal's "Gmail Drafts Setup" accordion (and mirrored
 * in DeliveryPanel, which keeps its own identical copy). The rep pastes this into
 * script.google.com → Deploy as Web App → pastes the URL back into Settings.
 */

export const GAS_SCRIPT = `/**
 * MSM Campaign Dispatcher – Gmail Drafts Bridge
 *
 * Deploy as a Web App:
 *   Execute as : Me
 *   Who has access : Anyone within DoorDash
 *
 * After deploying, open the Web App URL once in your browser to grant Gmail
 * permissions, then paste the URL into ⚙ Settings → Google Apps Script URL.
 */

function doGet(e) {
  // Simple GET endpoint to confirm the script is authorized and reachable.
  return ContentService
    .createTextOutput(
      "✅ Authorization successful! You can close this tab and return to the Dispatcher."
    )
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * POST endpoint used by the Dispatcher.
 * Expects either:
 *   - payload_encoded : URL-encoded JSON string (preferred, preserves emojis)
 *   - payload         : Base64-encoded JSON string
 *   - emails          : raw JSON string (fallback)
 *
 * It ONLY creates drafts; it never sends mail directly.
 * The rep must open Gmail Drafts and click Send manually  
 * this ensures Salesforce logs the email as manual ([outreach] [Email] manual [out]).
 */
function doPost(e) {
  var emails = [];

  try {
    // Prefer the explicitly encoded payload to avoid emoji corruption.
    if (e.parameter.payload_encoded) {
      var jsonStr = decodeURIComponent(e.parameter.payload_encoded);
      emails = JSON.parse(jsonStr);
    } else if (e.parameter.payload) {
      // Base64-encoded fallback.
      var decodedBytes = Utilities.base64Decode(e.parameter.payload);
      var jsonStr = Utilities.newBlob(decodedBytes).getDataAsString();
      emails = JSON.parse(jsonStr);
    } else {
      // Legacy fallback.
      emails = JSON.parse(e.parameter.emails || "[]");
    }
  } catch (err) {
    // If parsing fails, treat as empty list so the script doesn't crash.
    emails = [];
  }

  // Create a draft for each email object.
  // NOTE: We never call GmailApp.sendEmail() here.
  // Sending must be done manually by the rep inside Gmail
  // so that Salesforce/Outreach tags the message as [manual out].
  emails.forEach(function (email) {
    var opts = {
      cc:       email.cc || "",
      htmlBody: email.htmlBody || ""
    };
    GmailApp.createDraft(
      email.to,
      email.subject,
      email.plainTextBody || "",  // plain-text body (required)
      opts
    );
  });

  // Respond with a simple JSON payload so the frontend can show a count.
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, count: emails.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * OPTIONAL: Helper to send a limited number of existing drafts from the script editor.
 * WARNING: Do NOT call this from the web-app endpoint if you need the "manual" tag
 * in Salesforce. Sending from Apps Script will always tag as automated.
 */
// function sendAllMyDrafts() {
//   var MAX_SENDS = 50; // adjust as needed
//   var drafts = GmailApp.getDrafts();
//   var sentCount = 0;
// 
//   for (var i = 0; i < drafts.length; i++) {
//     if (sentCount >= MAX_SENDS) {
//       Logger.log("Reached maximum limit of " + MAX_SENDS + " sends. Stopping.");
//       break;
//     }
//     var toAddress = drafts[i].getMessage().getTo();
//     if (!toAddress || toAddress.trim() === "") {
//       break; 
//     }
//     
//     drafts[i].send();
//     sentCount++;
//   }
//   
//   Logger.log("Finished! Total emails sent this run: " + sentCount);
// }`;
