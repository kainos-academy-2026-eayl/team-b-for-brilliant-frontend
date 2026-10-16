import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './safe-return-to';

describe('safeReturnTo', () => {
    it('keeps same-site paths', () => {
        expect(safeReturnTo('/orders?page=2')).toBe('/orders?page=2');
    });

    it.each(['https://evil.com', '//evil.com', '/\\evil.com', 'orders', '/a\nb'])(
        'rejects %j',
        (value) => {
            expect(safeReturnTo(value)).toBe('/account');
        },
    );

    it('falls back when the value is missing or not a string', () => {
        expect(safeReturnTo(undefined)).toBe('/account');
        expect(safeReturnTo(['/a'])).toBe('/account');
    });
});
