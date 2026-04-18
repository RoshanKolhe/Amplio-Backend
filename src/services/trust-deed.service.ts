import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {TrustDeed} from '../models';
import {TrustDeedRepository} from '../repositories';
import {
  SpvDocumentOverallSigningStatus,
  SpvKycDocumentService,
  SpvKycDocumentWithSigningDetails,
} from './spv-kyc-document.service';

export type TrustDeedWithSigningDetails = TrustDeed & {
  document: SpvKycDocumentWithSigningDetails | null;
  overallSigningStatus: SpvDocumentOverallSigningStatus;
  signing: {
    trustee: {
      status: string;
      signedAt?: Date;
    };
  };
};

export type TrustDeedDetailsPayload = Partial<
  Pick<
    TrustDeed,
    | 'trustName'
    | 'trusteeEntity'
    | 'settlor'
    | 'governingLaw'
    | 'bankruptcyClause'
    | 'trustDuration'
    | 'stampDutyAndRegistrationId'
    | 'isActive'
    | 'isDeleted'
  >
>;

export class TrustDeedService {
  constructor(
    @repository(TrustDeedRepository)
    private trustDeedRepository: TrustDeedRepository,
    @inject('service.spvKycDocument.service')
    private spvKycDocumentService: SpvKycDocumentService,
  ) {}

  private async buildResponse(
    trustDeed: TrustDeed,
  ): Promise<TrustDeedWithSigningDetails> {
    const document =
      await this.spvKycDocumentService.fetchDocumentByApplicationIdAndValue(
        trustDeed.spvApplicationId,
        'trust_deed',
      );

    return {
      ...trustDeed.toJSON(),
      document,
      overallSigningStatus: document?.overallSigningStatus ?? 'pending',
      signing: {
        trustee: {
          status: document?.signing?.trustee?.status ?? 'pending',
          signedAt: document?.signing?.trustee?.signedAt,
        },
      },
    } as TrustDeedWithSigningDetails;
  }

  async createOrUpdate(
    spvApplicationId: string,
    payload: TrustDeedDetailsPayload,
    tx?: unknown,
  ): Promise<TrustDeedWithSigningDetails> {
    const existing = await this.trustDeedRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (existing) {
      await this.trustDeedRepository.updateById(
        existing.id,
        {
          ...payload,
          updatedAt: new Date(),
        },
        tx ? {transaction: tx} : undefined,
      );

      const updatedTrustDeed = await this.trustDeedRepository.findById(
        existing.id,
        undefined,
        tx ? {transaction: tx} : undefined,
      );

      return this.buildResponse(updatedTrustDeed);
    }

    const newTrustDeed = await this.trustDeedRepository.create(
      {
        ...payload,
        spvApplicationId,
      },
      tx ? {transaction: tx} : undefined,
    );

    return this.buildResponse(newTrustDeed);
  }

  async fetchByApplicationId(
    spvApplicationId: string,
  ): Promise<TrustDeedWithSigningDetails | null> {
    const trustDeed = await this.trustDeedRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!trustDeed) {
      return null;
    }

    return this.buildResponse(trustDeed);
  }

  async fetchByApplicationIdOrFail(
    spvApplicationId: string,
  ): Promise<TrustDeedWithSigningDetails> {
    const record = await this.fetchByApplicationId(spvApplicationId);

    if (!record) {
      throw new HttpErrors.NotFound('Trust deed not found');
    }

    return record;
  }
}
