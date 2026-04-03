import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorKycDocumentRequirements} from './investor-kyc-document-requirements.model';
import {Media} from './media.model';
import {Users} from './users.model';

@model({
  settings: {
    postgresql: {
      table: 'investor_kyc_documents',
      schema: 'public',
    },
    indexes: {
      uniqueInvestorRequirementDocument: {
        keys: {
          usersId: 1,
          investorKycDocumentRequirementsId: 1,
        },
        options: {unique: true},
      },
    },
  },
})
export class InvestorKycDocument extends Entity {
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
      enum: [0, 1],
    },
  })
  mode: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2],
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

  @belongsTo(() => InvestorKycDocumentRequirements)
  investorKycDocumentRequirementsId: string;

  @belongsTo(() => Media, {name: 'media'})
  documentsFileId: string;

  @belongsTo(() => Users)
  usersId: string;

  constructor(data?: Partial<InvestorKycDocument>) {
    super(data);
  }
}

export interface InvestorKycDocumentRelations {
  // describe navigational properties here
}

export type InvestorKycDocumentWithRelations = InvestorKycDocument &
  InvestorKycDocumentRelations;
