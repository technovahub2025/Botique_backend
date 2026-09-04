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
  getDriveUserInfo,
  getStoredRefreshToken,
  getDriveClient,
  normalizeFolderId,
} = require('../utils/googleDrive');

const router = express.Router();

/**
 * =========================================================
 * GOOGLE DRIVE STATUS
 * =========================================================
 *
 * GET /api/google-drive/status
 *
 * This endpoint checks:
 * - OAuth configuration
 * - Whether a refresh token exists
 * - Whether Google Drive can be accessed
 * - Whether the configured folder is accessible
 *
 * This endpoint is intentionally not protected so the
 * frontend can check Google Drive connection status.
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const configured = isOAuthConfigured();
    const authorized = isDriveAuthorized();

    const result = {
      success: true,
      configured,
      connected: false,
      email: null,
      folderAccessible: false,
      folderId: configured
        ? normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID)
        : undefined,
    };

    // Google Drive OAuth is not configured
    if (!configured) {
      return res.status(200).json(result);
    }

    // No refresh token available
    if (!authorized) {
      return res.status(200).json(result);
    }

    try {
      /**
       * Try to get Google Drive account information.
       */
      const userInfo = await getDriveUserInfo();

      result.connected = true;
      result.email = userInfo?.emailAddress || null;

      /**
       * Verify that the configured Google Drive folder
       * is actually accessible.
       */
      try {
        await ensureDriveAccess();

        result.folderAccessible = true;
      } catch (folderErr) {
        console.error(
          '[Google Drive status] Folder access failed:',
          folderErr.message
        );

        result.folderAccessible = false;
      }
    } catch (authErr) {
      console.error(
        '[Google Drive status] Authorization check failed:',
        authErr.message
      );

      result.connected = false;
      result.email = null;
      result.folderAccessible = false;
    }

    return res.status(200).json(result);
  })
);

/**
 * =========================================================
 * START GOOGLE DRIVE AUTHORIZATION
 * =========================================================
 *
 * GET /api/google-drive/auth
 *
 * Opens Google's OAuth authorization page.
 */
router.get(
  '/auth',
  asyncHandler(async (req, res) => {
    if (!isOAuthConfigured()) {
      return res.status(500).json({
        success: false,
        message:
          'Google Drive OAuth is not configured. Please contact your system administrator.',
      });
    }

    try {
      const { authUrl } = getAuthUrl();

      return res.redirect(authUrl);
    } catch (error) {
      console.error(
        '[Google Drive auth] Failed to generate auth URL:',
        error
      );

      return res.status(500).json({
        success: false,
        message: 'Failed to start Google Drive authorization.',
      });
    }
  })
);

/**
 * =========================================================
 * GOOGLE DRIVE OAUTH CALLBACK
 * =========================================================
 *
 * GET /api/google-drive/callback
 *
 * Google redirects here after authorization.
 */
router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const {
      code,
      state,
      error,
      error_description,
    } = req.query;

    /**
     * -----------------------------------------------------
     * Handle Google OAuth errors
     * -----------------------------------------------------
     */
    if (error) {
      console.error('[Google Drive OAuth] Google returned error:', {
        error,
        error_description,
      });

      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Drive Authorization Failed</title>
          </head>

          <body
            style="
              font-family: sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            "
          >
            <h1>Authorization Failed</h1>

            <p>
              Google Drive authorization was cancelled or failed.
            </p>

            <p>
              ${error_description || error}
            </p>

            <p>
              <a href="/api/google-drive/auth">
                Try Google Drive authorization again
              </a>
            </p>
          </body>
        </html>
      `);
    }

    /**
     * -----------------------------------------------------
     * Validate code and state
     * -----------------------------------------------------
     */
    if (!code || !state) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invalid Google Drive Authorization</title>
          </head>

          <body
            style="
              font-family: sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            "
          >
            <h1>Invalid Authorization Response</h1>

            <p>
              Google did not return the required authorization information.
            </p>

            <p>
              <a href="/api/google-drive/auth">
                Try again
              </a>
            </p>
          </body>
        </html>
      `);
    }

    /**
     * -----------------------------------------------------
     * Validate OAuth state
     * -----------------------------------------------------
     */
    if (!validateState(state)) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invalid Google Drive Authorization</title>
          </head>

          <body
            style="
              font-family: sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            "
          >
            <h1>Invalid Authorization State</h1>

            <p>
              The authorization request could not be verified.
            </p>

            <p>
              Please start the Google Drive authorization process again.
            </p>

            <p>
              <a href="/api/google-drive/auth">
                Try again
              </a>
            </p>
          </body>
        </html>
      `);
    }

    /**
     * -----------------------------------------------------
     * Exchange authorization code for Google tokens
     * -----------------------------------------------------
     */
    try {
      const tokens = await exchangeCodeForTokens(code);

      /**
       * Google may not return a refresh_token when the
       * application was already authorized previously.
       *
       * Therefore:
       *
       * 1. Use the new refresh token if Google returned one.
       * 2. Otherwise use an already stored refresh token.
       * 3. If neither exists, ask the user to revoke access
       *    and authorize again.
       */
      let refreshToken = tokens.refresh_token;

      if (!refreshToken) {
        console.log(
          '[Google Drive OAuth] Google did not return a new refresh token.'
        );

        refreshToken = getStoredRefreshToken();

        if (refreshToken) {
          console.log(
            '[Google Drive OAuth] Existing refresh token found. Reusing it.'
          );
        }
      }

      /**
       * No refresh token available at all.
       */
      if (!refreshToken) {
        console.error(
          '[Google Drive OAuth] No refresh token available.'
        );

        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Google Drive Authorization</title>
            </head>

            <body
              style="
                font-family: sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
              "
            >
              <h1>Authorization Completed</h1>

              <p>
                Google granted access, but no refresh token was returned.
              </p>

              <p>
                This usually happens because this Google account has
                already authorized the application.
              </p>

              <p>
                Please revoke this application's Google Drive access
                and then authorize it again.
              </p>

              <p>
                <a
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Google Account Permissions
                </a>
              </p>

              <p>
                After revoking the application, click below:
              </p>

              <p>
                <a href="/api/google-drive/auth">
                  Authorize Google Drive Again
                </a>
              </p>
            </body>
          </html>
        `);
      }

      /**
       * -----------------------------------------------------
       * Save refresh token
       * -----------------------------------------------------
       *
       * IMPORTANT:
       * On Render, the recommended permanent location is
       * GOOGLE_DRIVE_REFRESH_TOKEN environment variable.
       *
       * The helper function handles the storage logic.
       */
      await saveRefreshToken(refreshToken);

      /**
       * Clear cached Drive authorization.
       */
      resetOAuthCache();

      /**
       * -----------------------------------------------------
       * Verify Google Drive folder access
       * -----------------------------------------------------
       */
      let folderInfo = null;
      let folderErrMessage = null;

      try {
        folderInfo = await ensureDriveAccess();
      } catch (folderErr) {
        folderErrMessage = folderErr.message;

        console.error(
          '[Google Drive callback] Folder access verification failed:',
          {
            message: folderErr.message,
            code: folderErr.code,
            status: folderErr.originalError?.status,
          }
        );
      }

      /**
       * -----------------------------------------------------
       * Frontend redirect URL
       * -----------------------------------------------------
       *
       * We intentionally use FRONTEND_URL.
       *
       * Render environment:
       *
       * FRONTEND_URL=https://technovahub.in/test_boutique
       *
       * We do NOT use FRONTEND_ADMIN_URL.
       *
       * We also do NOT hardcode:
       *
       * /test_boutique/admin
       */
      const frontendUrl =
        process.env.FRONTEND_URL ||
        'https://technovahub.in/test_boutique';

      /**
       * -----------------------------------------------------
       * Google Drive connected successfully
       * -----------------------------------------------------
       */
      if (folderInfo) {
        return res.redirect(302, frontendUrl);
      }

      /**
       * -----------------------------------------------------
       * Authorization succeeded but folder failed
       * -----------------------------------------------------
       */
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Drive Folder Error</title>
          </head>

          <body
            style="
              font-family: sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            "
          >
            <h1>Google Drive Authorization Successful</h1>

            <p>
              Google Drive authorization was successful.
            </p>

            <p>
              However, the configured Google Drive folder could not
              be accessed.
            </p>

            ${
              folderErrMessage
                ? `<p><strong>Error:</strong> ${folderErrMessage}</p>`
                : ''
            }

            <p>
              Please check:
            </p>

            <ul>
              <li>GOOGLE_DRIVE_FOLDER_ID</li>
              <li>Google Drive folder permissions</li>
              <li>Google Cloud OAuth configuration</li>
            </ul>

            <p>
              <a href="${frontendUrl}">
                Return to Loom &amp; Luster
              </a>
            </p>
          </body>
        </html>
      `);
    } catch (err) {
      console.error(
        '[Google Drive OAuth token exchange error]',
        {
          message: err.message,
          code: err.code,
          status: err.originalError?.status,
          responseStatus: err.response?.status,
        }
      );

      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Drive Authorization Error</title>
          </head>

          <body
            style="
              font-family: sans-serif;
              max-width: 600px;
              margin: 50px auto;
              padding: 20px;
            "
          >
            <h1>Google Drive Authorization Error</h1>

            <p>
              Failed to complete Google Drive authorization.
            </p>

            <p>
              Please check the Render logs for more information.
            </p>

            <p>
              <a href="/api/google-drive/auth">
                Try again
              </a>
            </p>
          </body>
        </html>
      `);
    }
  })
);

/**
 * =========================================================
 * GOOGLE DRIVE CONNECTION TEST
 * =========================================================
 *
 * GET /api/google-drive/test
 *
 * Admin only.
 *
 * This endpoint verifies:
 * - OAuth configuration
 * - Refresh token
 * - Drive API
 * - Folder ID
 * - Folder access
 */
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

    /**
     * OAuth configuration check
     */
    if (!results.oauthConfigured) {
      return res.status(200).json({
        success: false,
        message: 'Google Drive OAuth is not configured.',
        results,
      });
    }

    /**
     * Refresh token check
     */
    if (!results.authorizationTokenAvailable) {
      return res.status(200).json({
        success: false,
        message: 'Google Drive is not authorized.',
        results,
      });
    }

    try {
      /**
       * Create Drive client.
       *
       * This will use the stored refresh token and obtain
       * an access token when required.
       */
      const drive = getDriveClient();

      if (!drive) {
        throw new Error('Google Drive client could not be created.');
      }

      results.accessTokenRefreshable = true;
      results.driveApiAccessible = true;

      /**
       * Normalize configured folder ID.
       */
      const folderId = normalizeFolderId(
        process.env.GOOGLE_DRIVE_FOLDER_ID
      );

      if (!folderId) {
        throw new Error(
          'GOOGLE_DRIVE_FOLDER_ID is not configured.'
        );
      }

      results.folderExists = true;

      /**
       * Verify folder access.
       */
      const folderInfo = await ensureDriveAccess();

      results.folderAccessible = true;
      results.folderName = folderInfo?.name || null;

      return res.status(200).json({
        success: true,
        message: 'Google Drive connection test successful.',
        results,
      });
    } catch (err) {
      console.error(
        '[Google Drive test] Error:',
        {
          message: err.message,
          code: err.code,
          status: err.originalError?.status || err.response?.status,
        }
      );

      results.accessTokenRefreshable = false;

      return res.status(200).json({
        success: false,
        message: 'Google Drive connection test failed.',
        results,
        error: err.message,
        errorCode: err.code || null,
        errorStatus:
          err.originalError?.status ||
          err.response?.status ||
          null,
      });
    }
  })
);

module.exports = router;