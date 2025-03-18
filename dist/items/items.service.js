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
exports.ItemsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ItemsService = class ItemsService {
    constructor(itemModel) {
        this.itemModel = itemModel;
    }
    async createItem(item) {
        try {
            const newItem = new this.itemModel(item);
            return await newItem.save();
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateItem(item) {
        try {
            const updatedItem = await this.itemModel.findByIdAndUpdate(item._id, item, { new: true });
            if (!updatedItem) {
                throw new common_1.HttpException("Item not found", common_1.HttpStatus.NOT_FOUND);
            }
            return updatedItem;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getAllItems() {
        try {
            return await this.itemModel.find().exec();
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getItem(id) {
        try {
            const item = await this.itemModel.findById(id).exec();
            if (!item) {
                throw new common_1.HttpException("Item not found", common_1.HttpStatus.NOT_FOUND);
            }
            return item;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async searchItems(searchText) {
        try {
            const items = await this.itemModel
                .find({
                name: { $regex: `.*${searchText}.*`, $options: "i" }
            })
                .exec();
            return items;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.ItemsService = ItemsService;
exports.ItemsService = ItemsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)("items")),
    __metadata("design:paramtypes", [mongoose_2.Model])
], ItemsService);
//# sourceMappingURL=items.service.js.map