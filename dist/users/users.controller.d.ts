import { UsersService } from "./users.service";
import { LoginDto } from "./dto/login.dto";
import { User } from "src/database/typeorm/entities/User";
export declare class UsersController {
    private readonly usersService;
    constructor(usersService: UsersService);
    login(credential: LoginDto): Promise<User>;
}
