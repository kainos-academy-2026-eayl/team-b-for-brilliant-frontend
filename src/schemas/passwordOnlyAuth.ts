import { z } from 'zod';

export const passwordOnlyAuthSchema = z.object({
  // MFA is unsupported; never treat an unfinished challenge as a completed sign-in.
  mfaEnabled: z.literal(false).optional(),
});
