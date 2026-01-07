import {authenticate} from '@loopback/authentication';
import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  IsolationLevel,
  repository,
  Where,
} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {authorize} from '../authorization';
import {Documents} from '../models';
import {DocumentsRepository} from '../repositories';

export class DocumentsController {
  constructor(
    @repository(DocumentsRepository)
    public documentsRepository: DocumentsRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/documents')
  @response(200, {
    description: 'Documents model instance',
    content: {'application/json': {schema: getModelSchemaRef(Documents)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Documents, {
            title: 'NewDocuments',
            exclude: ['id'],
          }).definitions?.Documents?.properties,
          screens: {type: 'array', items: 'string'}
        },
      },
    })
    documents: Omit<Documents, 'id'> & {screens?: string[]},
  ): Promise<Documents> {
    const tx = await this.documentsRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});
    try {
      const {screens, ...documentsData} = documents;
      const newDocument = await this.documentsRepository.create(documentsData, {transaction: tx});
      if (newDocument) {
        for (const screenId of screens) {
          await this.documentsRepository.screens(newDocument.id).link(screenId, {transaction: tx});
        }
      }
      await tx.commit();
      return newDocument;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/documents/count')
  @response(200, {
    description: 'Documents model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(Documents) where?: Where<Documents>,
  ): Promise<Count> {
    return this.documentsRepository.count(where);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/documents')
  @response(200, {
    description: 'Array of Documents model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Documents, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(Documents) filter?: Filter<Documents>,
  ): Promise<Documents[]> {
    return this.documentsRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/documents')
  @response(200, {
    description: 'Documents PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Documents, {partial: true}),
        },
      },
    })
    documents: Documents,
    @param.where(Documents) where?: Where<Documents>,
  ): Promise<Count> {
    return this.documentsRepository.updateAll(documents, where);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/documents/{id}')
  @response(200, {
    description: 'Documents model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Documents, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Documents, {exclude: 'where'}) filter?: FilterExcludingWhere<Documents>
  ): Promise<Documents> {
    return this.documentsRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/documents/{id}')
  @response(204, {
    description: 'Documents PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Documents, {partial: true}).definitions?.Documents?.properties,
          screenIds: {type: 'array', items:'string'}
        },
      },
    })
    documents: Documents & {screenIds?: string[]},
  ): Promise<void> {
    const tx = await this.documentsRepository.dataSource.beginTransaction({IsolationLevel: IsolationLevel.READ_COMMITTED});
    try {
      const {screenIds = [], ...documentsData} = documents;
      await this.documentsRepository.updateById(id, documentsData, {transaction: tx});

      await this.documentsRepository.screens(id).unlinkAll();

      for (const screenId of screenIds) {
        await this.documentsRepository.screens(id).link(screenId);
      }

      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // @put('/documents/{id}')
  // @response(204, {
  //   description: 'Documents PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() documents: Documents,
  // ): Promise<void> {
  //   await this.documentsRepository.replaceById(id, documents);
  // }

  // @del('/documents/{id}')
  // @response(204, {
  //   description: 'Documents DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.documentsRepository.deleteById(id);
  // }
}
