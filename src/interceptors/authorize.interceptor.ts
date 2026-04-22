import {
  AUTHENTICATION_METADATA_KEY,
  AuthenticationBindings,
} from '@loopback/authentication';
import {
  Getter,
  Interceptor,
  InvocationContext,
  InvocationResult,
  Provider,
  ValueOrPromise,
  globalInterceptor,
  inject,
} from '@loopback/core';
import {MetadataInspector} from '@loopback/metadata';
import {HttpErrors} from '@loopback/rest';
import {intersection} from 'lodash';
import {CurrentUser} from '../types';

@globalInterceptor('authorization', {tags: {name: 'authorize'}})
export class AuthorizeInterceptor implements Provider<Interceptor> {
  constructor(
    @inject.getter(AuthenticationBindings.CURRENT_USER)
    private getCurrentUser: Getter<CurrentUser>,
  ) {}

  value(): Interceptor {
    return this.intercept.bind(this);
  }

  async intercept(
    context: InvocationContext,
    next: () => ValueOrPromise<InvocationResult>,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authorizeMeta: any = MetadataInspector.getMethodMetadata(
      'authorization.metadata',
      context.target!.constructor.prototype,
      context.methodName,
    );

    const authenticationMeta = MetadataInspector.getMethodMetadata(
      AUTHENTICATION_METADATA_KEY,
      context.target!.constructor.prototype,
      context.methodName,
    );

    if (!authorizeMeta && !authenticationMeta) {
      return next();
    }

    const currentUser = await this.getCurrentUser();
    if (!currentUser) {
      throw new HttpErrors.Unauthorized('User not authenticated');
    }

    const requiredRoles = authorizeMeta?.roles ?? [];
    const requiredPermissions = authorizeMeta?.permissions ?? [];
    const allowedScopes = authorizeMeta?.allowedScopes ?? [];

    if (currentUser.scope && !allowedScopes.includes(currentUser.scope)) {
      throw new HttpErrors.Forbidden('Forbidden: Token scope not allowed');
    }

    if (!requiredRoles.length && !requiredPermissions.length) {
      return next();
    }

    // SUPER ADMIN BYPASS
    if (currentUser.roles.includes('super_admin')) {
      return next();
    }

    // ROLE CHECK
    if (requiredRoles.length > 0) {
      const matched = intersection(currentUser.roles, requiredRoles);
      if (matched.length === 0) {
        throw new HttpErrors.Forbidden('Forbidden: Role not allowed');
      }
    }

    // PERMISSION CHECK
    if (requiredPermissions.length > 0) {
      const matched = intersection(
        currentUser.permissions,
        requiredPermissions,
      );
      if (matched.length === 0) {
        throw new HttpErrors.Forbidden('Forbidden: Permission not allowed');
      }
    }

    return next();
  }
}
