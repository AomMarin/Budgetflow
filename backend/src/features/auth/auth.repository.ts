import { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { RegisterDto } from './auth.dto';

export class AuthRepository {
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async create(data: RegisterDto & { password: string }): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        name: data.name,
        accounts: {
          create: { name: 'Main Account', balance: 0, isDefault: true },
        },
      },
    });
  }

  async updateProfile(id: string, data: Partial<User>): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }
}
