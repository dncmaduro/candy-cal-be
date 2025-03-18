"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ProductsService = class ProductsService {
    constructor(productModel) {
        this.productModel = productModel;
    }
    async createProduct(product) {
        try {
            const newProduct = new this.productModel(product);
            return await newProduct.save();
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateProduct(product) {
        try {
            const updatedProduct = await this.productModel.findByIdAndUpdate(product._id, product, { new: true });
            if (!updatedProduct) {
                throw new common_1.HttpException("Product not found", common_1.HttpStatus.NOT_FOUND);
            }
            return updatedProduct;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateItemsForProduct(productId, items) {
        try {
            const updatedProduct = await this.productModel.findByIdAndUpdate(productId, { items }, { new: true });
            if (!updatedProduct) {
                throw new common_1.HttpException("Product not found", common_1.HttpStatus.NOT_FOUND);
            }
            return updatedProduct;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getAllProducts() {
        try {
            return await this.productModel.find().exec();
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getProduct(id) {
        try {
            const product = await this.productModel.findById(id).exec();
            if (!product) {
                throw new common_1.HttpException("Product not found", common_1.HttpStatus.NOT_FOUND);
            }
            return product;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async searchProducts(searchText) {
        try {
            const products = await this.productModel
                .find({
                name: { $regex: `.*${searchText}.*`, $options: "i" }
            })
                .exec();
            return products;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ProductsService = ProductsService;
exports.ProductsService = ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)("products")),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ProductsService);
//# sourceMappingURL=products.service.js.map