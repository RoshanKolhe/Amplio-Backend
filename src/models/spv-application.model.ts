import {belongsTo, Entity, hasOne, model, property} from '@loopback/repository';
import {Spv} from './spv.model';
import {TrusteeProfiles} from './trustee-profiles.model';
import {Users} from './users.model';
import {SpvApplicationStatusMaster} from './spv-application-status-master.model';
import {SpvApplicationCreditRating} from './spv-application-credit-rating.model';

@model({
  settings: {
    postgresql: {
      table: 'spv_applications',
      schema: 'public',
    },
    indexes: {
      uniqueSpvApplicationPerTrusteeAndCreatedAt: {
        keys: {trusteeProfilesId: 1, createdAt: 1},
      }
    },
  },
})
export class SpvApplication extends Entity {
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
      enum: [0, 1, 2],
    },
  })
  status: number;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {
      enum: [0, 1], // 0 => auto, 1 => manual
    },
  })
  mode: number;

  @property({
    type: 'boolean',
    default: false,
  })
  humanInteraction?: boolean;

  @property({
    type: 'string',
  })
  reason?: string;

  @property({
    type: 'date',
  })
  verifiedAt?: Date;

  @belongsTo(() => SpvApplicationStatusMaster)
  spvApplicationStatusMasterId: string;

  @belongsTo(() => TrusteeProfiles)
  trusteeProfilesId: string;

  @belongsTo(() => Users)
  usersId: string;

  @hasOne(() => Spv)
  spv: Spv;

  @hasOne(() => SpvApplicationCreditRating)
  spvApplicationCreditRating: SpvApplicationCreditRating;

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

  constructor(data?: Partial<SpvApplication>) {
    super(data);
  }
}

export interface SpvApplicationRelations {
  spvApplicationStatusMaster?: SpvApplicationStatusMaster;
  trusteeProfiles?: TrusteeProfiles;
  users?: Users;
  spv?: Spv;
  spvApplicationCreditRating?: SpvApplicationCreditRating;
}

export type SpvApplicationWithRelations = SpvApplication &
  SpvApplicationRelations;
