import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';
import { SendMessageDto, StartConversationDto } from './dto';
import {
  MAX_CHAT_ATTACHMENTS,
  MAX_CHAT_ATTACHMENT_BYTES,
  type UploadedAttachmentFile,
} from './attachment-storage.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.chat.list(user.id);
  }

  @Post()
  start(@CurrentUser() user: { id: string }, @Body() dto: StartConversationDto) {
    return this.chat.getOrCreateByProvider(user.id, dto.providerId);
  }

  @Post('orders/:orderId')
  startForOrder(@Param('orderId') orderId: string, @CurrentUser() user: { id: string }) {
    return this.chat.getOrCreateByOrder(orderId, user.id);
  }

  @Get(':id/messages')
  getMessages(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.chat.getMessages(id, user.id);
  }

  @Post(':id/messages')
  @UseInterceptors(
    FilesInterceptor('files', MAX_CHAT_ATTACHMENTS, {
      limits: { files: MAX_CHAT_ATTACHMENTS, fileSize: MAX_CHAT_ATTACHMENT_BYTES },
    }),
  )
  sendMessage(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SendMessageDto,
    @UploadedFiles() files: UploadedAttachmentFile[] = [],
  ) {
    return this.chat.sendMessage(id, user.id, dto, files);
  }
}
