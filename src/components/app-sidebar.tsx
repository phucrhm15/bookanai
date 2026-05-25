import { Link, useRouterState } from "@tanstack/react-router";
import { Store, Sparkles, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { AuthControls, AuthSidebarHint } from "@/components/auth-controls";
import { useTranslation } from "@/lib/i18n/locale-context";
import { WalletBalanceDisplay } from "@/components/wallet-balance-display";

export function AppSidebar() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { title: t("nav.marketplace"), url: "/marketplace", icon: Store },
    { title: t("nav.studio"), url: "/studio", icon: Sparkles },
    { title: t("nav.wallet"), url: "/wallet", icon: Wallet },
  ];
  const isActive = (url: string) => pathname === url || pathname.startsWith(`${url}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/marketplace" className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-neon text-neon-foreground font-bold text-lg shadow-neon">
            N
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="font-display text-sm font-bold tracking-wide">
              NANO<span className="text-gradient-neon">.AGENT</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {t("nav.web3Studio")}
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.2em]">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    className="data-[active=true]:bg-gradient-neon data-[active=true]:text-neon-foreground data-[active=true]:shadow-neon"
                  >
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <WalletBalanceDisplay variant="sidebar" />
        <AuthSidebarHint />
        <AuthControls variant="sidebar" />
        <div className="px-2 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground group-data-[collapsible=icon]:hidden">
          <span className="text-success">●</span> {t("nav.circleMainnet")}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
