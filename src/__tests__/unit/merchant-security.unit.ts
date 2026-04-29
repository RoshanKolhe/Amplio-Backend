import {InvocationContext} from '@loopback/core';
import {AUTHENTICATION_METADATA_KEY} from '@loopback/authentication';
import {MetadataInspector} from '@loopback/metadata';
import {HttpErrors} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import {expect, sinon} from '@loopback/testlab';
import jwt from 'jsonwebtoken';
import {AuthController} from '../../controllers/auth.controller';
import {BankDetailsController} from '../../controllers/bank-details.controller';
import {MerchantKycDocumentController} from '../../controllers/merchant-kyc-document.controller';
import {MerchantProfilesController} from '../../controllers/merchant-profiles.controller';
import {AuthorizeInterceptor} from '../../interceptors/authorize.interceptor';
import {BankDetailsService} from '../../services/bank-details.service';
import {JWTService} from '../../services/jwt-service';
import {MerchantKycDocumentService} from '../../services/merchant-kyc-document.service';
import {MerchantPayoutService} from '../../services/merchant-payout.service';
import {PspService} from '../../services/psp.service';
import {UboDetailsService} from '../../services/ubo-details.service';

describe('Merchant security hardening', () => {
  const merchantUser = {
    [securityId]: '11111111-1111-4111-8111-111111111111',
    id: '11111111-1111-4111-8111-111111111111',
    roles: ['merchant'],
  } as unknown as UserProfile;

  const onboardingMerchantUser = {
    [securityId]: '11111111-1111-4111-8111-111111111111',
    id: '11111111-1111-4111-8111-111111111111',
    roles: ['merchant'],
    permissions: [],
    scope: 'kyc_onboarding',
    merchantProfilesId: '99999999-9999-4999-8999-999999999999',
  } as unknown as UserProfile;

  it('protects merchant onboarding and bank verification endpoints with jwt auth', () => {
    const protectedEndpoints: Array<[object, string]> = [
      [MerchantProfilesController.prototype, 'uploadMerchantKYCDocuments'],
      [MerchantProfilesController.prototype, 'uploadMerchantBankDetails'],
      [MerchantProfilesController.prototype, 'uploadMerchantKycUboDetails'],
      [MerchantProfilesController.prototype, 'createMerchantPsp'],
      [MerchantProfilesController.prototype, 'uploadMerchantKycAddressDetails'],
      [BankDetailsController.prototype, 'fetchBankInfo'],
      [BankDetailsController.prototype, 'verifyAccount'],
      [MerchantKycDocumentController.prototype, 'uploadDocument'],
      [MerchantKycDocumentController.prototype, 'fetchByMerchantProfile'],
    ];

    for (const [target, methodName] of protectedEndpoints) {
      const metadata = MetadataInspector.getMethodMetadata(
        AUTHENTICATION_METADATA_KEY,
        target,
        methodName,
      ) as {strategy?: string} | Array<{strategy?: string}> | undefined;

      expect(metadata).to.not.be.undefined();

      const strategy = Array.isArray(metadata)
        ? metadata[0]?.strategy
        : metadata?.strategy;

      expect(strategy).to.equal('jwt');
    }
  });

  it('returns an onboarding accessToken with kyc_onboarding scope from merchant registration', async () => {
    const tx = {
      commit: sinon.stub().resolves(),
      rollback: sinon.stub().resolves(),
    };
    const usersRepository = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'merchant@example.com',
        phone: '9999999999',
      }),
    };
    const registrationSessionsRepository = {
      findById: sinon.stub().resolves({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        phoneVerified: true,
        emailVerified: true,
        isDeleted: false,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        roleValue: 'merchant',
        email: 'merchant@example.com',
        phoneNumber: '9999999999',
      }),
    };
    const merchantProfileRepository = {
      dataSource: {
        beginTransaction: sinon.stub().resolves(tx),
      },
      findOne: sinon
        .stub()
        .onFirstCall()
        .resolves(null)
        .onSecondCall()
        .resolves(null),
      create: sinon.stub().resolves({
        id: '99999999-9999-4999-8999-999999999999',
      }),
      updateById: sinon.stub().resolves(),
    };
    const merchantPanCardRepository = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({}),
    };
    const kycApplicationsRepository = {
      create: sinon.stub().resolves({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        currentProgress: ['merchant_kyc', 'pan_verified'],
      }),
    };
    const hasher = {
      hashPassword: sinon.stub().resolves('hashed-password'),
    };
    const rbacService = {
      assignNewUserRole: sinon.stub().resolves({success: true, data: true}),
    };
    const mediaService = {
      updateMediaUsedStatus: sinon.stub().resolves(),
    };
    const companyDataMapperService = {
      merchantPanValidation: sinon.stub().resolves(),
    };
    const jwtService = new JWTService('unit-test-secret', '7h');

    const controller = new AuthController(
      usersRepository as never,
      {} as never,
      {} as never,
      {} as never,
      registrationSessionsRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      kycApplicationsRepository as never,
      {} as never,
      {} as never,
      merchantProfileRepository as never,
      merchantPanCardRepository as never,
      hasher as never,
      {} as never,
      jwtService as never,
      rbacService as never,
      mediaService as never,
      companyDataMapperService as never,
    );

    const response = await controller.merchantRegistration({
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      companyName: 'Merchant Pvt Ltd',
      CIN: 'L12345MH2024PTC123456',
      GSTIN: '27ABCDE1234F1Z5',
      udyamRegistrationNumber: 'UDYAM-MH-12-1234567',
      dateOfIncorporation: '2024-01-01',
      cityOfIncorporation: 'Mumbai',
      stateOfIncorporation: 'Maharashtra',
      countryOfIncorporation: 'India',
      submittedPanDetails: {
        submittedMerchantName: 'Merchant Pvt Ltd',
        submittedPanNumber: 'ABCDE1234F',
      },
      extractedPanDetails: {
        extractedMerchantName: 'Merchant Pvt Ltd',
        extractedPanNumber: 'ABCDE1234F',
      },
      panCardDocumentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      merchantDealershipTypeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });

    const decoded = jwt.verify(
      response.accessToken,
      'unit-test-secret',
    ) as jwt.JwtPayload;

    expect(response.usersId).to.equal('11111111-1111-4111-8111-111111111111');
    expect(response.user).to.deepEqual({
      id: '11111111-1111-4111-8111-111111111111',
      role: 'merchant',
      merchantProfilesId: '99999999-9999-4999-8999-999999999999',
    });
    expect(response.currentProgress).to.deepEqual([
      'merchant_kyc',
      'pan_verified',
    ]);
    expect(decoded.sub).to.equal('11111111-1111-4111-8111-111111111111');
    expect(decoded.role).to.equal('merchant');
    expect(decoded.scope).to.equal('kyc_onboarding');
    expect(decoded.merchantProfilesId).to.equal(
      '99999999-9999-4999-8999-999999999999',
    );
  });

  it('returns kycStatus 1 for manual-review merchant registration', async () => {
    const tx = {
      commit: sinon.stub().resolves(),
      rollback: sinon.stub().resolves(),
    };
    const usersRepository = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'merchant@example.com',
        phone: '9999999999',
      }),
    };
    const registrationSessionsRepository = {
      findById: sinon.stub().resolves({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        phoneVerified: true,
        emailVerified: true,
        isDeleted: false,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        roleValue: 'merchant',
        email: 'merchant@example.com',
        phoneNumber: '9999999999',
      }),
    };
    const merchantProfileRepository = {
      dataSource: {
        beginTransaction: sinon.stub().resolves(tx),
      },
      findOne: sinon
        .stub()
        .onFirstCall()
        .resolves(null)
        .onSecondCall()
        .resolves(null),
      create: sinon.stub().resolves({
        id: '99999999-9999-4999-8999-999999999999',
      }),
      updateById: sinon.stub().resolves(),
    };
    const merchantPanCardRepository = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({}),
    };
    const kycApplicationsRepository = {
      create: sinon.stub().resolves({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 1,
        currentProgress: ['merchant_kyc'],
      }),
    };
    const hasher = {
      hashPassword: sinon.stub().resolves('hashed-password'),
    };
    const rbacService = {
      assignNewUserRole: sinon.stub().resolves({success: true, data: true}),
    };
    const mediaService = {
      updateMediaUsedStatus: sinon.stub().resolves(),
    };
    const companyDataMapperService = {
      merchantPanValidation: sinon.stub().resolves(),
    };
    const jwtService = new JWTService('unit-test-secret', '7h');

    const controller = new AuthController(
      usersRepository as never,
      {} as never,
      {} as never,
      {} as never,
      registrationSessionsRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      kycApplicationsRepository as never,
      {} as never,
      {} as never,
      merchantProfileRepository as never,
      merchantPanCardRepository as never,
      hasher as never,
      {} as never,
      jwtService as never,
      rbacService as never,
      mediaService as never,
      companyDataMapperService as never,
    );

    const response = await controller.merchantRegistration({
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      companyName: 'Merchant Pvt Ltd',
      CIN: 'L12345MH2024PTC123456',
      GSTIN: '27ABCDE1234F1Z5',
      udyamRegistrationNumber: 'UDYAM-MH-12-1234567',
      dateOfIncorporation: '2024-01-01',
      cityOfIncorporation: 'Mumbai',
      stateOfIncorporation: 'Maharashtra',
      countryOfIncorporation: 'India',
      humanInteraction: true,
      submittedPanDetails: {
        submittedMerchantName: 'Merchant Pvt Ltd',
        submittedPanNumber: 'ABCDE1234F',
      },
      panCardDocumentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      merchantDealershipTypeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });

    expect(response.kycStatus).to.equal(1);
    expect(response.currentProgress).to.deepEqual(['merchant_kyc']);
  });

  it('reuses an existing merchant onboarding profile instead of creating duplicates', async () => {
    const tx = {
      commit: sinon.stub().resolves(),
      rollback: sinon.stub().resolves(),
    };
    const usersRepository = {
      findOne: sinon.stub().resolves({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'merchant@example.com',
        phone: '9999999999',
      }),
      create: sinon.stub(),
    };
    const registrationSessionsRepository = {
      findById: sinon.stub().resolves({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        phoneVerified: true,
        emailVerified: true,
        isDeleted: false,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        roleValue: 'merchant',
        email: 'merchant@example.com',
        phoneNumber: '9999999999',
      }),
    };
    const merchantProfileRepository = {
      dataSource: {
        beginTransaction: sinon.stub().resolves(tx),
      },
      findOne: sinon.stub().resolves({
        id: '99999999-9999-4999-8999-999999999999',
      }),
      create: sinon.stub(),
      updateById: sinon.stub(),
    };
    const kycApplicationsRepository = {
      findOne: sinon.stub().resolves({
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        status: 1,
        currentProgress: ['merchant_kyc'],
      }),
    };
    const controller = new AuthController(
      usersRepository as never,
      {} as never,
      {} as never,
      {} as never,
      registrationSessionsRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      kycApplicationsRepository as never,
      {} as never,
      {} as never,
      merchantProfileRepository as never,
      {} as never,
      {hashPassword: sinon.stub().resolves('hashed-password')} as never,
      {} as never,
      new JWTService('unit-test-secret', '7h') as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = await controller.merchantRegistration({
      sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      companyName: 'Merchant Pvt Ltd',
      CIN: 'L12345MH2024PTC123456',
      GSTIN: '27ABCDE1234F1Z5',
      udyamRegistrationNumber: 'UDYAM-MH-12-1234567',
      dateOfIncorporation: '2024-01-01',
      cityOfIncorporation: 'Mumbai',
      stateOfIncorporation: 'Maharashtra',
      countryOfIncorporation: 'India',
      submittedPanDetails: {
        submittedMerchantName: 'Merchant Pvt Ltd',
        submittedPanNumber: 'ABCDE1234F',
      },
      panCardDocumentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      merchantDealershipTypeId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });

    expect(response.message).to.equal(
      'Merchant onboarding is already in progress',
    );
    expect(response.kycStatus).to.equal(1);
    sinon.assert.notCalled(merchantProfileRepository.create);
    sinon.assert.notCalled(usersRepository.create);
  });

  it('accepts a kyc_onboarding token on merchant KYC write endpoints', async () => {
    const interceptor = new AuthorizeInterceptor(
      async () => onboardingMerchantUser as never,
    );
    const target = Object.create(MerchantProfilesController.prototype);
    const next = sinon.stub().resolves('allowed');

    const result = await interceptor.intercept(
      {
        target,
        methodName: 'uploadMerchantKYCDocuments',
      } as InvocationContext,
      next,
    );

    expect(result).to.equal('allowed');
    sinon.assert.calledOnce(next);
  });

  it('accepts a kyc_onboarding token on bank IFSC lookup during onboarding', async () => {
    const interceptor = new AuthorizeInterceptor(
      async () => onboardingMerchantUser as never,
    );
    const target = Object.create(BankDetailsController.prototype);
    const next = sinon.stub().resolves('allowed');

    const result = await interceptor.intercept(
      {
        target,
        methodName: 'fetchBankInfo',
      } as InvocationContext,
      next,
    );

    expect(result).to.equal('allowed');
    sinon.assert.calledOnce(next);
  });

  it('rejects a kyc_onboarding token on non-KYC merchant endpoints', async () => {
    const interceptor = new AuthorizeInterceptor(
      async () => onboardingMerchantUser as never,
    );
    const target = Object.create(MerchantProfilesController.prototype);

    await expect(
      interceptor.intercept(
        {
          target,
          methodName: 'getMyMerchantProfile',
        } as InvocationContext,
        async () => 'allowed',
      ),
    ).to.be.rejectedWith(HttpErrors.Forbidden);
  });

  it('rejects merchant KYC step reads without auth or verified session', async () => {
    const controller = new MerchantProfilesController(
      {
        findOne: sinon.stub(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        fetchProfile: sinon.stub(),
      } as never,
      new JWTService('unit-test-secret', '7h') as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.getMerchantProfileKycData(
        'merchant_documents',
        merchantUser.id,
        undefined,
        {headers: {}} as never,
      ),
    ).to.be.rejectedWith(HttpErrors.Unauthorized);
  });

  it('accepts merchant KYC step reads through the verified registration session', async () => {
    const merchantProfilesRepository = {
      findOne: sinon.stub().resolves({
        id: '99999999-9999-4999-8999-999999999999',
        usersId: merchantUser.id,
        kycApplicationsId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        merchantDealershipType: {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          label: 'Dealer',
          value: 'dealer',
        },
      }),
    };
    const kycApplicationsRepository = {
      findById: sinon.stub().resolves({
        currentProgress: ['merchant_documents'],
      }),
    };
    const merchantKycDocumentService = {
      fetchForKycStepper: sinon.stub().resolves({
        documents: [{id: 'doc-1'}],
      }),
    };
    const controller = new MerchantProfilesController(
      merchantProfilesRepository as never,
      kycApplicationsRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        fetchProfile: sinon.stub().resolves({
          success: true,
          profile: {id: merchantUser.id},
        }),
      } as never,
      new JWTService('unit-test-secret', '7h') as never,
      merchantKycDocumentService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = await controller.getMerchantProfileKycData(
      'merchant_documents',
      merchantUser.id,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      {headers: {}} as never,
    );

    expect(response.success).to.equal(true);
    expect(response.data).to.deepEqual([{id: 'doc-1'}]);
    sinon.assert.calledOnce(merchantKycDocumentService.fetchForKycStepper);
  });

  it('rejects merchant KYC document reads for another user', async () => {
    const service = new MerchantKycDocumentService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.fetchByUser(
        '22222222-2222-4222-8222-222222222222',
        merchantUser.id,
      ),
    ).to.be.rejectedWith(HttpErrors.Forbidden);
  });

  it('rejects merchant document upload when body usersId targets another user', async () => {
    const service = {
      uploadDocument: sinon.stub(),
    };
    const controller = new MerchantKycDocumentController(service as never);

    await expect(
      controller.uploadDocument(merchantUser, {
        usersId: '22222222-2222-4222-8222-222222222222',
        merchantKycDocumentRequirementsId:
          '33333333-3333-4333-8333-333333333333',
        documentsFileId: '44444444-4444-4444-8444-444444444444',
        mode: 1,
        status: 0,
      }),
    ).to.be.rejectedWith(HttpErrors.Forbidden);
  });

  it('rejects bank verification when body usersId targets another user', async () => {
    const bankDetailsService = {
      verifyWithPerfios: sinon.stub(),
      extractBankInfo: sinon.stub(),
    };
    const controller = new BankDetailsController(
      {} as never,
      bankDetailsService as never,
    );

    await expect(
      controller.verifyAccount(merchantUser, {
        accountNumber: '1234567890',
        ifscCode: 'HDFC0000001',
        accountHolderName: 'Merchant Pvt Ltd',
        usersId: '22222222-2222-4222-8222-222222222222',
      }),
    ).to.be.rejectedWith(HttpErrors.Forbidden);
  });

  it('uses the authenticated user during bank verification', async () => {
    const bankDetailsService = {
      verifyWithPerfios: sinon.stub().resolves({success: true}),
      extractBankInfo: sinon.stub(),
    };
    const controller = new BankDetailsController(
      {} as never,
      bankDetailsService as never,
    );

    await controller.verifyAccount(merchantUser, {
      accountNumber: '1234567890',
      ifscCode: 'HDFC0000001',
      accountHolderName: 'Merchant Pvt Ltd',
    });

    sinon.assert.calledWithMatch(
      bankDetailsService.verifyWithPerfios,
      sinon.match({
        usersId: merchantUser.id,
        roleValue: 'merchant',
      }),
    );
  });

  it('temporarily bypasses bank verification outcome while keeping ownership checks', async () => {
    const bankDetailsRepository = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().callsFake(async payload => payload),
    };
    const mediaService = {
      updateMediaUsedStatus: sinon.stub().resolves(),
    };
    const perfiosService = {
      verifyBankAccount: sinon.stub().resolves({
        result: {
          data: {
            source: [{isValid: false}],
          },
          comparisionData: {
            inputVsSource: {
              validity: 'INVALID',
            },
          },
        },
      }),
    };
    const service = new BankDetailsService(
      bankDetailsRepository as never,
      mediaService as never,
      perfiosService as never,
    );

    sinon.stub(service, 'extractBankInfo').resolves({
      bankName: 'HDFC',
      branchName: 'Mumbai',
      bankShortCode: 'HDFC',
      ifscCode: 'HDFC0000001',
      bankAddress: 'Mumbai',
    });

    const result = await service.verifyWithPerfios({
      accountNumber: '1234567890',
      ifscCode: 'HDFC0000001',
      accountHolderName: 'Merchant Pvt Ltd',
      usersId: merchantUser.id,
      roleValue: 'merchant',
    });

    expect(result.success).to.equal(true);
    sinon.assert.calledWithMatch(
      bankDetailsRepository.create,
      sinon.match({
        usersId: merchantUser.id,
        status: 1,
      }),
    );
  });

  it('scopes merchant bank-account reads by owner', async () => {
    const bankDetailsRepository = {
      findOne: sinon.stub().resolves(null),
    };
    const service = new BankDetailsService(
      bankDetailsRepository as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.fetchUserBankAccount('55555555-5555-4555-8555-555555555555', {
        usersId: merchantUser.id,
        roleValue: 'merchant',
      }),
    ).to.be.rejectedWith(HttpErrors.NotFound);

    sinon.assert.calledWithMatch(
      bankDetailsRepository.findOne,
      sinon.match({
        where: {
          and: sinon.match.array.deepEquals([
            {id: '55555555-5555-4555-8555-555555555555'},
            {isActive: true},
            {isDeleted: false},
            {usersId: merchantUser.id},
            {roleValue: 'merchant'},
          ]),
        },
      }),
    );
  });

  it('scopes merchant UBO updates by owner', async () => {
    const uboDetailsRepository = {
      findOne: sinon.stub().resolves(null),
    };
    const service = new UboDetailsService(
      uboDetailsRepository as never,
      {} as never,
    );

    await expect(
      service.updateUboDetail(
        '66666666-6666-4666-8666-666666666666',
        {fullName: 'Updated UBO'},
        {},
        {
          usersId: merchantUser.id,
          identifierId: '77777777-7777-4777-8777-777777777777',
          roleValue: 'merchant',
        },
      ),
    ).to.be.rejectedWith(HttpErrors.NotFound);

    sinon.assert.calledWithMatch(
      uboDetailsRepository.findOne,
      sinon.match({
        where: {
          and: sinon.match.array.deepEquals([
            {id: '66666666-6666-4666-8666-666666666666'},
            {isActive: true},
            {isDeleted: false},
            {usersId: merchantUser.id},
            {identifierId: '77777777-7777-4777-8777-777777777777'},
            {roleValue: 'merchant'},
          ]),
        },
      }),
    );
  });

  it('encrypts stored PSP credentials and masks them in responses', async () => {
    process.env.PSP_SECRET_ENCRYPTION_KEY = 'unit-test-psp-secret-key';

    const createdRecords: Array<Record<string, unknown>> = [];
    const pspRepository = {
      find: sinon.stub().resolves([]),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().callsFake(async payload => {
        createdRecords.push(payload);
        return {
          id: '88888888-8888-4888-8888-888888888888',
          ...payload,
        };
      }),
      findById: sinon.stub().callsFake(async (id: string) => ({
        id,
        usersId: merchantUser.id,
        merchantProfilesId: '99999999-9999-4999-8999-999999999999',
        pspMasterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        settlementAccount: 'Primary',
        merchantId: 'merchant-live',
        apiKey: createdRecords[0].apiKey,
        apiSecret: createdRecords[0].apiSecret,
        webhookSecret: createdRecords[0].webhookSecret,
        publishableKey: createdRecords[0].publishableKey,
        status: 0,
        mode: 1,
        isActive: true,
        isDeleted: false,
        transactions: [],
        pspMaster: {
          value: 'razorpay',
          pspMasterFields: [],
        },
      })),
    };
    const pspMasterRepository = {
      findById: sinon.stub().resolves({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        value: 'razorpay',
      }),
    };
    const pspMasterFieldsRepository = {
      find: sinon.stub().resolves([]),
    };
    const service = new PspService(
      pspRepository as never,
      pspMasterRepository as never,
      pspMasterFieldsRepository as never,
    );

    const result = await service.upsertMerchantPsp(
      '99999999-9999-4999-8999-999999999999',
      merchantUser.id,
      {
        pspMasterId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        settlementAccount: 'Primary',
        merchantId: 'merchant-live',
        apiKey: 'rzp_test_1234',
        apiSecret: 'secret_9876',
        webhookSecret: 'hook_1111',
        publishableKey: 'pub_2222',
      },
      undefined,
      {},
    );

    expect(String(createdRecords[0].apiKey)).to.match(/^enc:v1:/);
    expect(String(createdRecords[0].apiSecret)).to.match(/^enc:v1:/);
    expect(result.psp.apiKey).to.equal('****1234');
    expect(result.psp.apiSecret).to.equal('****9876');
    expect(result.psp.webhookSecret).to.equal('****1111');
    expect(result.psp.publishableKey).to.equal('****2222');
    expect(result.psp).to.not.have.property('usersId');
    expect(result.psp).to.not.have.property('merchantProfilesId');
  });

  it('ignores merchant-supplied maxAllowedDailyCap and keeps the platform cap at 10 lakh', async () => {
    const merchantPayoutConfigRepository = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().callsFake(async payload => payload),
    };
    const service = new MerchantPayoutService(
      merchantPayoutConfigRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.upsertConfigForMerchant(
      '99999999-9999-4999-8999-999999999999',
      merchantUser.id,
      {
        maxAllowedDailyCap: 2500000,
        selectedDailyCap: 750000,
      },
      new Date('2026-04-22T10:00:00.000Z'),
    );

    expect(result.maxAllowedDailyCap).to.equal(1000000);
    expect(result.selectedDailyCap).to.equal(750000);
  });

  it('rejects negative selectedDailyCap instead of widening it to the platform max', async () => {
    const merchantPayoutConfigRepository = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub(),
    };
    const service = new MerchantPayoutService(
      merchantPayoutConfigRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.upsertConfigForMerchant(
        '99999999-9999-4999-8999-999999999999',
        merchantUser.id,
        {
          selectedDailyCap: -1,
        },
        new Date('2026-04-22T10:00:00.000Z'),
      ),
    ).to.be.rejectedWith('selectedDailyCap cannot be negative');
  });

  it('updates the existing merchant KYC bank account on patch instead of creating a duplicate account-number record', async () => {
    const tx = {
      commit: sinon.stub().resolves(),
      rollback: sinon.stub().resolves(),
    };
    const bankDetailsService = {
      updateBankAccountInfo: sinon.stub().resolves({
        success: true,
        message: 'Bank Account Updated',
        account: {id: 'acc-1'},
      }),
    };
    const controller = new MerchantProfilesController(
      {
        dataSource: {
          beginTransaction: sinon.stub().resolves(tx),
        },
        findOne: sinon.stub().resolves({
          id: '99999999-9999-4999-8999-999999999999',
          usersId: merchantUser.id,
          kycApplicationsId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        }),
      } as never,
      {
        findById: sinon.stub().resolves({
          currentProgress: [],
        }),
        updateById: sinon.stub().resolves(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: sinon.stub().resolves({
          id: 'acc-1',
          usersId: merchantUser.id,
          roleValue: 'merchant',
        }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new JWTService('unit-test-secret', '7h') as never,
      {} as never,
      bankDetailsService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const response = await controller.patchMerchantKycBankDetails(
      merchantUser,
      {
        bankDetails: {
          bankName: 'State Bank of India',
          bankShortCode: 'SBI',
          ifscCode: 'SBIN0016324',
          branchName: 'Pune',
          bankAddress: 'Pune',
          accountType: 1,
          accountHolderName: 'Merchant Pvt Ltd',
          accountNumber: '123456789012',
          bankAccountProofType: 1,
          bankAccountProofId: 'proof-1',
        },
      },
    );

    expect(response.currentProgress).to.deepEqual(['merchant_bank_details']);
    sinon.assert.calledOnce(bankDetailsService.updateBankAccountInfo);
  });
});
