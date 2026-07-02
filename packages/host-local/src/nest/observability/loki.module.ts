import { Module, Global } from '@nestjs/common';
import { LokiService } from './loki.service.js';

@Global()
@Module({
  providers: [LokiService],
  exports: [LokiService],
})
export class LokiModule {}
