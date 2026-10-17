import { brandFont, handFont } from "@/components/hm/fonts";

/** Brand fonts for both the website (/) and the app (/app). The app shell lives in app/layout.tsx. */
export default function UiLayout({ children }: LayoutProps<"/">) {
  return <div className={`${brandFont.variable} ${handFont.variable} h-full`}>{children}</div>;
}
