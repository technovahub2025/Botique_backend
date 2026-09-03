require('dotenv').config();
const crypto = require('crypto');

const rawKey = process.env.GOOGLE_PRIVATE_KEY;

console.log('=== Key Format Check ===');
console.log('Key length:', rawKey ? rawKey.length : 0);

const hasLiteralBackslashN = rawKey.includes('\\n');
const hasActualNewline = rawKey.includes(String.fromCharCode(10));

console.log('Has literal \\n (backslash+n):', hasLiteralBackslashN);
console.log('Has actual newline:', hasActualNewline);
console.log('First 60 chars:', JSON.stringify(rawKey.substring(0, 60)));

// Try to parse the key directly
try {
  const keyObj = crypto.createPrivateKey(rawKey);
  console.log('Direct parse OK:', keyObj.asymmetricKeyType);
} catch (e) {
  console.log('Direct parse FAILED:', e.code, e.message);
}

// Try converting \n to newlines
const converted = rawKey.replace(/\\n/g, '\n');
console.log('\nAfter replace(/\\\\n/g, newline):');
console.log('Has literal \\n:', converted.includes('\\n'));
console.log('Has actual newline:', converted.includes(String.fromCharCode(10)));

try {
  const keyObj2 = crypto.createPrivateKey(converted);
  console.log('Converted parse OK:', keyObj2.asymmetricKeyType);
} catch (e) {
  console.log('Converted parse FAILED:', e.code, e.message);
}

// Check if dotenv processes escapes
process.env.GOOGLE_PRIVATE_KEY_TEST = 'test\\nvalue\\nmore';
console.log('\ndotenv escape test:', JSON.stringify(process.env.GOOGLE_PRIVATE_KEY_TEST));
