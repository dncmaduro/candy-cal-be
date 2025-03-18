import { IProductsService } from "./products";
import { Model } from "mongoose";
import { Product } from "src/database/mongoose/schemas/Product";
import { ProductDto } from "./dto/product.dto";
export declare class ProductsService implements IProductsService {
    private readonly productModel;
    constructor(productModel: Model<Product>);
    createProduct(product: ProductDto): Promise<Product>;
    updateProduct(product: Product): Promise<Product>;
    updateItemsForProduct(productId: string, items: Product["items"]): Promise<Product>;
    getAllProducts(): Promise<Product[]>;
    getProduct(id: string): Promise<Product>;
    searchProducts(searchText: string): Promise<Product[]>;
}
