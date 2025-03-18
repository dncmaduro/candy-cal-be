"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ItemModel = exports.ItemSchema = void 0;
const mongoose_1 = require("mongoose");
exports.ItemSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    quantityPerBox: { type: Number, required: true }
});
exports.ItemModel = (0, mongoose_1.model)("Item", exports.ItemSchema);
//# sourceMappingURL=Item.js.map