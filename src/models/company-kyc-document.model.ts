import {Entity, model, property, belongsTo} from '@loopback/repository';
import {CompanyKycDocumentRequirements} from './company-kyc-document-requirements.model';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'company_kyc_documents',
      schema: 'public',
    },
    indexes: {
      uniqueUserRequirementDocument: {
        keys: {
          usersId: 1,
          companyKycDocumentRequirementsId: 1,
        },
        options: {unique: true},
      },
    },
  },
})
export class CompanyKycDocument extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;
  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0 => auto, 1 => manual
    },
  })
  mode: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2], // 0 => under review, 1 => approved, 2 => rejected
    },
  })
  status: number;

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

  @belongsTo(() => CompanyKycDocumentRequirements)
  companyKycDocumentRequirementsId: string;

  @belongsTo(() => Media, {name: 'media'})
  documentsFileId: string;

  @belongsTo(() => Users)
  usersId: string;

  constructor(data?: Partial<CompanyKycDocument>) {
    super(data);
  }
}

export interface CompanyKycDocumentRelations {
  // describe navigational properties here
}

export type CompanyKycDocumentWithRelations = CompanyKycDocument &
  CompanyKycDocumentRelations;
