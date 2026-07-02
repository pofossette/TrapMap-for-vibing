import { Module, Global } from '@nestjs/common';
import { PrometheusService } from './prometheus.service.js';

@Global()
@Module({
  providers: [PrometheusService],
  exports: [PrometheusService],
})
export class PrometheusModule {}
