import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import axios from 'axios';
import {BankDetails} from '../models';
import {BankDetailsRepository} from '../repositories';
import {MediaService} from './media.service';
import {PerfiosService} from './perfios.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class BankDetailsService {
  constructor(
    @repository(BankDetailsRepository)
    public bankDetailsRepository: BankDetailsRepository,
    @inject('service.media.service')
    private mediaService: MediaService,
    @inject('service.perfios.service')
    private perfiosService: PerfiosService
  ) { }

  private removeUndefinedFields<T extends object>(data: T): T {
    return Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    ) as T;
  }

  private pickBankDetailsFields(data: Partial<BankDetails>): Partial<BankDetails> {
    return this.removeUndefinedFields({
      bankName: data.bankName,
      bankShortCode: data.bankShortCode,
      ifscCode: data.ifscCode,
      branchName: data.branchName,
      bankAddress: data.bankAddress,
      accountType: data.accountType,
      accountHolderName: data.accountHolderName,
      accountNumber: data.accountNumber,
      bankAccountProofType: data.bankAccountProofType,
      bankAccountProofId: data.bankAccountProofId,
      usersId: data.usersId,
      roleValue: data.roleValue,
      status: data.status,
      mode: data.mode,
      reason: data.reason,
      verifiedAt: data.verifiedAt,
      isPrimary: data.isPrimary,
      isActive: data.isActive,
      isDeleted: data.isDeleted,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      deletedAt: data.deletedAt,
    });
  }

  private getPerfiosMessage(response: any, fallbackMessage: string): string {
    return (
      response?.message ??
      response?.result?.message ??
      response?.result?.data?.message ??
      response?.result?.data?.source?.[0]?.message ??
      response?.errors?.[0]?.errorMessage ??
      fallbackMessage
    );
  }

  // verify bank account with Perfios
  async verifyWithPerfios(data: {
    accountNumber: string;
    ifscCode: string;
    accountHolderName: string;
    usersId: string;
    roleValue: string;
  }) {
    try {
      // 1. Call Perfios API
      const perfiosResponse: any = await this.perfiosService.verifyBankAccount(
        data.accountNumber,
        data.ifscCode,
        data.accountHolderName
      );
      console.log('Perfios Response:', perfiosResponse);

      const verificationData = perfiosResponse;
      const sourceData = verificationData?.result?.data?.source?.[0];
      const validity = verificationData?.result?.comparisionData?.inputVsSource?.validity;

      console.log('Verification Data:', verificationData);
      console.log('Perfios Source Data:', sourceData);
      console.log('Perfios Comparison Validity:', validity);

      /**
       * Perfios v3 response exposes verification outcome through the
       * source validity and the input-vs-source comparison validity.
       */
      const isVerified = sourceData?.isValid === true && validity === 'VALID';
      const perfiosMessage = this.getPerfiosMessage(
        verificationData,
        isVerified
          ? 'Bank account verified successfully with Perfios'
          : 'Bank account verification failed with Perfios'
      );

      const status = isVerified ? 1 : 2; // 1 = Approved, 2 = Rejected
      const mode = 0; // 0 = Auto

      // 2. Find if record exists, if not create one
      const existingAccount = await this.bankDetailsRepository.findOne({
        where: {
          usersId: data.usersId,
          accountNumber: data.accountNumber,
          roleValue: data.roleValue
        }
      });

      if (existingAccount) {
        await this.bankDetailsRepository.updateById(existingAccount.id, this.pickBankDetailsFields({
          status,
          mode,
          verifiedAt: isVerified ? new Date() : undefined,
          accountHolderName: data.accountHolderName,
        }));

        return {
          success: isVerified,
          message: perfiosMessage,
          data: perfiosResponse
        };
      }

      // If it doesn't exist, create a record
      const bankInfo = await this.extractBankInfo(data.ifscCode);

      const newAccount = await this.bankDetailsRepository.create(this.pickBankDetailsFields({
        ...bankInfo,
        accountNumber: data.accountNumber,
        accountHolderName: data.accountHolderName,
        usersId: data.usersId,
        roleValue: data.roleValue,
        status,
        mode,
        verifiedAt: isVerified ? new Date() : undefined,
        accountType: 0,
        bankAccountProofType: 0,
      }) as Omit<BankDetails, 'id'>);

      return {
        success: isVerified,
        message: perfiosMessage,
        data: {
          ...verificationData,
          account: newAccount,
        }
      };

    } catch (error: any) {
      console.error('Error in verifyWithPerfios:', error);
      throw error;
    }
  }

  // extract-bank-info from ifsc code
  async extractBankInfo(ifscCode: string) {
    try {
      const response = await axios.get(
        `https://ifsc.razorpay.com/${ifscCode.trim().toUpperCase()}`
      );

      const data: any = response.data;

      return this.removeUndefinedFields({
        bankName: data.BANK,
        branchName: data.BRANCH,
        bankShortCode: data.BANKCODE,
        ifscCode: data.IFSC,
        bankAddress: data.ADDRESS,
      });
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new HttpErrors.NotFound('Invalid IFSC code');
      }
      console.error('Error while extracting bank info:', error);
      throw new Error('Failed to fetch bank details');
    }
  }

  // create new bank account...
 async createNewBankAccount(bankDetails: Omit<BankDetails, 'id'>) {
  try {

    const existingAccount = await this.bankDetailsRepository.findOne({
      where: {
        usersId: bankDetails.usersId,
        accountNumber: bankDetails.accountNumber,
        roleValue: bankDetails.roleValue
      }
    });

    if (existingAccount) {
      await this.bankDetailsRepository.updateById(
        existingAccount.id,
        this.pickBankDetailsFields(bankDetails)
      );

      const account = await this.bankDetailsRepository.findById(existingAccount.id);

      return {
        success: true,
        message: 'Bank account updated',
        account
      };
    }

    const newAccount = await this.bankDetailsRepository.create(
      this.pickBankDetailsFields(bankDetails) as Omit<BankDetails, 'id'>
    );

    return {
      success: true,
      message: 'New Account Created',
      account: newAccount
    };

  } catch (error) {
    console.log('Error while creating new bank account:', error);
    throw error;
  }
}

  // fetch user bank accounts...
  async fetchUserBankAccounts(usersId: string, roleValue: string): Promise<{success: boolean; message: string; accounts: BankDetails[]}> {
    const bankAccounts = await this.bankDetailsRepository.find({
      where: {
        and: [
          {usersId: usersId},
          {roleValue: roleValue},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'bankAccountProof', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}}
      ]
    });

    return {
      success: true,
      message: 'Bank accounts',
      accounts: bankAccounts
    }
  }

  // fetch user bank accounts...
  async fetchUserBankAccount(accountId: string): Promise<{success: boolean; message: string; account: BankDetails}> {
    const bankAccount = await this.bankDetailsRepository.findOne({
      where: {
        and: [
          {id: accountId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'bankAccountProof', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}}
      ]
    });

    if (!bankAccount) {
      throw new HttpErrors.NotFound('Bank account not found');
    }

    return {
      success: true,
      message: 'Bank accounts',
      account: bankAccount
    }
  }

  // update bank account info...
  async updateBankAccountInfo(accountId: string, accountData: Partial<BankDetails>, tx: any): Promise<{success: boolean; message: string; account: BankDetails | null}> {
    const bankAccount = await this.bankDetailsRepository.findOne({
      where: {
        and: [
          {id: accountId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'bankAccountProof', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}}
      ]
    }, {transaction: tx});

    if (!bankAccount) {
      throw new HttpErrors.NotFound('Bank account not found');
    }

    if (bankAccount.status === 1) {
      throw new HttpErrors.BadRequest('Bank account is already approved! please contact admin');
    }

    await this.bankDetailsRepository.updateById(
      accountId,
      this.pickBankDetailsFields({...accountData, status: 0, mode: 1}),
      {transaction: tx}
    );

    const updatedAccountData = await this.bankDetailsRepository.findOne({
      where: {
        and: [
          {id: accountId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'bankAccountProof', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}}
      ]
    }, {transaction: tx});

    if (updatedAccountData && (updatedAccountData.bankAccountProofId !== bankAccount.bankAccountProofId)) {
      await this.mediaService.updateMediaUsedStatus([bankAccount.bankAccountProofId], false);
      await this.mediaService.updateMediaUsedStatus([updatedAccountData?.bankAccountProofId], true);
    }

    return {
      success: true,
      message: 'Bank Account Updated',
      account: updatedAccountData
    }
  }

  // mark account as primary account...
  async markAccountAsPrimaryAccount(accountId: string, tx: any): Promise<{success: true; message: string}> {
    const bankAccount = await this.bankDetailsRepository.findOne({
      where: {
        and: [
          {id: accountId},
          {isActive: true},
          {isDeleted: false}
        ]
      },
      include: [
        {relation: 'bankAccountProof', scope: {fields: {id: true, fileUrl: true, fileOriginalName: true}}}
      ]
    }, {transaction: tx});

    if (!bankAccount) {
      throw new HttpErrors.NotFound('Bank account not found');
    }

    if (bankAccount.status !== 1) {
      throw new HttpErrors.BadRequest('Bank account is not approved!');
    }

    const existingPrimaryAccount = await this.bankDetailsRepository.findOne({
      where: {
        and: [
          {usersId: bankAccount.usersId},
          {roleValue: bankAccount.roleValue},
          {isActive: true},
          {isDeleted: false},
          {isPrimary: true}
        ]
      },
    }, {transaction: tx});

    await this.bankDetailsRepository.updateById(accountId, {isPrimary: true}, {transaction: tx});

    if (existingPrimaryAccount) {
      await this.bankDetailsRepository.updateById(existingPrimaryAccount.id, {isPrimary: false}, {transaction: tx});
    };

    return {
      success: true,
      message: "Primary account changed"
    }
  }

  // update account status
  async updateAccountStatus(accountId: string, status: number, reason: string): Promise<{success: boolean; message: string}> {
    const existingAccount = await this.bankDetailsRepository.findById(accountId);

    if (!existingAccount) {
      throw new HttpErrors.NotFound('No Account found');
    }

    const statusOptions = [0, 1, 2];

    if (!statusOptions.includes(status)) {
      throw new HttpErrors.BadRequest('Invalid status');
    }

    if (status === 1) {
      await this.bankDetailsRepository.updateById(existingAccount.id, {status: 1, verifiedAt: new Date()});
      return {
        success: true,
        message: 'Bank Account Approved'
      }
    }

    if (status === 2) {
      await this.bankDetailsRepository.updateById(existingAccount.id, {status: 2, reason: reason});
      return {
        success: true,
        message: 'Bank Account Rejected'
      }
    }

    if (status === 3) {
      await this.bankDetailsRepository.updateById(existingAccount.id, {status: 0});
      return {
        success: true,
        message: 'Bank account status is in under review'
      }
    }

    throw new HttpErrors.BadRequest('invalid status');
  }
}
