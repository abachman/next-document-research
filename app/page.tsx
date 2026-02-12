import { Workspace } from "@/components/workspace";
import { getWorkspaceSnapshot } from "@/lib/server/workspace";

export default async function Home() {
  const snapshot = await getWorkspaceSnapshot();
  return (
    <main>
      <Workspace initialSnapshot={snapshot} />
    </main>
  );
}
