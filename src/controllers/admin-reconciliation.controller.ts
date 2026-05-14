import {authenticate} from '@loopback/authentication';
import {inject} from '@loopback/core';
import {get, param} from '@loopback/rest';
import {authorize} from '../authorization';
import {AdminReconciliationService} from '../services/admin-reconciliation.service';

export class AdminReconciliationController {
  constructor(
    @inject('service.adminReconciliation.service')
    private reconciliationService: AdminReconciliationService,
  ) {}

  // ─── Dashboard Summary ───────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/summary')
  async getReconciliationSummary() {
    const summary = await this.reconciliationService.getReconciliationSummary();

    return {
      success: true,
      message: 'Reconciliation summary fetched successfully',
      data: summary,
    };
  }

  // ─── Allocation Monitoring ───────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/allocation-monitoring')
  async getAllocationMonitoring() {
    const items =
      await this.reconciliationService.getAllVerificationsForAllocationMonitoring();

    return {
      success: true,
      message: 'Allocation monitoring data fetched successfully',
      data: items,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/stuck-allocations')
  async getStuckAllocations() {
    const items = await this.reconciliationService.getStuckAllocations();

    return {
      success: true,
      message: 'Stuck allocations fetched successfully',
      data: items,
    };
  }

  // ─── Unmatched UTRs ──────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/unmatched-utrs')
  async getUnmatchedUtrs() {
    const verifications = await this.reconciliationService.getUnmatchedUtrs();

    return {
      success: true,
      message: 'Unmatched UTRs fetched successfully',
      data: verifications,
    };
  }

  // ─── Duplicate UTR Detection ─────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/duplicate-utrs')
  async getDuplicateUtrs() {
    const groups = await this.reconciliationService.getDuplicateUtrGroups();

    return {
      success: true,
      message: 'Duplicate UTR groups fetched successfully',
      data: groups,
    };
  }

  // ─── Rejection / Suspicious ──────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/rejected-verifications')
  async getRejectedVerifications(
    @param.query.number('limit') limit?: number,
  ) {
    const verifications =
      await this.reconciliationService.getRejectedVerifications(limit);

    return {
      success: true,
      message: 'Rejected verifications fetched successfully',
      data: verifications,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/suspicious-verifications')
  async getSuspiciousVerifications(
    @param.query.number('limit') limit?: number,
  ) {
    const verifications =
      await this.reconciliationService.getSuspiciousVerifications(limit);

    return {
      success: true,
      message: 'Suspicious verifications fetched successfully',
      data: verifications,
    };
  }

  // ─── Payout Failures ─────────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/failed-payouts')
  async getFailedPayouts(
    @param.query.number('limit') limit?: number,
  ) {
    const payouts = await this.reconciliationService.getFailedPayouts(limit);

    return {
      success: true,
      message: 'Failed payouts fetched successfully',
      data: payouts,
    };
  }

  // ─── Edge Case Monitoring ────────────────────────────────────────────────────

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/expired-intents')
  async getExpiredPaymentIntents() {
    const verifications =
      await this.reconciliationService.getExpiredPaymentIntents();

    return {
      success: true,
      message: 'Expired payment intents fetched successfully',
      data: verifications,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/utr-conflicts')
  async getUtrConflicts() {
    const verifications = await this.reconciliationService.getUtrConflicts();

    return {
      success: true,
      message: 'UTR conflict verifications fetched successfully',
      data: verifications,
    };
  }

  @authenticate('jwt')
  @authorize({roles: ['admin', 'super_admin']})
  @get('/admin/reconciliation/amount-variance-flags')
  async getAmountVarianceFlags() {
    const verifications =
      await this.reconciliationService.getAmountVarianceFlags();

    return {
      success: true,
      message: 'Amount variance flagged verifications fetched successfully',
      data: verifications,
    };
  }
}
