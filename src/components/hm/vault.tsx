"use client";

import dynamic from "next/dynamic";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ScopeTree } from "./scope-tree";
import { Inspector } from "./inspector";

const MemoryEditor = dynamic(() => import("./memory-editor").then((m) => m.MemoryEditor), {
  ssr: false,
  loading: () => <div className="h-full bg-bg" />,
});

export function Vault() {
  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize="18%" minSize="12%">
        <ScopeTree />
      </Panel>
      <Separator className="hm-sep" />
      <Panel defaultSize="57%" minSize="30%">
        <MemoryEditor />
      </Panel>
      <Separator className="hm-sep" />
      <Panel defaultSize="25%" minSize="18%">
        <Inspector />
      </Panel>
    </Group>
  );
}
