import type { Basket, BasketItem } from '../models/basket';

export class BasketError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export interface BasketService {
    getBasket(credential: string): Promise<Basket>;
    addItem(credential: string, productID: string, quantity: number): Promise<void>;
    setQuantity(credential: string, productID: string, quantity: number): Promise<void>;
    removeItem(credential: string, productID: string): Promise<void>;
}

const LOW_STOCK_THRESHOLD = 10;

interface MockRow {
    productID: string;
    name: string;
    quantity: number;
    stock: number;
}

function toItem(row: MockRow): BasketItem {
    return {
        basketItemID: `item-${row.productID}`,
        productID: row.productID,
        productName: row.name,
        quantityInBasket: row.quantity,
        stockAvailable: row.stock,
        isQuantityAvailable: row.quantity <= row.stock,
        lowStock: row.stock > 0 && row.stock <= LOW_STOCK_THRESHOLD,
    };
}

export function createMockBasketService(): BasketService {
    const rows: MockRow[] = [
        { productID: 'p1', name: 'Mug', quantity: 2, stock: 25 },
        { productID: 'p2', name: 'Notebook', quantity: 1, stock: 4 },
    ];

    const find = (productID: string) => rows.find((row) => row.productID === productID);

    return {
        async getBasket() {
            return { items: rows.map(toItem) };
        },
        async addItem(_credential, productID, quantity) {
            const row = find(productID);
            if (row) {
                if (row.quantity + quantity > row.stock) {
                    throw new BasketError(409, `Not enough stock. Only ${row.stock} available.`);
                }
                row.quantity += quantity;
                return;
            }
            rows.push({ productID, name: `Product ${productID}`, quantity, stock: 5 });
        },
        async setQuantity(_credential, productID, quantity) {
            const row = find(productID);
            if (!row) throw new BasketError(404, 'Item not in basket');
            if (quantity === 0) {
                rows.splice(rows.indexOf(row), 1);
                return;
            }
            if (quantity > row.stock) {
                throw new BasketError(409, `Not enough stock. Only ${row.stock} available.`);
            }
            row.quantity = quantity;
        },
        async removeItem(_credential, productID) {
            const row = find(productID);
            if (!row) throw new BasketError(404, 'Item not in basket');
            rows.splice(rows.indexOf(row), 1);
        },
    };
}
