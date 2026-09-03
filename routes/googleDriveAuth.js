const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { admin } = require('../middleware/adminMiddleware');
const asyncHandler = require('../middleware/asyncHandler');
const {
  isOAuthConfigured,
  isDriveAuthorized,
  getAuthUrl,
  validateState,
  exchangeCodeForTokens,
  saveRefreshToken,
  resetOAuthCache,
  ensureDriveAccess,
  getStoredRefreshToken,
  normalizeFolderId,
  getDriveClient,
} = require('../utils/googleDrive');

const router = express.Router();

router.get('/status', (req, res) => {
  const configured = isOAuthConfigured();
  const authorized = isDriveAuthorized();

  res.json({
    success: true,
    configured,
    authorized,
    folderId: configured ? process.env.GOOGLE_DRIVE_FOLDER_ID : undefined,
  });
});

router.get(
  '/auth',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    if (!isOAuthConfigured()) {
      return res.status(500).json({
        success: false,
        message:
          'Google Drive OAuth is not configured. Please contact your system administrator.',
      });
    }

    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin authorization required.',
      });
    }

    const { authUrl } = getAuthUrl();
    res.redirect(authUrl);
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Authorization Failed</title></head>
          <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px;">
            <h1>Authorization Failed</h1>
            <p style="color: #dc2626;">${error_description || error}</p>
            <p><a href="/">Return to admin panel</a></p>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Authorization Failed</title></head>
          <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px;">
            <h1>Authorization Failed</h1>
            <p>Missing authorization code or state parameter.</p>
            <p><a href="/">Return to admin panel</a></p>
          </body>
        </html>
      `);
    }

    if (!validateState(state)) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Authorization Failed</title></head>
          <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px;">
            <h1>Authorization Failed</h1>
            <p>Invalid or expired authorization state. Please try again.</p>
            <p><a href="/api/google-drive/auth">Try again</a></p>
          </body>
        </html>
      `);
    }

    try {
      const tokens = await exchangeCodeForTokens(code);

      if (!tokens.refresh_token) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Google Drive Authorization</title></head>
            <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px;">
              <h1>Authorization Note</h1>
              <p>Access was granted but no refresh token was returned. This can happen if you previously authorized this application.</p>
              <p>To receive a refresh token, <a href="https://myaccount.google.com/permissions">revoke the application's access</a> and try again.</p>
              <p><a href="/api/google-drive/auth">Try again</a></p>
            </body>
          </html>
        `);
      }

      await saveRefreshToken(tokens.refresh_token);

      resetOAuthCache();

      let folderInfo = null;
      try {
        folderInfo = await ensureDriveAccess();
      } catch (folderErr) {
        console.error('[Drive callback folder check error]', {
          message: folderErr.message,
          code: folderErr.code,
          status: folderErr.originalError?.status,
        });

        return res.status(500).send(`
          <!DOCTYPE html>
          <html>
            <head><title>Google Drive Authorization</title></head>
            <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px;">
              <h1>Authorization Successful</h1>
              <p>Google Drive tokens were saved successfully, but folder access verification failed:</p>
              <p style="color: #dc2626;">${folderErr.message}</p>
              <p>Verify that <strong>GOOGLE_DRIVE_FOLDER_ID</strong> is set correctly and the authorized account has access.</p>
              <p><a href="/">Return to admin panel</a></p>
            </body>
          </html>
        `);
      }

      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Authorization Successful</title></head>
          <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px;">
            <h1>Authorization Successful</h1>
            <p>Google Drive is now connected and ready for image uploads.</p>
            <p><strong>Connected folder:</strong> ${folderInfo ? folderInfo.name : normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID)}</p>
            <p><strong>Folder ID:</strong> ${normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID)}</p>
            <p>The refresh token has been securely persisted. Image uploads will use this Google account.</p>
            <p><a href="/">Return to admin panel</a></p>
          </body>
        </html>
      `);
    } catch (err) {
      console.error('[Drive OAuth token exchange error]', {
        errorName: err.name,
        errorMessage: err.message,
        errorCode: err.code,
        responseStatus: err.response?.status,
        responseStatusText: err.response?.statusText,
        responseData: JSON.stringify(err.response?.data),
      });

      res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Drive Authorization Failed</title></head>
          <body style="font-family: sans-serif; max-width: 500px; margin: 50px auto; padding: 20px;">
            <h1>Authorization Failed</h1>
            <p>Failed to exchange authorization code for tokens. Please check your OAuth credentials and try again.</p>
            <p><a href="/api/google-drive/auth">Try again</a></p>
          </body>
        </html>
      `);
    }
  })
);

router.get(
  '/test',
  protect,
  admin,
  asyncHandler(async (req, res) => {
    const results = {
      oauthConfigured: isOAuthConfigured(),
      authorizationTokenAvailable: isDriveAuthorized(),
      accessTokenRefreshable: false,
      driveApiAccessible: false,
      folderExists: false,
      folderAccessible: false,
      folderName: null,
    };

    if (!results.oauthConfigured) {
      return res.status(200).json({
        success: true,
        results,
      });
    }

    if (!results.authorizationTokenAvailable) {
      return res.status(200).json({
        success: true,
        results,
        message: 'Google Drive is configured but not yet authorized. Visit /api/google-drive/auth to authorize.',
      });
    }

    try {
      const drive = getDriveClient();
      results.accessTokenRefreshable = true;
      results.driveApiAccessible = true;

      const folderId = normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);
      results.folderExists = true;

      const folderInfo = await ensureDriveAccess();
      results.folderAccessible = true;
      results.folderName = folderInfo.name;
    } catch (err) {
      results.error = err.message;
      results.errorCode = err.code;
      results.errorStatus = err.originalError?.status || err.response?.status;
    }

    res.status(200).json({ success: true, results });
  })
);

module.exports = router;
