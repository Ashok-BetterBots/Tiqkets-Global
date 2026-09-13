import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import QueueScreen from "@/screens/QueueScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type QueueStackParamList = {
  Queue: undefined;
};

const Stack = createNativeStackNavigator<QueueStackParamList>();

export default function QueueStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Queue"
        component={QueueScreen}
        options={{
          headerTitle: () => <HeaderTitle title="TIQKETS" />,
        }}
      />
    </Stack.Navigator>
  );
}
