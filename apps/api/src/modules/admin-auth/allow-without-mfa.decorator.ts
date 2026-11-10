import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_MFA = 'admin:allowWithoutMfa';

/**
 * Marks an admin route as reachable before 2FA is set up while
 * ADMIN_MFA_REQUIRED is on: account and enrolment routes only, or nobody
 * could ever enrol.
 */
export const AllowWithoutMfa = () => SetMetadata(ALLOW_WITHOUT_MFA, true);
