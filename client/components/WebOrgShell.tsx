import React from "react";

export interface WebShellNavItem {
  name: string;
  label: string;
  icon: string;
  group: string;
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
