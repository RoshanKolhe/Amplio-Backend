import {Entity, model, property, belongsTo} from '@loopback/repository';
import {Media} from './media.model';
import {SpvApplication} from './spv-application.model';

@model()
export class TrustDeed extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {dataType: 'uuid'},
  })
  id: string;

  @property({type: 'string', required: true})
  trustName: string;

  @property({type: 'string'})
  trusteeEntity?: string;

  @property({type: 'string'})
  settlor?: string;

  @property({type: 'string'})
  governingLaw?: string;

  @property({type: 'string'})
  bankruptcyClause?: string;

  @property({type: 'string'})
  trustDuration?: string;

  @belongsTo(() => Media)
  stampDutyAndRegistrationId?: string;

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

  @belongsTo(() => SpvApplication)
  spvApplicationId: string;

  constructor(data?: Partial<TrustDeed>) {
    super(data);
  }
}

export interface TrustDeedRelations {
  spvApplication?: SpvApplication;
  stampDutyAndRegistration?: Media;
}

export type TrustDeedWithRelations = TrustDeed & TrustDeedRelations;
