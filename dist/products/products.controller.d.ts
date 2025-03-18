import { ProductsService } from "./products.service";
import { ProductDto } from "./dto/product.dto";
import { Product } from "src/database/mongoose/schemas/Product";
export declare class ProductsController {
    private readonly productsService;
    constructor(productsService: ProductsService);
    createProduct(product: ProductDto): Promise<Product>;
    updateProduct(product: Product): Promise<Product>;
    updateItemsForProduct(productId: string, items: Product["items"]): Promise<Product>;
    getAllProducts(): Promise<Product[]>;
    getProduct(id: string): Promise<Product>;
    searchProducts(searchText: string): Promise<Product[]>;
}
