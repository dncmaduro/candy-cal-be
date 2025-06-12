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

export class ForgotPasswordDto {
  username: string
  oldPassword: string
  newPassword: string
}

export class UpdateUserDto {
  name: string
}
