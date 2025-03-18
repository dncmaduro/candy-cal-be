"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComboModel = exports.ComboSchema = void 0;
const mongoose_1 = require("mongoose");
const ComboProductSchema = new mongoose_1.Schema({
    _id: { type: String, required: true },
    quantity: { type: Number, required: true }
});
exports.ComboSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    products: { type: [ComboProductSchema], required: true }
});
exports.ComboModel = (0, mongoose_1.model)("Combo", exports.ComboSchema);
//# sourceMappingURL=Combo.js.map