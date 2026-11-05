import { describe, expect, it } from 'vitest';
import { orderProductImages } from '../../utils/productImageOrder';

const images = [{ name: 'one.png' }, { name: 'two.png' }, { name: 'three.png' }];

describe('product image ordering', () => {
  it.each([undefined, ''])('preserves selection order without JavaScript metadata: %s', (value) => {
    const result = orderProductImages(images, value);
    expect(result).toEqual({ success: true, images });
    if (!result.success) throw new Error('Expected natural image order');
    expect(result.images).not.toBe(images);
  });

  it('uses the exact requested order without mutating uploads', () => {
    const original = [...images];
    expect(orderProductImages(images, '[2,0,1]')).toEqual({
      success: true, images: [images[2], images[0], images[1]],
    });
    expect(images).toEqual(original);
  });

  it('supports all five images and empty selections', () => {
    expect(orderProductImages([0, 1, 2, 3, 4], '[4,2,0,3,1]')).toEqual({
      success: true, images: [4, 2, 0, 3, 1],
    });
    expect(orderProductImages([], '[]')).toEqual({ success: true, images: [] });
  });

  it.each([
    'not JSON', 'null', '{}', '[]', '[0,1]', '[0,1,1]', '[0,1,3]', '[-1,0,1]',
    '[0,1,1.5]', '["0",1,2]', '[0,1,2,3]', ['[0,1,2]', '[2,1,0]'], 1,
  ])('rejects malformed, missing, duplicate or out-of-range indices: %s', (value) => {
    expect(orderProductImages(images, value)).toEqual({
      success: false,
      message: 'The image order is invalid. Select your images again and choose their order.',
    });
  });
});
