import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {v4 as uuidv4} from 'uuid';
import {
  BankDetails,
  MerchantProfiles,
  MerchantPayoutBatch,
  MerchantPayoutBatchItem,
  MerchantPayoutConfig,
  Transaction,
} from '../models';
import {
  BankDetailsRepository,
  MerchantProfilesRepository,
  MerchantPayoutBatchItemRepository,
  MerchantPayoutBatchRepository,
  MerchantPayoutConfigRepository,
  PspRepository,
  TransactionRepository,
} from '../repositories';
import {isSettlementEligibleForDiscounting} from '../utils/transactions';

type ScheduleMode = 'eod' | 'bucketed';
type RunType =
  | 'scheduled'
  | 'cutoff_sweep'
  | 'eod_default'
  | 'retry'
  | 'fallback';

export type MerchantPayoutWindow = {
  businessDate: string;
  bucketStartAt: Date;
  bucketEndAt: Date;
  scheduledFor: Date;
  frequencyHours?: number;
  scheduleMode: ScheduleMode;
  runType: RunType;
};

export type MerchantPayoutBatchPreparation = {
  batch: MerchantPayoutBatch;
  items: MerchantPayoutBatchItem[];
  beneficiaryAccount: BankDetails | null;
  window: MerchantPayoutWindow;
  effectiveDailyCap: number;
  availableDailyCap: number;
  eligibleAmount: number;
  releasedAmount: number;
  totalFundedAmount: number;
  wasCreated: boolean;
};

export type MerchantPayoutStopResult = {
  success: boolean;
  message: string;
  config: MerchantPayoutConfig;
};

export type MerchantPayoutConfigUpsertPayload = Partial<
  Pick<
    MerchantPayoutConfig,
    | 'maxAllowedDailyCap'
    | 'selectedDailyCap'
    | 'frequencyHours'
    | 'scheduleMode'
    | 'startTime'
    | 'cutoffTime'
    | 'timezone'
    | 'commitmentUnit'
    | 'commitmentValue'
    | 'commitmentStartAt'
  >
>;

type TimeZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type TransactionCandidate = {
  transaction: Transaction;
  availableAmount: number;
};

type DailyBatchUsage = {
  reservedOrReleasedToday: number;
  pendingReservedAmounts: Map<string, number>;
};

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const PENDING_BATCH_STATUSES = ['pending', 'processing'];
const TERMINAL_RELEASED_BATCH_STATUSES = ['success', 'partial'];
const ACTIVE_BATCH_STATUSES = [
  ...PENDING_BATCH_STATUSES,
  ...TERMINAL_RELEASED_BATCH_STATUSES,
];
const MAX_LOOKBACK_DAYS = 7;
const RETRY_BACKOFF_MS = 5 * 60 * 1000;
const ENABLED_DEBUG_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DEFAULT_FALLBACK_PLATFORM_DAILY_LIMIT = Number(
  process.env.DEFAULT_PLATFORM_DAILY_LIMIT ?? 100000,
);
const PAYOUT_TRANSACTION_OPTIONS = {
  isolationLevel: 'READ COMMITTED',
} as const;
const MERCHANT_FUNDED_STATUS = 'fundeed';
const MERCHANT_NOT_FUNDED_STATUS = 'notfunded';

export class MerchantPayoutService {
  constructor(
    @repository(MerchantPayoutConfigRepository)
    private merchantPayoutConfigRepository: MerchantPayoutConfigRepository,
    @repository(MerchantProfilesRepository)
    private merchantProfilesRepository: MerchantProfilesRepository,
    @repository(MerchantPayoutBatchRepository)
    private merchantPayoutBatchRepository: MerchantPayoutBatchRepository,
    @repository(MerchantPayoutBatchItemRepository)
    private merchantPayoutBatchItemRepository: MerchantPayoutBatchItemRepository,
    @repository(TransactionRepository)
    private transactionRepository: TransactionRepository,
    @repository(PspRepository)
    private pspRepository: PspRepository,
    @repository(BankDetailsRepository)
    private bankDetailsRepository: BankDetailsRepository,
  ) {}

  private isMerchantPayoutCronDebugEnabled() {
    return ENABLED_DEBUG_VALUES.has(
      String(process.env.MERCHANT_PAYOUT_CRON_DEBUG ?? '')
        .trim()
        .toLowerCase(),
    );
  }

  private logMerchantPayoutCronDebug(
    message: string,
    payload?: Record<string, unknown>,
  ) {
    if (!this.isMerchantPayoutCronDebugEnabled()) {
      return;
    }

    if (payload) {
      console.log(message, payload);
      return;
    }

    console.log(message);
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private getConfigDebugContext(config: MerchantPayoutConfig) {
    return {
      merchantPayoutConfigId: config.id,
      merchantProfilesId: config.merchantProfilesId,
      usersId: config.usersId,
      scheduleMode: this.getConfigScheduleMode(config),
      frequencyHours: config.frequencyHours,
      startTime: config.startTime,
      cutoffTime: config.cutoffTime,
      timezone: this.getConfigTimezone(config),
      autoPayoutEnabled: config.autoPayoutEnabled,
      autoPayoutStatus: config.autoPayoutStatus,
      effectiveDailyCap: this.resolveEffectiveDailyCap(config),
    };
  }

  private getWindowDebugContext(window: MerchantPayoutWindow) {
    return {
      businessDate: window.businessDate,
      bucketStartAt: window.bucketStartAt.toISOString(),
      bucketEndAt: window.bucketEndAt.toISOString(),
      scheduledFor: window.scheduledFor.toISOString(),
      scheduleMode: window.scheduleMode,
      frequencyHours: window.frequencyHours,
      runType: window.runType,
    };
  }

  private getTimeZoneParts(date: Date, timezone: string): TimeZoneParts {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(date);

    const getPart = (type: string) =>
      Number(parts.find(part => part.type === type)?.value ?? 0);

    return {
      year: getPart('year'),
      month: getPart('month'),
      day: getPart('day'),
      hour: getPart('hour'),
      minute: getPart('minute'),
      second: getPart('second'),
    };
  }

  private formatBusinessDate(
    parts: Pick<TimeZoneParts, 'year' | 'month' | 'day'>,
  ) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  private getLocalBusinessDate(date: Date, timezone: string) {
    return this.formatBusinessDate(this.getTimeZoneParts(date, timezone));
  }

  private addDays(dateString: string, days: number) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);

    return this.formatBusinessDate({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }

  private buildDateInTimezone(
    dateString: string,
    timeString: string,
    timezone: string,
  ) {
    const [year, month, day] = dateString.split('-').map(Number);
    const [hour, minute] = timeString.split(':').map(Number);

    let utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

    for (let attempt = 0; attempt < 2; attempt++) {
      const parts = this.getTimeZoneParts(utcDate, timezone);
      const actualUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
      const targetUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
      const diffMs = actualUtc - targetUtc;

      if (diffMs === 0) {
        break;
      }

      utcDate = new Date(utcDate.getTime() - diffMs);
    }

    utcDate.setSeconds(0, 0);
    return utcDate;
  }

  private getConfigTimezone(config: MerchantPayoutConfig) {
    return config.timezone || DEFAULT_TIMEZONE;
  }

  private sanitizeLookbackDays(lookbackDays: number) {
    if (!Number.isFinite(lookbackDays)) {
      return 0;
    }

    return Math.min(Math.max(Math.trunc(lookbackDays), 0), MAX_LOOKBACK_DAYS);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as {code?: string}).code === '23505'
    );
  }

  private reduceToLatestDueWindowPerBusinessDate(
    dueWindows: MerchantPayoutWindow[],
  ) {
    const latestWindowByDate = new Map<string, MerchantPayoutWindow>();

    for (const dueWindow of dueWindows) {
      const currentLatestWindow = latestWindowByDate.get(
        dueWindow.businessDate,
      );

      if (
        !currentLatestWindow ||
        dueWindow.scheduledFor.getTime() >
          currentLatestWindow.scheduledFor.getTime()
      ) {
        latestWindowByDate.set(dueWindow.businessDate, dueWindow);
      }
    }

    return Array.from(latestWindowByDate.values()).sort(
      (left, right) =>
        left.scheduledFor.getTime() - right.scheduledFor.getTime(),
    );
  }

  private async fetchBatchWithItems(batchId: string) {
    const batch = await this.merchantPayoutBatchRepository.findById(batchId);
    const items = await this.merchantPayoutBatchItemRepository.find({
      where: {
        and: [{merchantPayoutBatchId: batchId}, {isDeleted: false}],
      },
      order: ['createdAt ASC'],
    });

    return {batch, items};
  }

  private getConfigScheduleMode(config: MerchantPayoutConfig): ScheduleMode {
    return config.scheduleMode === 'bucketed' ? 'bucketed' : 'eod';
  }

  private validateConfig(config: MerchantPayoutConfig) {
    if (
      !Number.isFinite(config.maxAllowedDailyCap) ||
      config.maxAllowedDailyCap <= 0
    ) {
      throw new HttpErrors.BadRequest(
        'maxAllowedDailyCap must be greater than zero',
      );
    }

    const window = this.resolveBusinessWindow(
      config,
      this.getLocalBusinessDate(new Date(), this.getConfigTimezone(config)),
    );

    if (window.cutoffAt.getTime() <= window.startAt.getTime()) {
      throw new HttpErrors.BadRequest('cutoffTime must be after startTime');
    }

    if (
      this.getConfigScheduleMode(config) === 'bucketed' &&
      (!config.frequencyHours || config.frequencyHours <= 0)
    ) {
      throw new HttpErrors.BadRequest(
        'frequencyHours is required for bucketed payout mode',
      );
    }

    if (this.getConfigTimezone(config) !== DEFAULT_TIMEZONE) {
      throw new HttpErrors.BadRequest(
        `Only ${DEFAULT_TIMEZONE} is supported for automated payouts right now`,
      );
    }
  }

  async findConfigForMerchant(merchantProfilesId: string, usersId: string) {
    return this.merchantPayoutConfigRepository.findOne({
      where: {
        and: [{merchantProfilesId}, {usersId}, {isDeleted: false}],
      },
      order: ['createdAt DESC'],
    });
  }

  private buildConfigForUpsert(
    existingConfig: MerchantPayoutConfig | null,
    merchantProfilesId: string,
    usersId: string,
    payload: MerchantPayoutConfigUpsertPayload,
    referenceAt: Date,
  ) {
    const maxAllowedDailyCap = Number(
      payload.maxAllowedDailyCap ?? existingConfig?.maxAllowedDailyCap,
    );

    if (!Number.isFinite(maxAllowedDailyCap) || maxAllowedDailyCap <= 0) {
      throw new HttpErrors.BadRequest(
        'maxAllowedDailyCap must be greater than zero',
      );
    }

    const hasSelectedDailyCapInPayload = Object.prototype.hasOwnProperty.call(
      payload,
      'selectedDailyCap',
    );
    const rawSelectedDailyCap = hasSelectedDailyCapInPayload
      ? payload.selectedDailyCap
      : existingConfig?.selectedDailyCap;
    const selectedDailyCap = Number(rawSelectedDailyCap ?? 0);
    const normalizedSelectedDailyCap =
      Number.isFinite(selectedDailyCap) && selectedDailyCap > 0
        ? Number(Math.min(selectedDailyCap, maxAllowedDailyCap).toFixed(2))
        : undefined;

    const scheduleMode =
      payload.scheduleMode ?? existingConfig?.scheduleMode ?? 'eod';
    const frequencyHours =
      scheduleMode === 'bucketed'
        ? (payload.frequencyHours ?? existingConfig?.frequencyHours)
        : undefined;
    const commitmentUnit =
      payload.commitmentUnit ?? existingConfig?.commitmentUnit ?? 'none';
    const commitmentValue =
      commitmentUnit === 'none'
        ? 0
        : Number(
            payload.commitmentValue ?? existingConfig?.commitmentValue ?? 0,
          );

    if (
      commitmentUnit !== 'none' &&
      (!Number.isFinite(commitmentValue) || commitmentValue <= 0)
    ) {
      throw new HttpErrors.BadRequest(
        'commitmentValue must be greater than zero when commitmentUnit is week or month',
      );
    }

    const commitmentStartAt =
      commitmentUnit === 'none'
        ? undefined
        : (payload.commitmentStartAt ??
          existingConfig?.commitmentStartAt ??
          referenceAt);

    const configData: Partial<MerchantPayoutConfig> = {
      merchantProfilesId,
      usersId,
      maxAllowedDailyCap: Number(maxAllowedDailyCap.toFixed(2)),
      selectedDailyCap: normalizedSelectedDailyCap,
      scheduleMode: scheduleMode === 'bucketed' ? 'bucketed' : 'eod',
      frequencyHours,
      startTime: payload.startTime ?? existingConfig?.startTime ?? '09:00',
      cutoffTime: payload.cutoffTime ?? existingConfig?.cutoffTime ?? '20:00',
      timezone:
        payload.timezone ?? existingConfig?.timezone ?? DEFAULT_TIMEZONE,
      commitmentUnit,
      commitmentValue,
      commitmentStartAt,
      commitmentEndAt: undefined,
      autoPayoutEnabled: existingConfig?.autoPayoutEnabled ?? true,
      autoPayoutStatus: existingConfig?.autoPayoutStatus ?? 'active',
      stopRequestedAt: existingConfig?.stopRequestedAt,
      stopEffectiveAt: existingConfig?.stopEffectiveAt,
      stopReason: existingConfig?.stopReason,
      isActive: existingConfig?.isActive ?? true,
      isDeleted: false,
      createdAt: existingConfig?.createdAt ?? referenceAt,
      updatedAt: referenceAt,
      deletedAt: undefined,
    };

    const config = new MerchantPayoutConfig(configData);
    config.commitmentEndAt =
      commitmentUnit === 'none'
        ? undefined
        : this.resolveCommitmentEndAt(config);

    if (config.autoPayoutStatus === 'stop_requested') {
      config.stopEffectiveAt = config.commitmentEndAt ?? config.stopEffectiveAt;
    }

    this.validateConfig(config);
    return config;
  }

  async upsertConfigForMerchant(
    merchantProfilesId: string,
    usersId: string,
    payload: MerchantPayoutConfigUpsertPayload,
    referenceAt: Date = new Date(),
  ) {
    const existingConfig = await this.findConfigForMerchant(
      merchantProfilesId,
      usersId,
    );
    const normalizedConfig = this.buildConfigForUpsert(
      existingConfig,
      merchantProfilesId,
      usersId,
      payload,
      referenceAt,
    );

    if (!existingConfig) {
      return this.merchantPayoutConfigRepository.create({
        ...normalizedConfig,
        id: uuidv4(),
      });
    }

    const updatableFields =
      normalizedConfig.toJSON() as Partial<MerchantPayoutConfig>;
    delete updatableFields.id;

    await this.merchantPayoutConfigRepository.updateById(
      existingConfig.id,
      updatableFields,
    );

    return this.merchantPayoutConfigRepository.findById(existingConfig.id);
  }

  private async loadConfig(configOrId: MerchantPayoutConfig | string) {
    if (typeof configOrId !== 'string') {
      return configOrId;
    }

    return this.merchantPayoutConfigRepository.findById(configOrId);
  }

  private serializeWindowKey(
    merchantPayoutConfigId: string,
    businessDate: string,
    bucketStartAt: Date,
    bucketEndAt: Date,
  ) {
    return [
      merchantPayoutConfigId,
      businessDate,
      bucketStartAt.toISOString(),
      bucketEndAt.toISOString(),
    ].join('|');
  }

  private getTransactionSettledConsumedAmount(transaction: Transaction) {
    return Math.max(Number(transaction.releasedAmount ?? 0), 0);
  }

  private resolvePlatformFundingStatus(transaction?: Partial<Transaction>) {
    if (
      transaction?.status === MERCHANT_FUNDED_STATUS ||
      Number(transaction?.releasedAmount ?? 0) > 0 ||
      transaction?.lastReleasedAt
    ) {
      return MERCHANT_FUNDED_STATUS;
    }

    return MERCHANT_NOT_FUNDED_STATUS;
  }

  private resolveFrequencyMinutes(frequencyHours?: number) {
    if (!Number.isFinite(frequencyHours) || !frequencyHours || frequencyHours <= 0) {
      return undefined;
    }

    return Math.max(Math.round(frequencyHours * 60), 1);
  }

  private createFallbackConfigData(
    merchantProfile: MerchantProfiles,
    referenceAt: Date,
  ) {
    return {
      merchantProfilesId: merchantProfile.id,
      usersId: merchantProfile.usersId,
      maxAllowedDailyCap: DEFAULT_FALLBACK_PLATFORM_DAILY_LIMIT,
      selectedDailyCap: DEFAULT_FALLBACK_PLATFORM_DAILY_LIMIT,
      scheduleMode: 'eod',
      frequencyHours: undefined,
      startTime: '09:00',
      cutoffTime: '20:00',
      timezone: DEFAULT_TIMEZONE,
      commitmentUnit: 'none',
      commitmentValue: 0,
      commitmentStartAt: undefined,
      commitmentEndAt: undefined,
      autoPayoutEnabled: true,
      autoPayoutStatus: 'active',
      lastProcessedWindowEndAt: undefined,
      isActive: true,
      isDeleted: false,
      createdAt: referenceAt,
      updatedAt: referenceAt,
    } as Partial<MerchantPayoutConfig>;
  }

  private async ensureFallbackConfigForMerchant(
    merchantProfile: MerchantProfiles,
    referenceAt: Date,
  ) {
    const existingConfig = await this.findConfigForMerchant(
      merchantProfile.id,
      merchantProfile.usersId,
    );

    if (existingConfig) {
      return existingConfig;
    }

    const fallbackConfig = await this.merchantPayoutConfigRepository.create({
      id: uuidv4(),
      ...this.createFallbackConfigData(merchantProfile, referenceAt),
    });

    this.logMerchantPayoutCronDebug(
      '[MerchantPayoutCron] Created fallback merchant payout config',
      {
        merchantProfilesId: merchantProfile.id,
        usersId: merchantProfile.usersId,
        merchantPayoutConfigId: fallbackConfig.id,
        maxAllowedDailyCap: fallbackConfig.maxAllowedDailyCap,
      },
    );

    return fallbackConfig;
  }

  private async listConfigsForEvaluation(referenceAt: Date) {
    const existingConfigs = await this.merchantPayoutConfigRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt ASC'],
    });

    const existingConfigMerchantIds = new Set(
      existingConfigs.map(config => config.merchantProfilesId),
    );
    const merchantProfiles = await this.merchantProfilesRepository.find({
      where: {
        and: [{isActive: true}, {isDeleted: false}],
      },
      order: ['createdAt ASC'],
    });

    const fallbackConfigs: MerchantPayoutConfig[] = [];

    for (const merchantProfile of merchantProfiles) {
      if (existingConfigMerchantIds.has(merchantProfile.id)) {
        continue;
      }

      const fallbackConfig = await this.ensureFallbackConfigForMerchant(
        merchantProfile,
        referenceAt,
      );
      fallbackConfigs.push(fallbackConfig);
    }

    return [...existingConfigs, ...fallbackConfigs];
  }

  private async updateLastProcessedWindowEndAt(
    configId: string,
    bucketEndAt: Date,
  ) {
    const config = await this.merchantPayoutConfigRepository.findById(configId);
    const currentProcessedAt = config.lastProcessedWindowEndAt
      ? new Date(config.lastProcessedWindowEndAt)
      : undefined;

    if (
      currentProcessedAt &&
      currentProcessedAt.getTime() >= bucketEndAt.getTime()
    ) {
      return config;
    }

    await this.merchantPayoutConfigRepository.updateById(configId, {
      lastProcessedWindowEndAt: bucketEndAt,
      updatedAt: new Date(),
    });

    return this.merchantPayoutConfigRepository.findById(configId);
  }

  resolveEffectiveDailyCap(config: MerchantPayoutConfig) {
    const selectedDailyCap = Number(config.selectedDailyCap ?? 0);
    const maxAllowedDailyCap = Number(config.maxAllowedDailyCap ?? 0);

    if (selectedDailyCap > 0) {
      return Number(Math.min(selectedDailyCap, maxAllowedDailyCap).toFixed(2));
    }

    return Number(maxAllowedDailyCap.toFixed(2));
  }

  resolveCommitmentEndAt(config: MerchantPayoutConfig) {
    if (config.commitmentEndAt) {
      return new Date(config.commitmentEndAt);
    }

    if (
      !config.commitmentStartAt ||
      config.commitmentUnit === 'none' ||
      !config.commitmentValue
    ) {
      return undefined;
    }

    const endAt = new Date(config.commitmentStartAt);

    if (config.commitmentUnit === 'week') {
      endAt.setUTCDate(endAt.getUTCDate() + config.commitmentValue * 7);
      return endAt;
    }

    if (config.commitmentUnit === 'month') {
      endAt.setUTCMonth(endAt.getUTCMonth() + config.commitmentValue);
      return endAt;
    }

    return undefined;
  }

  canStopAutoPayout(
    config: MerchantPayoutConfig,
    referenceAt: Date = new Date(),
  ) {
    const commitmentEndAt = this.resolveCommitmentEndAt(config);

    if (!commitmentEndAt) {
      return true;
    }

    return referenceAt.getTime() >= commitmentEndAt.getTime();
  }

  resolveTransactionBusinessDate(
    createdAt: Date,
    config: MerchantPayoutConfig,
  ) {
    const timezone = this.getConfigTimezone(config);
    const localDate = this.getLocalBusinessDate(createdAt, timezone);
    const cutoffAt = this.buildDateInTimezone(
      localDate,
      config.cutoffTime,
      timezone,
    );

    if (createdAt.getTime() > cutoffAt.getTime()) {
      return this.addDays(localDate, 1);
    }

    return localDate;
  }

  resolveBusinessWindow(config: MerchantPayoutConfig, businessDate: string) {
    const timezone = this.getConfigTimezone(config);

    return {
      startAt: this.buildDateInTimezone(
        businessDate,
        config.startTime,
        timezone,
      ),
      cutoffAt: this.buildDateInTimezone(
        businessDate,
        config.cutoffTime,
        timezone,
      ),
    };
  }

  getPayoutWindowsForBusinessDate(
    config: MerchantPayoutConfig,
    businessDate: string,
  ): MerchantPayoutWindow[] {
    this.validateConfig(config);

    const {startAt, cutoffAt} = this.resolveBusinessWindow(
      config,
      businessDate,
    );
    const scheduleMode = this.getConfigScheduleMode(config);

    if (scheduleMode === 'eod') {
      return [
        {
          businessDate,
          bucketStartAt: startAt,
          bucketEndAt: cutoffAt,
          scheduledFor: cutoffAt,
          scheduleMode: 'eod',
          runType: 'eod_default',
        },
      ];
    }

    const windows: MerchantPayoutWindow[] = [];
    const frequencyHours = config.frequencyHours!;
    const frequencyMinutes = this.resolveFrequencyMinutes(frequencyHours);

    if (!frequencyMinutes) {
      throw new HttpErrors.BadRequest(
        'frequencyHours must resolve to at least one minute',
      );
    }

    let cursor = new Date(startAt);

    while (cursor.getTime() < cutoffAt.getTime()) {
      const nextEndAt = new Date(cursor);
      nextEndAt.setUTCMinutes(nextEndAt.getUTCMinutes() + frequencyMinutes);

      if (nextEndAt.getTime() > cutoffAt.getTime()) {
        nextEndAt.setTime(cutoffAt.getTime());
      }

      windows.push({
        businessDate,
        bucketStartAt: new Date(cursor),
        bucketEndAt: nextEndAt,
        scheduledFor: nextEndAt,
        frequencyHours,
        scheduleMode: 'bucketed',
        runType:
          nextEndAt.getTime() === cutoffAt.getTime()
            ? 'cutoff_sweep'
            : 'scheduled',
      });

      cursor = nextEndAt;
    }

    return windows;
  }

  async requestAutoPayoutStop(
    configId: string,
    stopReason?: string,
    referenceAt: Date = new Date(),
  ): Promise<MerchantPayoutStopResult> {
    const config = await this.merchantPayoutConfigRepository.findById(configId);
    const commitmentEndAt = this.resolveCommitmentEndAt(config);
    const canStopNow = this.canStopAutoPayout(config, referenceAt);

    await this.merchantPayoutConfigRepository.updateById(configId, {
      autoPayoutEnabled: !canStopNow,
      autoPayoutStatus: canStopNow ? 'stopped' : 'stop_requested',
      stopRequestedAt: referenceAt,
      stopEffectiveAt: canStopNow ? referenceAt : commitmentEndAt,
      stopReason,
      commitmentEndAt: commitmentEndAt ?? config.commitmentEndAt,
      updatedAt: referenceAt,
    });

    const updatedConfig =
      await this.merchantPayoutConfigRepository.findById(configId);

    return {
      success: true,
      message: canStopNow
        ? 'Auto payout stopped successfully'
        : 'Stop request recorded. Auto payout will stop after the commitment period ends.',
      config: updatedConfig,
    };
  }

  async reactivateAutoPayout(
    configId: string,
    referenceAt: Date = new Date(),
  ): Promise<MerchantPayoutStopResult> {
    await this.merchantPayoutConfigRepository.updateById(configId, {
      autoPayoutEnabled: true,
      autoPayoutStatus: 'active',
      stopRequestedAt: undefined,
      stopEffectiveAt: undefined,
      stopReason: undefined,
      updatedAt: referenceAt,
    });

    const updatedConfig =
      await this.merchantPayoutConfigRepository.findById(configId);

    return {
      success: true,
      message: 'Auto payout reactivated successfully',
      config: updatedConfig,
    };
  }

  private async applyPendingStopIfDue(
    config: MerchantPayoutConfig,
    referenceAt: Date = new Date(),
  ) {
    if (config.autoPayoutStatus !== 'stop_requested') {
      return config;
    }

    const stopEffectiveAt =
      config.stopEffectiveAt ?? this.resolveCommitmentEndAt(config);

    if (!stopEffectiveAt || referenceAt.getTime() < stopEffectiveAt.getTime()) {
      return config;
    }

    await this.merchantPayoutConfigRepository.updateById(config.id, {
      autoPayoutEnabled: false,
      autoPayoutStatus: 'stopped',
      stopEffectiveAt,
      updatedAt: referenceAt,
    });

    return this.merchantPayoutConfigRepository.findById(config.id);
  }

  private shouldProcessConfig(config: MerchantPayoutConfig) {
    return (
      config.isDeleted !== true &&
      config.isActive !== false &&
      config.autoPayoutEnabled !== false &&
      config.autoPayoutStatus !== 'stopped'
    );
  }

  async getPrimaryMerchantBankAccount(usersId: string) {
    return this.bankDetailsRepository.findOne({
      where: {
        and: [
          {usersId},
          {roleValue: 'merchant'},
          {status: 1},
          {isPrimary: true},
          {isActive: true},
          {isDeleted: false},
        ],
      },
    });
  }

  private async getMerchantPspIds(config: MerchantPayoutConfig) {
    const psps = await this.pspRepository.find({
      where: {
        and: [
          {merchantProfilesId: config.merchantProfilesId},
          {usersId: config.usersId},
          {isActive: true},
          {isDeleted: false},
        ],
      },
      fields: {id: true},
    });

    return psps.map(psp => psp.id);
  }

  private async getDailyBatchUsage(
    merchantPayoutConfigId: string,
    businessDate: string,
  ): Promise<DailyBatchUsage> {
    const batches = await this.merchantPayoutBatchRepository.find({
      where: {
        and: [
          {merchantPayoutConfigId},
          {businessDate},
          {status: {inq: ACTIVE_BATCH_STATUSES}},
          {isDeleted: false},
        ],
      },
      fields: {
        id: true,
        status: true,
        releasedAmount: true,
      },
    });

    const reservedOrReleasedToday = Number(
      batches
        .reduce((sum, batch) => sum + Number(batch.releasedAmount ?? 0), 0)
        .toFixed(2),
    );
    const pendingReservedAmounts = new Map<string, number>();
    const pendingBatchIds = batches
      .filter(batch => PENDING_BATCH_STATUSES.includes(batch.status))
      .map(batch => batch.id);

    if (!pendingBatchIds.length) {
      return {
        reservedOrReleasedToday,
        pendingReservedAmounts,
      };
    }

    const items = await this.merchantPayoutBatchItemRepository.find({
      where: {
        and: [
          {merchantPayoutBatchId: {inq: pendingBatchIds}},
          {isDeleted: false},
        ],
      },
      fields: {
        transactionId: true,
        allocatedAmount: true,
      },
    });

    for (const item of items) {
      const currentAmount = pendingReservedAmounts.get(item.transactionId) ?? 0;
      pendingReservedAmounts.set(
        item.transactionId,
        Number((currentAmount + Number(item.allocatedAmount ?? 0)).toFixed(2)),
      );
    }

    return {
      reservedOrReleasedToday,
      pendingReservedAmounts,
    };
  }

  private async listTransactionsForWindow(
    config: MerchantPayoutConfig,
    businessDate: string,
    bucketEndAt: Date,
  ) {
    const pspIds = await this.getMerchantPspIds(config);

    if (!pspIds.length) {
      return [];
    }

    const previousBusinessDate = this.addDays(businessDate, -1);
    const previousCutoffAt = this.buildDateInTimezone(
      previousBusinessDate,
      config.cutoffTime,
      this.getConfigTimezone(config),
    );

    const transactions = await this.transactionRepository.find({
      where: {
        and: [
          {pspId: {inq: pspIds}},
          {isDeleted: false},
          {
            createdAt: {
              gte: previousCutoffAt,
              lte: bucketEndAt,
            },
          },
        ],
      },
      order: ['createdAt ASC'],
    });

    return transactions.filter(transaction => {
      if (!transaction.createdAt) {
        return false;
      }

      const createdAt = new Date(transaction.createdAt);
      const resolvedBusinessDate =
        transaction.eligibleBusinessDate ??
        this.resolveTransactionBusinessDate(createdAt, config);

      return (
        transaction.status !== MERCHANT_FUNDED_STATUS &&
        isSettlementEligibleForDiscounting(transaction.pspSettlementStatus) &&
        resolvedBusinessDate === businessDate &&
        createdAt.getTime() <= bucketEndAt.getTime()
      );
    });
  }

  private allocateTransactions(
    transactions: TransactionCandidate[],
    releaseTargetAmount: number,
  ) {
    const allocations: Array<{
      transaction: Transaction;
      allocatedAmount: number;
    }> = [];

    let remainingAmount = releaseTargetAmount;

    for (const candidate of transactions) {
      if (remainingAmount <= 0) {
        break;
      }

      // Do not partially fund a transaction. Fund it only when the whole
      // discountable amount fits within the remaining daily capacity.
      if (candidate.availableAmount > remainingAmount) {
        continue;
      }

      const allocatedAmount = candidate.availableAmount;

      if (allocatedAmount <= 0) {
        continue;
      }

      allocations.push({
        transaction: candidate.transaction,
        allocatedAmount: Number(allocatedAmount.toFixed(2)),
      });

      remainingAmount = Number((remainingAmount - allocatedAmount).toFixed(2));
    }

    return allocations;
  }

  private async buildBatchDraft(
    config: MerchantPayoutConfig,
    window: MerchantPayoutWindow,
  ) {
    const effectiveDailyCap = this.resolveEffectiveDailyCap(config);
    const dailyBatchUsage = await this.getDailyBatchUsage(
      config.id,
      window.businessDate,
    );
    const availableDailyCap = Number(
      Math.max(
        effectiveDailyCap - dailyBatchUsage.reservedOrReleasedToday,
        0,
      ).toFixed(2),
    );

    const transactions = await this.listTransactionsForWindow(
      config,
      window.businessDate,
      window.bucketEndAt,
    );

    const candidates: TransactionCandidate[] = [];

    for (const transaction of transactions) {
      const settledConsumedAmount =
        this.getTransactionSettledConsumedAmount(transaction);
      const pendingReservedAmount =
        dailyBatchUsage.pendingReservedAmounts.get(transaction.id) ?? 0;
      const transactionNetAmount = Number(transaction.netAmount ?? 0);
      const availableAmount = Number(
        Math.max(
          transactionNetAmount - settledConsumedAmount - pendingReservedAmount,
          0,
        ).toFixed(2),
      );

      if (availableAmount <= 0) {
        continue;
      }

      candidates.push({
        transaction,
        availableAmount,
      });
    }

    const eligibleAmount = Number(
      candidates
        .reduce((sum, candidate) => sum + candidate.availableAmount, 0)
        .toFixed(2),
    );
    const allocations = this.allocateTransactions(candidates, availableDailyCap);
    const releasedAmount = Number(
      allocations
        .reduce((sum, allocation) => sum + Number(allocation.allocatedAmount ?? 0), 0)
        .toFixed(2),
    );
    const totalFundedAmount = Number(
      (
        Number(dailyBatchUsage.reservedOrReleasedToday ?? 0) +
        Number(releasedAmount ?? 0)
      ).toFixed(2),
    );

    return {
      effectiveDailyCap,
      alreadyReleasedToday: dailyBatchUsage.reservedOrReleasedToday,
      availableDailyCap,
      eligibleAmount,
      releasedAmount,
      totalFundedAmount,
      allocations,
    };
  }

  private async listDueWindowsForResolvedConfig(
    config: MerchantPayoutConfig,
    referenceAt: Date,
    lookbackDays: number,
  ) {
    const boundedLookbackDays = this.sanitizeLookbackDays(lookbackDays);
    const timezone = this.getConfigTimezone(config);
    const currentBusinessDate = this.getLocalBusinessDate(
      referenceAt,
      timezone,
    );
    const lastProcessedWindowEndAt = config.lastProcessedWindowEndAt
      ? new Date(config.lastProcessedWindowEndAt)
      : undefined;
    const earliestBusinessDate = lastProcessedWindowEndAt
      ? this.getLocalBusinessDate(lastProcessedWindowEndAt, timezone)
      : this.addDays(currentBusinessDate, -boundedLookbackDays);
    const businessDates: string[] = [];

    for (
      let businessDate = earliestBusinessDate;
      businessDate <= currentBusinessDate;
      businessDate = this.addDays(businessDate, 1)
    ) {
      businessDates.push(businessDate);
    }

    const existingBatches = await this.merchantPayoutBatchRepository.find({
      where: {
        and: [
          {merchantPayoutConfigId: config.id},
          {businessDate: {inq: businessDates}},
          {isDeleted: false},
        ],
      },
      fields: {
        merchantPayoutConfigId: true,
        businessDate: true,
        bucketStartAt: true,
        bucketEndAt: true,
      },
    });

    const existingKeys = new Set(
      existingBatches.map(batch =>
        this.serializeWindowKey(
          config.id,
          batch.businessDate,
          new Date(batch.bucketStartAt),
          new Date(batch.bucketEndAt),
        ),
      ),
    );

    const dueWindows: MerchantPayoutWindow[] = [];

    for (const businessDate of businessDates) {
      const windows = this.getPayoutWindowsForBusinessDate(
        config,
        businessDate,
      );

      for (const window of windows) {
        const key = this.serializeWindowKey(
          config.id,
          window.businessDate,
          window.bucketStartAt,
          window.bucketEndAt,
        );

        if (existingKeys.has(key)) {
          continue;
        }

        if (
          lastProcessedWindowEndAt &&
          window.scheduledFor.getTime() <= lastProcessedWindowEndAt.getTime()
        ) {
          continue;
        }

        if (window.scheduledFor.getTime() <= referenceAt.getTime()) {
          dueWindows.push(window);
        }
      }
    }

    return dueWindows.sort(
      (left, right) =>
        left.scheduledFor.getTime() - right.scheduledFor.getTime(),
    );
  }

  async listDueWindowsForConfig(
    configOrId: MerchantPayoutConfig | string,
    referenceAt: Date = new Date(),
    lookbackDays = 2,
  ) {
    let config = await this.loadConfig(configOrId);
    config = await this.applyPendingStopIfDue(config, referenceAt);

    if (!this.shouldProcessConfig(config)) {
      return [];
    }

    return this.listDueWindowsForResolvedConfig(
      config,
      referenceAt,
      lookbackDays,
    );
  }

  private async createBatchAndItems(
    config: MerchantPayoutConfig,
    window: MerchantPayoutWindow,
    batchDraft: Awaited<ReturnType<MerchantPayoutService['buildBatchDraft']>>,
  ) {
    const tx =
      await this.merchantPayoutBatchRepository.dataSource.beginTransaction(
        PAYOUT_TRANSACTION_OPTIONS,
      );

    try {
      const batch = await this.merchantPayoutBatchRepository.create(
        {
          id: uuidv4(),
          businessDate: window.businessDate,
          bucketStartAt: window.bucketStartAt,
          bucketEndAt: window.bucketEndAt,
          scheduledFor: window.scheduledFor,
          frequencyHours: window.frequencyHours,
          scheduleMode: window.scheduleMode,
          effectiveDailyCap: batchDraft.effectiveDailyCap,
          alreadyReleasedToday: batchDraft.alreadyReleasedToday,
          eligibleAmount: batchDraft.eligibleAmount,
          releasedAmount: batchDraft.releasedAmount,
          totalFundedAmount: batchDraft.totalFundedAmount,
          runType: window.runType,
          status: 'pending',
          merchantPayoutConfigId: config.id,
          merchantProfilesId: config.merchantProfilesId,
          usersId: config.usersId,
        },
        {transaction: tx},
      );

      const items = await this.merchantPayoutBatchItemRepository.createAll(
        batchDraft.allocations.map(allocation => ({
          id: uuidv4(),
          transactionAmount: Number(allocation.transaction.amount ?? 0),
          totalReceivedAmount: Number(
            allocation.transaction.totalRecieved ?? 0,
          ),
          haircutPercentage: Number(allocation.transaction.haircut ?? 0),
          transactionNetAmount: Number(allocation.transaction.netAmount ?? 0),
          allocatedAmount: Number(allocation.allocatedAmount ?? 0),
          status: 'allocated',
          merchantPayoutBatchId: batch.id,
          transactionId: allocation.transaction.id,
        })),
        {transaction: tx},
      );

      await tx.commit();
      return {batch, items, wasCreated: true};
    } catch (error) {
      await tx.rollback();

      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const existingBatch = await this.merchantPayoutBatchRepository.findOne({
        where: {
          and: [
            {merchantPayoutConfigId: config.id},
            {businessDate: window.businessDate},
            {bucketStartAt: window.bucketStartAt},
            {bucketEndAt: window.bucketEndAt},
            {isDeleted: false},
          ],
        },
      });

      if (!existingBatch) {
        throw error;
      }

      const existingBatchWithItems = await this.fetchBatchWithItems(
        existingBatch.id,
      );
      return {
        ...existingBatchWithItems,
        wasCreated: false,
      };
    }
  }

  private async prepareBatchForResolvedConfig(
    config: MerchantPayoutConfig,
    window: MerchantPayoutWindow,
    options?: {debug?: boolean},
  ): Promise<MerchantPayoutBatchPreparation | null> {
    this.validateConfig(config);

    const existingBatch = await this.merchantPayoutBatchRepository.findOne({
      where: {
        and: [
          {merchantPayoutConfigId: config.id},
          {businessDate: window.businessDate},
          {bucketStartAt: window.bucketStartAt},
          {bucketEndAt: window.bucketEndAt},
          {isDeleted: false},
        ],
      },
    });

    if (existingBatch) {
      await this.updateLastProcessedWindowEndAt(config.id, window.bucketEndAt);

      const existingBatchWithItems = await this.fetchBatchWithItems(
        existingBatch.id,
      );
      const beneficiaryAccount =
        Number(existingBatch.releasedAmount ?? 0) > 0
          ? await this.getPrimaryMerchantBankAccount(config.usersId)
          : null;

      return {
        batch: existingBatchWithItems.batch,
        items: existingBatchWithItems.items,
        beneficiaryAccount,
        window,
        effectiveDailyCap: Number(existingBatch.effectiveDailyCap ?? 0),
        availableDailyCap: Number(
          Math.max(
            Number(existingBatch.effectiveDailyCap ?? 0) -
              Number(existingBatch.alreadyReleasedToday ?? 0),
            0,
          ).toFixed(2),
        ),
        eligibleAmount: Number(existingBatch.eligibleAmount ?? 0),
        releasedAmount: Number(existingBatch.releasedAmount ?? 0),
        totalFundedAmount: Number(
          (
            Number(
              existingBatch.totalFundedAmount ??
                Number(existingBatch.alreadyReleasedToday ?? 0) +
                  Number(existingBatch.releasedAmount ?? 0),
            ) ?? 0
          ).toFixed(2),
        ),
        wasCreated: false,
      };
    }

    const batchDraft = await this.buildBatchDraft(config, window);

    if (batchDraft.releasedAmount <= 0) {
      await this.updateLastProcessedWindowEndAt(config.id, window.bucketEndAt);

      if (options?.debug) {
        this.logMerchantPayoutCronDebug(
          '[MerchantPayoutCron] Skipping due window because nothing is releasable',
          {
            ...this.getConfigDebugContext(config),
            ...this.getWindowDebugContext(window),
            eligibleAmount: batchDraft.eligibleAmount,
            releasedAmount: batchDraft.releasedAmount,
            availableDailyCap: batchDraft.availableDailyCap,
            alreadyReleasedToday: batchDraft.alreadyReleasedToday,
          },
        );
      }

      return null;
    }

    const beneficiaryAccount = await this.getPrimaryMerchantBankAccount(
      config.usersId,
    );

    if (!beneficiaryAccount) {
      if (options?.debug) {
        this.logMerchantPayoutCronDebug(
          '[MerchantPayoutCron] Beneficiary bank account missing for releasable batch',
          {
            ...this.getConfigDebugContext(config),
            ...this.getWindowDebugContext(window),
            eligibleAmount: batchDraft.eligibleAmount,
            releasedAmount: batchDraft.releasedAmount,
          },
        );
      }

      throw new HttpErrors.BadRequest(
        'No approved primary merchant bank account found for payout',
      );
    }

    const createdBatch = await this.createBatchAndItems(
      config,
      window,
      batchDraft,
    );
    await this.updateLastProcessedWindowEndAt(config.id, window.bucketEndAt);

    return {
      batch: createdBatch.batch,
      items: createdBatch.items,
      beneficiaryAccount,
      window,
      effectiveDailyCap: batchDraft.effectiveDailyCap,
      availableDailyCap: batchDraft.availableDailyCap,
      eligibleAmount: batchDraft.eligibleAmount,
      releasedAmount: batchDraft.releasedAmount,
      totalFundedAmount: batchDraft.totalFundedAmount,
      wasCreated: createdBatch.wasCreated,
    };
  }

  async prepareBatchForWindow(
    configOrId: MerchantPayoutConfig | string,
    window: MerchantPayoutWindow,
    referenceAt: Date = new Date(),
  ): Promise<MerchantPayoutBatchPreparation | null> {
    let config = await this.loadConfig(configOrId);
    config = await this.applyPendingStopIfDue(config, referenceAt);

    if (!this.shouldProcessConfig(config)) {
      return null;
    }

    return this.prepareBatchForResolvedConfig(config, window);
  }

  private isFinalWindowBatch(
    batch: MerchantPayoutBatch,
    config: MerchantPayoutConfig,
  ) {
    if (batch.scheduleMode === 'eod') {
      return true;
    }

    const {cutoffAt} = this.resolveBusinessWindow(config, batch.businessDate);
    return new Date(batch.bucketEndAt).getTime() === cutoffAt.getTime();
  }

  private async listRetryableFailedBatchesForResolvedConfig(
    config: MerchantPayoutConfig,
    referenceAt: Date,
    lookbackDays: number,
  ) {
    const boundedLookbackDays = this.sanitizeLookbackDays(lookbackDays);
    const currentBusinessDate = this.getLocalBusinessDate(
      referenceAt,
      this.getConfigTimezone(config),
    );
    const businessDates = Array.from(
      {length: boundedLookbackDays + 1},
      (_, index) =>
        this.addDays(currentBusinessDate, -boundedLookbackDays + index),
    );

    const failedBatches = await this.merchantPayoutBatchRepository.find({
      where: {
        and: [
          {merchantPayoutConfigId: config.id},
          {businessDate: {inq: businessDates}},
          {status: 'failed'},
          {isDeleted: false},
        ],
      },
      order: ['scheduledFor ASC'],
    });

    return failedBatches.filter(batch => {
      const completedAt = batch.completedAt
        ? new Date(batch.completedAt)
        : undefined;
      const retryBackoffPassed =
        !completedAt ||
        referenceAt.getTime() - completedAt.getTime() >= RETRY_BACKOFF_MS;
      const isPreviousBusinessDate = batch.businessDate < currentBusinessDate;

      return (
        retryBackoffPassed &&
        (isPreviousBusinessDate || this.isFinalWindowBatch(batch, config))
      );
    });
  }

  async retryFailedBatch(
    batchOrId: MerchantPayoutBatch | string,
    referenceAt: Date = new Date(),
  ): Promise<MerchantPayoutBatchPreparation | null> {
    const failedBatch =
      typeof batchOrId === 'string'
        ? await this.merchantPayoutBatchRepository.findById(batchOrId)
        : batchOrId;

    if (failedBatch.status !== 'failed') {
      throw new HttpErrors.BadRequest('Only failed batches can be retried');
    }

    let config = await this.merchantPayoutConfigRepository.findById(
      failedBatch.merchantPayoutConfigId,
    );
    config = await this.applyPendingStopIfDue(config, referenceAt);

    if (!this.shouldProcessConfig(config)) {
      return null;
    }

    const window: MerchantPayoutWindow = {
      businessDate: failedBatch.businessDate,
      bucketStartAt: new Date(failedBatch.bucketStartAt),
      bucketEndAt: new Date(failedBatch.bucketEndAt),
      scheduledFor: new Date(failedBatch.scheduledFor),
      frequencyHours: failedBatch.frequencyHours,
      scheduleMode: failedBatch.scheduleMode as ScheduleMode,
      runType: 'retry',
    };
    const batchDraft = await this.buildBatchDraft(config, window);
    const beneficiaryAccount =
      batchDraft.releasedAmount > 0
        ? await this.getPrimaryMerchantBankAccount(config.usersId)
        : null;

    if (batchDraft.releasedAmount > 0 && !beneficiaryAccount) {
      throw new HttpErrors.BadRequest(
        'No approved primary merchant bank account found for payout',
      );
    }

    const tx =
      await this.merchantPayoutBatchRepository.dataSource.beginTransaction(
        PAYOUT_TRANSACTION_OPTIONS,
      );

    try {
      await this.merchantPayoutBatchItemRepository.updateAll(
        {
          isDeleted: true,
          updatedAt: referenceAt,
        },
        {
          merchantPayoutBatchId: failedBatch.id,
          isDeleted: false,
        },
        {transaction: tx},
      );

      await this.merchantPayoutBatchRepository.updateById(
        failedBatch.id,
        {
          frequencyHours: window.frequencyHours,
          scheduleMode: window.scheduleMode,
          effectiveDailyCap: batchDraft.effectiveDailyCap,
          alreadyReleasedToday: batchDraft.alreadyReleasedToday,
          eligibleAmount: batchDraft.eligibleAmount,
          releasedAmount: batchDraft.releasedAmount,
          totalFundedAmount: batchDraft.totalFundedAmount,
          runType: 'retry',
          status: batchDraft.releasedAmount > 0 ? 'pending' : 'skipped',
          providerName: undefined,
          providerReferenceId: undefined,
          failureReason: undefined,
          providerResponse: undefined,
          triggeredAt: undefined,
          completedAt: undefined,
          updatedAt: referenceAt,
        },
        {transaction: tx},
      );

      const items =
        batchDraft.releasedAmount > 0
          ? await this.merchantPayoutBatchItemRepository.createAll(
              batchDraft.allocations.map(allocation => ({
                id: uuidv4(),
                transactionAmount: Number(allocation.transaction.amount ?? 0),
                totalReceivedAmount: Number(
                  allocation.transaction.totalRecieved ?? 0,
                ),
                haircutPercentage: Number(allocation.transaction.haircut ?? 0),
                transactionNetAmount: Number(
                  allocation.transaction.netAmount ?? 0,
                ),
                allocatedAmount: Number(allocation.allocatedAmount ?? 0),
                status: 'allocated',
                merchantPayoutBatchId: failedBatch.id,
                transactionId: allocation.transaction.id,
              })),
              {transaction: tx},
            )
          : [];

      await tx.commit();

      const batch = await this.merchantPayoutBatchRepository.findById(
        failedBatch.id,
      );

      return batchDraft.releasedAmount > 0
        ? {
            batch,
            items,
            beneficiaryAccount,
            window,
            effectiveDailyCap: batchDraft.effectiveDailyCap,
            availableDailyCap: batchDraft.availableDailyCap,
            eligibleAmount: batchDraft.eligibleAmount,
            releasedAmount: batchDraft.releasedAmount,
            totalFundedAmount: batchDraft.totalFundedAmount,
            wasCreated: false,
          }
        : null;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async prepareDueBatches(referenceAt: Date = new Date(), lookbackDays = 2) {
    const boundedLookbackDays = this.sanitizeLookbackDays(lookbackDays);
    const configs = await this.listConfigsForEvaluation(referenceAt);

    const preparedBatches: MerchantPayoutBatchPreparation[] = [];

    this.logMerchantPayoutCronDebug(
      '[MerchantPayoutCron] Loaded active configs for evaluation',
      {
        referenceAt: referenceAt.toISOString(),
        lookbackDays: boundedLookbackDays,
        configCount: configs.length,
      },
    );

    for (const baseConfig of configs) {
      try {
        const config = await this.applyPendingStopIfDue(baseConfig, referenceAt);

        if (!this.shouldProcessConfig(config)) {
          this.logMerchantPayoutCronDebug(
            '[MerchantPayoutCron] Skipping config because it is not processable',
            {
              ...this.getConfigDebugContext(config),
              referenceAt: referenceAt.toISOString(),
              isActive: config.isActive,
              isDeleted: config.isDeleted,
            },
          );
          continue;
        }

        this.validateConfig(config);
        this.logMerchantPayoutCronDebug(
          '[MerchantPayoutCron] Evaluating config',
          {
            ...this.getConfigDebugContext(config),
            referenceAt: referenceAt.toISOString(),
            lookbackDays: boundedLookbackDays,
          },
        );

        const retryableFailedBatches =
          await this.listRetryableFailedBatchesForResolvedConfig(
            config,
            referenceAt,
            boundedLookbackDays,
          );

        this.logMerchantPayoutCronDebug(
          '[MerchantPayoutCron] Retryable failed batches resolved',
          {
            ...this.getConfigDebugContext(config),
            retryableFailedBatchCount: retryableFailedBatches.length,
          },
        );

        for (const retryableFailedBatch of retryableFailedBatches) {
          try {
            const retriedBatch = await this.retryFailedBatch(
              retryableFailedBatch,
              referenceAt,
            );

            if (!retriedBatch) {
              this.logMerchantPayoutCronDebug(
                '[MerchantPayoutCron] Retry batch skipped because no amount is releasable',
                {
                  ...this.getConfigDebugContext(config),
                  batchId: retryableFailedBatch.id,
                  businessDate: retryableFailedBatch.businessDate,
                  scheduledFor: new Date(
                    retryableFailedBatch.scheduledFor,
                  ).toISOString(),
                },
              );
              continue;
            }

            preparedBatches.push(retriedBatch);
            this.logMerchantPayoutCronDebug(
              '[MerchantPayoutCron] Retry batch prepared',
              {
                ...this.getConfigDebugContext(config),
                batchId: retriedBatch.batch.id,
                releasedAmount: retriedBatch.releasedAmount,
                eligibleAmount: retriedBatch.eligibleAmount,
                itemCount: retriedBatch.items.length,
                wasCreated: retriedBatch.wasCreated,
                ...this.getWindowDebugContext(retriedBatch.window),
              },
            );
          } catch (error) {
            console.error(
              `[MerchantPayoutCron] Failed retry batch ${retryableFailedBatch.id} for config ${config.id}: ${this.getErrorMessage(error)}`,
            );
          }
        }

        const dueWindows = await this.listDueWindowsForResolvedConfig(
          config,
          referenceAt,
          boundedLookbackDays,
        );

        this.logMerchantPayoutCronDebug(
          '[MerchantPayoutCron] Due windows resolved',
          {
            ...this.getConfigDebugContext(config),
            dueWindowCount: dueWindows.length,
            dueWindows: dueWindows.map(window => this.getWindowDebugContext(window)),
          },
        );

        for (const window of dueWindows) {
          try {
            const preparedBatch = await this.prepareBatchForResolvedConfig(
              config,
              window,
              {debug: true},
            );

            if (!preparedBatch) {
              continue;
            }

            preparedBatches.push(preparedBatch);
            this.logMerchantPayoutCronDebug(
              '[MerchantPayoutCron] Due window prepared successfully',
              {
                ...this.getConfigDebugContext(config),
                batchId: preparedBatch.batch.id,
                releasedAmount: preparedBatch.releasedAmount,
                eligibleAmount: preparedBatch.eligibleAmount,
                availableDailyCap: preparedBatch.availableDailyCap,
                itemCount: preparedBatch.items.length,
                wasCreated: preparedBatch.wasCreated,
                ...this.getWindowDebugContext(preparedBatch.window),
              },
            );
          } catch (error) {
            console.error(
              `[MerchantPayoutCron] Failed due window ${window.businessDate} (${window.bucketStartAt.toISOString()} - ${window.bucketEndAt.toISOString()}) for config ${config.id}: ${this.getErrorMessage(error)}`,
            );
          }
        }
      } catch (error) {
        console.error(
          `[MerchantPayoutCron] Failed config ${baseConfig.id}: ${this.getErrorMessage(error)}`,
        );
      }
    }

    this.logMerchantPayoutCronDebug(
      '[MerchantPayoutCron] Evaluation finished',
      {
        referenceAt: referenceAt.toISOString(),
        preparedBatchCount: preparedBatches.length,
      },
    );

    return preparedBatches;
  }

  async markBatchAsProcessing(batchId: string, triggeredAt: Date = new Date()) {
    const batch = await this.merchantPayoutBatchRepository.findById(batchId);

    if (batch.status === 'success') {
      return batch;
    }

    await this.merchantPayoutBatchRepository.updateById(batchId, {
      status: 'processing',
      triggeredAt,
      updatedAt: triggeredAt,
    });

    return this.merchantPayoutBatchRepository.findById(batchId);
  }

  async markBatchAsSuccess(
    batchId: string,
    metadata?: {
      providerName?: string;
      providerReferenceId?: string;
      providerResponse?: object;
      completedAt?: Date;
    },
  ) {
    const completedAt = metadata?.completedAt ?? new Date();
    const tx =
      await this.merchantPayoutBatchRepository.dataSource.beginTransaction(
        PAYOUT_TRANSACTION_OPTIONS,
      );

    try {
      const batch = await this.merchantPayoutBatchRepository.findById(
        batchId,
        undefined,
        {transaction: tx},
      );

      if (batch.status === 'success') {
        await tx.commit();
        return batch;
      }

      const items = await this.merchantPayoutBatchItemRepository.find(
        {
          where: {
            and: [{merchantPayoutBatchId: batchId}, {isDeleted: false}],
          },
        },
        {transaction: tx},
      );
      const payoutConfig = await this.merchantPayoutConfigRepository.findById(
        batch.merchantPayoutConfigId,
        undefined,
        {transaction: tx},
      );
      const transactionIds = Array.from(
        new Set(items.map(item => item.transactionId)),
      );
      const transactions = transactionIds.length
        ? await this.transactionRepository.find(
            {
              where: {
                id: {inq: transactionIds},
              },
            },
            {transaction: tx},
          )
        : [];
      const transactionById = new Map(
        transactions.map(transaction => [transaction.id, transaction]),
      );

      for (const item of items) {
        const transaction = transactionById.get(item.transactionId);

        if (!transaction) {
          throw new HttpErrors.NotFound(
            `Transaction not found for payout batch item ${item.id}`,
          );
        }

        const updatedReleasedAmount = Number(
          (
            Number(transaction.releasedAmount ?? 0) +
            Number(item.allocatedAmount ?? 0)
          ).toFixed(2),
        );

        await this.transactionRepository.updateById(
          transaction.id,
          {
            status: MERCHANT_FUNDED_STATUS,
            releasedAmount: updatedReleasedAmount,
            lastReleasedAt: completedAt,
            eligibleBusinessDate:
              transaction.eligibleBusinessDate ??
              this.resolveTransactionBusinessDate(
                new Date(transaction.createdAt ?? completedAt),
                payoutConfig,
              ),
            updatedAt: completedAt,
          },
          {transaction: tx},
        );

        this.logMerchantPayoutCronDebug(
          '[MerchantPayoutCron] Transaction marked as funded after payout success',
          {
            batchId,
            transactionId: transaction.id,
            previousPlatformStatus: this.resolvePlatformFundingStatus(
              transaction,
            ),
            currentStatus: MERCHANT_FUNDED_STATUS,
            pspStatus: transaction.pspStatus ?? transaction.status,
            releasedAmount: updatedReleasedAmount,
            completedAt: completedAt.toISOString(),
          },
        );
      }

      await this.merchantPayoutBatchItemRepository.updateAll(
        {
          status: 'released',
          providerReferenceId: metadata?.providerReferenceId,
          providerResponse: metadata?.providerResponse,
          updatedAt: completedAt,
        },
        {
          merchantPayoutBatchId: batchId,
          isDeleted: false,
        },
        {transaction: tx},
      );

      await this.merchantPayoutBatchRepository.updateById(
        batchId,
        {
          status: 'success',
          totalFundedAmount: Number(
            (
              Number(batch.alreadyReleasedToday ?? 0) +
              Number(batch.releasedAmount ?? 0)
            ).toFixed(2),
          ),
          providerName: metadata?.providerName,
          providerReferenceId: metadata?.providerReferenceId,
          providerResponse: metadata?.providerResponse,
          completedAt,
          triggeredAt: batch.triggeredAt ?? completedAt,
          updatedAt: completedAt,
        },
        {transaction: tx},
      );

      await tx.commit();

      return await this.merchantPayoutBatchRepository.findById(batchId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async markBatchAsFailed(
    batchId: string,
    failureReason: string,
    metadata?: {
      providerName?: string;
      providerReferenceId?: string;
      providerResponse?: object;
      completedAt?: Date;
    },
  ) {
    const completedAt = metadata?.completedAt ?? new Date();
    const tx =
      await this.merchantPayoutBatchRepository.dataSource.beginTransaction(
        PAYOUT_TRANSACTION_OPTIONS,
      );

    try {
      const batch = await this.merchantPayoutBatchRepository.findById(
        batchId,
        undefined,
        {transaction: tx},
      );

      await this.merchantPayoutBatchItemRepository.updateAll(
        {
          status: 'failed',
          failureReason,
          providerReferenceId: metadata?.providerReferenceId,
          providerResponse: metadata?.providerResponse,
          updatedAt: completedAt,
        },
        {
          merchantPayoutBatchId: batchId,
          isDeleted: false,
        },
        {transaction: tx},
      );

      await this.merchantPayoutBatchRepository.updateById(
        batchId,
        {
          status: 'failed',
          totalFundedAmount: Number(
            Number(batch.alreadyReleasedToday ?? 0).toFixed(2),
          ),
          failureReason,
          providerName: metadata?.providerName,
          providerReferenceId: metadata?.providerReferenceId,
          providerResponse: metadata?.providerResponse,
          completedAt,
          updatedAt: completedAt,
        },
        {transaction: tx},
      );

      await tx.commit();

      return await this.merchantPayoutBatchRepository.findById(batchId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
