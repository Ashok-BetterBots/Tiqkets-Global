import React, { useState } from "react";
import { Platform } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import SuperAdminWebShell from "@/components/SuperAdminWebShell";
import SuperAdminDashboard from "@/screens/superadmin/SuperAdminDashboard";
import AdminListScreen from "@/screens/superadmin/AdminListScreen";
import OnboardListScreen from "@/screens/superadmin/OnboardListScreen";
import VisitorReportScreen from "@/screens/superadmin/VisitorReportScreen";
import ReportScreen from "@/screens/superadmin/ReportScreen";
import SubscriberListScreen from "@/screens/superadmin/SubscriberListScreen";
import TransactionHistoryScreen from "@/screens/superadmin/TransactionHistoryScreen";
import PricePlanScreen from "@/screens/superadmin/PricePlanScreen";
import TechSupportScreen from "@/screens/superadmin/TechSupportScreen";
import MasterScreen from "@/screens/superadmin/MasterScreen";
import LogsScreen from "@/screens/superadmin/LogsScreen";
import UserControlScreen from "@/screens/superadmin/UserControlScreen";
import NotificationSettingsScreen from "@/screens/superadmin/NotificationSettingsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type SuperAdminStackParamList = {
  SuperDashboard: undefined;
  SuperAdminList: undefined;
  SuperOnboardList: undefined;
  SuperVisitorReport: undefined;
  SuperReports: undefined;
  SuperSubscriberList: undefined;
  SuperTransactions: undefined;
  SuperPricePlan: undefined;
  SuperTechSupport: undefined;
  SuperMaster: { tab?: string } | undefined;
  SuperLogs: { tab?: string } | undefined;
  SuperUserControl: { tab?: string } | undefined;
  SuperNotificationSettings: undefined;
};

const Stack = createNativeStackNavigator<SuperAdminStackParamList>();

export default function SuperAdminStackNavigator() {
  const screenOptions = useScreenOptions();
  const isWeb = Platform.OS === "web";
  const [currentTab, setCurrentTab] = useState<string | undefined>();

  const shellLayout = isWeb
    ? ({
        navigation,
        children,
        route,
      }: {
        navigation: {
          navigate: (name: string, params?: object) => void;
        };
        children: React.ReactNode;
        route: { name: string; params?: any };
      }) => (
        <SuperAdminWebShell
          currentRouteName={route.name}
          currentTab={(route.params as any)?.tab ?? currentTab}
          onNavigate={(name, tab) => {
            setCurrentTab(tab);
            if (name === route.name && tab) {
              navigation.navigate(name as any, { tab });
              return;
            }
            if (name === route.name) return;
            navigation.navigate(name as any, tab ? { tab } : undefined);
          }}
        >
          {children}
        </SuperAdminWebShell>
      )
    : undefined;

  const opts = (title: string) => ({
    headerTitle: title,
    headerShown: !isWeb,
  });

  return (
    <Stack.Navigator
      screenOptions={screenOptions}
      initialRouteName="SuperDashboard"
      screenLayout={shellLayout as any}
    >
      <Stack.Screen
        name="SuperDashboard"
        component={SuperAdminDashboard}
        options={opts("Dashboard")}
      />
      <Stack.Screen
        name="SuperAdminList"
        component={AdminListScreen}
        options={opts("Admin List")}
      />
      <Stack.Screen
        name="SuperOnboardList"
        component={OnboardListScreen}
        options={opts("Onboarding List")}
      />
      <Stack.Screen
        name="SuperVisitorReport"
        component={VisitorReportScreen}
        options={opts("Visitor Report")}
      />
      <Stack.Screen
        name="SuperReports"
        component={ReportScreen}
        options={opts("Reports")}
      />
      <Stack.Screen
        name="SuperSubscriberList"
        component={SubscriberListScreen}
        options={opts("Subscribers")}
      />
      <Stack.Screen
        name="SuperTransactions"
        component={TransactionHistoryScreen}
        options={opts("Transactions")}
      />
      <Stack.Screen
        name="SuperPricePlan"
        component={PricePlanScreen}
        options={opts("Pricing & Plans")}
      />
      <Stack.Screen
        name="SuperTechSupport"
        component={TechSupportScreen}
        options={opts("Tech Support")}
      />
      <Stack.Screen
        name="SuperMaster"
        options={opts("Master")}
      >
        {(props) => (
          <MasterScreen
            initialTab={(props.route.params?.tab as any) || "categories"}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="SuperLogs"
        options={opts("Logs")}
      >
        {(props) => (
          <LogsScreen
            initialTab={(props.route.params?.tab as any) || "system"}
          />
        )}
      </Stack.Screen>
      <Stack.Screen
        name="SuperNotificationSettings"
        component={NotificationSettingsScreen}
        options={opts("Notification Settings")}
      />
      <Stack.Screen
        name="SuperUserControl"
        options={opts("User Control")}
      >
        {(props) => (
          <UserControlScreen
            initialTab={(props.route.params?.tab as any) || "roles"}
          />
        )}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
