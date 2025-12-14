import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';
import * as dotenv from 'dotenv';
dotenv.config();

const config = {
  name: 'amplio',
  connector: 'postgresql',
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
};


// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class AmplioDataSource extends juggler.DataSource
  implements LifeCycleObserver {
  static dataSourceName = 'amplio';
  static readonly defaultConfig = config;

  constructor(
    @inject('datasources.config.amplio', {optional: true})
    dsConfig: object = config,
  ) {
    super(dsConfig);
  }
}
