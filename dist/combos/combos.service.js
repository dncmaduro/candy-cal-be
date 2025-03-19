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
exports.CombosService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let CombosService = class CombosService {
    constructor(comboModel) {
        this.comboModel = comboModel;
    }
    async createCombo(combo) {
        try {
            const newCombo = new this.comboModel(combo);
            return await newCombo.save();
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateCombo(combo) {
        try {
            const updatedCombo = await this.comboModel.findByIdAndUpdate(combo._id, combo, { new: true });
            if (!updatedCombo) {
                throw new common_1.HttpException("Combo not found", common_1.HttpStatus.NOT_FOUND);
            }
            return updatedCombo;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async updateProductsForCombo(comboId, products) {
        try {
            const updatedCombo = await this.comboModel.findByIdAndUpdate(comboId, { products }, { new: true });
            if (!updatedCombo) {
                throw new common_1.HttpException("Combo not found", common_1.HttpStatus.NOT_FOUND);
            }
            return updatedCombo;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getAllCombos() {
        try {
            return await this.comboModel.find().exec();
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async getCombo(id) {
        try {
            const combo = await this.comboModel.findById(id).exec();
            if (!combo) {
                throw new common_1.HttpException("Combo not found", common_1.HttpStatus.NOT_FOUND);
            }
            return combo;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
    async searchCombos(searchText) {
        try {
            const combos = await this.comboModel
                .find({
                name: { $regex: `.*${searchText}.*`, $options: "i" }
            })
                .exec();
            return combos;
        }
        catch (error) {
            console.error(error);
            throw new common_1.HttpException("Internal server error", common_1.HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
};
exports.CombosService = CombosService;
exports.CombosService = CombosService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)("combos")),
    __metadata("design:paramtypes", [mongoose_2.Model])
], CombosService);
//# sourceMappingURL=combos.service.js.map