import {belongsTo, Entity, model, property} from '@loopback/repository';
import {BusinessKycDocumentType} from './business-kyc-document-type.model';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'platform_agreement',
      schema: 'public',
    },
    indexes: {
      uniquePlatformAgreement: {
        keys: {
          usersId: 1,
          roleValue: 1,
          identifierId: 1,
          businessKycDocumentTypeId: 1,
        },
        options: {unique: true},
      },
    },
  },
})
export class PlatformAgreement extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @property({
    type: 'boolean',
    default: false,
    required: true,
  })
  isConsent: boolean;

  @belongsTo(() => Users)
  usersId: string;

  @property({
    type: 'string',
    required: true,
  })
  roleValue: string;

  @property({
    type: 'string',
    required: true,
    postgresql: {dataType: 'uuid'},
  })
  identifierId: string;

  @belongsTo(() => BusinessKycDocumentType)
  businessKycDocumentTypeId: string;

  @belongsTo(() => Media)
  mediaId?: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2],
    },
  })
  status: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1],
    },
  })
  mode: number;

  @property({
    type: 'string',
  })
  reason?: string;

  @property({
    type: 'date',
  })
  verifiedAt?: Date;

  @property({
    type: 'boolean',
    default: true,
  })
  isActive?: boolean;

  @property({
    type: 'boolean',
    default: false,
  })
  isDeleted?: boolean;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  createdAt?: Date;

  @property({
    type: 'date',
    defaultFn: 'now',
  })
  updatedAt?: Date;

  @property({
    type: 'date',
  })
  deletedAt?: Date;


  constructor(data?: Partial<PlatformAgreement>) {
    super(data);
  }
}

export interface PlatformAgreementRelations {
}

export type PlatformAgreementWithRelations = PlatformAgreement &
  PlatformAgreementRelations;
