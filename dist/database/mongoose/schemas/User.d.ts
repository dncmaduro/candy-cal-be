import { Schema, Document } from "mongoose";
export interface User extends Document {
    username: string;
    password: string;
    name: string;
    role: string;
}
export declare const UserSchema: Schema<User, import("mongoose").Model<User, any, any, any, Document<unknown, any, User> & User & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, User, Document<unknown, {}, import("mongoose").FlatRecord<User>> & import("mongoose").FlatRecord<User> & Required<{
    _id: unknown;
}> & {
    __v: number;
}>;
export declare const UserModel: import("mongoose").Model<User, {}, {}, {}, Document<unknown, {}, User> & User & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
