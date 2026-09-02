const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

let authClient = null;
let googleDrive = null;

function getDriveClient() {
  if (googleDrive) return googleDrive;

  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.GOOGLE_PROJECT_ID;

  if (!clientEmail || !privateKey) {
    const err = new Error('Google Drive credentials not configured. Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY.');
    err.code = 'DRIVE_CONFIG_ERROR';
    throw err;
  }

  const jwtClient = new google.auth.JWT(clientEmail, null, privateKey, SCOPES);

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
    const metadata = {
      name: 'placeholder-access-check',
      mimeType: 'text/plain',
    };
    const buffer = Buffer.from('check', 'utf8');

    const res = await drive.files.create({
      requestBody: {
        ...metadata,
        parents: [folderId],
      },
      media: {
        mimeType: 'text/plain',
        body: buffer,
      },
    });

    await drive.files.delete({ fileId: res.data.id });
    return true;
  } catch (err) {
    if (err.code === 404 || err.message?.includes('folder')) {
      const folderErr = new Error('Google Drive folder not accessible. Check folder ID and sharing permissions.');
      folderErr.code = 'DRIVE_FOLDER_ERROR';
      throw folderErr;
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
      body: buffer,
    },
    fields: 'id,name,mimeType,size',
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
      { fileId: driveFileId, alt: 'media' },
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
    await drive.files.delete({ fileId: driveFileId });
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
};
