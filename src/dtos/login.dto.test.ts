import { describe, expect, it } from 'vitest';
import { loginSchema } from './login.dto';

describe('loginSchema', () => {
    it('trims and lowercases the email', () => {
        const result = loginSchema.parse({ email: '  A@B.com ', password: 'x' });
        expect(result.email).toBe('a@b.com');
    });

    it.each([
        { email: 'not-an-email', password: 'x' },
        { email: 'a@b.com', password: '' },
        { email: 'a@b.com', password: 'x'.repeat(201) },
        { email: 'a@b.com' },
    ])('rejects %j', (input) => {
        expect(loginSchema.safeParse(input).success).toBe(false);
    });
});
