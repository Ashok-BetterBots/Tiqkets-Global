import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import OrgLoginScreen from "@/screens/org/OrgLoginScreen";
import OrgTabNavigator from "@/navigation/OrgTabNavigator";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useOrganization } from "@/contexts/OrganizationContext";

export type OrgStackParamList = {
  OrgLogin: undefined;
  OrgMain: undefined;
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
        <Stack.Screen
          name="OrgMain"
          component={OrgTabNavigator}
          options={{ headerShown: false }}
        />
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
