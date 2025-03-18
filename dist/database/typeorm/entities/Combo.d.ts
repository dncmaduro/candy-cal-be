import { ObjectId } from "typeorm";
interface ComboProduct {
    _id: string;
    quantity: number;
}
export declare class Combo {
    _id: ObjectId;
    name: string;
    products: ComboProduct[];
}
export {};
