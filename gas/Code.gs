/**
 * GAS Companion Script for MSM Campaign Dispatcher
 * 
 * Deployment Instructions:
 * 1. Go to https://script.google.com and create a new project.
 * 2. Paste this entire file into Code.gs.
 * 3. Click "Deploy" -> "New Deployment"
 * 4. Select type "Web App"
 * 5. Execute as: "Me"
 * 6. Who has access: "Anyone"
 * 7. Click Deploy, authorize permissions, and copy the Web App URL.
 * 8. Paste that URL into the Rep Settings Modal in the React application.
 */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const emails = payload.emails || [];
    const action = payload.action || "send"; // 'send' or 'draft'

    emails.forEach(function(email) {
      if (!email.to || !email.subject) return;
      
      const options = {
        to: String(email.to).trim(),
        subject: String(email.subject),
        htmlBody: email.htmlBody,
        name: email.name || "DoorDash Merchant Success Manager"
      };
      
      if (email.cc) {
        options.cc = String(email.cc).trim();
      }

      if (action === "draft") {
        GmailApp.createDraft(options.to, options.subject, email.plainTextBody || "", {
          htmlBody: options.htmlBody,
          cc: options.cc,
          name: options.name
        });
      } else {
        MailApp.sendEmail(options);
      }
    });

    const successMsg = action === "draft" 
      ? `Successfully saved ${emails.length} drafts to your Gmail.` 
      : `Successfully sent ${emails.length} emails.`;

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok", sent: emails.length, message: successMsg }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Required to handle CORS preflight checks or browser ping
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "online", service: "MSM Campaign Dispatcher GAS API" }))
    .setMimeType(ContentService.MimeType.JSON);
}
