import { z } from 'zod';

export const registrationDetailsSchema = z.object({
  firstname: z.string().trim().max(100, 'First name must be 100 characters or fewer.').default(''),
  surname: z.string().trim().max(100, 'Surname must be 100 characters or fewer.').default(''),
  addressLine1: z.string().trim().max(255, 'Address line 1 must be 255 characters or fewer.').default(''),
  addressLine2: z.string().trim().max(255, 'Address line 2 must be 255 characters or fewer.').default(''),
  postcode: z.string().trim().max(20, 'Postcode must be 20 characters or fewer.').default(''),
});

export type RegistrationDetails = z.infer<typeof registrationDetailsSchema>;
