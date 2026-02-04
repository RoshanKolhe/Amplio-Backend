import {injectable} from '@loopback/core';
import {v4 as uuidv4} from 'uuid';

@injectable()
export class GuarantorVerificationLinkService {

  generateToken(): {token: string; expiresAt: Date} {
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hrs validity

    return {token, expiresAt};
  }

  buildUrl(token: string): string {
    return `${process.env.FRONTEND_URL}/guarantor/verify?token=${token}`;
  }
}
