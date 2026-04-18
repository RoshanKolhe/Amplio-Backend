import {belongsTo, Entity, model, property} from '@loopback/repository';
import {SpvApplication} from './spv-application.model';

@model()
export class EscrowSetup extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    postgresql: {
      dataType: 'uuid',
    },
  })
  id: string;

  @property({type: 'string', required: true})
  bankName: string;

  @property({type: 'string'})
  branchDetails?: string;

  @property({type: 'string', required: true})
  accountNumber: string;

  @property({type: 'string', required: true})
  ifscCode: string;

  @property({
    type: 'string',
    required: true,
    default: 'collection_escrow',
    jsonSchema: {
      enum: ['collection_escrow', 'reserve_escrow'],
    },
  })
  accountType: string;

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


  constructor(data?: Partial<EscrowSetup>) {
    super(data);
  }
}

export interface EscrowSetupRelations {
  // describe navigational properties here
}

export type EscrowSetupWithRelations = EscrowSetup & EscrowSetupRelations;
