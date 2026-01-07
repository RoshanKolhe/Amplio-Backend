import {belongsTo, Entity, hasOne, model, property} from '@loopback/repository';
import {InvestorPanCards} from './investor-pan-cards.model';
import {Media} from './media.model';
import {Users} from './users.model';
import {KycApplications} from './kyc-applications.model';

@model({
  settings: {
    postgresql: {
      table: 'investor_profiles',
      schema: 'public',
    },
  },
})
export class InvestorProfile extends Entity {
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
    type: 'string',
    required: true
  })
  fullName: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [
        'male',
        'female',
        'other'
      ]
    }
  })
  gender: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [
        'manual',
        'auto'
      ]
    }
  })
  kycMode: string;

  @belongsTo(() => Media)
  aadharFrontImageId: string;

  @belongsTo(() => Media)
  aadharBackImageId: string;

  @belongsTo(() => Media)
  selfieId: string;

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

  @hasOne(() => InvestorPanCards)
  investorPanCards: InvestorPanCards;

  @belongsTo(() => Users)
  usersId: string;

  @belongsTo(() => KycApplications)
  kycApplicationsId: string;

  constructor(data?: Partial<InvestorProfile>) {
    super(data);
  }
}

export interface InvestorProfileRelations {
  // describe navigational properties here
}

export type InvestorProfileWithRelations = InvestorProfile & InvestorProfileRelations;
