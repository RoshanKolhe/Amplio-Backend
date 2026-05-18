import {repository} from '@loopback/repository';
import {HttpErrors} from '@loopback/rest';
import {ConsentTemplate} from '../models';
import {ConsentTemplateRepository} from '../repositories';

const CONSENT_TEMPLATE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ConsentTemplateService {
  constructor(
    @repository(ConsentTemplateRepository)
    private consentTemplateRepository: ConsentTemplateRepository,
  ) {}

  async createTemplate(
    data: Omit<
      ConsentTemplate,
      'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'verifiedAt'
    >,
  ): Promise<ConsentTemplate> {
    const slug = this.normalizeSlug(data.slug);

    const existingTemplate = await this.consentTemplateRepository.findOne({
      where: {slug},
    });

    if (existingTemplate) {
      throw new HttpErrors.Conflict('Consent template slug already exists');
    }

    return this.consentTemplateRepository.create({
      ...data,
      slug,
    });
  }

  async getTemplateBySlug(slug: string): Promise<ConsentTemplate> {
    const normalizedSlug = this.normalizeSlug(slug);

    const template = await this.consentTemplateRepository.findOne({
      where: {
        slug: normalizedSlug,
        isDeleted: false,
      },
    });

    if (!template) {
      throw new HttpErrors.NotFound('Consent template not found');
    }

    return template;
  }

  async getAllTemplates(): Promise<ConsentTemplate[]> {
    return this.consentTemplateRepository.find({
      where: {
        isActive: true,
        isDeleted: false,
      },
      order: ['createdAt ASC'],
    });
  }

  private normalizeSlug(slug: string): string {
    const normalizedSlug = slug.trim().toLowerCase();

    if (!CONSENT_TEMPLATE_SLUG_REGEX.test(normalizedSlug)) {
      throw new HttpErrors.BadRequest(
        'Slug must contain only lowercase letters, numbers, and hyphens',
      );
    }

    return normalizedSlug;
  }
}
