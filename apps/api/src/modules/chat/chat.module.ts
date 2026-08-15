import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AttachmentStorageService } from './attachment-storage.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService, AttachmentStorageService],
})
export class ChatModule {}
