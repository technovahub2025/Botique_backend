describe('Google Drive credential normalization', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('normalizes escaped newlines and removes wrapping quotes', () => {
    const { normalizePrivateKey } = require('../utils/googleDrive');

    const input = '"line1\\nline2\\n"';
    const output = normalizePrivateKey(input);

    expect(output).toContain('line1');
    expect(output).toContain('line2');
    expect(output).toContain('-----BEGIN PRIVATE KEY-----');
    expect(output).toContain('-----END PRIVATE KEY-----');
    expect(output).toContain('\nline1\nline2\n');
  });

  it('reads service account JSON from env', () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'svc@example.iam.gserviceaccount.com',
      private_key: 'abc123',
    });

    const { loadGoogleDriveCredentials } = require('../utils/googleDrive');
    const creds = loadGoogleDriveCredentials();

    expect(creds.clientEmail).toBe('svc@example.iam.gserviceaccount.com');
    expect(creds.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
    expect(creds.privateKey).toContain('abc123');
  });
});
