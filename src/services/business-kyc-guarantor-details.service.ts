/* eslint-disable @typescript-eslint/no-explicit-any */
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {BusinessKycGuarantor} from '../models';
import {
  BusinessKycGuarantorRepository,
  BusinessKycGuarantorVerificationRepository,
  BusinessKycRepository,
  CompanyProfilesRepository,
} from '../repositories';
import {JWTService} from './jwt-service';
import {inject} from '@loopback/core';

export class BusinessKycGuarantorDetailsService {
  constructor(
    @repository(BusinessKycGuarantorRepository)
    private businessKycGuarantorRepository: BusinessKycGuarantorRepository,

    @repository(BusinessKycRepository)
    private businessKycRepository: BusinessKycRepository,

    @repository(CompanyProfilesRepository)
    private companyProfileRepository: CompanyProfilesRepository,

    @repository(BusinessKycGuarantorVerificationRepository)
    private businessKycGuarantorVerificationRepository: BusinessKycGuarantorVerificationRepository,

    @inject('service.jwt.service')
    private jwtService: JWTService,
  ) {}

  /**
   * ✅ CREATE single guarantor
   */
  async createGuarantor(
    businessKycId: string,
    userId: string,
    payload: Omit<
      BusinessKycGuarantor,
      'id' | 'businessKycId' | 'companyProfilesId'
    >,
    tx: any,
  ): Promise<BusinessKycGuarantor> {
    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        usersId: userId,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    return this.businessKycGuarantorRepository.create(
      {
        ...payload,
        businessKycId,
        companyProfilesId: companyProfile.id,
        status: 0,
        mode: 0,
        isActive: true,
        isDeleted: false,
      },
      {transaction: tx},
    );
  }

  /**
   * ✅ UPDATE single guarantor by ID (PATCH)
   */
  async updateGuarantorById(
    guarantorId: string,
    userId: string,
    payload: Omit<
      BusinessKycGuarantor,
      'id' | 'businessKycId' | 'companyProfilesId'
    >,
    tx: any,
  ): Promise<BusinessKycGuarantor> {
    // company profile
    const companyProfile = await this.companyProfileRepository.findOne({
      where: {
        usersId: userId,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!companyProfile) {
      throw new HttpErrors.NotFound('Company profile not found');
    }

    // guarantor
    const guarantor =
      await this.businessKycGuarantorRepository.findById(guarantorId);

    if (!guarantor || guarantor.isDeleted) {
      throw new HttpErrors.NotFound('Guarantor not found');
    }

    // ownership check
    const kyc = await this.businessKycRepository.findById(
      guarantor.businessKycId,
    );

    if (kyc.companyProfilesId !== companyProfile.id) {
      throw new HttpErrors.Forbidden('Unauthorized guarantor update');
    }

    // patch update
    await this.businessKycGuarantorRepository.updateById(guarantorId, payload, {
      transaction: tx,
    });

    return this.businessKycGuarantorRepository.findById(guarantorId, {
      include: ['companyPan', 'companyAadhar'],
    });
  }

  /**
   * ✅ GET all guarantors for a business KYC
   */
  async getGuarantorsByBusinessKycId(
    businessKycId: string,
  ): Promise<BusinessKycGuarantor[]> {
    return this.businessKycGuarantorRepository.find({
      where: {
        businessKycId,
        isActive: true,
        isDeleted: false,
      },
      include: ['companyPan', 'companyAadhar'],
    });
  }

  async countGuarantors(businessKycId: string, tx: any): Promise<number> {
    return this.businessKycGuarantorRepository
      .count(
        {
          businessKycId,
          isActive: true,
          isDeleted: false,
        },
        {transaction: tx},
      )
      .then(res => res.count);
  }

  async createGuarantorVerificationLink(
    guarantorId: string,
    tx: any,
  ): Promise<string> {
    const verification =
      await this.businessKycGuarantorVerificationRepository.create(
        {
          businessKycGuarantorId: guarantorId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          isVerified: false,
          isUsed: false,
        },
        {transaction: tx},
      );

    const token = await this.jwtService.generateGuarantorVerificationToken({
      guarantorId,
      verificationId: verification.id,
    });

    const siteUrl = process.env.REACT_APP_SITE_URL;
    const verificationUrl = `${siteUrl}/kyc/invoiceFinancing/verify?token=${token}`;

    await this.businessKycGuarantorVerificationRepository.updateById(
      verification.id,
      {verificationUrl},
      {transaction: tx},
    );

    return verificationUrl;
  }

  async updateGuarantorDetailsStatus(
    id: string,
    status: number,
    reason: string,
  ): Promise<{success: boolean; message: string}> {
    const existingProfile =
      await this.businessKycGuarantorRepository.findById(id);

    if (!existingProfile) {
      throw new HttpErrors.NotFound('No guarantor details found');
    }

    const statusOptions = [0, 1, 2];

    if (!statusOptions.includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.businessKycGuarantorRepository.updateById(existingProfile.id, {
        status: 1,
        verifiedAt: new Date(),
      });
      return {
        success: true,
        message: 'Guarantor Details Approved',
      };
    }

    if (status === 2) {
      await this.businessKycGuarantorRepository.updateById(existingProfile.id, {
        status: 2,
        reason: reason,
      });
      return {
        success: true,
        message: 'Guarantor Details Rejected',
      };
    }

    if (status === 3) {
      await this.businessKycGuarantorRepository.updateById(existingProfile.id, {
        status: 0,
      });
      return {
        success: true,
        message: 'Guarantor Details status is in under review',
      };
    }

    throw new HttpErrors.BadRequest('invalid status');
  }
}
