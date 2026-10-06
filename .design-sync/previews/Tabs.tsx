import { Tabs, TabsContent, TabsList, TabsTrigger } from "sub-office";

export const Threads = () => (
  <div style={{ width: 420 }}>
    <Tabs defaultValue="mine">
      <TabsList>
        <TabsTrigger value="mine">Needs you</TabsTrigger>
        <TabsTrigger value="out">Asked by you</TabsTrigger>
        <TabsTrigger value="done">Done</TabsTrigger>
      </TabsList>
      <TabsContent value="mine">Mina asks for the March invoices.</TabsContent>
      <TabsContent value="out">
        The signed Northwind quote, from Tom.
      </TabsContent>
      <TabsContent value="done">Acme paid on the 3rd.</TabsContent>
    </Tabs>
  </div>
);

export const LineVariant = () => (
  <div style={{ width: 420 }}>
    <Tabs defaultValue="card">
      <TabsList variant="line">
        <TabsTrigger value="card">Card</TabsTrigger>
        <TabsTrigger value="menu">Menu</TabsTrigger>
        <TabsTrigger value="trust">Trust</TabsTrigger>
      </TabsList>
      <TabsContent value="card">How your bot appears to others.</TabsContent>
      <TabsContent value="menu">What others can ask it for.</TabsContent>
      <TabsContent value="trust">When it acts alone.</TabsContent>
    </Tabs>
  </div>
);
