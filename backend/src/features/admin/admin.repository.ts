import { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { CreateUserDto, UpdateUserDto } from './admin.dto';

export class AdminRepository {
  async findAll(): Promise<User[]> {
    return prisma.user.findMany({ where: { isPoolAccount: false }, orderBy: { createdAt: 'desc' } });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async create(data: CreateUserDto & { password: string }): Promise<User> {
    return prisma.user.create({
      data: {
        email: data.email,
        password: data.password,
        name: data.name,
        role: data.role ?? 'USER',
        accounts: {
          create: { name: 'Main Account', balance: 0, isDefault: true },
        },
      },
    });
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await prisma.user.delete({ where: { id } });
  }
}
