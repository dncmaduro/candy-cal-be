import { IUsersService } from "./users";
import { Model } from "mongoose";
import { User } from "src/database/mongoose/schemas/User";
import { LoginDto } from "./dto/login.dto";
export declare class UsersService implements IUsersService {
    private readonly userModel;
    constructor(userModel: Model<User>);
    login(credential: LoginDto): Promise<User>;
}
