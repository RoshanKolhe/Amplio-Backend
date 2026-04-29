import {DataObject, repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {BankDetails, InvestorEscrowAccount} from '../models';
import {
  BankDetailsRepository,
  InvestorEscrowAccountRepository,
  InvestorProfileRepository,
} from '../repositories';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class InvestorEscrowAccountService {
  constructor(
    @repository(InvestorEscrowAccountRepository)
    private investorEscrowAccountRepository: InvestorEscrowAccountRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(BankDetailsRepository)
    private bankDetailsRepository: BankDetailsRepository,
  ) {}

  private buildEscrowPayload(
    investorProfileId: string,
    bankAccount: BankDetails,
  ): DataObject<InvestorEscrowAccount> {
    return {
      investorProfileId,
      usersId: bankAccount.usersId,
      bankDetailsId: bankAccount.id,
      bankName: bankAccount.bankName,
      ifscCode: bankAccount.ifscCode,
      branchName: bankAccount.branchName,
      bankAddress: bankAccount.bankAddress,
      accountHolderName: bankAccount.accountHolderName,
      accountNumber: bankAccount.accountNumber,
      accountType: bankAccount.accountType,
      escrowType: 'investor_escrow',
      status: 'auto_created',
      createdOnApprovalAt: new Date(),
      isActive: true,
      isDeleted: false,
    };
  }

  async ensureForApprovedInvestor(
    investorProfileId: string,
    tx?: any,
  ): Promise<InvestorEscrowAccount> {
    const options = tx ? {transaction: tx} : undefined;
    const investorProfile = await this.investorProfileRepository.findOne(
      {
        where: {
          and: [{id: investorProfileId}, {isDeleted: false}],
        },
      },
      options,
    );

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor profile not found');
    }

    const bankAccount = await this.bankDetailsRepository.findOne(
      {
        where: {
          and: [
            {usersId: investorProfile.usersId},
            {roleValue: 'investor'},
            {status: 1},
            {isActive: true},
            {isDeleted: false},
          ],
        },
        order: ['isPrimary DESC', 'updatedAt DESC', 'createdAt DESC'],
      },
      options,
    );

    if (!bankAccount) {
      throw new HttpErrors.BadRequest(
        'Cannot create investor escrow account. Approved investor bank details not found',
      );
    }

    return this.upsertEscrowWithBankDetails(investorProfile.id, bankAccount, tx);
  }

  private async upsertEscrowWithBankDetails(
    investorProfileId: string,
    bankAccount: BankDetails,
    tx?: any,
  ): Promise<InvestorEscrowAccount> {
    const options = tx ? {transaction: tx} : undefined;
    const payload = this.buildEscrowPayload(investorProfileId, bankAccount);
    const existing = await this.investorEscrowAccountRepository.findOne(
      {
        where: {
          investorProfileId,
        },
      },
      options,
    );

    if (existing) {
      await this.investorEscrowAccountRepository.updateById(
        existing.id,
        {
          ...payload,
          updatedAt: new Date(),
        },
        options,
      );

      return this.investorEscrowAccountRepository.findById(
        existing.id,
        undefined,
        options,
      );
    }

    return this.investorEscrowAccountRepository.create(payload, options);
  }

  async getOrCreateActiveEscrowForApprovedInvestor(
    investorProfileId: string,
    tx?: any,
  ): Promise<InvestorEscrowAccount> {
    const options = tx ? {transaction: tx} : undefined;

    // Fetch latest approved bank account first to ensure sync
    const investorProfile = await this.investorProfileRepository.findOne(
      {
        where: {
          and: [{id: investorProfileId}, {isDeleted: false}],
        },
      },
      options,
    );

    if (!investorProfile) {
      throw new HttpErrors.NotFound('Investor profile not found');
    }

    const bankAccount = await this.bankDetailsRepository.findOne(
      {
        where: {
          and: [
            {usersId: investorProfile.usersId},
            {roleValue: 'investor'},
            {status: 1},
            {isActive: true},
            {isDeleted: false},
          ],
        },
        order: ['isPrimary DESC', 'updatedAt DESC', 'createdAt DESC'],
      },
      options,
    );

    if (!bankAccount) {
      throw new HttpErrors.BadRequest(
        'Cannot create investor escrow account. Approved investor bank details not found',
      );
    }

    const existing = await this.investorEscrowAccountRepository.findOne(
      {
        where: {
          and: [
            {investorProfileId},
            {isActive: true},
            {isDeleted: false},
            {bankDetailsId: bankAccount.id},
            {status: {neq: 'inactive'}},
          ],
        },
        include: [{relation: 'bankDetails'}],
      },
      options,
    );

    if (existing) {
      return existing;
    }

    return this.upsertEscrowWithBankDetails(investorProfileId, bankAccount, tx);
  }

  async fetchByInvestorProfileId(
    investorProfileId: string,
  ): Promise<InvestorEscrowAccount | null> {
    return this.investorEscrowAccountRepository.findOne({
      where: {
        and: [
          {investorProfileId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      include: [{relation: 'bankDetails'}],
    });
  }
}
