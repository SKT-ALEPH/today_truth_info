import { connection } from "next/server";
import { Dashboard } from "@/components/dashboard";
import { getBoardSnapshot } from "@/lib/database";

export default async function Home() {
  await connection();
  const initialSnapshot = await getBoardSnapshot().catch(() => ({
    configured: true,
    sealed: false,
    readings: [],
    error: "storage_unavailable",
  }));
  return <Dashboard initialSnapshot={initialSnapshot} />;
}
