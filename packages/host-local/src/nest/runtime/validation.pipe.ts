import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';
import { type ZodSchema, ZodError } from 'zod';

/**
 * Validation pipe that validates request bodies against Zod schemas
 * from packages/contracts. Zod validation errors are caught and re-thrown
 * as BadRequestException, which the global exception filter maps to
 * the canonical 400 validation_error envelope.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          code: 'validation_error',
          message: 'Request validation failed',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }
  }
}

/**
 * Creates a body validation pipe for a given Zod schema.
 * Use on individual route handlers:
 *   @Post() search(@Body(new ZodBodyValidationPipe(searchSchema)) body: SearchInput)
 */
export class ZodBodyValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'body') {
      return value;
    }
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          code: 'validation_error',
          message: 'Request validation failed',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      throw error;
    }
  }
}
