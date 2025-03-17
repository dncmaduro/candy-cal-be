import { User } from "src/database/typeorm/entities/User";
import { LoginDto } from "./dto/login.dto";
export interface IUsersService {
    login(credential: LoginDto): Promise<User>;
}
