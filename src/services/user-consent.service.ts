import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {Request, RestBindings} from '@loopback/rest';
import {UsersConsentRepository} from '../repositories';
import {UsersConsent} from '../models';

export class UserConsentService {
  constructor(
    @repository(UsersConsentRepository)
    private usersConsentRepo: UsersConsentRepository,

    @inject(RestBindings.Http.REQUEST)
    private request: Request,
  ) {}

  async createConsent(data: Partial<UsersConsent>): Promise<UsersConsent> {

    const ipAddress =
      this.request.headers['x-forwarded-for']?.toString().split(',')[0] ||
      this.request.socket.remoteAddress;

    const userAgent = this.request.headers['user-agent'];


    return this.usersConsentRepo.create({
      ...data,
      ipAddress,
      userAgent,
      acceptedAt: new Date(),
    });
  }
}
