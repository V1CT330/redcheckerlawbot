import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createThread, deleteThread, listThreads } from "@/lib/threads.functions";
import { Button } from "@/components/ui/button";
import { LogOut, MessageSquarePlus, Trash2 } from "lucide-react";
import logo from "@/assets/red-checker-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DocumentsPanel } from "@/components/documents-panel";
import { LawLinksPanel } from "@/components/law-links-panel";
import { useState } from "react";

type Tab = "chats" | "library" | "law";

export function AppSidebar() {
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;
  const [tab, setTab] = useState<Tab>("chats");

  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);

  const threadsQ = useQuery({ queryKey: ["threads"], queryFn: () => list() });

  const createM = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (t?.id) navigate({ to: "/chat/$threadId", params: { threadId: t.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create chat"),
  });

  const deleteM = useMutation({
    mutationFn: (threadId: string) => del({ data: { threadId } }),
    onSuccess: (_data, threadId) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      if (activeId === threadId) navigate({ to: "/chat" });
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/" });
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/chat" className="flex items-center gap-3 px-2 py-2">
          <img src={logo} alt="" width={48} height={48} className="h-12 w-12 shrink-0" />
          <span className="font-serif text-xl font-bold leading-tight text-sidebar-foreground">
            RedBot Law Checker
          </span>
        </Link>
        <div className="mt-2 grid grid-cols-3 gap-1 rounded-md bg-sidebar-accent/40 p-1 text-[11px]">
          {([
            ["chats", "Chats"],
            ["library", "Library"],
            ["law", "Law"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded px-2 py-1 font-medium transition ${
                tab === id
                  ? "bg-sidebar text-sidebar-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {tab === "chats" && (
          <>
            <div className="p-2">
              <Button
                onClick={() => createM.mutate()}
                disabled={createM.isPending}
                className="w-full justify-start"
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                New chat
              </Button>
            </div>
            <SidebarGroup>
              <SidebarGroupLabel>Your chats</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {threadsQ.isLoading && (
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/60">Loading…</div>
                  )}
                  {threadsQ.data?.length === 0 && (
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/60">
                      No chats yet.
                    </div>
                  )}
                  {threadsQ.data?.map((t) => (
                    <SidebarMenuItem key={t.id} className="group/item">
                      <div className="relative flex items-center">
                        <SidebarMenuButton asChild isActive={activeId === t.id} className="pr-8">
                          <Link
                            to="/chat/$threadId"
                            params={{ threadId: t.id }}
                            className="truncate"
                            title={t.title}
                          >
                            {t.title || "Untitled"}
                          </Link>
                        </SidebarMenuButton>
                        <button
                          type="button"
                          aria-label="Delete chat"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirm("Delete this conversation?")) deleteM.mutate(t.id);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-sidebar-foreground/50 opacity-0 transition group-hover/item:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
        {tab === "library" && <DocumentsPanel />}
        {tab === "law" && <LawLinksPanel />}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <Button variant="ghost" onClick={signOut} className="justify-start text-sidebar-foreground hover:bg-sidebar-accent">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
