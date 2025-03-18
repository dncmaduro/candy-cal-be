import { ObjectId } from "typeorm";
interface ProductItem {
    _id: string;
    quantity: number;
}
export declare class Product {
    _id: ObjectId;
    name: string;
    items: ProductItem[];
}
export {};
