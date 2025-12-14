import {authenticate} from '@loopback/authentication';
import {
  Count,
  CountSchema,
  Filter,
  FilterExcludingWhere,
  repository,
  Where,
} from '@loopback/repository';
import {
  get,
  getModelSchemaRef,
  HttpErrors,
  param,
  patch,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {authorize} from '../authorization';
import {Screens} from '../models';
import {ScreensRepository} from '../repositories';

export class ScreensController {
  constructor(
    @repository(ScreensRepository)
    public screensRepository: ScreensRepository,
  ) { }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @post('/screens')
  @response(200, {
    description: 'Screens model instance',
    content: {'application/json': {schema: getModelSchemaRef(Screens)}},
  })
  async create(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Screens, {
            title: 'NewScreens',
            exclude: ['id'],
          }),
        },
      },
    })
    screens: Omit<Screens, 'id'>,
  ): Promise<Screens> {
    return this.screensRepository.create(screens);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/screens/count')
  @response(200, {
    description: 'Screens model count',
    content: {'application/json': {schema: CountSchema}},
  })
  async count(
    @param.where(Screens) where?: Where<Screens>,
  ): Promise<Count> {
    return this.screensRepository.count(where);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/screens')
  @response(200, {
    description: 'Array of Screens model instances',
    content: {
      'application/json': {
        schema: {
          type: 'array',
          items: getModelSchemaRef(Screens, {includeRelations: true}),
        },
      },
    },
  })
  async find(
    @param.filter(Screens) filter?: Filter<Screens>,
  ): Promise<Screens[]> {
    return this.screensRepository.find(filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/screens')
  @response(200, {
    description: 'Screens PATCH success count',
    content: {'application/json': {schema: CountSchema}},
  })
  async updateAll(
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Screens, {partial: true}),
        },
      },
    })
    screens: Screens,
    @param.where(Screens) where?: Where<Screens>,
  ): Promise<Count> {
    return this.screensRepository.updateAll(screens, where);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @get('/screens/{id}')
  @response(200, {
    description: 'Screens model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(Screens, {includeRelations: true}),
      },
    },
  })
  async findById(
    @param.path.string('id') id: string,
    @param.filter(Screens, {exclude: 'where'}) filter?: FilterExcludingWhere<Screens>
  ): Promise<Screens> {
    return this.screensRepository.findById(id, filter);
  }

  @authenticate('jwt')
  @authorize({roles: ['super_admin']})
  @patch('/screens/{id}')
  @response(204, {
    description: 'Screens PATCH success',
  })
  async updateById(
    @param.path.string('id') id: string,
    @requestBody({
      content: {
        'application/json': {
          schema: getModelSchemaRef(Screens, {partial: true}),
        },
      },
    })
    screens: Screens,
  ): Promise<void> {
    await this.screensRepository.updateById(id, screens);
  }

  // fetch documents from screen route...
  @get('/screens/documents-by-screen/{route}')
  async fetchDocumentsListByScreen(
    @param.path.string('route') route: string,
  ): Promise<{success: boolean; message: string; documents: object[]}> {
    const screen = await this.screensRepository.findOne({
      where: {
        route: route,
        isActive: true,
        isDeleted: false
      },
      include: [
        {relation: 'documents'}
      ]
    });

    if (!screen) {
      throw new HttpErrors.NotFound('No Screen found with given route')
    }

    const screenDocuments = screen?.documents || [];

    return {
      success: true,
      message: 'Documents list',
      documents: screenDocuments
    }
  }

  // @put('/screens/{id}')
  // @response(204, {
  //   description: 'Screens PUT success',
  // })
  // async replaceById(
  //   @param.path.string('id') id: string,
  //   @requestBody() screens: Screens,
  // ): Promise<void> {
  //   await this.screensRepository.replaceById(id, screens);
  // }

  // @del('/screens/{id}')
  // @response(204, {
  //   description: 'Screens DELETE success',
  // })
  // async deleteById(@param.path.string('id') id: string): Promise<void> {
  //   await this.screensRepository.deleteById(id);
  // }
}
