import { Schema, Document } from "mongoose";
export interface Item extends Document {
    name: string;
    quantityPerBox: number;
}
export declare const ItemSchema: Schema<Item, import("mongoose").Model<Item, any, any, any, Document<unknown, any, Item> & Item & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Item, Document<unknown, {}, import("mongoose").FlatRecord<Item>> & import("mongoose").FlatRecord<Item> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
export declare const ItemModel: import("mongoose").Model<Item, {}, {}, {}, Document<unknown, {}, Item> & Item & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
