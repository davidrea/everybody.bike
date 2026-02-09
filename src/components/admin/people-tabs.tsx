"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserList } from "./user-list";
import { RiderList } from "./rider-list";

export function PeopleTabsClient() {
  return (
    <Tabs defaultValue="adults">
      <TabsList>
        <TabsTrigger value="adults">Adults</TabsTrigger>
        <TabsTrigger value="riders">Riders</TabsTrigger>
      </TabsList>
      <TabsContent value="adults" className="space-y-4 pt-2">
        <UserList />
      </TabsContent>
      <TabsContent value="riders" className="space-y-4 pt-2">
        <RiderList />
      </TabsContent>
    </Tabs>
  );
}
