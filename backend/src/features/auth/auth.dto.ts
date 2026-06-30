export interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface UpdateProfileDto {
  name?: string;
  currency?: string;
  timezone?: string;
  alertAt80?: boolean;
  alertAt90?: boolean;
  alertAt100?: boolean;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}
