/**
 * gasScript.js | Canonical Gmail Drafts Bridge script (single source of truth)
 *
 * Displayed in RepSettingsModal's "Gmail Drafts Setup" accordion and DeliveryPanel.
 * The rep pastes this into script.google.com → Deploy as Web App → pastes the URL back into Settings.
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
      "✅ Authorization successful! Gmail Drafts Bridge is connected and ready. You can close this tab and return to the Dispatcher."
    )
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * POST endpoint used by the Dispatcher.
 * Accepts:
 *   - Direct JSON body (via e.postData.contents from fetch text/plain)
 *   - payload_encoded : URL-encoded JSON string (form submission)
 *   - payload         : Base64-encoded JSON string
 *   - emails          : raw JSON string
 *
 * It ONLY creates drafts; it never sends mail directly.
 * The rep must open Gmail Drafts and click Send manually  
 * this ensures Salesforce logs the email as manual ([outreach] [Email] manual [out]).
 */
function doPost(e) {
  var emails = [];
  var errors = [];
  var createdCount = 0;

  try {
    // 1. Direct JSON body (preferred from fetch text/plain)
    if (e && e.postData && e.postData.contents) {
      try {
        var parsed = JSON.parse(e.postData.contents);
        if (Array.isArray(parsed)) {
          emails = parsed;
        } else if (parsed && Array.isArray(parsed.emails)) {
          emails = parsed.emails;
        } else if (parsed && parsed.payload_encoded) {
          emails = JSON.parse(decodeURIComponent(parsed.payload_encoded));
        }
      } catch (postDataErr) {
        // Fall back to parameter parsing below
      }
    }

    // 2. Form parameter fallbacks
    if (emails.length === 0 && e && e.parameter) {
      if (e.parameter.payload_encoded) {
        emails = JSON.parse(decodeURIComponent(e.parameter.payload_encoded));
      } else if (e.parameter.payload) {
        var decodedBytes = Utilities.base64Decode(e.parameter.payload);
        var jsonStr = Utilities.newBlob(decodedBytes).getDataAsString();
        emails = JSON.parse(jsonStr);
      } else if (e.parameter.emails) {
        emails = JSON.parse(e.parameter.emails);
      }
    }
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "Failed to parse payload: " + err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!Array.isArray(emails) || emails.length === 0) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "No emails provided in payload." }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Create drafts with individual error handling per email
  emails.forEach(function (email, index) {
    try {
      var to = (email.to || "").trim();
      if (!to) {
        errors.push({ index: index, error: "Missing recipient address" });
        return;
      }

      var opts = {};
      // ONLY include cc if it contains a non-empty string. Passing cc: "" causes
      // GmailApp.createDraft to throw "Invalid argument: cc" and crash execution!
      if (email.cc && typeof email.cc === "string" && email.cc.trim().length > 0) {
        opts.cc = email.cc.trim();
      }
      if (email.htmlBody) {
        opts.htmlBody = email.htmlBody;
      }
      if (email.name) {
        opts.name = email.name;
      }

      GmailApp.createDraft(
        to,
        email.subject || "(No Subject)",
        email.plainTextBody || "",
        opts
      );
      createdCount++;
    } catch (draftErr) {
      errors.push({ index: index, to: email.to, error: draftErr.toString() });
    }
  });

  return ContentService
    .createTextOutput(JSON.stringify({
      ok: createdCount > 0,
      createdCount: createdCount,
      totalRequested: emails.length,
      failedCount: errors.length,
      errors: errors.slice(0, 5)
    }))
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
