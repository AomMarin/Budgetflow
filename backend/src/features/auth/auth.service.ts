import { User } from '@prisma/client';
import { AuthRepository } from './auth.repository';
import { RegisterDto, LoginDto, UpdateProfileDto, ChangePasswordDto } from './auth.dto';
import { hashPassword, comparePassword } from '../../utils/password';
import { generateTokens, verifyRefreshToken } from '../../utils/jwt';
import { TokenPair, SafeUser } from '../../types';

export class AuthService {
  constructor(private readonly repo = new AuthRepository()) {}

  async register(dto: RegisterDto): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) throw Object.assign(new Error('Email already registered'), { status: 409 });

    const hashedPassword = await hashPassword(dto.password);
    const user = await this.repo.create({ ...dto, password: hashedPassword });
    const tokens = generateTokens(user.id, user.email, user.name, user.role);

    return { user: this.sanitize(user), tokens };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const user = await this.repo.findByEmail(dto.email);
    if (!user) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

    const valid = await comparePassword(dto.password, user.password);
    if (!valid) throw Object.assign(new Error('Invalid credentials'), { status: 401 });

    const tokens = generateTokens(user.id, user.email, user.name, user.role);
    return { user: this.sanitize(user), tokens };
  }

  async refreshToken(token: string): Promise<TokenPair> {
    const payload = verifyRefreshToken(token);
    const user = await this.repo.findById(payload.userId);
    if (!user) throw Object.assign(new Error('User not found'), { status: 401 });
    return generateTokens(user.id, user.email, user.name, user.role);
  }

  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.repo.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
    return this.sanitize(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    const user = await this.repo.updateProfile(userId, dto);
    return this.sanitize(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    const valid = await comparePassword(dto.currentPassword, user.password);
    if (!valid) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });

    const hashedPassword = await hashPassword(dto.newPassword);
    await this.repo.updateProfile(userId, { password: hashedPassword });
  }

  private sanitize(user: User): SafeUser {
    const { password: _, ...safe } = user;
    return safe;
  }
}
