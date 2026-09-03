const { google } = require('googleapis');
const { Readable } = require('stream');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let authClient = null;
let googleDrive = null;

function normalizeSecretValue(value) {
  if (!value || typeof value !== 'string') return value;

  let normalized = value.trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    normalized = normalized.slice(1, -1);
  }

  normalized = normalized.replace(/\\n/g, '\n').replace(/\r/g, '');

  return normalized;
}

function normalizePrivateKey(value) {
  let privateKey = normalizeSecretValue(value);

  if (!privateKey) return privateKey;

  const hasPemBoundary = privateKey.includes('-----BEGIN') && privateKey.includes('-----END');

  if (!hasPemBoundary) {
    const base64Candidate = privateKey.replace(/\s+/g, '');

    if (/^[A-Za-z0-9+/=]+$/.test(base64Candidate)) {
      try {
        const decoded = Buffer.from(base64Candidate, 'base64').toString('utf8').trim();
        if (decoded.includes('-----BEGIN') && decoded.includes('-----END')) {
          privateKey = decoded.replace(/\r/g, '');
        }
      } catch (decodeErr) {
        // Fall back to the original value below.
      }
    }
  }

  if (!privateKey.includes('-----BEGIN')) {
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----\n`;
  }

  return privateKey;
}

function loadGoogleDriveCredentials() {
  const serviceAccountJson = normalizeSecretValue(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (serviceAccountJson) {
    try {
      const parsed = JSON.parse(serviceAccountJson);
      const clientEmail = parsed.client_email || parsed.clientEmail;
      const privateKey = normalizePrivateKey(parsed.private_key || parsed.privateKey);

      if (clientEmail && privateKey) {
        return { clientEmail, privateKey };
      }
    } catch (err) {
      // Ignore JSON parse errors and fall through to env-based credentials.
    }
  }

  const clientEmail = normalizeSecretValue(process.env.GOOGLE_CLIENT_EMAIL);
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

  return { clientEmail, privateKey };
}

function getDriveClient() {
  if (googleDrive) return googleDrive;

  const { clientEmail, privateKey } = loadGoogleDriveCredentials();

  if (!clientEmail || !privateKey) {
    const err = new Error('Google Drive credentials not configured. Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY.');
    err.code = 'DRIVE_CONFIG_ERROR';
    throw err;
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

  googleDrive = google.drive({ version: 'v3', auth: jwtClient });
  authClient = jwtClient;

  return googleDrive;
}

async function ensureDriveAccess() {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    const err = new Error('Google Drive folder ID not configured. Missing GOOGLE_DRIVE_FOLDER_ID.');
    err.code = 'DRIVE_CONFIG_ERROR';
    throw err;
  }

  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'id,name,mimeType',
      supportsAllDrives: true,
    });

    if (response.data.mimeType === 'application/vnd.google-apps.folder') {
      return { folderId: response.data.id, name: response.data.name };
    }

    const err = new Error(`ID ${folderId} does not point to a Drive folder.`);
    err.code = 'DRIVE_FOLDER_ERROR';
    throw err;
  } catch (err) {
    if (err.code === 404) {
      const folderErr = new Error('Google Drive folder not found. Verify the folder ID and sharing permissions.');
      folderErr.code = 'DRIVE_FOLDER_ERROR';
      throw folderErr;
    }
    if (err.code === 403) {
      const permErr = new Error('Google Drive access denied. Ensure the service account has access to the folder.');
      permErr.code = 'DRIVE_PERM_ERROR';
      throw permErr;
    }
    throw err;
  }
}

async function uploadBufferToDrive(buffer, originalName, mimeType) {
  const drive = getDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    const err = new Error('Google Drive folder ID not configured. Missing GOOGLE_DRIVE_FOLDER_ID.');
    err.code = 'DRIVE_CONFIG_ERROR';
    throw err;
  }

  const metadata = {
    name: originalName,
    parents: [folderId],
  };

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
}

async function getFileMetadata(driveFileId) {
  const drive = getDriveClient();

  try {
    const response = await drive.files.get({
      fileId: driveFileId,
      fields: 'id,name,mimeType,size,thumbnails',
      supportsAllDrives: true,
    });
    return response.data;
  } catch (err) {
    if (err.code === 404) {
      const notFoundErr = new Error('File not found in Google Drive');
      notFoundErr.code = 'DRIVE_FILE_NOT_FOUND';
      throw notFoundErr;
    }
    throw err;
  }
}

async function downloadFileStream(driveFileId) {
  const drive = getDriveClient();

  try {
    const response = await drive.files.get(
      { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    return response.data;
  } catch (err) {
    if (err.code === 404) {
      const notFoundErr = new Error('File not found in Google Drive');
      notFoundErr.code = 'DRIVE_FILE_NOT_FOUND';
      throw notFoundErr;
    }
    throw err;
  }
}

async function deleteDriveFile(driveFileId) {
  const drive = getDriveClient();

  try {
    await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true });
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
  try {
    await drive.permissions.create({
      fileId: driveFileId,
      requestBody: {
        type: 'anyone',
        role: 'reader',
      },
    });
  } catch (err) {
    if (err.code !== 409) {
      throw err;
    }
  }
}

module.exports = {
  getDriveClient,
  ensureDriveAccess,
  uploadBufferToDrive,
  getFileMetadata,
  downloadFileStream,
  deleteDriveFile,
  setFilePermissions,
  normalizePrivateKey,
  loadGoogleDriveCredentials,
};
