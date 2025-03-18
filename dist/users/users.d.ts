import { User } from "src/database/mongoose/schemas/User";
import { LoginDto } from "./dto/login.dto";
export interface IUsersService {
    login(credential: LoginDto): Promise<User>;
}
