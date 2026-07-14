import crypto from 'crypto';
import { HouseholdRepository } from './household.repository';
import { CreateHouseholdDto, JoinHouseholdDto } from './household.dto';
import { DashboardService } from '../dashboard/dashboard.service';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class HouseholdService {
  constructor(
    private readonly repo = new HouseholdRepository(),
    private readonly dashboardService = new DashboardService(),
  ) {}

  private notFound(message: string): never {
    throw Object.assign(new Error(message), { status: 404 });
  }

  private forbidden(message: string): never {
    throw Object.assign(new Error(message), { status: 403 });
  }

  private badRequest(message: string): never {
    throw Object.assign(new Error(message), { status: 400 });
  }

  async getMine(userId: string) {
    const membership = await this.repo.findMembershipByUserId(userId);
    if (!membership) return null;

    const members = await this.repo.findMembers(membership.householdId);
    return {
      id: membership.household.id,
      name: membership.household.name,
      myRole: membership.role,
      members: members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async create(userId: string, dto: CreateHouseholdDto) {
    const existing = await this.repo.findMembershipByUserId(userId);
    if (existing) this.badRequest('You are already in a household — leave it first');

    await this.repo.createHousehold(dto.name, userId);
    return this.getMine(userId);
  }

  async createInvite(userId: string, householdId: string) {
    const membership = await this.repo.findMembershipByUserId(userId);
    if (!membership || membership.householdId !== householdId || membership.role !== 'OWNER') {
      this.forbidden('Only the household owner can create invites');
    }

    const code = crypto.randomBytes(5).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const invite = await this.repo.createInvite(householdId, userId, code, expiresAt);

    return { code: invite.code, expiresAt: invite.expiresAt };
  }

  async join(userId: string, dto: JoinHouseholdDto) {
    const existing = await this.repo.findMembershipByUserId(userId);
    if (existing) this.badRequest('You are already in a household — leave it first');

    const invite = await this.repo.findInviteByCode(dto.code.trim());
    if (!invite) this.notFound('Invalid invite code');
    if (invite.usedAt) this.badRequest('This invite code has already been used');
    if (invite.expiresAt < new Date()) this.badRequest('This invite code has expired');

    await this.repo.addMember(invite.householdId, userId, 'MEMBER');
    await this.repo.markInviteUsed(invite.id, userId);

    return this.getMine(userId);
  }

  async removeMember(userId: string, targetUserId: string): Promise<void> {
    const membership = await this.repo.findMembershipByUserId(userId);
    if (!membership || membership.role !== 'OWNER') {
      this.forbidden('Only the household owner can remove members');
    }
    if (targetUserId === userId) {
      this.badRequest('Use leave or delete-household to remove yourself');
    }

    const target = await this.repo.findMembershipByUserId(targetUserId);
    if (!target || target.householdId !== membership.householdId) {
      this.notFound('Member not found in this household');
    }

    await this.repo.removeMember(membership.householdId, targetUserId);
  }

  async leave(userId: string): Promise<void> {
    const membership = await this.repo.findMembershipByUserId(userId);
    if (!membership) this.notFound('You are not in a household');
    if (membership.role === 'OWNER') {
      this.badRequest('The owner cannot leave — delete the household instead');
    }

    await this.repo.removeMember(membership.householdId, userId);
  }

  async deleteHousehold(userId: string): Promise<void> {
    const membership = await this.repo.findMembershipByUserId(userId);
    if (!membership || membership.role !== 'OWNER') {
      this.forbidden('Only the household owner can delete the household');
    }

    await this.repo.deleteHousehold(membership.householdId);
  }

  async getOverview(userId: string) {
    const membership = await this.repo.findMembershipByUserId(userId);
    if (!membership) return null;

    const members = await this.repo.findMembers(membership.householdId);
    const memberSummaries = await Promise.all(
      members.map(async (m) => ({
        userId: m.user.id,
        name: m.user.name,
        role: m.role,
        summary: await this.dashboardService.getSummary(m.user.id),
      })),
    );

    return {
      householdId: membership.household.id,
      householdName: membership.household.name,
      members: memberSummaries,
    };
  }
}
