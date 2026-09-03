require('dotenv').config();
const drive = require('./utils/googleDrive').getDriveClient();

drive.files.list({
  q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
  fields: 'files(id,name)',
  pageSize: 10
}).then(res => {
  console.log('Folders found in Drive:', res.data.files.length);
  res.data.files.forEach(f => console.log('  -', f.name, f.id));
}).catch(err => {
  console.error('Drive list error:', err.code, err.message);
});
