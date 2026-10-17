import { AppShell } from "@/components/hm/app-shell";
import { brandFont, handFont } from "@/components/hm/fonts";

export default function UiLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${brandFont.variable} ${handFont.variable} h-full`}>
      <AppShell>{children}</AppShell>
    </div>
  );
}
