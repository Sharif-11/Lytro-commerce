import {
  operatorEnrollSchema,
  operatorSigninSchema,
  operatorVerifySchema,
} from '@lytronix/validators';
import { createZodDto } from 'nestjs-zod';

// DTO classes are built from the shared schemas, so each request shape is written once (ENGINEERING §4).
export class OperatorSigninDto extends createZodDto(operatorSigninSchema) {}
export class OperatorEnrollDto extends createZodDto(operatorEnrollSchema) {}
export class OperatorVerifyDto extends createZodDto(operatorVerifySchema) {}
