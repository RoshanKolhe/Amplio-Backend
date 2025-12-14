/* eslint-disable @typescript-eslint/no-explicit-any */
import {inject} from '@loopback/core';
import {Filter, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {AuthorizeSignatories} from '../models';
import {AuthorizeSignatoriesRepository} from '../repositories';
import {MediaService} from './media.service';

export class AuthorizeSignatoriesService {
  constructor(
    @repository(AuthorizeSignatoriesRepository)
    private authorizeSignatoriesRepository: AuthorizeSignatoriesRepository,
    @inject('service.media.service')
    private mediaService: MediaService
  ) { }

  // fetch authorize signatories...
  async fetchAuthorizeSignatories(usersId: string, roleValue: string, identifierId: string, filter?: Filter<AuthorizeSignatories>): Promise<{
    success: boolean;
    message: string;
    signatories: AuthorizeSignatories[]
  }> {
    const authorizeSignatories = await this.authorizeSignatoriesRepository.find({
      where: {
        and: [
          {...filter?.where},
          {usersId: usersId},
          {roleValue: roleValue},
          {identifierId: identifierId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'panCardFile', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}},
        {relation: 'boardResolutionFile', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}},
      ],
    });

    return {
      success: true,
      message: 'Authorize signatories',
      signatories: authorizeSignatories
    }
  }

  // fetch authorize signatory...
  async fetchAuthorizeSignatory(signatoryId: string): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories
  }> {
    const authorizeSignatory = await this.authorizeSignatoriesRepository.findOne({
      where: {
        and: [
          {id: signatoryId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'panCardFile', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}},
        {relation: 'boardResolutionFile', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}},
      ],
    });

    if (!authorizeSignatory) {
      throw new HttpErrors.NotFound('Signatory not found');
    }

    return {
      success: true,
      message: 'Authorize signatories',
      signatory: authorizeSignatory
    }
  }

  // create single authorize signatory
  async createAuthorizeSignatory(
    signatory: Omit<AuthorizeSignatories, 'id'>
  ): Promise<{
    success: boolean;
    message: string;
    signatory: AuthorizeSignatories;
  }> {
    try {
      // Check duplicates
      const existing = await this.authorizeSignatoriesRepository.findOne({
        where: {
          and: [
            {submittedPanNumber: signatory.submittedPanNumber},
            {usersId: signatory.usersId},
            {roleValue: signatory.roleValue},
            {identifierId: signatory.identifierId},
            {isActive: true},
            {isDeleted: false},
          ],
        },
      });

      if (existing) {
        throw new HttpErrors.BadRequest(
          'Signatory with same PAN already exists'
        );
      }

      // Prepare name checks
      const extractedName = signatory.extractedPanFullName?.trim().toLowerCase();
      const submittedName = signatory.submittedPanFullName?.trim().toLowerCase();
      const fullName = signatory.fullName.trim().toLowerCase();

      const nameMatches =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        (extractedName?.includes(fullName)) ||
        (submittedName?.includes(fullName));

      const hasOCR =
        signatory.extractedPanNumber &&
        signatory.extractedPanFullName &&
        signatory.extractedDateOfBirth;

      // ---------------------------------------------------------
      // ✔ CASE 1 — AUTO MODE (OCR PRESENT)
      // ---------------------------------------------------------
      if (hasOCR) {
        if (
          signatory.extractedPanNumber === signatory.submittedPanNumber &&
          nameMatches
        ) {
          signatory.mode = 0; // auto
          signatory.status = 1; // approved
          signatory.verifiedAt = new Date();

          const created = await this.authorizeSignatoriesRepository.create(signatory);

          return {
            success: true,
            message: 'Signatory created (auto approved)',
            signatory: created,
          };
        }

        throw new HttpErrors.BadRequest(
          'Fullname or PAN mismatch with OCR data'
        );
      }

      // ---------------------------------------------------------
      // ✔ CASE 2 — MANUAL MODE
      // ---------------------------------------------------------
      if (submittedName?.includes(fullName)) {
        signatory.mode = 1;
        signatory.status = 0; // under review

        const created = await this.authorizeSignatoriesRepository.create(signatory);

        return {
          success: true,
          message: 'Signatory created (manual review)',
          signatory: created,
        };
      }

      throw new HttpErrors.BadRequest(
        'Fullname does not match with PAN card'
      );

    } catch (err) {
      console.error('Error while creating signatory:', err);
      throw err;
    }
  }

  // create new authorize signatories...
  async createAuthorizeSignatories(signatories: Omit<AuthorizeSignatories, 'id'>[], tx: any): Promise<{
    success: boolean;
    message: string;
    createdAuthorizeSignatories: AuthorizeSignatories[];
    erroredAuthrizeSignatories: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }>;
  }> {
    const createdAuthorizeSignatories: AuthorizeSignatories[] = [];
    const erroredAuthrizeSignatories: Array<{
      fullName: string;
      email: string;
      phone: string;
      submittedPanNumber: string;
      message: string;
    }> = [];

    const mediaIds: string[] = [];

    for (const signatory of signatories) {
      // prepare name checks
      const extractedName = signatory.extractedPanFullName?.trim().toLowerCase();
      const submittedPanName = signatory.submittedPanFullName?.trim().toLowerCase();
      const fullName = signatory.fullName.trim().toLowerCase();

      const nameMatches =
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        (extractedName?.includes(fullName)) ||
        (submittedPanName?.includes(fullName));

      // CASE 1: OCR present → try auto mode
      if (signatory.extractedPanNumber && signatory.extractedPanFullName && signatory.extractedDateOfBirth) {

        if ((signatory.extractedPanNumber === signatory.submittedPanNumber) && nameMatches) {
          signatory.mode = 0; // auto
          signatory.status = 1; // approved
          signatory.verifiedAt = new Date();

          try {
            const createdSignatory = await this.authorizeSignatoriesRepository.create(signatory, {transaction: tx});
            createdAuthorizeSignatories.push(createdSignatory);
            mediaIds.push(createdSignatory.panCardFileId, createdSignatory.boardResolutionFileId);
            continue;
          } catch (dbErr) {
            if (dbErr?.code === '23505') {
              erroredAuthrizeSignatories.push({
                fullName: signatory.fullName,
                email: signatory.email,
                phone: signatory.phone,
                submittedPanNumber: signatory.submittedPanNumber,
                message: 'This PAN is already added for this company/role',
              });
              continue;
            }
            throw dbErr;
          }

        } else {
          erroredAuthrizeSignatories.push({
            fullName: signatory.fullName,
            email: signatory.email,
            phone: signatory.phone,
            submittedPanNumber: signatory.submittedPanNumber,
            message: 'Fullname does not match with given pan',
          });
          continue;
        }

      }

      // CASE 2: Manual mode (no OCR)
      if (submittedPanName?.includes(fullName)) {
        signatory.mode = 1;
        signatory.status = 0; // under review

        try {
          const createdSignatory = await this.authorizeSignatoriesRepository.create(signatory, {transaction: tx});
          createdAuthorizeSignatories.push(createdSignatory);
          mediaIds.push(createdSignatory.panCardFileId, createdSignatory.boardResolutionFileId);
          continue;
        } catch (dbErr) {
          if (dbErr?.code === '23505') {
            erroredAuthrizeSignatories.push({
              fullName: signatory.fullName,
              email: signatory.email,
              phone: signatory.phone,
              submittedPanNumber: signatory.submittedPanNumber,
              message: 'This PAN is already added for this company/role',
            });
            continue;
          }
          throw dbErr;
        }

      } else {
        erroredAuthrizeSignatories.push({
          fullName: signatory.fullName,
          email: signatory.email,
          phone: signatory.phone,
          submittedPanNumber: signatory.submittedPanNumber,
          message: 'Fullname does not match with pan card',
        });
      }
    }

    await this.mediaService.updateMediaUsedStatus(mediaIds, true);

    return {
      success: true,
      message: 'Authorize signatories data',
      createdAuthorizeSignatories,
      erroredAuthrizeSignatories
    };
  }

  // update signatory status
  async updateSignatoryStatus(signatoryId: string, status: number, reason: string): Promise<{success: boolean; message: string}> {
    const existingSignatory = await this.authorizeSignatoriesRepository.findById(signatoryId);

    if (!existingSignatory) {
      throw new HttpErrors.NotFound('No Authorize signatory found');
    }

    const statusOptions = [0, 1, 2];

    if (!statusOptions.includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.authorizeSignatoriesRepository.updateById(existingSignatory.id, {status: 1, verifiedAt: new Date()});
      return {
        success: true,
        message: 'Authorize signatory Approved'
      }
    }

    if (status === 2) {
      await this.authorizeSignatoriesRepository.updateById(existingSignatory.id, {status: 2, reason: reason});
      return {
        success: true,
        message: 'Authorize signatory Rejected'
      }
    }

    if (status === 3) {
      await this.authorizeSignatoriesRepository.updateById(existingSignatory.id, {status: 0});
      return {
        success: true,
        message: 'Authorize signatory status is in under review'
      }
    }

    throw new HttpErrors.BadRequest('invalid status');
  }

  // update signatory info...
  async updateSignatoryInfo(signatoryId: string, signatoryData: Partial<AuthorizeSignatories>, tx: any): Promise<{success: boolean; message: string; signatory: AuthorizeSignatories | null}> {
    const signatory = await this.authorizeSignatoriesRepository.findOne({
      where: {
        and: [
          {id: signatoryId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
    }, {transaction: tx});

    if (!signatory) {
      throw new HttpErrors.NotFound('Signatory not found');
    }

    if (signatory.status === 1) {
      throw new HttpErrors.BadRequest('Signatory is already approved! please contact admin');
    }

    await this.authorizeSignatoriesRepository.updateById(signatoryId, {...signatoryData, status: 0, mode: 1}, {transaction: tx});

    const updatedSignatoryData = await this.authorizeSignatoriesRepository.findOne({
      where: {
        and: [
          {id: signatoryId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'panCardFile', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}},
        {relation: 'boardResolutionFile', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}},
      ]
    }, {transaction: tx});

    if (updatedSignatoryData && (updatedSignatoryData.panCardFileId !== signatory.panCardFileId)) {
      await this.mediaService.updateMediaUsedStatus([signatory.panCardFileId], false);
      await this.mediaService.updateMediaUsedStatus([updatedSignatoryData.panCardFileId], true);
    }

    if (updatedSignatoryData && (updatedSignatoryData.boardResolutionFileId !== signatory.boardResolutionFileId)) {
      await this.mediaService.updateMediaUsedStatus([signatory.boardResolutionFileId], false);
      await this.mediaService.updateMediaUsedStatus([updatedSignatoryData.boardResolutionFileId], true);
    }

    return {
      success: true,
      message: 'Authorize signatory updated',
      signatory: updatedSignatoryData
    }
  }
}
