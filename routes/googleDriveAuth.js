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
 * FRONTEND URL
 * =========================================================
 *
 * Used only after backend-side Google Drive setup/reconnect.
 *
 * Normal frontend usage does NOT need Google authorization.
 */
function getFrontendUrl() {
  return (
    process.env.FRONTEND_URL ||
    'https://technovahub.in/test_boutique'
  );
}

/**
 * =========================================================
 * GOOGLE DRIVE STATUS
 * =========================================================
 *
 * GET /api/google-drive/status
 *
 * This endpoint checks:
 *
 * - OAuth configuration
 * - Whether a refresh token exists
 * - Whether Google Drive can be accessed
 * - Whether the configured folder is accessible
 *
 * IMPORTANT:
 * This endpoint does NOT start OAuth.
 *
 * The frontend can safely call this endpoint without
 * causing a Google authorization page to appear.
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

    /**
     * Google Drive OAuth is not configured.
     */
    if (!configured) {
      return res.status(200).json(result);
    }

    /**
     * No refresh token available.
     *
     * IMPORTANT:
     * Do NOT redirect to Google here.
     *
     * This keeps the frontend completely silent.
     */
    if (!authorized) {
      return res.status(200).json(result);
    }

    try {
      /**
       * getDriveUserInfo() uses the stored refresh token.
       *
       * Google OAuth automatically obtains a new access token
       * when necessary.
       */
      const userInfo = await getDriveUserInfo();

      result.connected = true;
      result.email = userInfo?.emailAddress || null;

      /**
       * Verify the configured Drive folder.
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
 * GOOGLE DRIVE AUTHORIZATION / SETUP
 * =========================================================
 *
 * GET /api/google-drive/auth
 *
 * IMPORTANT:
 *
 * This route is NOT part of the normal frontend flow.
 *
 * Behaviour:
 *
 * 1. OAuth is not configured
 *       -> return configuration error
 *
 * 2. A refresh token already exists
 *       -> verify Drive automatically
 *       -> NO Google authorization page
 *
 * 3. No refresh token exists
 *       -> start Google OAuth setup
 *
 * Therefore, once the backend has been authorized,
 * calling this endpoint will NOT show Google's permission
 * screen again.
 */
router.get(
  '/auth',
  asyncHandler(async (req, res) => {
    /**
     * Check OAuth configuration first.
     */
    if (!isOAuthConfigured()) {
      return res.status(500).json({
        success: false,
        message:
          'Google Drive OAuth is not configured. Please contact your system administrator.',
      });
    }

    /**
     * -----------------------------------------------------
     * AUTOMATIC CONNECTION
     * -----------------------------------------------------
     *
     * If a refresh token already exists, try to use it.
     *
     * This is the important part that prevents the normal
     * application flow from opening Google's authorization
     * screen.
     */
    if (isDriveAuthorized()) {
      try {
        await getDriveUserInfo();
        await ensureDriveAccess();

        /**
         * Already connected.
         *
         * Do NOT redirect to Google.
         */
        return res.redirect(302, getFrontendUrl());
      } catch (error) {
        console.error(
          '[Google Drive auth] Existing authorization could not be used:',
          {
            message: error.message,
            code: error.code,
            status:
              error.originalError?.status ||
              error.response?.status ||
              null,
          }
        );

        /**
         * IMPORTANT:
         *
         * We only continue to OAuth when the stored token
         * cannot actually authenticate.
         *
         * This means normal requests will never unnecessarily
         * ask for Google permission.
         */
      }
    }

    /**
     * -----------------------------------------------------
     * INITIAL SETUP / RECONNECT ONLY
     * -----------------------------------------------------
     *
     * If there is no usable refresh token, start OAuth.
     *
     * This route should be used manually by the administrator
     * for first-time setup or genuine token recovery.
     */
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
 * This endpoint is ONLY used by Google after the initial
 * backend authorization/reconnect process.
 *
 * Normal frontend/admin usage never needs this route.
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
      console.error(
        '[Google Drive OAuth] Google returned error:',
        {
          error,
          error_description,
        }
      );

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
              Please contact the system administrator if
              Google Drive needs to be connected again.
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
              Google did not return the required authorization
              information.
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
              Please contact the system administrator if
              Google Drive needs to be connected again.
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
       * application has already been authorized previously.
       *
       * Therefore:
       *
       * 1. Use the new refresh token if Google returned one.
       * 2. Otherwise reuse the existing stored refresh token.
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
       * No refresh token available.
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
                The administrator may need to revoke this application's
                Google access and authorize it again.
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
            </body>
          </html>
        `);
      }

      /**
       * -----------------------------------------------------
       * Save refresh token
       * -----------------------------------------------------
       *
       * Locally this is stored in:
       *
       * .gdrive_refresh_token
       *
       * Production persistence will be handled separately
       * so Render restarts do not lose the token.
       */
      await saveRefreshToken(refreshToken);

      /**
       * Clear cached OAuth/Drive clients so the new token
       * is immediately used.
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

      const frontendUrl = getFrontendUrl();

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
              However, the configured Google Drive folder
              could not be accessed.
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
              Please check the backend logs for more information.
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
 *
 * - OAuth configuration
 * - Refresh token
 * - Drive client
 * - Access token
 * - Drive API
 * - Folder ID
 * - Folder existence
 * - Folder accessibility
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
     * -----------------------------------------------------
     * OAuth configuration check
     * -----------------------------------------------------
     */
    if (!results.oauthConfigured) {
      return res.status(200).json({
        success: false,
        message: 'Google Drive OAuth is not configured.',
        results,
      });
    }

    /**
     * -----------------------------------------------------
     * Refresh token check
     * -----------------------------------------------------
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
       * The OAuth client uses the stored refresh token.
       */
      const drive = getDriveClient();

      if (!drive) {
        throw new Error(
          'Google Drive client could not be created.'
        );
      }

      results.driveApiAccessible = true;

      /**
       * -----------------------------------------------------
       * Check configured folder ID
       * -----------------------------------------------------
       */
      const folderId = normalizeFolderId(
        process.env.GOOGLE_DRIVE_FOLDER_ID
      );

      if (!folderId) {
        throw new Error(
          'GOOGLE_DRIVE_FOLDER_ID is not configured.'
        );
      }

      /**
       * -----------------------------------------------------
       * Actually verify the folder.
       *
       * ensureDriveAccess() performs:
       *
       * Google Drive API
       *      ↓
       * files.get(folderId)
       *      ↓
       * verify folder MIME type
       *
       * If this succeeds, the access token was usable.
       */
      const folderInfo = await ensureDriveAccess();

      results.accessTokenRefreshable = true;
      results.folderExists = true;
      results.folderAccessible = true;
      results.folderName = folderInfo?.name || null;

      return res.status(200).json({
        success: true,
        message:
          'Google Drive connection test successful.',
        results,
      });
    } catch (err) {
      console.error(
        '[Google Drive test] Error:',
        {
          message: err.message,
          code: err.code,
          status:
            err.originalError?.status ||
            err.response?.status ||
            null,
        }
      );

      return res.status(200).json({
        success: false,
        message:
          'Google Drive connection test failed.',
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