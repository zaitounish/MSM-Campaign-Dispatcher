# MSM Campaign Dispatcher Backend (GAS)

Because this tool runs exclusively client-side to keep costs at zero, it utilizes Google Apps Script (GAS) as a serverless backend for bulk email delivery.

## How to Deploy Code.gs
1. Go to [script.google.com](https://script.google.com) and click **"New Project"**.
2. Clear any existing code in `Code.gs` and copy/paste the entire contents of the `gas/Code.gs` file from this folder.
3. In the top right corner, click **Deploy** > **New Deployment**.
4. Click the gear icon next to "Select type" and choose **Web App**.
5. Set the parameters exactly as follows:
   - **Execute as**: `Me` *(your DoorDash Google account)*
   - **Who has access**: `Anyone` *(so the React app can POST to it without OAuth)*
6. Click **Deploy**.
7. Google will ask you to authorize access (since it uses `MailApp` to send emails on your behalf). Advance through the warnings and allow it.
8. Copy the **Web App URL** provided at the end of the deployment.
9. Open the React application, click **Settings**, and paste the URL into the Google Apps Script Web App URL field.

You are now ready to bulk dispatch!
