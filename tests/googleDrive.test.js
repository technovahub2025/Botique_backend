describe('Google Drive OAuth 2.0', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('normalizes folder ID by trimming whitespace and removing quotes', () => {
    const { normalizeFolderId } = require('../utils/googleDrive');

    expect(normalizeFolderId('  123abc  ')).toBe('123abc');
    expect(normalizeFolderId('"123abc"')).toBe('123abc');
    expect(normalizeFolderId("'123abc'")).toBe('123abc');
    expect(normalizeFolderId('')).toBe('');
    expect(normalizeFolderId(null)).toBe(null);
  });

  it('reports OAuth as not configured when env vars are missing', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;

    const { isOAuthConfigured } = require('../utils/googleDrive');
    expect(isOAuthConfigured()).toBe(false);
  });

  it('reports OAuth as configured when all env vars are present', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8000/api/google-drive/callback';
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder123';

    const { isOAuthConfigured } = require('../utils/googleDrive');
    expect(isOAuthConfigured()).toBe(true);
  });

  it('detects authorization from env var refresh token', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:8000/api/google-drive/callback';
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder123';
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'refresh-token-value';

    const { isDriveAuthorized } = require('../utils/googleDrive');
    expect(isDriveAuthorized()).toBe(true);
  });

  it('detects lack of authorization when no refresh token', () => {
    delete process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

    const fs = require('fs');
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const { isDriveAuthorized } = require('../utils/googleDrive');
    expect(isDriveAuthorized()).toBe(false);

    fs.existsSync.mockRestore();
  });

  it('validates OAuth state correctly', () => {
    const { getAuthUrl, validateState } = require('../utils/googleDrive');

    const { state } = getAuthUrl();
    expect(state).toBeDefined();
    expect(state.length).toBeGreaterThanOrEqual(32);

    expect(validateState(state)).toBe(true);

    // State is single-use
    expect(validateState(state)).toBe(false);
  });

  it('rejects invalid OAuth state', () => {
    const { validateState } = require('../utils/googleDrive');

    expect(validateState('invalid-state')).toBe(false);
    expect(validateState(null)).toBe(false);
    expect(validateState(undefined)).toBe(false);
    expect(validateState('')).toBe(false);
  });
});
