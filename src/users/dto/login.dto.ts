export class LoginDto {
  username: string
  password: string
}

export class RefreshTokenDto {
  refreshToken: string
}

export class ValidTokenDto {
  accessToken: string
}
