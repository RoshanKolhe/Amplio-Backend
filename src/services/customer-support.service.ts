import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {UserProfile} from '@loopback/security';
import {v4 as uuidv4} from 'uuid';
import {
  CustomerSupport,
  CustomerSupportStatus,
  InvestmentOrder,
} from '../models';
import {
  CustomerSupportRepository,
  InvestmentOrderRepository,
  InvestorProfileRepository,
  MediaRepository,
} from '../repositories';

export type CreateCustomerSupportDto = {
  issueType: string;
  complaintDescription: string;
  attachmentMediaId?: string;
};

export class CustomerSupportService {
  constructor(
    @repository(CustomerSupportRepository)
    private customerSupportRepository: CustomerSupportRepository,
    @repository(InvestmentOrderRepository)
    private investmentOrderRepository: InvestmentOrderRepository,
    @repository(InvestorProfileRepository)
    private investorProfileRepository: InvestorProfileRepository,
    @repository(MediaRepository)
    private mediaRepository: MediaRepository,
  ) {}

  async createSupportRequest(
    currentUser: UserProfile,
    orderId: string,
    dto: CreateCustomerSupportDto,
  ): Promise<CustomerSupport> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    await this.findOrderForInvestor(orderId, investorProfileId);

    if (!dto.issueType?.trim()) {
      throw new HttpErrors.BadRequest('issueType is required');
    }
    if (!dto.complaintDescription?.trim()) {
      throw new HttpErrors.BadRequest('complaintDescription is required');
    }

    if (dto.attachmentMediaId) {
      await this.mediaRepository.findById(dto.attachmentMediaId);
    }

    return this.customerSupportRepository.create({
      id: uuidv4(),
      orderId,
      investorProfileId,
      issueType: dto.issueType.trim(),
      complaintDescription: dto.complaintDescription.trim(),
      attachmentMediaId: dto.attachmentMediaId,
      status: CustomerSupportStatus.OPEN,
      createdBy: currentUser.id,
      updatedBy: currentUser.id,
    });
  }

  async getOrderSupportRequests(
    currentUser: UserProfile,
    orderId: string,
  ): Promise<CustomerSupport[]> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    await this.findOrderForInvestor(orderId, investorProfileId);

    return this.customerSupportRepository.find({
      where: {orderId, investorProfileId},
      include: [{relation: 'attachmentMedia'}],
      order: ['createdAt DESC'],
    });
  }

  async getSupportRequestById(
    currentUser: UserProfile,
    orderId: string,
    supportId: string,
  ): Promise<CustomerSupport> {
    const investorProfileId = await this.resolveInvestorProfileId(currentUser.id);
    await this.findOrderForInvestor(orderId, investorProfileId);

    const support = await this.customerSupportRepository.findById(supportId, {
      include: [{relation: 'attachmentMedia'}],
    });

    if (
      support.orderId !== orderId ||
      support.investorProfileId !== investorProfileId
    ) {
      throw new HttpErrors.Forbidden(
        'Not authorized to access this support request',
      );
    }

    return support;
  }

  private async resolveInvestorProfileId(userId: string): Promise<string> {
    const profile = await this.investorProfileRepository.findOne({
      where: {usersId: userId, isDeleted: false},
    });

    if (!profile) {
      throw new HttpErrors.NotFound('Investor profile not found');
    }

    return profile.id;
  }

  private async findOrderForInvestor(
    orderId: string,
    investorProfileId: string,
  ): Promise<InvestmentOrder> {
    const order = await this.investmentOrderRepository.findById(orderId);
    if (order.investorProfileId !== investorProfileId) {
      throw new HttpErrors.Forbidden('Not authorized to access this order');
    }
    return order;
  }
}
