
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  createThread,
  deleteThread,
  listThreads,
} from "@/lib/threads.functions";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  MessageSquarePlus,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DocumentsPanel } from "@/components/documents-panel";
import { LawLinksPanel } from "@/components/law-links-panel";
import { useEffect, useState } from "react";

type Tab = "chats" | "library" | "law" | "settings";

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { threadId?: string };
  const activeId = params.threadId;

  const [tab, setTab] = useState<Tab>(
    location.pathname === "/chat/settings" ? "settings" : "chats",
  );
  const [managingThreadId, setManagingThreadId] = useState<string | null>(
    null,
  );
  const [signingOut, setSigningOut] = useState(false);

  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const del = useServerFn(deleteThread);

  useEffect(() => {
    if (location.pathname === "/chat/settings") {
      setTab("settings");
    } else if (tab === "settings") {
      setTab("chats");
    }
  }, [location.pathname, tab]);

  const threadsQ = useQuery({
    queryKey: ["threads"],
    queryFn: () => list(),
  });

  const createM = useMutation({
    mutationFn: () => create({ data: {} }),
    onSuccess: (thread) => {
      qc.invalidateQueries({ queryKey: ["threads"] });

      if (thread?.id) {
        setManagingThreadId(null);
        navigate({
          to: "/chat/$threadId",
          params: { threadId: thread.id },
        });
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Could not create chat",
      ),
  });

  const deleteM = useMutation({
    mutationFn: (threadId: string) => del({ data: { threadId } }),
    onSuccess: (_data, threadId) => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      setManagingThreadId(null);

      if (activeId === threadId) {
        navigate({ to: "/chat" });
      }

      toast.success("Chat deleted");
    },
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete conversation",
      ),
  });

  const selectTab = (nextTab: Tab) => {
    setTab(nextTab);
    setManagingThreadId(null);

    if (nextTab === "settings") {
      void navigate({ to: "/chat/settings" });
      return;
    }

    if (location.pathname === "/chat/settings") {
      void navigate({ to: "/chat" });
    }
  };

  const signOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await qc.cancelQueries();
      qc.clear();

      const { error } = await supabase.auth.signOut({ scope: "local" });

      if (error) throw error;

      await navigate({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not sign out. Please try again.",
      );
    } finally {
      setSigningOut(false);
    }
  };

  const tabs: [Tab, string][] = [
    ["chats", "Chats"],
    ["library", "Library"],
    ["law", "Law"],
    ["settings", "Settings"],
  ];

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/chat" className="flex items-center gap-3.5 px-3 py-3">
          <BrandLogo className="w-12" />
          <span className="min-w-0 font-serif text-xl font-bold leading-tight text-sidebar-foreground">
            RedBot Law Checker
          </span>
        </Link>

        <nav
          aria-label="Workspace navigation"
          className="mt-2 flex flex-row flex-wrap gap-1 rounded-md bg-sidebar-accent/40 p-1 text-sm"
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => selectTab(id)}
              className={`flex-1 rounded px-3 py-2 text-center text-xs font-medium transition ${
                tab === id
                  ? "bg-sidebar text-sidebar-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
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
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/60">
                      Loading…
                    </div>
                  )}

                  {threadsQ.isError && (
                    <div className="px-3 py-2 text-xs text-destructive">
                      Could not load chats. Please refresh.
                    </div>
                  )}

                  {threadsQ.data?.length === 0 && (
                    <div className="px-3 py-2 text-xs text-sidebar-foreground/60">
                      No chats yet.
                    </div>
                  )}

                  {threadsQ.data?.map((thread) => (
                    <SidebarMenuItem
                      key={thread.id}
                      className="group/item"
                    >
                      <div className="w-full min-w-0">
                        <div className="flex min-w-0 items-center gap-1">
                          <SidebarMenuButton
                            asChild
                            isActive={activeId === thread.id}
                            className="min-w-0 flex-1"
                          >
                            <Link
                              to="/chat/$threadId"
                              params={{ threadId: thread.id }}
                              title={thread.title || "Untitled"}
                              onClick={() => setManagingThreadId(null)}
                            >
                              <span className="block truncate">
                                {thread.title || "Untitled"}
                              </span>
                            </Link>
                          </SidebarMenuButton>

                          <button
                            type="button"
                            aria-label={`Chat options: ${thread.title || "Untitled"}`}
                            title="Chat options"
                            aria-expanded={managingThreadId === thread.id}
                            onClick={() =>
                              setManagingThreadId((current) =>
                                current === thread.id ? null : thread.id,
                              )
                            }
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </div>

                        {managingThreadId === thread.id && (
                          <div className="mx-1 mt-1 rounded-md border border-sidebar-border bg-sidebar-accent/30 p-2">
                            <p className="mb-2 text-xs text-sidebar-foreground/70">
                              Delete this conversation?
                            </p>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={deleteM.isPending}
                                onClick={() => setManagingThreadId(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={deleteM.isPending}
                                onClick={() => deleteM.mutate(thread.id)}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                {deleteM.isPending
                                  ? "Deleting…"
                                  : "Confirm delete"}
                              </Button>
                            </div>
                          </div>
                        )}
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

        {tab === "settings" && (
          <div className="p-4 text-sm text-muted-foreground">
            <p>Account settings</p>
            <p className="mt-2">
              View your account information and security details.
            </p>
            <Link
              to="/chat/settings"
              className="mt-3 inline-block underline underline-offset-4"
            >
              Open Settings page
            </Link>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <Button
          variant="ghost"
          onClick={signOut}
          disabled={signingOut}
          className="justify-start text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
                            }
