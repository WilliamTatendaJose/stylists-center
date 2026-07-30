import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeGateway } from './realtime.gateway';
import { SocketEmitterService } from './socket-emitter.service';

@Module({
  imports: [AuthModule],
  providers: [RealtimeGateway, SocketEmitterService],
  exports: [SocketEmitterService],
})
export class RealtimeModule {}
