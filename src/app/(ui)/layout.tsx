import { AppShell } from "@/components/hm/app-shell";
import { displayFont, handFont } from "@/components/hm/fonts";

export default function UiLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={`${displayFont.variable} ${handFont.variable} h-full`}>
      <AppShell>{children}</AppShell>
    </div>
  );
}
