import {Entity, model, property} from '@loopback/repository';

@model({
  settings: {
    postgresql: {
      table: 'investor_kyc_document_requirements',
      schema: 'public',
    },
    indexes: {
      uniqueInvestorKycDocumentRequirementSequenceOrder: {
        keys: {sequenceOrder: 1},
        options: {unique: true},
      },
      uniqueInvestorKycDocumentRequirementDocumentValue: {
        keys: {documentValue: 1},
        options: {unique: true},
      },
    },
  },
})
export class InvestorKycDocumentRequirements extends Entity {
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
  })
  sequenceOrder: number;

  @property({
    type: 'string',
    required: true,
  })
  documentLabel: string;

  @property({
    type: 'string',
    required: true,
  })
  documentValue: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['ALWAYS', 'INVESTOR_TYPE'],
    },
  })
  conditionType: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['EQ'],
    },
  })
  conditionOperator: string;

  @property({
    type: 'array',
    itemType: 'string',
    required: true,
    postgresql: {dataType: 'varchar[]'},
  })
  conditionValue: string[];

  @property({
    type: 'boolean',
    required: true,
  })
  isMandatory: boolean;

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

  constructor(data?: Partial<InvestorKycDocumentRequirements>) {
    super(data);
  }
}

export interface InvestorKycDocumentRequirementsRelations {
  // describe navigational properties here
}

export type InvestorKycDocumentRequirementsWithRelations =
  InvestorKycDocumentRequirements & InvestorKycDocumentRequirementsRelations;
