import { Global, Module } from '@nestjs/common';
import { RewardsHooksService } from './rewards-hooks.service';

@Global()
@Module({
  providers: [RewardsHooksService],
  exports: [RewardsHooksService],
})
export class RewardsModule {}
