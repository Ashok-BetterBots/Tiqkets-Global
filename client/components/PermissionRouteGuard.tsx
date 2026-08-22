import React, { useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import { useOrganization } from "@/contexts/OrganizationContext";
import { PermissionDenied } from "@/components/RequirePermission";
import { ORG_QUEUE_NAV_PERMISSIONS } from "@shared/permissions";

type Allow = string | string[];

function isAllowed(
  allow: Allow,
  hasPermission: (k: string) => boolean,
  hasAnyPermission: (k: string[]) => boolean,
): boolean {
  if (Array.isArray(allow)) return hasAnyPermission(allow);
  return hasPermission(allow);
}

function pickFirstAllowedTab(
  hasPermission: (k: string) => boolean,
  hasAnyPermission: (k: string[]) => boolean,
): string | null {
  if (hasPermission("org.dashboard.view")) return "OrgDashboard";
  if (hasAnyPermission(ORG_QUEUE_NAV_PERMISSIONS)) return "OrgQueue";
  if (hasPermission("org.branches.view")) return "OrgServices";
  if (hasPermission("org.bookings.view")) return "OrgBookings";
  if (hasPermission("org.settings.view")) return "OrgSettings";
  return null;
}

interface Props {
  allow: Allow;
  roles?: string[];
  message?: string;
  children: React.ReactNode;
}

export function PermissionRouteGuard({ allow, roles, message, children }: Props) {
  const navigation = useNavigation<any>();
  const { currentUser, hasPermission, hasAnyPermission } = useOrganization();
  const roleAllowed = !roles || roles.includes(currentUser?.role || "");
  const allowed = roleAllowed && isAllowed(allow, hasPermission, hasAnyPermission);

  useEffect(() => {
    if (allowed) return;
    const target = pickFirstAllowedTab(hasPermission, hasAnyPermission);
    if (!target) return;
    const t = setTimeout(() => {
      try {
        navigation.reset({
          index: 0,
          routes: [{ name: "OrgMain", params: { screen: target } }],
        });
      } catch (err) {
        console.warn("PermissionRouteGuard: navigation.reset failed", err);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [allowed, hasPermission, hasAnyPermission, navigation]);

  if (!allowed) {
    return (
      <PermissionDenied
        message={
          message ?? "You do not have permission to view this section."
        }
      />
    );
  }
  return <>{children}</>;
}
