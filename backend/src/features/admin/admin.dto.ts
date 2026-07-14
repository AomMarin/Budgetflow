import { Role } from '@prisma/client';

export interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  role?: Role;
}

export interface UpdateUserDto {
  email?: string;
  password?: string;
  name?: string;
  role?: Role;
}
