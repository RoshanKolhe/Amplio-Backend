import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {Spv} from '../models';
import {
  PspMasterRepository,
  SpvApplicationRepository,
  SpvRepository,
  TrusteeProfilesRepository,
} from '../repositories';

export class SpvService {
  constructor(
    @repository(SpvRepository)
    private spvRepository: SpvRepository,
    @repository(SpvApplicationRepository)
    private spvApplicationRepository: SpvApplicationRepository,
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @repository(PspMasterRepository)
    private pspMasterRepository: PspMasterRepository,
  ) { }

  private normalizeSpvName(spvName: string): string {
    return spvName.trim().toLowerCase();
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private async ensureUniqueSpvName(
    spvName: string,
    currentSpvId?: string,
    tx?: unknown,
  ): Promise<string> {
    const trimmedSpvName = spvName.trim();

    const existingSpvs = await this.spvRepository.find(
      {
        where: {
          and: [{isActive: true}, {isDeleted: false}],
        },
      },
      tx ? {transaction: tx} : undefined,
    );

    const duplicateSpv = existingSpvs.find(
      existing =>
        existing.id !== currentSpvId &&
        this.normalizeSpvName(existing.spvName) ===
        this.normalizeSpvName(trimmedSpvName),
    );

    if (duplicateSpv) {
      throw new HttpErrors.BadRequest(
        'SPV name already exists. Please use a different SPV name.',
      );
    }

    return trimmedSpvName;
  }

  private async generateRegistrationNumber(
    applicationId: string,
    tx?: unknown,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SPV-${year}-`;
    const existingSpvs = await this.spvRepository.find(
      {
        where: {
          and: [{registrationNumber: {like: `${prefix}%`}}],
        },
      },
      tx ? {transaction: tx} : undefined,
    );

    let nextSequence = 1;

    for (const spv of existingSpvs) {
      const suffix = String(spv.registrationNumber ?? '').slice(prefix.length);
      const parsedSequence = Number(suffix);

      if (Number.isFinite(parsedSequence)) {
        nextSequence = Math.max(nextSequence, parsedSequence + 1);
      }
    }

    return `${prefix}${String(nextSequence).padStart(4, '0')}`;
  }

  async generateSpvName(pspMasterId: string): Promise<string> {
    const psp = await this.pspMasterRepository.findById(pspMasterId);

    if (!psp) {
      throw new HttpErrors.NotFound('PSP not found');
    }

    const getPspCode = (name = '') =>
      name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 4) || 'SPV';

    const pspCode = getPspCode(psp.name);

    const now = new Date();

    const year = now.getFullYear();

    const month = String(now.getMonth() + 1).padStart(2, '0');

    const prefix = `${pspCode}${year}${month}`;

    const latestSpv = await this.spvRepository.findOne({
      where: {
        and: [
          {
            spvName: {
              like: `${prefix}%`,
            },
          },
          {isActive: true},
          {isDeleted: false},
        ],
      },
      order: ['spvName DESC'],
    });

    let nextSequence = 1;

    if (latestSpv?.spvName) {

      const lastSequence =
        latestSpv.spvName.replace(prefix, '');

      const parsedSequence = Number(lastSequence);

      if (Number.isFinite(parsedSequence)) {
        nextSequence = parsedSequence + 1;
      }
    }

    return `${prefix}${String(nextSequence).padStart(2, '0')}`;
  }


  async createOrUpdateSpv(
    applicationId: string,
    spvData: Omit<Spv, 'id' | 'spvApplicationId'>,
    tx?: unknown,
  ): Promise<{
    applicationId: string;
    spv: Spv;
    updateStatus: boolean;
  }> {
    const existingSpv = await this.spvRepository.findOne({
      where: {
        and: [
          {spvApplicationId: applicationId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    const uniqueSpvName = await this.ensureUniqueSpvName(
      spvData.spvName,
      existingSpv?.id,
      tx,
    );
    const payload = {
      ...spvData,
      spvName: uniqueSpvName,
    };

    if (existingSpv) {
      const registrationNumber =
        existingSpv.registrationNumber ??
        (await this.generateRegistrationNumber(applicationId, tx));

      await this.spvRepository.updateById(
        existingSpv.id,
        {
          ...payload,
          registrationNumber,
        },
        tx ? {transaction: tx} : undefined,
      );

      const updatedSpv = await this.spvRepository.findById(
        existingSpv.id,
        undefined,
        tx ? {transaction: tx} : undefined,
      );

      return {
        applicationId,
        spv: updatedSpv,
        updateStatus: false,
      };
    }

    const spv = await this.spvRepository.create(
      {
        ...payload,
        registrationNumber: await this.generateRegistrationNumber(applicationId, tx),
        spvApplicationId: applicationId,
      },
      tx ? {transaction: tx} : undefined,
    );

    return {
      applicationId,
      spv,
      updateStatus: false,
    };
  }

  async fetchSpvByApplicationId(applicationId: string): Promise<Spv | null> {
    const spv = await this.spvRepository.findOne({
      where: {
        and: [
          {spvApplicationId: applicationId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });

    if (spv) {
      return spv;
    }

    const application = await this.spvApplicationRepository.findOne({
      where: {id: applicationId},
    });

    if (application?.linkedSpvId && this.isUuid(application.linkedSpvId)) {
      return this.fetchSpvByIdOrFail(application.linkedSpvId);
    }

    return null;
  }

  async fetchSpvByApplicationIdOrFail(applicationId: string): Promise<Spv> {
    const spv = await this.fetchSpvByApplicationId(applicationId);

    if (!spv) {
      throw new HttpErrors.NotFound('SPV data not found');
    }

    return spv;
  }

  async fetchSpvByIdOrFail(spvId: string): Promise<Spv> {
    const spv = await this.spvRepository.findOne({
      where: {
        and: [{id: spvId}, {isActive: true}, {isDeleted: false}],
      },
    });

    if (!spv) {
      throw new HttpErrors.NotFound('SPV not found');
    }

    return spv;
  }
}
