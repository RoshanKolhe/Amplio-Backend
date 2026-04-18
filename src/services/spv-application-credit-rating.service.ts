import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {SpvApplicationCreditRating} from '../models';
import {SpvApplicationCreditRatingRepository} from '../repositories';
import {MediaService} from './media.service';

export class SpvApplicationCreditRatingService {
  constructor(
    @repository(SpvApplicationCreditRatingRepository)
    private spvApplicationCreditRatingRepository: SpvApplicationCreditRatingRepository,
    @inject('service.media.service')
    private mediaService: MediaService,
  ) {}

  async createOrUpdate(
    spvApplicationId: string,
    payload: Omit<SpvApplicationCreditRating, 'id' | 'spvApplicationId'>,
    tx?: unknown,
  ): Promise<SpvApplicationCreditRating> {
    const existing = await this.spvApplicationCreditRatingRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (existing) {
      await this.spvApplicationCreditRatingRepository.updateById(
        existing.id,
        payload,
        tx ? {transaction: tx} : undefined,
      );

      if (
        existing.ratingLetterId &&
        payload.ratingLetterId &&
        existing.ratingLetterId !== payload.ratingLetterId
      ) {
        await this.mediaService.updateMediaUsedStatus(
          [existing.ratingLetterId],
          false,
        );
        await this.mediaService.updateMediaUsedStatus(
          [payload.ratingLetterId],
          true,
        );
      }

      return this.spvApplicationCreditRatingRepository.findById(
        existing.id,
        {
          include: [
            {relation: 'creditRatingAgencies'},
            {relation: 'creditRatings'},
            {relation: 'ratingLetter'},
          ],
        },
        tx ? {transaction: tx} : undefined,
      );
    }

    const created = await this.spvApplicationCreditRatingRepository.create(
      {
        ...payload,
        spvApplicationId,
      },
      tx ? {transaction: tx} : undefined,
    );

    if (created.ratingLetterId) {
      await this.mediaService.updateMediaUsedStatus([created.ratingLetterId], true);
    }

    return this.spvApplicationCreditRatingRepository.findById(
      created.id,
      {
        include: [
          {relation: 'creditRatingAgencies'},
          {relation: 'creditRatings'},
          {relation: 'ratingLetter'},
        ],
      },
      tx ? {transaction: tx} : undefined,
    );
  }

  async fetchByApplicationId(
    spvApplicationId: string,
  ): Promise<SpvApplicationCreditRating | null> {
    return this.spvApplicationCreditRatingRepository.findOne({
      where: {
        and: [{spvApplicationId}, {isActive: true}, {isDeleted: false}],
      },
      include: [
        {relation: 'creditRatingAgencies'},
        {relation: 'creditRatings'},
        {relation: 'ratingLetter'},
      ],
    });
  }

  async fetchByApplicationIdOrFail(
    spvApplicationId: string,
  ): Promise<SpvApplicationCreditRating> {
    const record = await this.fetchByApplicationId(spvApplicationId);

    if (!record) {
      throw new HttpErrors.NotFound('SPV application credit rating not found');
    }

    return record;
  }
}
