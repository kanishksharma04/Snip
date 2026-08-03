"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createInvite,
  revokeInvite,
  removeMember,
  changeMemberRole,
  leaveOrganization,
} from "@/lib/actions/organizations";
import { formatDateIst } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { OrgRole } from "@/generated/prisma/enums";

type MemberRow = {
  id: string;
  role: OrgRole;
  user: { id: string; name: string | null; email: string; image: string | null };
};

type InviteRow = {
  id: string;
  role: OrgRole;
  token: string;
  expiresAt: Date;
};

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    toast.error("Could not copy to clipboard");
  });
}

function inviteUrl(token: string): string {
  return `${window.location.origin}/invite/${token}`;
}

export function MemberManager({
  initialMembers,
  initialInvites,
  viewerRole,
  viewerUserId,
  isPersonal,
}: {
  initialMembers: MemberRow[];
  initialInvites: InviteRow[];
  viewerRole: OrgRole | null;
  viewerUserId: string;
  isPersonal: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invites, setInvites] = useState(initialInvites);
  const [revealedInvite, setRevealedInvite] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOwner = viewerRole === "OWNER";

  const handleInvite = (role: OrgRole) => {
    startTransition(async () => {
      const result = await createInvite(role);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setInvites((prev) => [
        { id: result.data.id, role, token: result.data.token, expiresAt: result.data.expiresAt },
        ...prev,
      ]);
      setRevealedInvite(result.data.url);
    });
  };

  const handleRevokeInvite = (id: string) => {
    startTransition(async () => {
      const result = await revokeInvite(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setInvites((prev) => prev.filter((invite) => invite.id !== id));
    });
  };

  const handleRemoveMember = (id: string) => {
    startTransition(async () => {
      const result = await removeMember(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setMembers((prev) => prev.filter((member) => member.id !== id));
    });
  };

  const handleChangeRole = (id: string, role: OrgRole) => {
    startTransition(async () => {
      const result = await changeMemberRole(id, role);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setMembers((prev) => prev.map((member) => (member.id === id ? { ...member, role } : member)));
    });
  };

  const handleLeave = () => {
    startTransition(async () => {
      const result = await leaveOrganization();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Left the organization");
      window.location.href = "/dashboard";
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {isOwner && (
        <div className="flex max-w-md items-center gap-2 rounded-2xl border p-5 shadow-sm sm:p-6">
          <p className="text-muted-foreground flex-1 text-sm">
            Invite someone with a shareable link — Snip has no email sending, so nothing gets
            sent automatically.
          </p>
          <Button onClick={() => handleInvite("MEMBER")} disabled={isPending}>
            Invite member
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id} className="group">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarImage src={member.user.image ?? undefined} alt={member.user.name ?? "Member"} />
                      <AvatarFallback>
                        {(member.user.name ?? member.user.email).charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {member.user.name ?? member.user.email}
                        {member.user.id === viewerUserId && (
                          <span className="text-muted-foreground ml-1.5 text-xs">You</span>
                        )}
                      </span>
                      <span className="text-muted-foreground text-xs">{member.user.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {isOwner ? (
                    <Select
                      value={member.role}
                      onValueChange={(role) => handleChangeRole(member.id, role as OrgRole)}
                      disabled={isPending}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OWNER">Owner</SelectItem>
                        <SelectItem value="MEMBER">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{member.role === "OWNER" ? "Owner" : "Member"}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {isOwner && member.user.id !== viewerUserId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRemoveMember(member.id)}
                      className="opacity-60 transition-opacity group-hover:opacity-100"
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {invites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Pending invites</h3>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id} className="group hover:bg-transparent">
                    <TableCell className="text-muted-foreground text-sm">
                      {invite.role === "OWNER" ? "Owner" : "Member"} invite — expires{" "}
                      {formatDateIst(invite.expiresAt)}
                    </TableCell>
                    <TableCell className="w-40 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(inviteUrl(invite.token))}
                      >
                        Copy link
                      </Button>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleRevokeInvite(invite.id)}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {!isPersonal && (
        <Button variant="outline" size="sm" className="w-fit" disabled={isPending} onClick={handleLeave}>
          Leave organization
        </Button>
      )}

      <Dialog open={revealedInvite !== null} onOpenChange={(open) => !open && setRevealedInvite(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite link</DialogTitle>
            <DialogDescription>
              Share this link with whoever you&apos;re inviting — anyone with it can join. It
              expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          <code className="bg-muted block overflow-x-auto rounded p-3 text-sm break-all">
            {revealedInvite}
          </code>
          <DialogFooter>
            <Button variant="outline" onClick={() => revealedInvite && copyToClipboard(revealedInvite)}>
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
