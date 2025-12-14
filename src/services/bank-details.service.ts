import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import axios from 'axios';
import {BankDetails} from '../models';
import {BankDetailsRepository} from '../repositories';
import {MediaService} from './media.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class BankDetailsService {
  constructor(
    @repository(BankDetailsRepository)
    public bankDetailsRepository: BankDetailsRepository,
    @inject('service.media.service')
    private mediaService: MediaService
  ) { }

  // extract-bank-info from ifsc code
  async extractBankInfo(ifscCode: string) {
    try {
      const response = await axios.get(
        `https://ifsc.razorpay.com/${ifscCode.trim().toUpperCase()}`
      );

      const data: any = response.data;

      return {
        bankName: data.BANK,
        branchName: data.BRANCH,
        bankShortCode: data.BANKCODE,
        ifscCode: data.IFSC,
        bankAddress: data.ADDRESS,
        state: data.STATE,
        district: data.DISTRICT,
        city: data.CENTRE,
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new HttpErrors.NotFound('Invalid IFSC code');
      }
      console.error('Error while extracting bank info:', error);
      throw new Error('Failed to fetch bank details');
    }
  }

  // create new bank account...
  async createNewBankAccount(bankDetails: Omit<BankDetails, 'id'>): Promise<{
    success: boolean;
    message: string;
    account: BankDetails;
  }> {
    try {
      const checkForExistingAccount = await this.bankDetailsRepository.find({
        where: {
          and: [
            {usersId: bankDetails.usersId},
            {roleValue: bankDetails.roleValue}
          ]
        }
      });

      if (!checkForExistingAccount || checkForExistingAccount.length === 0) {
        bankDetails.isPrimary = true;
      }

      const newAccount = await this.bankDetailsRepository.create(bankDetails);

      return {
        success: true,
        message: 'New Account Created',
        account: newAccount
      }
    } catch (error) {
      console.log('Error while creating new bank account :', error);
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

    await this.bankDetailsRepository.updateById(accountId, {...accountData, status: 0, mode: 1}, {transaction: tx});

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
