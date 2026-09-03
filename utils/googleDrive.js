const { google } = require('googleapis');
const { Readable } = require('stream');
const crypto = require('crypto');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

const REFRESH_TOKEN_FILE = path.join(__dirname, '..', '.gdrive_refresh_token');

let oauth2Client = null;
let drive = null;

const oauthStates = new Map();

function normalizeFolderId(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  let normalized = value.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }

  return normalized.trim();
}

function isOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );
}

function isDriveAuthorized() {
  return Boolean(getStoredRefreshToken());
}

function getStoredRefreshToken() {
  const envToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
  if (envToken && envToken.trim()) {
    return envToken.trim();
  }

  try {
    if (fs.existsSync(REFRESH_TOKEN_FILE)) {
      const token = fs.readFileSync(REFRESH_TOKEN_FILE, 'utf8').trim();
      if (token) return token;
    }
  } catch (err) {
    // File doesn't exist or can't be read
  }

  return null;
}

async function saveRefreshToken(token) {
  await fsPromises.writeFile(REFRESH_TOKEN_FILE, token.trim(), { mode: 0o600 });
}

function resetOAuthCache() {
  oauth2Client = null;
  drive = null;
}

function getOAuthClient() {
  if (oauth2Client) {
    return oauth2Client;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    const err = new Error(
      'Google Drive OAuth credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.'
    );
    err.code = 'DRIVE_CONFIG_ERROR';
    throw err;
  }

  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const refreshToken = getStoredRefreshToken();
  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      saveRefreshToken(tokens.refresh_token).catch((err) => {
        console.error('[Drive token refresh save error]', {
          message: err.message,
        });
      });
    }
  });

  return oauth2Client;
}

function getDriveClient() {
  if (drive) {
    return drive;
  }

  const client = getOAuthClient();

  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    const err = new Error(
      'Google Drive is not authorized. Please complete Google Drive authorization first.'
    );
    err.code = 'DRIVE_NOT_AUTHORIZED';
    throw err;
  }

  drive = google.drive({ version: 'v3', auth: client });
  return drive;
}

function getAuthClient() {
  return oauth2Client;
}

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

function storeState(state, ttlMs) {
  oauthStates.set(state, { expiresAt: Date.now() + ttlMs });
  setTimeout(() => oauthStates.delete(state), ttlMs).unref();
}

function validateState(state) {
  if (!state) {
    return false;
  }

  const entry = oauthStates.get(state);
  if (!entry) {
    return false;
  }

  if (Date.now() > entry.expiresAt) {
    oauthStates.delete(state);
    return false;
  }

  oauthStates.delete(state);
  return true;
}

function getAuthUrl() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const state = generateState();
  storeState(state, 5 * 60 * 1000);

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: state,
    include_granted_scopes: true,
    response_type: 'code',
  });

  return { authUrl, state };
}

async function exchangeCodeForTokens(code) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const { tokens } = await client.getToken(code);
  return tokens;
}

async function ensureDriveAccess() {
  const drive = getDriveClient();

  const folderId = normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);

  if (!folderId) {
    const err = new Error(
      'Google Drive folder ID not configured. Set GOOGLE_DRIVE_FOLDER_ID.'
    );
    err.code = 'DRIVE_CONFIG_ERROR';
    throw err;
  }

  console.error('[Drive folder access check]', {
    folderId: folderId,
    oauthScope: SCOPES,
    folderIdLength: folderId.length,
  });

  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType,parents,driveId,capabilities',
      supportsAllDrives: true,
    });

    if (response.data.mimeType === 'application/vnd.google-apps.folder') {
      return {
        folderId: response.data.id,
        name: response.data.name,
      };
    }

    const err = new Error(
      `ID ${folderId} does not point to a Google Drive folder.`
    );
    err.code = 'DRIVE_FOLDER_ERROR';
    throw err;
  } catch (err) {
    if (err.code === 404) {
      const folderErr = new Error(
        'Google Drive folder not found. Verify the folder ID and access permissions.'
      );
      folderErr.code = 'DRIVE_FOLDER_ERROR';
      folderErr.originalError = {
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: JSON.stringify(err.response?.data),
        message: err.message,
      };

      console.error('[Drive folder access FAILED]', {
        folderId: folderId,
        googleApiCode: err.code,
        googleApiStatus: err.response?.status,
        googleApiMessage: err.message,
      });

      throw folderErr;
    }

    if (err.code === 403) {
      const permErr = new Error(
        'Google Drive access denied. The authorized account must have access to this folder.'
      );
      permErr.code = 'DRIVE_PERM_ERROR';
      permErr.originalError = {
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: JSON.stringify(err.response?.data),
        message: err.message,
      };

      throw permErr;
    }

    if (!err.originalError) {
      err.originalError = {
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        data: JSON.stringify(err.response?.data),
        message: err.message,
      };
    }

    throw err;
  }
}

async function uploadBufferToDrive(buffer, originalName, mimeType) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error(
      'Invalid upload buffer. Expected a Buffer.'
    );
    err.code = 'DRIVE_UPLOAD_BUFFER_ERROR';
    throw err;
  }

  const drive = getDriveClient();

  const folderId = normalizeFolderId(process.env.GOOGLE_DRIVE_FOLDER_ID);

  if (!folderId) {
    const err = new Error(
      'Google Drive folder ID not configured. Set GOOGLE_DRIVE_FOLDER_ID.'
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
      data: JSON.stringify(err.response?.data),
      message: err.message,
    };

    throw uploadErr;
  }
}

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
      notFoundErr.code = 'DRIVE_FILE_NOT_FOUND';
      throw notFoundErr;
    }

    throw err;
  }
}

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
      notFoundErr.code = 'DRIVE_FILE_NOT_FOUND';
      throw notFoundErr;
    }

    throw err;
  }
}

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
    if (err.code === 409) {
      return true;
    }

    throw err;
  }
}

async function getDriveUserInfo() {
  const drive = getDriveClient();

  try {
    const response = await drive.about.get({
      fields: 'user',
      supportsAllDrives: true,
    });

    return response.data.user;
  } catch (err) {
    if (err.code === 401 || err.code === 403) {
      const authErr = new Error(
        'Google Drive authentication failed. The refresh token may be invalid.'
      );
      authErr.code = 'DRIVE_AUTH_ERROR';
      authErr.originalError = {
        code: err.code,
        status: err.response?.status,
        statusText: err.response?.statusText,
        message: err.message,
      };
      throw authErr;
    }

    throw err;
  }
}

module.exports = {
  isOAuthConfigured,
  isDriveAuthorized,
  getOAuthClient,
  getDriveClient,
  getAuthClient,
  getAuthUrl,
  validateState,
  exchangeCodeForTokens,
  saveRefreshToken,
  getStoredRefreshToken,
  resetOAuthCache,
  ensureDriveAccess,
  getDriveUserInfo,
  uploadBufferToDrive,
  getFileMetadata,
  downloadFileStream,
  deleteDriveFile,
  setFilePermissions,
  normalizeFolderId,
};
