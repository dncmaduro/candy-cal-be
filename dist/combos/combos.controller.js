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
exports.CombosController = void 0;
const common_1 = require("@nestjs/common");
const combos_service_1 = require("./combos.service");
const combo_dto_1 = require("./dto/combo.dto");
let CombosController = class CombosController {
    constructor(combosService) {
        this.combosService = combosService;
    }
    async createCombo(combo) {
        return this.combosService.createCombo(combo);
    }
    async updateCombo(combo) {
        return this.combosService.updateCombo(combo);
    }
    async updateProductsForCombo(comboId, products) {
        return this.combosService.updateProductsForCombo(comboId, products);
    }
    async getAllCombos() {
        return this.combosService.getAllCombos();
    }
    async getCombo(id) {
        return this.combosService.getCombo(id);
    }
    async searchCombos(searchText) {
        return this.combosService.searchCombos(searchText);
    }
};
exports.CombosController = CombosController;
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [combo_dto_1.ComboDto]),
    __metadata("design:returntype", Promise)
], CombosController.prototype, "createCombo", null);
__decorate([
    (0, common_1.Put)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CombosController.prototype, "updateCombo", null);
__decorate([
    (0, common_1.Put)("/products"),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Query)("comboId")),
    __param(1, (0, common_1.Body)("products")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CombosController.prototype, "updateProductsForCombo", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CombosController.prototype, "getAllCombos", null);
__decorate([
    (0, common_1.Get)("/combo"),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Query)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CombosController.prototype, "getCombo", null);
__decorate([
    (0, common_1.Get)("/search"),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Query)("searchText")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CombosController.prototype, "searchCombos", null);
exports.CombosController = CombosController = __decorate([
    (0, common_1.Controller)("combos"),
    __metadata("design:paramtypes", [combos_service_1.CombosService])
], CombosController);
//# sourceMappingURL=combos.controller.js.map