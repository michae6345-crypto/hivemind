import { AppShell } from "@/components/hm/app-shell";

export default function UiLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
