import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [
    { title: "Chat Workspace | RedBot Law Checker" },
    { name: "description", content: "Your Malawi law chat workspace with RedBot Law Checker." },
    { property: "og:title", content: "Chat Workspace | RedBot Law Checker" },
    { property: "og:description", content: "Your Malawi law chat workspace with RedBot Law Checker." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ChatLayout,
});

function ChatLayout() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="flex h-12 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
            <SidebarTrigger />
            <div className="font-serif text-sm font-semibold text-muted-foreground">
              RedBot Law Checker · Malawi Law Assistant
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
