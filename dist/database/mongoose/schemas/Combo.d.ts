import { Schema, Document } from "mongoose";
export interface ComboProduct {
    _id: string;
    quantity: number;
}
export interface Combo extends Document {
    name: string;
    products: ComboProduct[];
}
export declare const ComboSchema: Schema<Combo, import("mongoose").Model<Combo, any, any, any, Document<unknown, any, Combo> & Combo & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, Combo, Document<unknown, {}, import("mongoose").FlatRecord<Combo>> & import("mongoose").FlatRecord<Combo> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
export declare const ComboModel: import("mongoose").Model<Combo, {}, {}, {}, Document<unknown, {}, Combo> & Combo & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
