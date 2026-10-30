export interface BasketItem {
    basketItemID: string;
    productID: string;
    productName: string;
    quantityInBasket: number;
    stockAvailable: number;
    isQuantityAvailable: boolean;
    lowStock: boolean;
}

export interface Basket {
    items: BasketItem[];
}
