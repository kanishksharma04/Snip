import { describe, expect, it, vi, beforeEach } from "vitest";

const mockMemberFindUnique = vi.fn();
const mockMemberFindFirst = vi.fn();
const mockMemberCount = vi.fn();
const mockMemberDelete = vi.fn();
const mockMemberUpdate = vi.fn();
const mockMemberUpsert = vi.fn();
const mockInviteFindUnique = vi.fn();
const mockInviteUpdate = vi.fn();
const mockUserUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    organizationMember: {
      findUnique: (...args: unknown[]) => mockMemberFindUnique(...args),
      findFirst: (...args: unknown[]) => mockMemberFindFirst(...args),
      count: (...args: unknown[]) => mockMemberCount(...args),
      delete: (...args: unknown[]) => mockMemberDelete(...args),
      update: (...args: unknown[]) => mockMemberUpdate(...args),
      upsert: (...args: unknown[]) => mockMemberUpsert(...args),
    },
    organizationInvite: {
      findUnique: (...args: unknown[]) => mockInviteFindUnique(...args),
      update: (...args: unknown[]) => mockInviteUpdate(...args),
    },
    user: {
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { getSession } from "@/lib/session";
import { removeMember, changeMemberRole, acceptInvite } from "@/lib/actions/organizations";

function sessionAs(userId: string, organizationId: string) {
  vi.mocked(getSession).mockResolvedValue({
    user: { id: userId, organizationId },
  } as never);
}

beforeEach(() => {
  mockMemberFindUnique.mockReset();
  mockMemberFindFirst.mockReset();
  mockMemberCount.mockReset();
  mockMemberDelete.mockReset();
  mockMemberUpdate.mockReset();
  mockMemberUpsert.mockReset();
  mockInviteFindUnique.mockReset();
  mockInviteUpdate.mockReset();
  mockUserUpdate.mockReset();
});

describe("removeMember — role gating", () => {
  it("rejects a MEMBER caller (requireRole fails)", async () => {
    sessionAs("user_member", "org_1");
    // requireRole looks up the caller's own membership first.
    mockMemberFindUnique.mockResolvedValueOnce({ role: "MEMBER" });

    const result = await removeMember("member_target");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/only an owner/i);
    expect(mockMemberDelete).not.toHaveBeenCalled();
  });

  it("refuses to remove the last remaining owner", async () => {
    sessionAs("user_owner", "org_1");
    mockMemberFindUnique.mockResolvedValueOnce({ role: "OWNER" }); // caller's own membership
    mockMemberFindFirst.mockResolvedValueOnce({ id: "member_target", role: "OWNER" }); // target
    mockMemberCount.mockResolvedValueOnce(0); // no other owners

    const result = await removeMember("member_target");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/last owner/i);
    expect(mockMemberDelete).not.toHaveBeenCalled();
  });

  it("allows an owner to remove a regular member", async () => {
    sessionAs("user_owner", "org_1");
    mockMemberFindUnique.mockResolvedValueOnce({ role: "OWNER" });
    mockMemberFindFirst.mockResolvedValueOnce({ id: "member_target", role: "MEMBER" });

    const result = await removeMember("member_target");

    expect(result.success).toBe(true);
    expect(mockMemberDelete).toHaveBeenCalledWith({ where: { id: "member_target" } });
  });
});

describe("changeMemberRole — last-owner guard", () => {
  it("refuses to demote the last owner to MEMBER", async () => {
    sessionAs("user_owner", "org_1");
    mockMemberFindUnique.mockResolvedValueOnce({ role: "OWNER" });
    mockMemberFindFirst.mockResolvedValueOnce({ id: "member_target", role: "OWNER" });
    mockMemberCount.mockResolvedValueOnce(0);

    const result = await changeMemberRole("member_target", "MEMBER");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/last owner/i);
    expect(mockMemberUpdate).not.toHaveBeenCalled();
  });

  it("allows promoting a member to OWNER", async () => {
    sessionAs("user_owner", "org_1");
    mockMemberFindUnique.mockResolvedValueOnce({ role: "OWNER" });
    mockMemberFindFirst.mockResolvedValueOnce({ id: "member_target", role: "MEMBER" });

    const result = await changeMemberRole("member_target", "OWNER");

    expect(result.success).toBe(true);
    expect(mockMemberUpdate).toHaveBeenCalledWith({
      where: { id: "member_target" },
      data: { role: "OWNER" },
    });
  });
});

describe("acceptInvite", () => {
  it("rejects an expired invite without creating a membership", async () => {
    sessionAs("user_1", "org_other");
    mockInviteFindUnique.mockResolvedValueOnce({
      id: "invite_1",
      organizationId: "org_1",
      role: "MEMBER",
      expiresAt: new Date(Date.now() - 1000),
      acceptedAt: null,
      organization: { id: "org_1", name: "Acme" },
    });

    const result = await acceptInvite("token_1");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/expired/i);
    expect(mockMemberUpsert).not.toHaveBeenCalled();
  });

  it("accepts a valid, not-yet-accepted invite and sets acceptedAt", async () => {
    sessionAs("user_1", "org_other");
    mockInviteFindUnique.mockResolvedValueOnce({
      id: "invite_1",
      organizationId: "org_1",
      role: "MEMBER",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      acceptedAt: null,
      organization: { id: "org_1", name: "Acme" },
    });

    const result = await acceptInvite("token_1");

    expect(result.success).toBe(true);
    expect(mockMemberUpsert).toHaveBeenCalledOnce();
    expect(mockInviteUpdate).toHaveBeenCalledOnce();
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { activeOrganizationId: "org_1" },
    });
  });

  it("is idempotent for an already-accepted invite — no second acceptedAt write", async () => {
    sessionAs("user_1", "org_other");
    mockInviteFindUnique.mockResolvedValueOnce({
      id: "invite_1",
      organizationId: "org_1",
      role: "MEMBER",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      acceptedAt: new Date(),
      organization: { id: "org_1", name: "Acme" },
    });

    const result = await acceptInvite("token_1");

    expect(result.success).toBe(true);
    expect(mockMemberUpsert).toHaveBeenCalledOnce();
    expect(mockInviteUpdate).not.toHaveBeenCalled();
  });
});
