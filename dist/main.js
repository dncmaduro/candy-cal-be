"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const bodyParser = require("body-parser");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const { PORT } = process.env;
    app.setGlobalPrefix("api/v1");
    app.enableCors();
    console.log(process.env.DATABASE_URL);
    app.use(bodyParser.json());
    try {
        await app.listen(PORT, () => console.log(`Server listening on PORT ${PORT}`));
    }
    catch (error) {
        console.log(error);
    }
}
bootstrap();
//# sourceMappingURL=main.js.map