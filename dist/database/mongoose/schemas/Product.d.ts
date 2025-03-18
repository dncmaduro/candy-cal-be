import { Schema, Document, Types } from "mongoose";
export interface ProductItem {
    _id: Types.ObjectId;
    quantity: number;
}
export interface Product extends Document {
    name: string;
    items: ProductItem[];
}
export declare const ProductSchema: Schema<Product, import("mongoose").Model<Product, any, any, any, Document<unknown, any, Product> & Product & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Product, Document<unknown, {}, import("mongoose").FlatRecord<Product>> & import("mongoose").FlatRecord<Product> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
export declare const ProductModel: import("mongoose").Model<Product, {}, {}, {}, Document<unknown, {}, Product> & Product & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
