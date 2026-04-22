import {createCipheriv, createDecipheriv, createHash, createHmac} from 'crypto';
import {HttpErrors} from '@loopback/rest';

const SECRET_PREFIX = 'enc:v1';
const DEFAULT_MASK = '****';

function getEncryptionKey() {
  const configuredKey =
    process.env.PSP_SECRET_ENCRYPTION_KEY ??
    process.env.SECRET_ENCRYPTION_KEY ??
    '';

  const trimmedKey = configuredKey.trim();

  if (!trimmedKey) {
    throw new HttpErrors.InternalServerError(
      'PSP secret encryption key is missing',
    );
  }

  return createHash('sha256').update(trimmedKey).digest();
}

function buildDeterministicIv(plainText: string) {
  return createHmac('sha256', getEncryptionKey())
    .update(plainText)
    .digest()
    .subarray(0, 12);
}

export function isEncryptedSecretValue(value?: string | null) {
  return (
    typeof value === 'string' &&
    value.startsWith(`${SECRET_PREFIX}:`) &&
    value.split(':').length === 5
  );
}

export function encryptSecretValue(value?: string | null) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (isEncryptedSecretValue(trimmedValue)) {
    return trimmedValue;
  }

  const key = getEncryptionKey();
  const iv = buildDeterministicIv(trimmedValue);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encryptedValue = Buffer.concat([
    cipher.update(trimmedValue, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    iv.toString('base64'),
    authTag.toString('base64'),
    encryptedValue.toString('base64'),
  ].join(':');
}

export function decryptSecretValue(value?: string | null) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (!isEncryptedSecretValue(trimmedValue)) {
    return trimmedValue;
  }

  const [, , ivPart, authTagPart, encryptedPart] = trimmedValue.split(':');

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivPart, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagPart, 'base64'));

    const decryptedValue = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64')),
      decipher.final(),
    ]);

    return decryptedValue.toString('utf8');
  } catch (error) {
    throw new HttpErrors.InternalServerError(
      'Unable to decrypt PSP secret value',
    );
  }
}

export function maskSecretValue(value?: string | null) {
  const plainText = decryptSecretValue(value);

  if (!plainText) {
    return undefined;
  }

  if (plainText.length <= 4) {
    return DEFAULT_MASK;
  }

  return `${DEFAULT_MASK}${plainText.slice(-4)}`;
}
