import {authenticate, AuthenticationBindings} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {get, HttpErrors, post, requestBody} from '@loopback/rest';
import {securityId, UserProfile} from '@loopback/security';
import _ from 'lodash';
import {authorize} from '../authorization';
import {CompanyPanCardsRepository, CompanyProfilesRepository, InvestorPanCardsRepository, InvestorProfileRepository, KycApplicationsRepository, OtpRepository, RegistrationSessionsRepository, RolesRepository, TrusteePanCardsRepository, TrusteeProfilesRepository, UserRolesRepository, UsersRepository} from '../repositories';
import {BcryptHasher} from '../services/hash.password.bcrypt';
import {JWTService} from '../services/jwt-service';
import {MediaService} from '../services/media.service';
import {RbacService} from '../services/rbac.service';
import {MyUserService} from '../services/user-service';

export class AuthController {
  constructor(
    @repository(UsersRepository)
    public usersRepository: UsersRepository,
    @repository(RolesRepository)
    private rolesRepository: RolesRepository,
    @repository(UserRolesRepository)
    private userRolesRepository: UserRolesRepository,
    @repository(OtpRepository)
    private otpRepository: OtpRepository,
    @repository(RegistrationSessionsRepository)
    private registrationSessionsRepository: RegistrationSessionsRepository,
    @repository(CompanyProfilesRepository)
    private companyProfilesRepository: CompanyProfilesRepository,
    @repository(CompanyPanCardsRepository)
    private companyPanCardsRepository: CompanyPanCardsRepository,
    @repository(TrusteeProfilesRepository)
    private trusteeProfilesRepository: TrusteeProfilesRepository,
    @repository(TrusteePanCardsRepository)
    private trusteePanCardsRepository: TrusteePanCardsRepository,
    @repository(KycApplicationsRepository)
    private kycApplicationsRepository: KycApplicationsRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(InvestorPanCardsRepository)
    private investorPanCardsRepository: InvestorPanCardsRepository,
    @inject('service.hasher')
    private hasher: BcryptHasher,
    @inject('service.user.service')
    public userService: MyUserService,
    @inject('service.jwt.service')
    public jwtService: JWTService,
    @inject('services.rbac')
    public rbacService: RbacService,
    @inject('service.media.service')
    private mediaService: MediaService
  ) { }

  // ---------------------------------------Super Admin Auth API's------------------------------------
  @post('/auth/super-admin')
  async createSuperAdmin(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'phone', 'password', 'fullName'],
            properties: {
              email: {type: 'string'},
              phone: {type: 'string'},
              password: {type: 'string'},
              fullName: {type: 'string'},
            },
          },
        },
      },
    })
    body: {
      fullName: string;
      email: string;
      phone: string;
      password: string
    },
  ): Promise<{success: boolean; message: string; userId: string}> {
    const superadminRole = await this.rolesRepository.findOne({
      where: {value: 'super_admin'},
    });

    if (!superadminRole) {
      throw new HttpErrors.BadRequest(
        'Superadmin role does not exist in roles table',
      );
    }

    const existingSuperadmin = await this.userRolesRepository.findOne({
      where: {rolesId: superadminRole.id},
    });

    if (existingSuperadmin) {
      throw new HttpErrors.BadRequest('Super Admin already exists');
    }

    const existUser = await this.usersRepository.findOne({
      where: {email: body.email},
    });

    if (existUser) {
      throw new HttpErrors.BadRequest('User already exists with this email');
    }

    const hashedPassword = await this.hasher.hashPassword(body.password);

    const newUser = await this.usersRepository.create({
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      password: hashedPassword,
      isActive: true,
    });

    await this.userRolesRepository.create({
      usersId: newUser.id!,
      rolesId: superadminRole.id!,
    });

    return {
      success: true,
      message: 'Super Admin created successfully',
      userId: newUser.id,
    };
  }

  @post('/auth/super-admin-login')
  async superAdminLogin(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password', 'rememberMe'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
              rememberMe: {type: 'boolean'}
            }
          }
        }
      }
    })
    body: {email: string; password: string; rememberMe: boolean}
  ): Promise<{success: boolean; message: string; accessToken: string; user: object}> {
    const userData = await this.usersRepository.findOne({
      where: {
        and: [
          {email: body.email},
          {isDeleted: false}
        ]
      }
    });

    if (!userData) {
      throw new HttpErrors.BadRequest('User not exist');
    }

    const user = await this.userService.verifyCredentials(body);

    const {roles, permissions} = await this.rbacService.getUserRoleAndPermissionsByRole(user.id!, 'super_admin');

    if (!roles.includes('super_admin')) {
      throw new HttpErrors.Forbidden('Access denied. Only super_admin can login here.');
    }

    const userProfile: UserProfile & {
      roles: string[];
      permissions: string[];
      phone: string;
    } = {
      [securityId]: user.id!,
      id: user.id!,
      email: user.email,
      phone: user.phone,
      roles,
      permissions,
    };

    const token = await this.jwtService.generateToken(userProfile);
    const profile = await this.rbacService.returnSuperAdminProfile(user.id, roles, permissions);
    return {
      success: true,
      message: "Super Admin login successful",
      accessToken: token,
      user: profile
    };
  }

  // --------------------------------------------Comman Auth API's-------------------------------------
  @authenticate('jwt')
  @authorize({roles: ['super_admin', 'company', 'trustee']})
  @post('/auth/update-password')
  async updatePassword(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['oldPassword', 'newPassword'],
            properties: {
              oldPassword: {type: 'string'},
              newPassword: {type: 'string'}
            }
          }
        }
      }
    })
    body: {
      oldPassword: string;
      newPassword: string;
    }
  ): Promise<{success: boolean; message: string}> {
    const user = await this.usersRepository.findById(currentUser.id);

    if (!user) {
      throw new HttpErrors.NotFound('No user found with given credentials');
    }

    const oldHashedPassword = user.password;
    const isValidPassword = await this.hasher.comparePassword(body.oldPassword, oldHashedPassword!);

    if (!isValidPassword) {
      throw new HttpErrors.BadRequest('Invalid old password');
    }

    const hashedPassword = await this.hasher.hashPassword(body.newPassword);

    await this.usersRepository.updateById(user.id, {password: hashedPassword});

    return {
      success: true,
      message: "Password updated successfully"
    }
  }

  @authenticate('jwt')
  @get('/auth/me')
  async whoAmI(
    @inject(AuthenticationBindings.CURRENT_USER) currentUser: UserProfile,
  ) {
    const user = await this.usersRepository.findById(currentUser.id);

    const companyProfile = await this.companyProfilesRepository.findOne({
      where: {usersId: currentUser.id},
      fields: {isBusinessKycComplete: true},
    });

    const userData = _.omit(user, ['password']);

    return {
      ...userData,
      roles: currentUser?.roles,
      permissions: currentUser?.permissions || [],
      isBusinessKycComplete:
        companyProfile?.isBusinessKycComplete ?? false,
    };
  }


  // -----------------------------------------registration verification Otp's---------------------------
  @post('/auth/send-phone-otp')
  async sendPhoneOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['phone', 'role'],
            properties: {
              phone: {type: 'string'},
              role: {type: 'string'}
            }
          }
        }
      }
    })
    body: {
      phone: string;
      role: string;
    }
  ): Promise<{success: boolean; message: string; sessionId: string}> {

    const user = await this.usersRepository.findOne({
      where: {phone: body.phone}
    });

    const role = await this.rolesRepository.findOne({
      where: {value: body.role}
    });

    if (!role) {
      if (process.env.NODE_ENV === 'dev') {
        throw new HttpErrors.BadRequest("Invalid role received");
      }
      throw new HttpErrors.InternalServerError("Something went wrong");
    }

    if (user) {
      const isUserRole = await this.userRolesRepository.findOne({
        where: {usersId: user.id, rolesId: role.id}
      });

      const kycApplication = await this.kycApplicationsRepository.findOne({
        where: {usersId: user.id, roleValue: role.value, isActive: true, isDeleted: false, status: 0}
      });

      if (isUserRole && !kycApplication) {
        throw new HttpErrors.BadRequest(
          `Phone number is already registered as ${role.label}`
        );
      }
    }

    await this.otpRepository.updateAll(
      {isUsed: true, expiresAt: new Date()},
      {identifier: body.phone, type: 0}
    );

    const otp = await this.otpRepository.create({
      otp: '1234',
      type: 0,
      identifier: body.phone,
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    });

    if (!otp) {
      throw new HttpErrors.InternalServerError(
        process.env.NODE_ENV === 'dev'
          ? "Failed to create otp"
          : "Something went wrong"
      );
    }

    const existingSession = await this.registrationSessionsRepository.findOne({
      where: {
        and: [
          {phoneNumber: body.phone},
          {roleValue: body.role},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (existingSession) {
      await this.registrationSessionsRepository.updateById(existingSession.id, {
        phoneVerified: false,
        emailVerified: false,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
      });

      return {
        success: true,
        message: "OTP sent successfully",
        sessionId: existingSession.id,
      };
    }

    const session = await this.registrationSessionsRepository.create({
      phoneNumber: body.phone,
      phoneVerified: false,
      emailVerified: false,
      roleValue: body.role,
      isActive: true,
      isDeleted: false,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min expiry
    });

    if (!session) {
      throw new HttpErrors.InternalServerError(
        process.env.NODE_ENV === 'dev'
          ? "Failed to create registration session"
          : "Something went wrong"
      );
    }

    return {
      success: true,
      message: "OTP sent successfully",
      sessionId: session.id,
    };
  }

  @post('/auth/verify-phone-otp')
  async verifyPhoneOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['sessionId', 'otp'],
            properties: {
              sessionId: {type: 'string'},
              otp: {type: 'string'},
            },
          },
        },
      },
    })
    body: {sessionId: string; otp: string},
  ): Promise<{success: boolean; message: string}> {
    const {sessionId, otp} = body;

    const session = await this.registrationSessionsRepository.findById(
      sessionId,
    );

    if (!session) {
      throw new HttpErrors.BadRequest('Invalid session');
    }

    if (new Date(session.expiresAt) < new Date()) {
      throw new HttpErrors.BadRequest('Session expired, please restart signup');
    }

    if (!session.phoneNumber) {
      throw new HttpErrors.BadRequest('Phone number missing in session');
    }

    const otpEntry = await this.otpRepository.findOne({
      where: {
        identifier: session.phoneNumber,
        type: 0,
        isUsed: false,
      },
      order: ['createdAt DESC'],
    });

    if (!otpEntry) {
      throw new HttpErrors.BadRequest('OTP expired or not found');
    }

    if (otpEntry.attempts >= 3) {
      throw new HttpErrors.BadRequest(
        'Maximum attempts reached, please request a new OTP',
      );
    }

    if (new Date(otpEntry.expiresAt) < new Date()) {
      await this.otpRepository.updateById(otpEntry.id, {
        isUsed: true,
        expiresAt: new Date(),
      });

      throw new HttpErrors.BadRequest('OTP expired, request a new one');
    }

    if (otpEntry.otp !== otp) {
      await this.otpRepository.updateById(otpEntry.id, {
        attempts: otpEntry.attempts + 1,
      });

      throw new HttpErrors.BadRequest('Invalid OTP');
    }

    await this.otpRepository.updateById(otpEntry.id, {
      isUsed: true,
      expiresAt: new Date(),
    });

    await this.registrationSessionsRepository.updateById(sessionId, {
      phoneVerified: true,
    });

    return {
      success: true,
      message: 'Phone number verified successfully',
    };
  }

  @post('/auth/send-email-otp')
  async sendEmailOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['sessionId', 'email'],
            properties: {
              sessionId: {type: 'string'},
              email: {type: 'string'},
            }
          }
        }
      }
    })
    body: {
      sessionId: string;
      email: string;
    }
  ): Promise<{success: boolean; message: string}> {

    const session = await this.registrationSessionsRepository.findById(
      body.sessionId,
    );

    if (!session) {
      throw new HttpErrors.BadRequest('Invalid session');
    }

    if (new Date(session.expiresAt) < new Date()) {
      throw new HttpErrors.BadRequest('Session expired, please restart signup');
    }

    if (!session.phoneVerified) {
      throw new HttpErrors.BadRequest('Phone number is not verified');
    }

    const user = await this.usersRepository.findOne({
      where: {email: body.email}
    });

    const role = await this.rolesRepository.findOne({
      where: {value: session.roleValue}
    });

    if (!role) {
      if (process.env.NODE_ENV === 'dev') {
        throw new HttpErrors.BadRequest("Invalid role received");
      }
      throw new HttpErrors.InternalServerError("Something went wrong");
    }

    if (user) {
      if (session.phoneNumber !== user.phone) {
        throw new HttpErrors.BadRequest(
          `Email is already registered with another user`
        );
      }

      const kycApplication = await this.kycApplicationsRepository.findOne({
        where: {usersId: user.id, roleValue: role.value, isActive: true, isDeleted: false, status: 0}
      });

      const isUserRole = await this.userRolesRepository.findOne({
        where: {usersId: user.id, rolesId: role.id}
      });

      if (isUserRole && !kycApplication) {
        throw new HttpErrors.BadRequest(
          `Email is already registered as ${role.label}`
        );
      }

    }

    const existingPhoneUser = await this.usersRepository.findOne({
      where: {
        and: [
          {phone: session.phoneNumber},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (existingPhoneUser && (existingPhoneUser.email !== body.email)) {
      throw new HttpErrors.BadRequest(
        `Phone is already registered with another email`
      );
    }

    await this.otpRepository.updateAll(
      {isUsed: true, expiresAt: new Date()},
      {identifier: body.email, type: 1}
    );

    const otp = await this.otpRepository.create({
      otp: '4321',
      type: 1,
      identifier: body.email,
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    });

    if (!otp) {
      throw new HttpErrors.InternalServerError(
        process.env.NODE_ENV === 'dev'
          ? "Failed to create otp"
          : "Something went wrong"
      );
    }

    await this.registrationSessionsRepository.updateById(body.sessionId, {
      email: body.email,
      emailVerified: false,
    });

    return {
      success: true,
      message: "OTP sent successfully",
    };
  }

  @post('/auth/verify-email-otp')
  async verifyEmailOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['sessionId', 'otp'],
            properties: {
              sessionId: {type: 'string'},
              otp: {type: 'string'},
            },
          },
        },
      },
    })
    body: {sessionId: string; otp: string; isAlreadyRegistered: boolean; kycStatus: number | null},
  ): Promise<{success: boolean; message: string}> {
    const {sessionId, otp} = body;

    const session = await this.registrationSessionsRepository.findById(
      sessionId,
    );

    if (!session) {
      throw new HttpErrors.BadRequest('Invalid session');
    }

    if (new Date(session.expiresAt) < new Date()) {
      throw new HttpErrors.BadRequest('Session expired, please restart signup');
    }

    if (!session.email) {
      throw new HttpErrors.BadRequest('Email missing in session');
    }

    const otpEntry = await this.otpRepository.findOne({
      where: {
        identifier: session.email,
        type: 1,
        isUsed: false,
      },
      order: ['createdAt DESC'],
    });

    if (!otpEntry) {
      throw new HttpErrors.BadRequest('OTP expired or not found');
    }

    if (otpEntry.attempts >= 3) {
      throw new HttpErrors.BadRequest(
        'Maximum attempts reached, please request a new OTP',
      );
    }

    if (new Date(otpEntry.expiresAt) < new Date()) {
      await this.otpRepository.updateById(otpEntry.id, {
        isUsed: true,
        expiresAt: new Date(),
      });

      throw new HttpErrors.BadRequest('OTP expired, request a new one');
    }

    if (otpEntry.otp !== otp) {
      await this.otpRepository.updateById(otpEntry.id, {
        attempts: otpEntry.attempts + 1,
      });

      throw new HttpErrors.BadRequest('Invalid OTP');
    }

    await this.otpRepository.updateById(otpEntry.id, {
      isUsed: true,
      expiresAt: new Date(),
    });

    await this.registrationSessionsRepository.updateById(sessionId, {
      emailVerified: true,
    });

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  // -----------------------------------------registration verification Otp's---------------------------
  @post('/auth/forget-password/send-email-otp')
  async sendForgetPasswordEmailOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'role'],
            properties: {
              email: {type: 'string'},
              role: {type: 'string'},
            }
          }
        }
      }
    })
    body: {
      email: string;
      role: string;
    }
  ): Promise<{success: boolean; message: string}> {
    const user = await this.usersRepository.findOne({
      where: {
        and: [
          {email: body.email},
          {isDeleted: false}
        ]
      }
    });

    if (!user) {
      throw new HttpErrors.NotFound("User doesn't exist");
    }

    if (user && !user.isActive) {
      throw new HttpErrors.BadRequest("User is not active");
    }

    const role = await this.rolesRepository.findOne({
      where: {value: body.role}
    });

    if (!role) {
      throw new HttpErrors.BadRequest('Role not found');
    }

    const isUserRole = await this.userRolesRepository.findOne({
      where: {usersId: user.id, rolesId: role.id}
    });

    if (!isUserRole) {
      throw new HttpErrors.Unauthorized('Unauthorized access');
    }

    await this.otpRepository.updateAll(
      {isUsed: true, expiresAt: new Date()},
      {identifier: body.email, type: 1}
    );

    const otp = await this.otpRepository.create({
      otp: '3421',
      type: 1,
      identifier: body.email,
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    });

    if (!otp) {
      throw new HttpErrors.InternalServerError(
        process.env.NODE_ENV === 'dev'
          ? "Failed to create otp"
          : "Something went wrong"
      );
    }

    return {
      success: true,
      message: "OTP sent successfully",
    };
  }

  @post('/auth/forget-password/verify-email-otp')
  async verifyForgetPasswordEmailOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'role', 'otp', 'newPassword'],
            properties: {
              email: {type: 'string'},
              otp: {type: 'string'},
              role: {type: 'string'},
              newPassword: {type: 'string'},
            }
          }
        }
      }
    })
    body: {
      email: string;
      otp: string;
      role: string;
      newPassword: string;
    }
  ): Promise<{success: boolean; message: string}> {
    const user = await this.usersRepository.findOne({
      where: {
        and: [
          {email: body.email},
          {isDeleted: false}
        ]
      }
    });

    if (!user) {
      throw new HttpErrors.NotFound("User doesn't exist");
    }

    if (user && !user.isActive) {
      throw new HttpErrors.BadRequest("User is not active");
    }

    const role = await this.rolesRepository.findOne({
      where: {value: body.role}
    });

    if (!role) {
      throw new HttpErrors.BadRequest('Role not found');
    }

    const isUserRole = await this.userRolesRepository.findOne({
      where: {usersId: user.id, rolesId: role.id}
    });

    if (!isUserRole) {
      throw new HttpErrors.Unauthorized('Unauthorized access');
    }

    const otpEntry = await this.otpRepository.findOne({
      where: {
        identifier: body.email,
        type: 1,
        isUsed: false,
      },
      order: ['createdAt DESC'],
    });

    if (!otpEntry) {
      throw new HttpErrors.BadRequest('OTP expired or not found');
    }

    if (otpEntry.attempts >= 3) {
      throw new HttpErrors.BadRequest(
        'Maximum attempts reached, please request a new OTP',
      );
    }

    if (new Date(otpEntry.expiresAt) < new Date()) {
      await this.otpRepository.updateById(otpEntry.id, {
        isUsed: true,
        expiresAt: new Date(),
      });

      throw new HttpErrors.BadRequest('OTP expired, request a new one');
    }

    if (otpEntry.otp !== body.otp) {
      await this.otpRepository.updateById(otpEntry.id, {
        attempts: otpEntry.attempts + 1,
      });

      throw new HttpErrors.BadRequest('Invalid OTP');
    }

    await this.otpRepository.updateById(otpEntry.id, {
      isUsed: true,
      expiresAt: new Date(),
    });

    const hashedPassword = await this.hasher.hashPassword(body.newPassword);

    await this.usersRepository.updateById(user.id, {password: hashedPassword});

    return {
      success: true,
      message: 'Password updated'
    }
  }

  // ------------------------------------------Company Registration API's------------------------------
  @post('/auth/company-registration')
  async companyRegistration(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'sessionId',
              // 'password',
              'companyName',
              'CIN',
              'GSTIN',
              'udyamRegistrationNumber',
              'dateOfIncorporation',
              'cityOfIncorporation',
              'stateOfIncorporation',
              'countryOfIncorporation',
              'submittedPanDetails',
              'panCardDocumentId',
              'companyEntityTypeId',
              'companySectorTypeId'
            ],
            properties: {
              sessionId: {
                type: 'string',
                description: 'Registration session id'
              },
              // password: {type: 'string'},
              companyName: {type: 'string'},
              CIN: {
                type: 'string',
                pattern: '^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'
              },
              GSTIN: {
                type: 'string',
                minLength: 15,
                maxLength: 15
              },
              udyamRegistrationNumber: {
                type: 'string'
              },
              dateOfIncorporation: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              cityOfIncorporation: {type: 'string'},
              stateOfIncorporation: {type: 'string'},
              countryOfIncorporation: {type: 'string'},
              humanInteraction: {
                type: 'boolean',
                default: false
              },
              extractedPanDetails: {
                type: 'object',
                required: [],
                properties: {
                  extractedCompanyName: {type: 'string'},
                  extractedPanNumber: {
                    type: 'string',
                    pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
                  }
                }
              },
              submittedPanDetails: {
                type: 'object',
                required: ['submittedCompanyName', 'submittedPanNumber'],
                properties: {
                  submittedCompanyName: {type: 'string'},
                  submittedPanNumber: {
                    type: 'string',
                    pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
                  }
                }
              },
              panCardDocumentId: {
                type: 'string',
                description: 'Media ID of uploaded PAN card'
              },
              companySectorTypeId: {type: 'string'},
              companyEntityTypeId: {type: 'string'},
            }
          }
        }
      }
    })
    body: {
      sessionId: string;
      // password: string;
      companyName: string;
      CIN: string;
      GSTIN: string;
      udyamRegistrationNumber: string;
      dateOfIncorporation: string; // yyyy-mm-dd
      cityOfIncorporation: string;
      stateOfIncorporation: string;
      countryOfIncorporation: string;
      humanInteraction?: boolean;
      extractedPanDetails?: {
        extractedCompanyName?: string;
        extractedPanNumber?: string;
      };
      submittedPanDetails: {
        submittedCompanyName: string;
        submittedPanNumber: string;
      };
      panCardDocumentId: string;
      companySectorTypeId: string;
      companyEntityTypeId: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    kycStatus: number;
    currentProgress: string[];
    usersId: string;
  }> {
    const tx = await this.companyProfilesRepository.dataSource.beginTransaction({
      isolationLevel: 'READ COMMITTED',
    });
    console.log('body', body);
    try {
      // ----------------------------
      //  Validate Registration Session
      // ----------------------------
      const registrationSession = await this.registrationSessionsRepository.findById(
        body.sessionId,
        undefined,
        {transaction: tx}
      );

      if (
        !registrationSession ||
        !registrationSession.phoneVerified ||
        !registrationSession.emailVerified ||
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        registrationSession.isDeleted ||
        new Date(registrationSession.expiresAt) < new Date()
      ) {
        throw new HttpErrors.BadRequest('Session is not valid');
      }

      // ----------------------------
      //  Validate CIN & GSTIN
      // ----------------------------
      const companyWithCIN = await this.companyProfilesRepository.findOne(
        {where: {CIN: body.CIN, isDeleted: false}},
        {transaction: tx}
      );
      if (companyWithCIN) throw new HttpErrors.BadRequest('CIN already registered');

      const companyWithGSTIN = await this.companyProfilesRepository.findOne(
        {where: {GSTIN: body.GSTIN, isDeleted: false}},
        {transaction: tx}
      );
      if (companyWithGSTIN)
        throw new HttpErrors.BadRequest('GSTIN already registered');

      // ----------------------------
      //  Create User
      // ----------------------------
      const hashedPassword = await this.hasher.hashPassword("Company@123");

      let newUserProfile = await this.usersRepository.findOne({
        where: {
          and: [
            {email: registrationSession.email},
            {phone: registrationSession.phoneNumber},
            {isActive: true},
            {isDeleted: false}
          ]
        }
      });

      if (!newUserProfile) {
        newUserProfile = await this.usersRepository.create(
          {
            phone: registrationSession.phoneNumber,
            email: registrationSession.email,
            password: hashedPassword,
            isActive: true,
            isDeleted: false,
          },
          {transaction: tx}
        );
      }
      // ----------------------------
      //  Create Company Profile
      // ----------------------------
      const newCompanyProfile = await this.companyProfilesRepository.create(
        {
          usersId: newUserProfile.id,
          companyName: body.companyName,
          CIN: body.CIN,
          GSTIN: body.GSTIN,
          dateOfIncorporation: body.dateOfIncorporation,
          cityOfIncorporation: body.cityOfIncorporation,
          stateOfIncorporation: body.stateOfIncorporation,
          countryOfIncorporation: body.countryOfIncorporation,
          udyamRegistrationNumber: body.udyamRegistrationNumber,
          companyEntityTypeId: body.companyEntityTypeId,
          companySectorTypeId: body.companySectorTypeId,
          isActive: false,
          isDeleted: false,
        },
        {transaction: tx}
      );

      // ----------------------------
      //  Check PAN duplicate
      // ----------------------------
      const isPanExist = await this.companyPanCardsRepository.findOne(
        {
          where: {
            and: [
              {submittedPanNumber: body.submittedPanDetails.submittedPanNumber},
              {isDeleted: false},
              {status: 1},
            ],
          },
        },
        {transaction: tx}
      );

      if (isPanExist)
        throw new HttpErrors.BadRequest('Pan already exists with another company');

      // ----------------------------
      //  Prepare PAN Data
      // ----------------------------
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyPanData: any = {
        submittedCompanyName: body.submittedPanDetails.submittedCompanyName,
        submittedPanNumber: body.submittedPanDetails.submittedPanNumber,
        extractedCompanyName: body.extractedPanDetails?.extractedCompanyName,
        extractedPanNumber: body.extractedPanDetails?.extractedPanNumber,
        panCardDocumentId: body.panCardDocumentId,
        mode: body.humanInteraction ? 1 : 0,
        status: 0,
        isActive: false,
        isDeleted: false,
        companyProfilesId: newCompanyProfile.id,
      };

      // ----------------------------
      //  Human Interaction Required
      // ----------------------------
      if (body.humanInteraction) {
        await this.companyPanCardsRepository.create(companyPanData, {
          transaction: tx,
        });

        const newApplication = await this.kycApplicationsRepository.create(
          {
            roleValue: registrationSession.roleValue,
            usersId: newUserProfile.id,
            status: 1,
            humanInteraction: true,
            mode: 0,
            isActive: true,
            isDeleted: false,
            currentProgress: ['company_kyc'],
            identifierId: newCompanyProfile.id
          },
          {transaction: tx}
        );

        await this.mediaService.updateMediaUsedStatus([body.panCardDocumentId], true);
        const result = await this.rbacService.assignNewUserRole(newUserProfile.id, 'company');
        if (!result.success || !result.data) {
          if (process.env.NODE_ENV === 'dev') {
            throw new HttpErrors.InternalServerError('Error while assigning role to user');
          } else {
            throw new HttpErrors.InternalServerError('Internal server error');
          }
        }

        await this.companyProfilesRepository.updateById(newCompanyProfile.id, {kycApplicationsId: newApplication.id}, {transaction: tx})
        await tx.commit();

        return {
          success: true,
          message: 'Registration completed',
          kycStatus: 0,
          currentProgress: newApplication.currentProgress ?? ['company_kyc'],
          usersId: newUserProfile.id
        };
      }

      // ----------------------------
      //  Auto verification (No Human Interaction)
      // ----------------------------
      if (
        body.submittedPanDetails.submittedCompanyName !== body.companyName
      ) {
        throw new HttpErrors.BadRequest('PAN details do not match company name');
      }

      // // Basic validation: Submitted PAN should match Extracted PAN
      // if (
      //   body.extractedPanDetails?.extractedPanNumber &&
      //   body.extractedPanDetails.extractedPanNumber !==
      //   body.submittedPanDetails.submittedPanNumber
      // ) {
      //   throw new HttpErrors.BadRequest('PAN number mismatch');
      // }

      // Auto approve PAN
      companyPanData.status = 1; // Verified
      companyPanData.isActive = true;

      await this.companyPanCardsRepository.create(companyPanData, {
        transaction: tx,
      });

      // ----------------------------
      //  Create KYC (Auto Approved PAN)
      // ----------------------------
      const newApplication = await this.kycApplicationsRepository.create(
        {
          roleValue: registrationSession.roleValue,
          usersId: newUserProfile.id,
          identifierId: newCompanyProfile.id,
          status: 0,
          humanInteraction: false,
          mode: 0,
          isActive: true,
          isDeleted: false,
          currentProgress: ['company_kyc', 'pan_verified'],
        },
        {transaction: tx}
      );

      await this.companyProfilesRepository.updateById(newCompanyProfile.id, {kycApplicationsId: newApplication.id}, {transaction: tx})
      await this.mediaService.updateMediaUsedStatus([body.panCardDocumentId], true);
      const result = await this.rbacService.assignNewUserRole(newUserProfile.id, 'company');
      if (!result.success || !result.data) {
        if (process.env.NODE_ENV === 'dev') {
          throw new HttpErrors.InternalServerError('Error while assigning role to user');
        } else {
          throw new HttpErrors.InternalServerError('Internal server error');
        }
      }
      console.log('result', result.data);
      await tx.commit();

      return {
        success: true,
        message: 'Registration completed',
        kycStatus: 0,
        currentProgress: newApplication.currentProgress ?? ['company_kyc', 'pan_verified'],
        usersId: newUserProfile.id
      };

    } catch (error) {
      await tx.rollback();
      console.log('error while registering new company :', error);
      throw error;
    }
  }

  @post('/auth/company-login')
  async companyLogin(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password', 'rememberMe'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
              rememberMe: {type: 'boolean'},
            }
          }
        }
      }
    })
    body: {email: string; password: string; rememberMe: boolean}
  ): Promise<{success: boolean; message: string; accessToken: string; user: object}> {
    const userData = await this.usersRepository.findOne({
      where: {
        and: [
          {email: body.email},
          {isDeleted: false}
        ]
      }
    });

    if (!userData) {
      throw new HttpErrors.BadRequest('User not exist');
    }

    const company = await this.companyProfilesRepository.findOne({
      where: {
        and: [
          {usersId: userData.id},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (!company) {
      throw new HttpErrors.Unauthorized('Unauthorized access');
    }

    const user = await this.userService.verifyCredentials(body);

    const {roles, permissions} = await this.rbacService.getUserRoleAndPermissionsByRole(user.id!, 'company');

    if (!roles.includes('company')) {
      throw new HttpErrors.Forbidden('Access denied. Only company users can login here.');
    }

    const userProfile: UserProfile & {
      roles: string[];
      permissions: string[];
      phone: string;
    } = {
      [securityId]: user.id!,
      id: user.id!,
      email: user.email,
      phone: user.phone,
      roles,
      permissions,
    };

    const token = await this.jwtService.generateToken(userProfile);
    const profile = await this.rbacService.returnCompanyProfile(user.id, roles, permissions);
    return {
      success: true,
      message: "Company login successful",
      accessToken: token,
      user: profile
    };
  }

  // ------------------------------------------Company Registration API's------------------------------
  @post('/auth/trustee-registration')
  async trusteeRegistration(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'sessionId',
              // 'password',
              'legalEntityName',
              'CIN',
              // 'GSTIN',
              // 'udyamRegistrationNumber',
              'sebiRegistrationNumber',
              'sebiValidityDate',
              'dateOfIncorporation',
              'cityOfIncorporation',
              'stateOfIncorporation',
              'countryOfIncorporation',
              'submittedPanDetails',
              'panCardDocumentId',
              'trusteeEntityTypesId',
              // 'companySectorTypeId'
            ],
            properties: {
              sessionId: {
                type: 'string',
                description: 'Registration session id'
              },
              // password: {type: 'string'},
              legalEntityName: {type: 'string'},
              CIN: {
                type: 'string',
                pattern: '^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$'
              },
              GSTIN: {
                type: 'string',
                minLength: 15,
                maxLength: 15
              },
              udyamRegistrationNumber: {
                type: 'string'
              },
              sebiRegistrationNumber: {
                type: 'string',
                pattern: '^IND\\d{9}$'
              },
              sebiValidityDate: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              dateOfIncorporation: {
                type: 'string',
                pattern: '^\\d{4}-\\d{2}-\\d{2}$'
              },
              cityOfIncorporation: {type: 'string'},
              stateOfIncorporation: {type: 'string'},
              countryOfIncorporation: {type: 'string'},

              humanInteraction: {
                type: 'boolean',
                default: false
              },
              extractedPanDetails: {
                type: 'object',
                required: [],
                properties: {
                  extractedTrusteeName: {type: 'string'},
                  extractedPanNumber: {
                    type: 'string',
                    pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
                  }
                }
              },
              submittedPanDetails: {
                type: 'object',
                required: ['submittedTrusteeName', 'submittedPanNumber'],
                properties: {
                  submittedTrusteeName: {type: 'string'},
                  submittedPanNumber: {
                    type: 'string',
                    pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
                  }
                }
              },
              panCardDocumentId: {
                type: 'string',
                description: 'Media ID of uploaded PAN card'
              },
              trusteeEntityTypesId: {type: 'string'},
              // companyEntityTypeId: {type: 'string'},
            }
          }
        }
      }
    })
    body: {
      sessionId: string;
      // password: string;
      legalEntityName: string;
      CIN: string;
      GSTIN?: string;
      udyamRegistrationNumber?: string;
      sebiRegistrationNumber: string;
      sebiValidityDate: string;
      dateOfIncorporation: string; // yyyy-mm-dd
      cityOfIncorporation: string;
      stateOfIncorporation: string;
      countryOfIncorporation: string;
      humanInteraction?: boolean;
      extractedPanDetails?: {
        extractedTrusteeName?: string;
        extractedPanNumber?: string;
      };
      submittedPanDetails: {
        submittedTrusteeName: string;
        submittedPanNumber: string;
      };
      panCardDocumentId: string;
      trusteeEntityTypesId: string;
      // companyEntityTypeId: string;
    }
  ): Promise<{success: boolean; message: string; kycStatus: number; usersId: string; currentProgress: string[]}> {
    const tx = await this.trusteeProfilesRepository.dataSource.beginTransaction({
      isolationLevel: 'READ COMMITTED',
    });
    try {
      // ----------------------------
      //  Validate Registration Session
      // ----------------------------
      const registrationSession = await this.registrationSessionsRepository.findById(
        body.sessionId,
        undefined,
        {transaction: tx}
      );

      if (
        !registrationSession ||
        !registrationSession.phoneVerified ||
        !registrationSession.emailVerified ||
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        registrationSession.isDeleted ||
        new Date(registrationSession.expiresAt) < new Date()
      ) {
        throw new HttpErrors.BadRequest('Session is not valid');
      }

      // ----------------------------
      //  Validate CIN & GSTIN
      // ----------------------------
      const companyWithCIN = await this.trusteeProfilesRepository.findOne(
        {where: {CIN: body.CIN, isDeleted: false}},
        {transaction: tx}
      );
      if (companyWithCIN) throw new HttpErrors.BadRequest('CIN already registered');

      if (body.GSTIN) {
        const companyWithGSTIN = await this.trusteeProfilesRepository.findOne(
          {where: {GSTIN: body.GSTIN, isDeleted: false}},
          {transaction: tx}
        );
        if (companyWithGSTIN)
          throw new HttpErrors.BadRequest('GSTIN already registered');
      }

      // ----------------------------
      //  Create User
      // ----------------------------
      const hashedPassword = await this.hasher.hashPassword("Trustee@123");

      const newUserProfile = await this.usersRepository.create(
        {
          phone: registrationSession.phoneNumber,
          email: registrationSession.email,
          password: hashedPassword,
          isActive: true,
          isDeleted: false,
        },
        {transaction: tx}
      );

      // ----------------------------
      //  Create Company Profile
      // ----------------------------
      const newTrusteeProfile = await this.trusteeProfilesRepository.create(
        {
          usersId: newUserProfile.id,
          legalEntityName: body.legalEntityName,
          CIN: body.CIN,
          ...(body.GSTIN && {GSTIN: body.GSTIN}),
          sebiRegistrationNumber: body.sebiRegistrationNumber,
          sebiValidityDate: body.sebiValidityDate,
          dateOfIncorporation: body.dateOfIncorporation,
          cityOfIncorporation: body.cityOfIncorporation,
          stateOfIncorporation: body.stateOfIncorporation,
          countryOfIncorporation: body.countryOfIncorporation,
          ...(body.udyamRegistrationNumber && {udyamRegistrationNumber: body.udyamRegistrationNumber}),
          trusteeEntityTypesId: body.trusteeEntityTypesId,
          isActive: false,
          isDeleted: false,
        },
        {transaction: tx}
      );

      // ----------------------------
      //  Check PAN duplicate
      // ----------------------------
      const isPanExist = await this.trusteePanCardsRepository.findOne(
        {
          where: {
            and: [
              {submittedPanNumber: body.submittedPanDetails.submittedPanNumber},
              {isDeleted: false},
              {status: 1},
            ],
          },
        },
        {transaction: tx}
      );

      if (isPanExist)
        throw new HttpErrors.BadRequest('Pan already exists with another trustee');

      // ----------------------------
      //  Prepare PAN Data
      // ----------------------------
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trusteePanData: any = {
        submittedTrusteeName: body.submittedPanDetails.submittedTrusteeName,
        submittedPanNumber: body.submittedPanDetails.submittedPanNumber,
        extractedTrusteeName: body.extractedPanDetails?.extractedTrusteeName,
        extractedPanNumber: body.extractedPanDetails?.extractedPanNumber,
        panCardDocumentId: body.panCardDocumentId,
        mode: body.humanInteraction ? 1 : 0,
        status: 0,
        isActive: false,
        isDeleted: false,
        trusteeProfilesId: newTrusteeProfile.id,
      };

      // ----------------------------
      //  Human Interaction Required
      // ----------------------------
      if (body.humanInteraction) {
        await this.trusteePanCardsRepository.create(trusteePanData, {
          transaction: tx,
        });

        const newKycApplication = await this.kycApplicationsRepository.create(
          {
            roleValue: registrationSession.roleValue,
            usersId: newUserProfile.id,
            status: 0,
            humanInteraction: true,
            mode: 1,
            isActive: true,
            isDeleted: false,
            currentProgress: ['trustee_kyc'],
            identifierId: newTrusteeProfile.id
          },
          {transaction: tx}
        );

        await this.mediaService.updateMediaUsedStatus([body.panCardDocumentId], true);
        const result = await this.rbacService.assignNewUserRole(newUserProfile.id, 'trustee');
        if (!result.success || !result.data) {
          if (process.env.NODE_ENV === 'dev') {
            throw new HttpErrors.InternalServerError('Error while assigning role to user');
          } else {
            throw new HttpErrors.InternalServerError('Internal server error');
          }
        }

        await this.trusteeProfilesRepository.updateById(newTrusteeProfile.id, {kycApplicationsId: newKycApplication.id}, {transaction: tx});
        console.log('result', result.data);
        await tx.commit();

        return {
          success: true,
          message: 'Registration completed',
          kycStatus: 0,
          usersId: newUserProfile.id,
          currentProgress: newKycApplication.currentProgress ?? ['trustee_kyc']
        };
      }

      // ----------------------------
      //  Auto verification (No Human Interaction)
      // ----------------------------
      if (
        body.submittedPanDetails.submittedTrusteeName !== body.legalEntityName
      ) {
        throw new HttpErrors.BadRequest('PAN details do not match legal entity name');
      }

      // // Basic validation: Submitted PAN should match Extracted PAN
      // if (
      //   body.extractedPanDetails?.extractedPanNumber &&
      //   body.extractedPanDetails.extractedPanNumber !==
      //   body.submittedPanDetails.submittedPanNumber
      // ) {
      //   throw new HttpErrors.BadRequest('PAN number mismatch');
      // }

      // Auto approve PAN
      trusteePanData.status = 1; // Verified
      trusteePanData.isActive = true;

      await this.trusteePanCardsRepository.create(trusteePanData, {
        transaction: tx,
      });

      // ----------------------------
      //  Create KYC (Auto Approved PAN)
      // ----------------------------
      const newKycApplication = await this.kycApplicationsRepository.create(
        {
          roleValue: registrationSession.roleValue,
          usersId: newUserProfile.id,
          identifierId: newTrusteeProfile.id,
          status: 0,
          humanInteraction: false,
          mode: 0,
          isActive: true,
          isDeleted: false,
          currentProgress: ['trustee_kyc', 'pan_verified'],
        },
        {transaction: tx}
      );

      await this.mediaService.updateMediaUsedStatus([body.panCardDocumentId], true);
      const result = await this.rbacService.assignNewUserRole(newUserProfile.id, 'trustee');
      if (!result.success || !result.data) {
        if (process.env.NODE_ENV === 'dev') {
          throw new HttpErrors.InternalServerError('Error while assigning role to user');
        } else {
          throw new HttpErrors.InternalServerError('Internal server error');
        }
      }

      await this.trusteeProfilesRepository.updateById(newTrusteeProfile.id, {kycApplicationsId: newKycApplication.id}, {transaction: tx});
      await tx.commit();

      return {
        success: true,
        message: 'Registration completed',
        kycStatus: 0,
        currentProgress: newKycApplication.currentProgress ?? ['trustee_kyc', 'pan_verified'],
        usersId: newUserProfile.id
      };

    } catch (error) {
      await tx.rollback();
      console.log('error while registering new company :', error);
      throw error;
    }
  }

  @post('/auth/trustee-login')
  async trusteeLogin(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'password', 'rememberMe'],
            properties: {
              email: {type: 'string'},
              password: {type: 'string'},
              rememberMe: {type: 'boolean'},
            }
          }
        }
      }
    })
    body: {email: string; password: string; rememberMe: boolean}
  ): Promise<{success: boolean; message: string; accessToken: string; user: object}> {
    const userData = await this.usersRepository.findOne({
      where: {
        and: [
          {email: body.email},
          {isDeleted: false}
        ]
      }
    });

    if (!userData) {
      throw new HttpErrors.BadRequest('User not exist');
    }

    const trustee = await this.trusteeProfilesRepository.findOne({
      where: {
        and: [
          {usersId: userData.id},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (!trustee) {
      throw new HttpErrors.Unauthorized('Unauthorized access');
    }

    const user = await this.userService.verifyCredentials(body);

    const {roles, permissions} = await this.rbacService.getUserRoleAndPermissionsByRole(user.id!, 'trustee');

    if (!roles.includes('trustee')) {
      throw new HttpErrors.Forbidden('Access denied. Only Trustee can login here.');
    }

    const userProfile: UserProfile & {
      roles: string[];
      permissions: string[];
      phone: string;
    } = {
      [securityId]: user.id!,
      id: user.id!,
      email: user.email,
      phone: user.phone,
      roles,
      permissions,
    };

    const token = await this.jwtService.generateToken(userProfile);
    const profile = await this.rbacService.returnTrusteeProfile(user.id, roles, permissions);
    return {
      success: true,
      message: "Trustee login successful",
      accessToken: token,
      user: profile
    };
  }

  // ------------------------------------------Investor Registration API's------------------------------
  @post('/auth/investor-registration')
  async investorRegistration(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: [
              'sessionId',
              'fullName',
              'gender',
              'kycMode',
              'submittedPanDetails',
              'panCardDocumentId',
              'aadharFrontImageId',
              'aadharBackImageId',
              'selfieId'
            ],
            properties: {
              sessionId: {
                type: 'string',
                description: 'Registration session id'
              },
              fullName: {type: 'string'},
              gender: {type: 'string'},
              kycMode: {type: 'string'},
              humanInteraction: {
                type: 'boolean',
                default: false
              },
              extractedPanDetails: {
                type: 'object',
                required: [],
                properties: {
                  extractedInvestorName: {type: 'string'},
                  extractedPanNumber: {
                    type: 'string',
                    pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
                  },
                  extractedDateOfBirth: {type: 'string'}
                }
              },
              submittedPanDetails: {
                type: 'object',
                required: ['submittedInvestorName', 'submittedPanNumber'],
                properties: {
                  submittedInvestorName: {type: 'string'},
                  submittedPanNumber: {
                    type: 'string',
                    pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'
                  },
                  submittedDateOfBirth: {type: 'string'}
                }
              },
              panCardDocumentId: {
                type: 'string',
                description: 'Media ID of uploaded PAN card'
              },
              aadharFrontImageId: {
                type: 'string',
                description: 'Media ID of uploaded Aadhar card front side'
              },
              aadharBackImageId: {
                type: 'string',
                description: 'Media ID of uploaded Aadhar card back side'
              },
              selfieId: {
                type: 'string',
                description: 'Media ID of uploaded selfie'
              }
            }
          }
        }
      }
    })
    body: {
      sessionId: string;
      fullName: string;
      gender: string;
      kycMode: string;
      humanInteraction?: boolean;
      extractedPanDetails?: {
        extractedInvestorName?: string;
        extractedPanNumber?: string;
        extractedDateOfBirth?: string;
      };
      submittedPanDetails: {
        submittedInvestorName: string;
        submittedPanNumber: string;
        submittedDateOfBirth: string;
      };
      panCardDocumentId: string;
      aadharFrontImageId: string;
      aadharBackImageId: string;
      selfieId: string;
    }
  ): Promise<{
    success: boolean;
    message: string;
    kycStatus: number;
    currentProgress: string[];
    usersId: string;
  }> {
    const tx = await this.investorProfileRepository.dataSource.beginTransaction({
      isolationLevel: 'READ COMMITTED',
    });
    try {
      // ----------------------------
      //  Validate Registration Session
      // ----------------------------
      const registrationSession = await this.registrationSessionsRepository.findById(
        body.sessionId,
        undefined,
        {transaction: tx}
      );

      if (
        !registrationSession ||
        !registrationSession.phoneVerified ||
        !registrationSession.emailVerified ||
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        registrationSession.isDeleted ||
        new Date(registrationSession.expiresAt) < new Date()
      ) {
        throw new HttpErrors.BadRequest('Session is not valid');
      }

      // ----------------------------
      //  Create User
      // ----------------------------
      const hashedPassword = await this.hasher.hashPassword("Investor@123");

      let newUserProfile = await this.usersRepository.findOne({
        where: {
          and: [
            {email: registrationSession.email},
            {phone: registrationSession.phoneNumber},
            {isActive: true},
            {isDeleted: false}
          ]
        }
      });

      if (!newUserProfile) {
        newUserProfile = await this.usersRepository.create(
          {
            phone: registrationSession.phoneNumber,
            email: registrationSession.email,
            password: hashedPassword,
            isActive: true,
            isDeleted: false,
          },
          {transaction: tx}
        );
      }
      // ----------------------------
      //  Create Investor Profile
      // ----------------------------
      const newInvestorProfile = await this.investorProfileRepository.create(
        {
          usersId: newUserProfile.id,
          fullName: body.fullName,
          gender: body.gender,
          kycMode: body.kycMode,
          aadharFrontImageId: body.aadharFrontImageId,
          aadharBackImageId: body.aadharBackImageId,
          selfieId: body.selfieId,
          isActive: false,
          isDeleted: false,
        },
        {transaction: tx}
      );

      // ----------------------------
      //  Check PAN duplicate
      // ----------------------------
      const isPanExist = await this.investorPanCardsRepository.findOne(
        {
          where: {
            and: [
              {submittedPanNumber: body.submittedPanDetails.submittedPanNumber},
              {isDeleted: false},
              {status: 1},
            ],
          },
        },
        {transaction: tx}
      );

      if (isPanExist)
        throw new HttpErrors.BadRequest('Pan already exists with another investor');

      // ----------------------------
      //  Prepare PAN Data
      // ----------------------------
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const investorPanData: any = {
        submittedInvestorName: body.submittedPanDetails.submittedInvestorName,
        submittedPanNumber: body.submittedPanDetails.submittedPanNumber,
        submittedDateOfBirth: body.submittedPanDetails.submittedDateOfBirth,
        extractedInvestorName: body.extractedPanDetails?.extractedInvestorName,
        extractedPanNumber: body.extractedPanDetails?.extractedPanNumber,
        extractedDateOfBirth: body.extractedPanDetails?.extractedDateOfBirth,
        panCardDocumentId: body.panCardDocumentId,
        mode: body.humanInteraction ? 1 : 0,
        status: 0,
        isActive: false,
        isDeleted: false,
        investorProfileId: newInvestorProfile.id,
      };

      // ----------------------------
      //  Human Interaction Required
      // ----------------------------
      if (body.humanInteraction) {
        await this.investorPanCardsRepository.create(investorPanData, {
          transaction: tx,
        });

        const newApplication = await this.kycApplicationsRepository.create(
          {
            roleValue: registrationSession.roleValue,
            usersId: newUserProfile.id,
            status: 0,
            humanInteraction: true,
            mode: 0,
            isActive: true,
            isDeleted: false,
            currentProgress: ['investor_kyc'],
            identifierId: newInvestorProfile.id
          },
          {transaction: tx}
        );

        await this.mediaService.updateMediaUsedStatus([body.panCardDocumentId], true);
        const result = await this.rbacService.assignNewUserRole(newUserProfile.id, 'investor');
        if (!result.success || !result.data) {
          if (process.env.NODE_ENV === 'dev') {
            throw new HttpErrors.InternalServerError('Error while assigning role to user');
          } else {
            throw new HttpErrors.InternalServerError('Internal server error');
          }
        }

        await this.investorProfileRepository.updateById(newInvestorProfile.id, {kycApplicationsId: newApplication.id}, {transaction: tx})
        await tx.commit();

        return {
          success: true,
          message: 'Registration completed',
          kycStatus: 0,
          currentProgress: newApplication.currentProgress ?? ['investor_kyc'],
          usersId: newUserProfile.id
        };
      }

      // ----------------------------
      //  Auto verification (No Human Interaction)
      // ----------------------------
      if (
        body.submittedPanDetails.submittedInvestorName !== body.fullName
      ) {
        throw new HttpErrors.BadRequest('PAN details do not match investor name');
      }

      // // Basic validation: Submitted PAN should match Extracted PAN
      // if (
      //   body.extractedPanDetails?.extractedPanNumber &&
      //   body.extractedPanDetails.extractedPanNumber !==
      //   body.submittedPanDetails.submittedPanNumber
      // ) {
      //   throw new HttpErrors.BadRequest('PAN number mismatch');
      // }

      // Auto approve PAN
      investorPanData.status = 1; // Verified
      investorPanData.isActive = true;

      await this.investorPanCardsRepository.create(investorPanData, {
        transaction: tx,
      });

      // ----------------------------
      //  Create KYC (Auto Approved PAN)
      // ----------------------------
      const newApplication = await this.kycApplicationsRepository.create(
        {
          roleValue: registrationSession.roleValue,
          usersId: newUserProfile.id,
          identifierId: newInvestorProfile.id,
          status: 0,
          humanInteraction: false,
          mode: 0,
          isActive: true,
          isDeleted: false,
          currentProgress: ['investor_kyc', 'pan_verified'],
        },
        {transaction: tx}
      );

      await this.investorProfileRepository.updateById(newInvestorProfile.id, {kycApplicationsId: newApplication.id}, {transaction: tx})
      await this.mediaService.updateMediaUsedStatus([body.panCardDocumentId], true);
      const result = await this.rbacService.assignNewUserRole(newUserProfile.id, 'investor');
      if (!result.success || !result.data) {
        if (process.env.NODE_ENV === 'dev') {
          throw new HttpErrors.InternalServerError('Error while assigning role to user');
        } else {
          throw new HttpErrors.InternalServerError('Internal server error');
        }
      }
      await tx.commit();

      return {
        success: true,
        message: 'Registration completed',
        kycStatus: 0,
        currentProgress: newApplication.currentProgress ?? ['investor_kyc', 'pan_verified'],
        usersId: newUserProfile.id
      };

    } catch (error) {
      await tx.rollback();
      console.log('error while registering new investor :', error);
      throw error;
    }
  }

  @post('/auth/investor-login/send-otp')
  async investorLoginSendOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'rememberMe'],
            properties: {
              emailOrPhone: {type: 'string'},
              // password: {type: 'string'},
              rememberMe: {type: 'boolean'},
            }
          }
        }
      }
    })
    body: {emailOrPhone: string; rememberMe: boolean}
  ): Promise<{success: boolean; message: string}> {
    const userData = await this.usersRepository.findOne({
      where: {
        and: [
          {
            or: [
              {email: body.emailOrPhone},
              {phone: body.emailOrPhone}
            ]
          },
          {isDeleted: false}
        ]
      }
    });

    if (!userData) {
      throw new HttpErrors.BadRequest('User not exist');
    }

    const isEmail = userData?.email === body.emailOrPhone;
    const investor = await this.investorProfileRepository.findOne({
      where: {
        and: [
          {usersId: userData.id},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (!investor) {
      throw new HttpErrors.Unauthorized('Unauthorized access');
    }

    const {roles} = await this.rbacService.getUserRoleAndPermissionsByRole(userData.id, 'investor');

    if (!roles.includes('investor')) {
      throw new HttpErrors.Forbidden('Access denied. Only investors can login here.');
    }

    // send otp to user...
    if (isEmail) {
      await this.otpRepository.updateAll(
        {isUsed: true, expiresAt: new Date()},
        {identifier: body.emailOrPhone, type: 1}
      );
    } else {
      await this.otpRepository.updateAll(
        {isUsed: true, expiresAt: new Date()},
        {identifier: body.emailOrPhone, type: 0}
      );
    }

    const otp = await this.otpRepository.create({
      otp: '1234',
      type: isEmail ? 1 : 0,
      identifier: body.emailOrPhone,
      attempts: 0,
      isUsed: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min
    });

    if (!otp) {
      throw new HttpErrors.InternalServerError(
        process.env.NODE_ENV === 'dev'
          ? "Failed to create otp"
          : "Something went wrong"
      );
    }

    return {
      success: true,
      message: "OTP send successfully",
    };
  }

  @post('/auth/investor-login/verify-otp')
  async investorLoginVerifyOtp(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['email', 'otp', 'rememberMe'],
            properties: {
              emailOrPhone: {type: 'string'},
              otp: {type: 'string'},
              // password: {type: 'string'},
              rememberMe: {type: 'boolean'},
            }
          }
        }
      }
    })
    body: {emailOrPhone: string; otp: string; rememberMe: boolean}
  ): Promise<{success: boolean; message: string; accessToken: string; user: object}> {
    const userData = await this.usersRepository.findOne({
      where: {
        and: [
          {
            or: [
              {email: body.emailOrPhone},
              {phone: body.emailOrPhone}
            ]
          },
          {isDeleted: false}
        ]
      }
    });

    if (!userData) {
      throw new HttpErrors.BadRequest('User not exist');
    }

    const isEmail = userData?.email === body.emailOrPhone;
    const investor = await this.investorProfileRepository.findOne({
      where: {
        and: [
          {usersId: userData.id},
          {isActive: true},
          {isDeleted: false}
        ]
      }
    });

    if (!investor) {
      throw new HttpErrors.Unauthorized('Unauthorized access');
    }

    const otpEntry = await this.otpRepository.findOne({
      where: {
        identifier: body.emailOrPhone,
        type: isEmail ? 1 : 0,
        isUsed: false,
      },
      order: ['createdAt DESC'],
    });

    if (!otpEntry) {
      throw new HttpErrors.BadRequest('OTP expired or not found');
    }

    if (otpEntry.attempts >= 3) {
      throw new HttpErrors.BadRequest(
        'Maximum attempts reached, please request a new OTP',
      );
    }

    if (new Date(otpEntry.expiresAt) < new Date()) {
      await this.otpRepository.updateById(otpEntry.id, {
        isUsed: true,
        expiresAt: new Date(),
      });

      throw new HttpErrors.BadRequest('OTP expired, request a new one');
    }

    if (otpEntry.otp !== body.otp) {
      await this.otpRepository.updateById(otpEntry.id, {
        attempts: otpEntry.attempts + 1,
      });

      throw new HttpErrors.BadRequest('Invalid OTP');
    }

    await this.otpRepository.updateById(otpEntry.id, {
      isUsed: true,
      expiresAt: new Date(),
    });


    const {roles, permissions} = await this.rbacService.getUserRoleAndPermissionsByRole(userData.id!, 'investor');

    if (!roles.includes('investor')) {
      throw new HttpErrors.Forbidden('Access denied. Only Investors can login here.');
    }

    const userProfile: UserProfile & {
      roles: string[];
      permissions: string[];
      phone: string;
    } = {
      [securityId]: userData.id!,
      id: userData.id!,
      email: userData.email,
      phone: userData.phone,
      roles,
      permissions,
    };

    const token = await this.jwtService.generateToken(userProfile);
    const profile = await this.rbacService.returnInvestorProfile(userData.id, roles, permissions);

    return {
      success: true,
      message: "Investor login successful",
      accessToken: token,
      user: profile
    };
  }
}

