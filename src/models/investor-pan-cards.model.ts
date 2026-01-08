import {belongsTo, Entity, model, property} from '@loopback/repository';
import {InvestorProfile} from './investor-profile.model';
import {Media} from './media.model';

@model({
  settings: {
    postgresql: {
      table: 'investor_pan_cards',
      schema: 'public',
    },
    indexes: {
      uniqueInvestorSubmittedPan: {
        keys: {submittedPanNumber: 1},
        options: {unique: true},
      },
      investorPanStatusIndex: {
        keys: {submittedPanNumber: 1, status: 1},
      },
    },
  },
})
export class InvestorPanCards extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;


  @property({
    type: 'string',
    jsonSchema: {
      pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$', // PAN format
    },
  })
  extractedPanNumber?: string;

  @property({
    type: 'string',
    jsonSchema: {
      minLength: 3,
      maxLength: 200,
    },
  })
  extractedInvestorName?: string;

  @property({
    type: 'string',
    required: false,
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$'
    }
  })
  extractedDateOfBirth?: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[A-Z]{5}[0-9]{4}[A-Z]{1}$',
      errorMessage: {
        pattern: 'Invalid PAN format (ABCDE1234F)',
      },
    },
  })
  submittedPanNumber: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 3,
      maxLength: 200,
    },
  })
  submittedInvestorName: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^\\d{4}-\\d{2}-\\d{2}$'
    }
  })
  submittedDateOfBirth: string;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1, 2], // 0=pending, 1=approved, 2=rejected
    },
  })
  status: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0=auto OCR, 1=manual team verification
    },
  })
  mode: number;

  @property({
    type: 'string',
  })
  reason?: string; // if rejection is there

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

  @belongsTo(() => Media)
  panCardDocumentId: string;

  @belongsTo(() => InvestorProfile)
  investorProfileId: string;

  constructor(data?: Partial<InvestorPanCards>) {
    super(data);
  }
}

export interface InvestorPanCardsRelations {
  // describe navigational properties here
}

export type InvestorPanCardsWithRelations = InvestorPanCards & InvestorPanCardsRelations;
