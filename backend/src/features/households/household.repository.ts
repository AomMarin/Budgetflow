import { Household, HouseholdMember, HouseholdInvite, HouseholdRole } from '@prisma/client';
import { prisma } from '../../config/database';

export type MembershipWithHousehold = HouseholdMember & { household: Household };

export class HouseholdRepository {
  async findMembershipByUserId(userId: string): Promise<MembershipWithHousehold | null> {
    return prisma.householdMember.findUnique({
      where: { userId },
      include: { household: true },
    });
  }

  async findMembers(householdId: string) {
    return prisma.householdMember.findMany({
      where: { householdId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async createHousehold(name: string, ownerId: string): Promise<Household> {
    return prisma.$transaction(async (tx) => {
      const household = await tx.household.create({ data: { name, ownerId } });
      await tx.householdMember.create({
        data: { householdId: household.id, userId: ownerId, role: 'OWNER' },
      });
      return household;
    });
  }

  async deleteHousehold(id: string): Promise<void> {
    await prisma.household.delete({ where: { id } });
  }

  async addMember(householdId: string, userId: string, role: HouseholdRole): Promise<HouseholdMember> {
    return prisma.householdMember.create({ data: { householdId, userId, role } });
  }

  async removeMember(householdId: string, userId: string): Promise<void> {
    await prisma.householdMember.deleteMany({ where: { householdId, userId } });
  }

  async createInvite(householdId: string, createdById: string, code: string, expiresAt: Date): Promise<HouseholdInvite> {
    return prisma.householdInvite.create({
      data: { householdId, createdById, code, expiresAt },
    });
  }

  async findInviteByCode(code: string): Promise<HouseholdInvite | null> {
    return prisma.householdInvite.findUnique({ where: { code } });
  }

  async markInviteUsed(id: string, usedByUserId: string): Promise<void> {
    await prisma.householdInvite.update({
      where: { id },
      data: { usedByUserId, usedAt: new Date() },
    });
  }
}
