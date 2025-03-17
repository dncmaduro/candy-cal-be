import { IUsersService } from "./users";
import { Repository } from "typeorm";
import { User } from "src/database/typeorm/entities/User";
import { LoginDto } from "./dto/login.dto";
export declare class UsersService implements IUsersService {
    private readonly userRepository;
    constructor(userRepository: Repository<User>);
    login(credential: LoginDto): Promise<User>;
}
