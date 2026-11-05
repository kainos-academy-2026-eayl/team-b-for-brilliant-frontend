import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const script = readFileSync('public/product-form.js', 'utf8');

interface KeyEvent {
  key?: string;
  preventDefault(): void;
}

class Element {
  constructor(readonly id = '') {}
  value = '';
  textContent = '';
  hidden = false;
  disabled = false;
  alt = '';
  tabIndex = 0;
  focusCount = 0;
  files: { name: string }[] = [];
  form?: Element;
  children: Element[] = [];
  readonly listeners = new Map<string, (event: KeyEvent) => void>();
  private readonly attributes = new Map<string, string>();
  private classes = new Set<string>();
  readonly classList = {
    add: (value: string) => this.classes.add(value),
    contains: (value: string) => this.classes.has(value),
    toggle: (value: string, enabled: boolean) => {
      if (enabled) this.classes.add(value);
      else this.classes.delete(value);
    },
  };
  get className() { return [...this.classes].join(' '); }
  set className(value: string) { this.classes = new Set(value.split(/\s+/)); }
  get src() { return this.attributes.get('src') ?? ''; }
  set src(value: string) { this.attributes.set('src', value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  addEventListener(name: string, listener: (event: KeyEvent) => void) { this.listeners.set(name, listener); }
  dispatchEvent(event: { type: string }) { this.fire(event.type); }
  fire(name: string, event: KeyEvent = { preventDefault() {} }) { this.listeners.get(name)?.(event); }
  focus() { this.focusCount++; }
}

function loadForm(values: Record<string, string> = {}) {
  const ids = [
    'images', 'image-order', 'image-order-panel', 'image-order-list', 'image-order-status',
    'product-preview', 'product-editor-tabs', 'product-details-tab', 'product-preview-tab', 'product-create-form',
    'product-preview-gallery', 'product-preview-thumbnails', 'product-preview-image-frame',
    'name', 'description', 'price', 'quantity', 'draft',
    'product-preview-name', 'product-preview-price', 'product-preview-stock', 'product-preview-image',
    'product-preview-image-placeholder', 'product-preview-visibility',
    'product-preview-description-section', 'product-preview-description',
  ];
  const elements = new Map(ids.map((id) => [id, new Element(id)]));
  const get = (id: string): Element => {
    const element = elements.get(id);
    if (!element) throw new Error(`Unknown test element: ${id}`);
    return element;
  };
  const form = new Element();
  get('images').form = form;
  get('draft').value = 'true';
  get('product-preview').hidden = true;
  get('product-preview-thumbnails').hidden = true;
  get('product-editor-tabs').hidden = true;
  for (const [id, value] of Object.entries(values)) get(id).value = value;
  let urlIndex = 0;
  const revokeObjectURL = vi.fn();
  runInNewContext(script, {
    document: {
      getElementById: get,
      createElement: () => new Element(),
    },
    URL: {
      createObjectURL: () => `blob:test-${urlIndex++}`,
      revokeObjectURL,
    },
    Event: class { constructor(readonly type: string) {} },
  });
  return { get, form, revokeObjectURL };
}

describe('live product preview', () => {
  it('initializes safe placeholders and opens Product details by default', () => {
    const { get } = loadForm();
    expect(get('product-preview').hidden).toBe(true);
    expect(get('product-create-form').hidden).toBe(false);
    expect(get('product-editor-tabs').hidden).toBe(false);
    expect(get('product-details-tab').getAttribute('aria-selected')).toBe('true');
    expect(get('product-preview-tab').getAttribute('aria-selected')).toBe('false');
    expect(get('product-preview-tab').tabIndex).toBe(-1);
    expect(get('product-create-form').getAttribute('role')).toBe('tabpanel');
    expect(get('product-preview').getAttribute('aria-labelledby')).toBe('product-preview-tab');
    expect(get('product-preview-name').textContent).toBe('Product name');
    expect(get('product-preview-price').textContent).toBe('Price unavailable');
    expect(get('product-preview-stock').hidden).toBe(true);
    expect(get('product-preview-image').hidden).toBe(true);
    expect(get('product-preview-image-placeholder').hidden).toBe(false);
    expect(get('product-preview-description-section').hidden).toBe(true);
    expect(get('product-preview-visibility').textContent).toBe('Draft - hidden from the shop');
  });

  it('switches panels without replacing values, selected files or image order', () => {
    const { get } = loadForm({ name: 'Travel Mug', price: '19.99' });
    const files = [{ name: 'first.png' }, { name: 'second.png' }];
    get('images').files = files;
    get('images').fire('change');
    get('product-preview-tab').fire('click');
    expect(get('product-preview').hidden).toBe(false);
    expect(get('product-create-form').hidden).toBe(true);
    expect(get('product-preview-tab').getAttribute('aria-selected')).toBe('true');
    expect(get('product-details-tab').tabIndex).toBe(-1);
    get('product-details-tab').fire('click');
    expect(get('product-create-form').hidden).toBe(false);
    expect(get('product-preview').hidden).toBe(true);
    expect(get('name').value).toBe('Travel Mug');
    expect(get('price').value).toBe('19.99');
    expect(get('images').files).toBe(files);
    expect(get('image-order').value).toBe('[0,1]');
  });

  it.each([
    ['product-details-tab', 'ArrowRight', 'product-preview-tab'],
    ['product-details-tab', 'ArrowLeft', 'product-preview-tab'],
    ['product-preview-tab', 'ArrowRight', 'product-details-tab'],
    ['product-preview-tab', 'ArrowLeft', 'product-details-tab'],
    ['product-details-tab', 'End', 'product-preview-tab'],
    ['product-preview-tab', 'Home', 'product-details-tab'],
  ])('supports tab keyboard navigation from %s with %s', (start, key, destination) => {
    const { get } = loadForm();
    get(start).fire('click');
    const preventDefault = vi.fn();
    get(start).fire('keydown', { key, preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(get(destination).focusCount).toBe(1);
    expect(get(destination).getAttribute('aria-selected')).toBe('true');
    expect(get(destination).tabIndex).toBe(0);
    expect(get('product-preview').hidden).toBe(destination !== 'product-preview-tab');
  });

  it('does not intercept normal Tab navigation', () => {
    const { get } = loadForm();
    const preventDefault = vi.fn();
    get('product-details-tab').fire('keydown', { key: 'Tab', preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(get('product-details-tab').getAttribute('aria-selected')).toBe('true');
  });

  it('reflects prefilled values and updates form fields as literal text', () => {
    const { get, form } = loadForm({
      name: ' Travel Mug ', price: '12.5', quantity: '4', description: 'Useful\nproduct', draft: 'false',
    });
    expect(get('product-preview-name').textContent).toBe('Travel Mug');
    expect(get('product-preview-price').textContent).toBe('\u00a312.50');
    expect(get('product-preview-stock').textContent).toBe('In stock');
    expect(get('product-preview-stock').classList.contains('stock--in')).toBe(true);
    expect(get('product-preview-visibility').textContent).toBe('Visible in the shop');
    expect(get('product-preview-description-section').hidden).toBe(false);
    expect(get('product-preview-description').textContent).toBe('Useful\nproduct');
    get('name').value = '<img src=x onerror=alert(1)>';
    get('description').value = '<script>alert(1)</script>';
    get('price').value = '0';
    form.fire('input');
    expect(get('product-preview-name').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(get('product-preview-description').textContent).toBe('<script>alert(1)</script>');
    expect(get('product-preview-price').textContent).toBe('\u00a30.00');
    get('draft').value = '';
    form.fire('change');
    expect(get('product-preview-visibility').textContent).toBe('Select a draft status.');
  });

  it.each([
    ['0', '\u00a30.00'], ['99999999.99', '\u00a399999999.99'], [' 19.9 ', '\u00a319.90'],
    ['', 'Price unavailable'], ['-1', 'Price unavailable'], ['1.234', 'Price unavailable'],
    ['100000000', 'Price unavailable'], ['NaN', 'Price unavailable'], ['1e2', 'Price unavailable'],
  ])('renders price %s without inventing a valid value', (price, expected) => {
    const { get } = loadForm({ price });
    expect(get('product-preview-price').textContent).toBe(expected);
    expect(get('product-preview-price').classList.contains('product__price--unavailable'))
      .toBe(expected === 'Price unavailable');
  });

  it.each([
    ['0', false, false], ['1', false, true], ['2147483647', false, true],
    ['', true, false], ['-1', true, false], ['1.5', true, false], ['2147483648', true, false],
  ])('only previews valid stock quantities: %s', (quantity, hidden, inStock) => {
    const { get } = loadForm({ quantity });
    expect(get('product-preview-stock').hidden).toBe(hidden);
    expect(get('product-preview-stock').classList.contains('stock--in')).toBe(inStock);
  });

  it('follows main-image reordering and clears revoked image URLs when files change', () => {
    const { get, revokeObjectURL } = loadForm();
    get('images').files = [{ name: 'first.png' }, { name: 'second.png' }];
    get('images').fire('change');
    expect(get('product-preview-image').src).toBe('blob:test-0');
    expect(get('product-preview-image').hidden).toBe(false);
    const moveSecondUp = get('image-order-list').children[1]?.children[3]?.children[0];
    if (!moveSecondUp) throw new Error('Move-up button missing');
    moveSecondUp.fire('click');
    expect(get('image-order').value).toBe('[1,0]');
    expect(get('product-preview-image').src).toBe('blob:test-1');
    get('images').files = [];
    get('images').fire('change');
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(get('product-preview-image').src).toBe('');
    expect(get('product-preview-image').hidden).toBe(true);
    expect(get('product-preview-image-placeholder').hidden).toBe(false);
  });

  it('displays all images and changes the viewed image without changing saved order', () => {
    const { get, form } = loadForm({ name: 'Travel Mug' });
    const files = [{ name: 'first.png' }, { name: 'second.png' }, { name: 'third.png' }];
    get('images').files = files;
    get('images').fire('change');
    get('product-preview-tab').fire('click');
    const thumbnails = get('product-preview-thumbnails');
    expect(thumbnails.hidden).toBe(false);
    expect(thumbnails.children).toHaveLength(3);
    expect(get('product-preview-gallery').classList.contains('product-detail__images--gallery')).toBe(true);
    const second = thumbnails.children[1];
    if (!second) throw new Error('Second thumbnail missing');
    expect(second.getAttribute('aria-controls')).toBe('product-preview-image');
    second.fire('click');
    expect(get('product-preview-image').src).toBe('blob:test-1');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(thumbnails.children[0]?.getAttribute('aria-pressed')).toBe('false');
    expect(get('product-preview-image').alt).toBe('Travel Mug - image 2 of 3');
    expect(get('image-order').value).toBe('[0,1,2]');
    get('product-details-tab').fire('click');
    get('name').value = 'New name';
    form.fire('input');
    get('product-preview-tab').fire('click');
    expect(get('product-preview-image').src).toBe('blob:test-1');
    expect(thumbnails.children[1]).toBe(second);
    expect(second.getAttribute('aria-label')).toBe('View image 2 of 3 for New name');
    expect(get('images').files).toBe(files);
    const moveThirdUp = get('image-order-list').children[2]?.children[3]?.children[0];
    if (!moveThirdUp) throw new Error('Third move button missing');
    moveThirdUp.fire('click');
    expect(get('image-order').value).toBe('[0,2,1]');
    expect(get('product-preview-image').src).toBe('blob:test-0');
    expect(thumbnails.children.map((button) => button.children[0]?.src))
      .toEqual(['blob:test-0', 'blob:test-2', 'blob:test-1']);
    expect(thumbnails.children[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('handles zero, one and five images without leaving stale gallery controls', () => {
    const { get } = loadForm();
    const thumbnails = get('product-preview-thumbnails');
    expect(thumbnails.hidden).toBe(true);
    get('images').files = [{ name: 'single.png' }];
    get('images').fire('change');
    expect(thumbnails.hidden).toBe(true);
    expect(thumbnails.children).toHaveLength(0);
    get('images').files = Array.from({ length: 5 }, (_, index) => ({ name: `${index}.png` }));
    get('images').fire('change');
    expect(thumbnails.children).toHaveLength(5);
    get('images').files = [];
    get('images').fire('change');
    expect(thumbnails.children).toHaveLength(0);
    expect(thumbnails.hidden).toBe(true);
    expect(get('product-preview-gallery').classList.contains('product-detail__images--gallery')).toBe(false);
    expect(get('product-preview-image').hidden).toBe(true);
  });

  it('retains the image fallback after a decode failure until a different image is selected', () => {
    const { get, form } = loadForm();
    get('images').files = [{ name: 'invalid.png' }];
    get('images').fire('change');
    get('product-preview-image').fire('error');
    form.fire('input');
    expect(get('product-preview-image').hidden).toBe(true);
    expect(get('product-preview-image-placeholder').hidden).toBe(false);
    get('images').files = [{ name: 'valid.png' }];
    get('images').fire('change');
    expect(get('product-preview-image').hidden).toBe(false);
    expect(get('product-preview-image-placeholder').hidden).toBe(true);
  });
});
