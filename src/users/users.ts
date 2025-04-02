import { LoginDto, RefreshTokenDto } from "./dto/login.dto"

export interface IUsersService {
  login(
    credential: LoginDto
  ): Promise<{ accessToken: string; refreshToken: string }>
  refreshToken(credential: RefreshTokenDto): Promise<{ accessToken: string }>
}
