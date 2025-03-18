"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductModel = exports.ProductSchema = void 0;
const mongoose_1 = require("mongoose");
const ProductItemSchema = new mongoose_1.Schema({
    _id: { type: String, required: true },
    quantity: { type: Number, required: true }
});
exports.ProductSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    items: { type: [ProductItemSchema], required: true }
});
exports.ProductModel = (0, mongoose_1.model)("Product", exports.ProductSchema);
//# sourceMappingURL=Product.js.map