import React from "react";

export interface WebShellNavItem {
  name: string;
  label: string;
  icon: string;
  group: string;
  /** Single permission required to see this nav item. */
  permission?: string;
  /** Any-of: user must have at least one of these permissions. */
  permissions?: string[];
  /** Only shown for classic organisation accounts. */
  orgOnly?: boolean;
  /** Only shown for event accounts. */
  eventOnly?: boolean;
  /** Label override when the signed-in account is an event account. */
  eventLabel?: string;
}

export const ORG_NAV_ITEMS: WebShellNavItem[] = [];

interface Props {
  currentRouteName: string;
  onNavigate: (name: string) => void;
  children: React.ReactNode;
}

export default function WebOrgShell({ children }: Props) {
  return <>{children}</>;
}
