import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {RegistrationSessionsRepository, UsersRepository} from '../repositories';

export class SessionService {
  constructor(
    @repository(RegistrationSessionsRepository)
    private registrationSessionsRepository: RegistrationSessionsRepository,
    @repository(UsersRepository)
    private usersRepository: UsersRepository
  ) { }

  // fetch profile from session...
  async fetchProfile(sessionId: string): Promise<{success: boolean; message: string; profile: object | null}> {
    const sessionData = await this.registrationSessionsRepository.findById(sessionId);

    if (!sessionData || (sessionData && !sessionData.phoneVerified) || (sessionData && !sessionData.emailVerified) || new Date(sessionData.expiresAt) < new Date()) {
      throw new HttpErrors.BadRequest('Invalid session');
    }

    const user = await this.usersRepository.findOne({
      where: {
        and: [
          {email: sessionData.email},
          {phone: sessionData.phoneNumber},
          // {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    return {
      success: true,
      message: 'Profile found',
      profile: user
    }
  }
}
