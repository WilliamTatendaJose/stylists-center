import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ChatService } from './chat.service';
import { SendMessageDto, StartConversationDto } from './dto';

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

  @Get(':id/messages')
  getMessages(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.chat.getMessages(id, user.id);
  }

  @Post(':id/messages')
  sendMessage(@Param('id') id: string, @CurrentUser() user: { id: string }, @Body() dto: SendMessageDto) {
    return this.chat.sendMessage(id, user.id, dto);
  }
}
