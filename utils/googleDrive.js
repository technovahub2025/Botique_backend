const { google } = require('googleapis');
const { Readable } = require('stream');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let authClient = null;
let googleDrive = null;

/**
 * Normalize environment variable values.
 * Handles:
 * - surrounding quotes
 * - escaped newlines
 * - Windows CRLF characters
 */
function normalizeSecretValue(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  let normalized = value.trim();

  // Remove surrounding single/double quotes
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }

  // Convert escaped \n into actual newlines
  normalized = normalized
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '');

  return normalized;
}

/**
 * Normalize Google service-account private key.
 *
 * Supports:
 * - Normal PEM private keys
 * - Environment variables containing escaped \n
 * - Base64 encoded PEM
 * - Raw key body without PEM boundaries
 */
function normalizePrivateKey(value) {
  let privateKey = normalizeSecretValue(value);

  if (!privateKey) {
    return privateKey;
  }

  const hasPemBoundary =
    privateKey.includes('-----BEGIN') &&
    privateKey.includes('-----END');

  if (hasPemBoundary) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  // Try base64 decoding if it doesn't already look like PEM
  if (!hasPemBoundary) {
    privateKey = privateKey.replace(/\\n/g, '\n');

    const base64Candidate = privateKey.replace(/\s+/g, '');

    if (/^[A-Za-z0-9+/=]+$/.test(base64Candidate)) {
      try {
        const decoded = Buffer.from(
          base64Candidate,
          'base64'
        )
          .toString('utf8')
          .trim();

        if (
          decoded.includes('-----BEGIN') &&
          decoded.includes('-----END')
        ) {
          privateKey = decoded.replace(/\r/g, '');
        }
      } catch (decodeErr) {
        // Ignore and continue with normal handling
      }
    }
  }

  // Add PEM boundaries if they are missing
  if (!privateKey.includes('-----BEGIN')) {
    privateKey =
      `-----BEGIN PRIVATE KEY-----\n` +
      `${privateKey}\n` +
      `-----END PRIVATE KEY-----\n`;
  }

  return privateKey;
}

/**
 * Load Google Drive credentials.
 *
 * Priority:
 * 1. GOOGLE_SERVICE_ACCOUNT_JSON
 * 2. GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY
 */
function loadGoogleDriveCredentials() {
  // Optional service-account JSON support
  const serviceAccountJson = normalizeSecretValue(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  );

  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);

      const clientEmail =
        parsed.client_email ||
        parsed.clientEmail;

      const privateKey = normalizePrivateKey(
        parsed.private_key ||
        parsed.privateKey
      );

      if (clientEmail && privateKey) {
        return {
          clientEmail,
          privateKey,
        };
      }
    } catch (err) {
      // Ignore JSON parsing errors and
      // fall back to separate environment variables.
    }
  }

  const clientEmail = normalizeSecretValue(
    process.env.GOOGLE_CLIENT_EMAIL
  );

  const privateKey = normalizePrivateKey(
    process.env.GOOGLE_PRIVATE_KEY
  );

  return {
    clientEmail,
    privateKey,
  };
}

/**
 * Create and cache Google Drive client.
 */
function getDriveClient() {
  if (googleDrive) {
    return googleDrive;
  }

  const {
    clientEmail,
    privateKey,
  } = loadGoogleDriveCredentials();

  if (!clientEmail || !privateKey) {
    const err = new Error(
      'Google Drive credentials not configured. Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY.'
    );

    err.code = 'DRIVE_CONFIG_ERROR';

    throw err;
  }

  const crypto = require('crypto');

  try {
    const keyObject = crypto.createPrivateKey(privateKey);
    console.error('[Drive key format]', {
      type: keyObject.type,
      asymmetricKeyType: keyObject.asymmetricKeyType,
      keyBits: keyObject.keyLength || 'n/a',
    });
  } catch (keyErr) {
    console.error('[Drive key parse error]', {
      message: keyErr.message,
      code: keyErr.code,
      hasPrivateKey: privateKey.length > 0,
      startsWithPem: privateKey.trim().startsWith('-----BEGIN'),
      endsWithPem: privateKey.trim().endsWith('-----END PRIVATE KEY-----'),
      keyLength: privateKey.length,
    });
  }

  let jwtClient;

  try {
    jwtClient = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: SCOPES,
    });
  } catch (err) {
    err.code = 'DRIVE_AUTH_ERROR';

    err.message =
      'Google Drive authentication failed. Check that GOOGLE_PRIVATE_KEY is a valid unencrypted service-account private key with preserved newlines.';

    throw err;
  }

  googleDrive = google.drive({
    version: 'v3',
    auth: jwtClient,
  });

  authClient = jwtClient;

  return googleDrive;
}

/**
 * Verify that the configured Google Drive folder
 * exists and is accessible by the service account.
 */
async function ensureDriveAccess() {
  const drive = getDriveClient();

  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    const err = new Error(
      'Google Drive folder ID not configured. Missing GOOGLE_DRIVE_FOLDER_ID.'
    );

    err.code = 'DRIVE_CONFIG_ERROR';

    throw err;
  }

  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
      supportsAllDrives: true,
    });

    if (
      response.data.mimeType ===
      'application/vnd.google-apps.folder'
    ) {
      return {
        folderId: response.data.id,
        name: response.data.name,
      };
    }

    const err = new Error(
      `ID ${folderId} does not point to a Drive folder.`
    );

    err.code = 'DRIVE_FOLDER_ERROR';

    throw err;
  } catch (err) {
    if (err.code === 404) {
      const folderErr = new Error(
        'Google Drive folder not found. Verify the folder ID and sharing permissions.'
      );

      folderErr.code = 'DRIVE_FOLDER_ERROR';

      folderErr.originalError = {
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message,
      };

      throw folderErr;
    }

    if (err.code === 403) {
      const permErr = new Error(
        'Google Drive access denied. Ensure the service account has access to the folder.'
      );

      permErr.code = 'DRIVE_PERM_ERROR';

      permErr.originalError = {
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message,
      };

      throw permErr;
    }

    if (!err.originalError) {
      err.originalError = {
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: err.response?.data,
        message: err.message,
      };
    }

    throw err;
  }
}

/**
 * Upload an image/file buffer to Google Drive.
 */
async function uploadBufferToDrive(
  buffer,
  originalName,
  mimeType
) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error(
      'Invalid upload buffer. Expected a Buffer.'
    );

    err.code = 'DRIVE_UPLOAD_BUFFER_ERROR';

    throw err;
  }

  const drive = getDriveClient();

  const folderId =
    process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    const err = new Error(
      'Google Drive folder ID not configured. Missing GOOGLE_DRIVE_FOLDER_ID.'
    );

    err.code = 'DRIVE_CONFIG_ERROR';

    throw err;
  }

  if (!originalName) {
    const err = new Error(
      'Original file name is required for Google Drive upload.'
    );

    err.code = 'DRIVE_UPLOAD_NAME_ERROR';

    throw err;
  }

  if (!mimeType) {
    const err = new Error(
      'MIME type is required for Google Drive upload.'
    );

    err.code = 'DRIVE_UPLOAD_MIME_ERROR';

    throw err;
  }

  const metadata = {
    name: originalName,
    parents: [folderId],
  };

  try {
    const response = await drive.files.create({
      requestBody: metadata,

      media: {
        mimeType,
        body: Readable.from([buffer]),
      },

      fields: 'id,name,mimeType,size',

      supportsAllDrives: true,
    });

    return {
      driveFileId: response.data.id,
      name: response.data.name,
      mimeType: response.data.mimeType,
      size: response.data.size,
    };
  } catch (err) {
    const uploadErr = new Error(
      'Failed to upload file to Google Drive.'
    );

    uploadErr.code = 'DRIVE_UPLOAD_ERROR';

    uploadErr.originalError = {
      code: err.code,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      message: err.message,
    };

    throw uploadErr;
  }
}

/**
 * Get metadata for a Google Drive file.
 */
async function getFileMetadata(driveFileId) {
  const drive = getDriveClient();

  if (!driveFileId) {
    const err = new Error(
      'Google Drive file ID is required.'
    );

    err.code = 'DRIVE_FILE_ID_ERROR';

    throw err;
  }

  try {
    const response = await drive.files.get({
      fileId: driveFileId,

      fields:
        'id,name,mimeType,size,thumbnails',

      supportsAllDrives: true,
    });

    return response.data;
  } catch (err) {
    if (err.code === 404) {
      const notFoundErr = new Error(
        'File not found in Google Drive'
      );

      notFoundErr.code =
        'DRIVE_FILE_NOT_FOUND';

      throw notFoundErr;
    }

    throw err;
  }
}

/**
 * Download a Google Drive file as a readable stream.
 *
 * This can be used by the backend image proxy so
 * Google Drive files do not need to be publicly accessible.
 */
async function downloadFileStream(driveFileId) {
  const drive = getDriveClient();

  if (!driveFileId) {
    const err = new Error(
      'Google Drive file ID is required.'
    );

    err.code = 'DRIVE_FILE_ID_ERROR';

    throw err;
  }

  try {
    const response = await drive.files.get(
      {
        fileId: driveFileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      {
        responseType: 'stream',
      }
    );

    return response.data;
  } catch (err) {
    if (err.code === 404) {
      const notFoundErr = new Error(
        'File not found in Google Drive'
      );

      notFoundErr.code =
        'DRIVE_FILE_NOT_FOUND';

      throw notFoundErr;
    }

    throw err;
  }
}

/**
 * Delete a file from Google Drive.
 */
async function deleteDriveFile(driveFileId) {
  const drive = getDriveClient();

  if (!driveFileId) {
    const err = new Error(
      'Google Drive file ID is required.'
    );

    err.code = 'DRIVE_FILE_ID_ERROR';

    throw err;
  }

  try {
    await drive.files.delete({
      fileId: driveFileId,
      supportsAllDrives: true,
    });

    return true;
  } catch (err) {
    if (err.code === 404) {
      return false;
    }

    throw err;
  }
}

/**
 * Make a Google Drive file publicly readable.
 *
 * NOTE:
 * If the application uses the backend proxy
 * (/api/uploads/drive/:fileId), this function is
 * normally NOT required.
 */
async function setFilePermissions(driveFileId) {
  const drive = getDriveClient();

  if (!driveFileId) {
    const err = new Error(
      'Google Drive file ID is required.'
    );

    err.code = 'DRIVE_FILE_ID_ERROR';

    throw err;
  }

  try {
    await drive.permissions.create({
      fileId: driveFileId,

      requestBody: {
        type: 'anyone',
        role: 'reader',
      },

      supportsAllDrives: true,
    });

    return true;
  } catch (err) {
    // Permission already exists
    if (err.code === 409) {
      return true;
    }

    throw err;
  }
}

/**
 * Get the currently configured auth client.
 * Useful for diagnostics/testing.
 */
function getAuthClient() {
  return authClient;
}

module.exports = {
  getDriveClient,
  getAuthClient,
  ensureDriveAccess,
  uploadBufferToDrive,
  getFileMetadata,
  downloadFileStream,
  deleteDriveFile,
  setFilePermissions,
  normalizeSecretValue,
  normalizePrivateKey,
  loadGoogleDriveCredentials,
};