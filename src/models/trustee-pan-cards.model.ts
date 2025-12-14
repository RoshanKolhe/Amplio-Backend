import {belongsTo, Entity, model, property} from '@loopback/repository';
import {Media} from './media.model';
import {TrusteeProfiles} from './trustee-profiles.model';

@model({
  settings: {
    postgresql: {
      table: 'trustee_pan_cards',
      schema: 'public',
    },
    indexes: {
      uniqueTrusteeSubmittedPan: {
        keys: {submittedPanNumber: 1},
        options: {unique: true},
      },
      trusteePanStatusIndex: {
        keys: {submittedPanNumber: 1, status: 1},
      },
    },
  },
})
export class TrusteePanCards extends Entity {
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
  extractedTrusteeName?: string;

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
  submittedTrusteeName: string;

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

  @belongsTo(() => TrusteeProfiles)
  trusteeProfilesId: string;

  constructor(data?: Partial<TrusteePanCards>) {
    super(data);
  }
}

export interface TrusteePanCardsRelations {
  // describe navigational properties here
}

export type TrusteePanCardsWithRelations = TrusteePanCards & TrusteePanCardsRelations;
