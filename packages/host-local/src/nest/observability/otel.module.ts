import { Module, Global } from '@nestjs/common';
import { OtelService } from './otel.service.js';

@Global()
@Module({
  providers: [OtelService],
  exports: [OtelService],
})
export class OtelModule {}
