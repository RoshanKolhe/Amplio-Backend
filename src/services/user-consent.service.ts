import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors, Request, RestBindings} from '@loopback/rest';
import {UsersConsent} from '../models';
import {
  ConsentTemplateRepository,
  MerchantProfilesRepository,
  RegistrationSessionsRepository,
  UsersConsentRepository,
} from '../repositories';
import {JWTService} from './jwt-service';

export class UserConsentService {
  constructor(
    @repository(UsersConsentRepository)
    private usersConsentRepo: UsersConsentRepository,
    @repository(ConsentTemplateRepository)
    private consentTemplateRepo: ConsentTemplateRepository,
    @repository(MerchantProfilesRepository)
    private merchantProfilesRepository: MerchantProfilesRepository,
    @repository(RegistrationSessionsRepository)
    private registrationSessionsRepository: RegistrationSessionsRepository,
    @inject('service.jwt.service')
    private jwtService: JWTService,

    @inject(RestBindings.Http.REQUEST)
    private request: Request,
  ) { }

  // Dynamic consent logic: verify onboarding session before using it to
  // persist or fetch consents during pre-profile onboarding.
  private async verifyRegistrationSession(sessionId: string) {
    const registrationSession =
      await this.registrationSessionsRepository.findOne({
        where: {
          and: [{id: sessionId}, {isActive: true}, {isDeleted: false}],
        },
      });

    if (!registrationSession) {
      throw new HttpErrors.BadRequest('Invalid sessionId');
    }

    return registrationSession;
  }

  // Dynamic consent logic: after profile creation we do not trust
  // identifierId from frontend. We derive and verify it from the current
  // authenticated merchant profile in backend.
  private async resolveVerifiedMerchantIdentifierId(
    requestedIdentifierId?: string,
  ): Promise<string> {
    const authorizationHeader =
      this.request.headers.authorization ?? this.request.headers.Authorization;

    if (!authorizationHeader || Array.isArray(authorizationHeader)) {
      throw new HttpErrors.Unauthorized(
        'Authorization is required when identifierId is used',
      );
    }

    const [scheme, token] = authorizationHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new HttpErrors.Unauthorized('Invalid authorization header');
    }

    const currentUser = await this.jwtService.verifyToken(token);

    const merchantProfile = await this.merchantProfilesRepository.findOne({
      where: {
        and: [{usersId: currentUser.id}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });

    if (!merchantProfile) {
      throw new HttpErrors.NotFound('Merchant profile not found');
    }

    if (
      requestedIdentifierId &&
      requestedIdentifierId !== merchantProfile.id
    ) {
      throw new HttpErrors.Forbidden(
        'You can only access consents for your own merchant profile',
      );
    }

    return merchantProfile.id;
  }

  // Dynamic consent logic: normalize consent ownership so both create and
  // patch follow the same backend verification rules.
  private async resolveConsentOwnership(data: Partial<UsersConsent>) {
    if (data.sessionId) {
      await this.verifyRegistrationSession(data.sessionId);
    }

    if (data.identifierId) {
      data.identifierId = await this.resolveVerifiedMerchantIdentifierId(
        data.identifierId,
      );
    }

    return data;
  }

  private buildConsentOwnershipWhere(data: Partial<UsersConsent>) {
    if (data.sessionId) {
      return {sessionId: data.sessionId};
    }

    if (data.identifierId) {
      return {identifierId: data.identifierId};
    }

    return null;
  }

  private async validateConsentTemplate(consentTemplateId?: string) {
    if (!consentTemplateId) {
      throw new HttpErrors.BadRequest('consentTemplateId is required');
    }

    const consentTemplate = await this.consentTemplateRepo.findById(
      consentTemplateId,
    );

    if (!consentTemplate.isActive || consentTemplate.isDeleted) {
      throw new HttpErrors.BadRequest('Consent template is not active');
    }

    return consentTemplate;
  }

  private getRequestMetadata() {
    const ipAddress =
      this.request.headers['x-forwarded-for']?.toString().split(',')[0] ||
      this.request.socket.remoteAddress;

    const userAgent = this.request.headers['user-agent'];

    return {ipAddress, userAgent};
  }

  async createConsent(data: Partial<UsersConsent>): Promise<UsersConsent> {
    await this.validateConsentTemplate(data.consentTemplateId);
    await this.resolveConsentOwnership(data);
    const {ipAddress, userAgent} = this.getRequestMetadata();
    const ownershipWhere = this.buildConsentOwnershipWhere(data);

    const existingConsent = ownershipWhere
      ? await this.usersConsentRepo.findOne({
          where: {
            and: [
              ownershipWhere,
              {consentTemplateId: data.consentTemplateId},
              {isDeleted: false},
            ],
          },
          order: ['updatedAt DESC', 'acceptedAt DESC', 'createdAt DESC'],
        })
      : null;

    // Dynamic consent logic: keep a single consent row per
    // sessionId/consentTemplateId or identifierId/consentTemplateId pair.
    if (existingConsent) {
      await this.usersConsentRepo.updateById(existingConsent.id, {
        isChecked: data.isChecked,
        identifierId: data.identifierId ?? existingConsent.identifierId,
        sessionId: data.sessionId ?? existingConsent.sessionId,
        ipAddress,
        userAgent,
        acceptedAt: new Date(),
      });

      return this.usersConsentRepo.findById(existingConsent.id);
    }

    return this.usersConsentRepo.create({
      ...data,
      ipAddress,
      userAgent,
      acceptedAt: new Date(),
    });
  }

  async updateConsent(data: Partial<UsersConsent>): Promise<UsersConsent> {
    await this.validateConsentTemplate(data.consentTemplateId);
    await this.resolveConsentOwnership(data);
    const {ipAddress, userAgent} = this.getRequestMetadata();
    const ownershipWhere = this.buildConsentOwnershipWhere(data);

    if (!ownershipWhere) {
      throw new HttpErrors.BadRequest(
        'sessionId or identifierId is required to update consent',
      );
    }

    // Dynamic consent logic: before profile creation update by
    // sessionId + consentTemplateId, and after profile creation update by
    // verified identifierId + consentTemplateId.
    const existingConsent = await this.usersConsentRepo.findOne({
      where: {
        and: [
          ownershipWhere,
          {consentTemplateId: data.consentTemplateId},
          {isDeleted: false},
        ],
      },
      order: ['updatedAt DESC', 'acceptedAt DESC', 'createdAt DESC'],
    });

    if (!existingConsent) {
      throw new HttpErrors.NotFound('Consent record not found');
    }

    await this.usersConsentRepo.updateById(existingConsent.id, {
      isChecked: data.isChecked,
      identifierId: data.identifierId ?? existingConsent.identifierId,
      sessionId: data.sessionId ?? existingConsent.sessionId,
      ipAddress,
      userAgent,
      acceptedAt: new Date(),
    });

    return this.usersConsentRepo.findById(existingConsent.id);
  }

  async fetchConsentsBySessionId(sessionId: string): Promise<UsersConsent[]> {
    await this.verifyRegistrationSession(sessionId);

    // Dynamic consent logic: return previously accepted onboarding consents
    // so UI can restore checkbox state after refresh.
    return this.usersConsentRepo.find({
      where: {
        and: [
          {sessionId},
          {isDeleted: false},
        ],
      },
      include: [{relation: 'consentTemplate'}],
      order: ['updatedAt DESC', 'acceptedAt DESC', 'createdAt DESC'],
    });
  }

  async fetchConsentsByIdentifierId(
    identifierId: string,
  ): Promise<UsersConsent[]> {
    const verifiedIdentifierId =
      await this.resolveVerifiedMerchantIdentifierId(identifierId);

    return this.usersConsentRepo.find({
      where: {
        and: [
          {identifierId: verifiedIdentifierId},
          {isDeleted: false},
        ],
      },
      include: [{relation: 'consentTemplate'}],
      order: ['updatedAt DESC', 'acceptedAt DESC', 'createdAt DESC'],
    });
  }
}
