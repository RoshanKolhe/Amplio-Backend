import {
  globalInterceptor,
  Interceptor,
  InvocationContext,
  InvocationResult,
  Provider,
  ValueOrPromise,
} from '@loopback/core';
import {HttpErrors} from '@loopback/rest';

@globalInterceptor('unique-constraint', {tags: {name: 'uniqueConstraint'}})
export class UniqueConstraintInterceptor implements Provider<Interceptor> {

  value(): Interceptor {
    return this.intercept.bind(this);
  }

  intercept(
    context: InvocationContext,
    next: () => ValueOrPromise<InvocationResult>,
  ): ValueOrPromise<InvocationResult> {

    return Promise.resolve(next()).catch((error: unknown) => {

      const err = error as {code?: string; detail?: string};

      // Postgres Unique Constraint
      if (err?.code === '23505') {

        let message = 'Duplicate value violates unique constraint';

        if (err?.detail) {
          message = err.detail
            .replace('Key', '')
            .replace(/[()=]/g, ' ')
            .trim();
        }

        throw new HttpErrors.BadRequest(message);
      }

      // Postgres Foreign Key Violation
      if (err?.code === '23503') {
        throw new HttpErrors.BadRequest(
          'Invalid reference — related record does not exist'
        );
      }

      throw error;
    });
  }
}
