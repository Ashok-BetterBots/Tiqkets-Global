import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import OrgLoginScreen from "@/screens/org/OrgLoginScreen";
import OrgTabNavigator from "@/navigation/OrgTabNavigator";
import UserManagementScreen from "@/screens/org/UserManagementScreen";
import CheckInScannerScreen from "@/screens/org/CheckInScannerScreen";
import JourneyManagementScreen from "@/screens/org/JourneyManagementScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useOrganization } from "@/contexts/OrganizationContext";

export type OrgStackParamList = {
  OrgLogin: undefined;
  OrgMain: undefined;
  UserManagement: undefined;
  CheckInScanner: undefined;
  JourneyManagement: undefined;
};

const Stack = createNativeStackNavigator<OrgStackParamList>();

export default function OrgStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isOrgAuthenticated, isLoading } = useOrganization();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {isOrgAuthenticated ? (
        <>
          <Stack.Screen
            name="OrgMain"
            component={OrgTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="UserManagement"
            component={UserManagementScreen}
            options={{ headerTitle: "User Management" }}
          />
          <Stack.Screen
            name="CheckInScanner"
            component={CheckInScannerScreen}
            options={{ headerShown: false, presentation: "fullScreenModal" }}
          />
          <Stack.Screen
            name="JourneyManagement"
            component={JourneyManagementScreen}
            options={{ headerTitle: "Customer Journeys" }}
          />
        </>
      ) : (
        <Stack.Screen
          name="OrgLogin"
          component={OrgLoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}
