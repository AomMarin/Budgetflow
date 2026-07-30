import { User } from '@prisma/client';
import { AdminRepository } from './admin.repository';
import { CreateUserDto, UpdateUserDto } from './admin.dto';
import { hashPassword } from '../../utils/password';
import { SafeUser } from '../../types';

export class AdminService {
  constructor(private readonly repo = new AdminRepository()) {}

  async listUsers(): Promise<SafeUser[]> {
    const users = await this.repo.findAll();
    return users.map((u) => this.sanitize(u));
  }

  async createUser(dto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });

    const hashedPassword = await hashPassword(dto.password);
    const user = await this.repo.create({ ...dto, password: hashedPassword });
    return this.sanitize(user);
  }

  async updateUser(currentUserId: string, id: string, dto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.repo.findById(id);
    if (!user || user.isPoolAccount) throw Object.assign(new Error('User not found'), { status: 404 });

    if (id === currentUserId && dto.role && dto.role !== 'ADMIN') {
      throw Object.assign(new Error('You cannot remove your own admin role'), { status: 400 });
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.repo.findByEmail(dto.email);
      if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });
    }

    const hashedPassword = dto.password ? await hashPassword(dto.password) : undefined;
    const updated = await this.repo.update(id, { ...dto, password: hashedPassword ?? undefined });
    return this.sanitize(updated);
  }

  async deleteUser(currentUserId: string, id: string): Promise<void> {
    if (id === currentUserId) {
      throw Object.assign(new Error('You cannot delete your own account'), { status: 400 });
    }
    const user = await this.repo.findById(id);
    if (!user || user.isPoolAccount) throw Object.assign(new Error('User not found'), { status: 404 });

    await this.repo.delete(id);
  }

  private sanitize(user: User): SafeUser {
    const { password: _, ...safe } = user;
    return safe;
  }
}
