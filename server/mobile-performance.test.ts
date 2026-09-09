import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("high-volume mobile collections stay virtualized", () => {
  const queueScreen = readFileSync("client/screens/org/OrgQueueScreen.tsx", "utf8");
  const usersScreen = readFileSync("client/screens/org/UserManagementScreen.tsx", "utf8");

  assert.match(queueScreen, /<FlatList[\s\S]*data=\{\(isFifoMode \|\| isSelectiveMode\) \? fifoList : filteredQueue\}/);
  assert.match(queueScreen, /keyExtractor=\{\(customer\) => customer\.id\}/);
  assert.match(queueScreen, /initialNumToRender=\{12\}/);
  assert.doesNotMatch(queueScreen, /fifoList\.map\(\(customer/);
  assert.doesNotMatch(queueScreen, /filteredQueue\.map\(\(customer/);

  assert.match(usersScreen, /const UserCard = memo\(/);
  assert.match(usersScreen, /<FlatList[\s\S]*data=\{filteredUsers\}/);
  assert.match(usersScreen, /keyExtractor=\{\(user\) => user\.id\}/);
  assert.doesNotMatch(usersScreen, /filteredUsers\.map\(\(user/);
});

test("secondary customer routes are evaluated only when opened", () => {
  const rootNavigator = readFileSync("client/navigation/RootStackNavigator.tsx", "utf8");

  for (const route of [
    "JoinQueue",
    "QueueDetails",
    "QRScanner",
    "SwapPosition",
    "ChangeService",
    "BookAppointment",
    "Appointments",
  ]) {
    assert.match(rootNavigator, new RegExp(`name="${route}"[\\s\\S]*?getComponent=`));
  }
});