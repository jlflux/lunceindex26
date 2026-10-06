import HomeEditor from "@/components/admin/HomeEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Front page" };

/**
 * The editor loads its own document over the API rather than being handed one
 * here, because everything on this screen is edited in the browser and sent
 * back whole. A server-resolved copy would be a second source of truth with
 * nothing to add — and the bracket has already shown what that costs.
 */
export default function AdminHomePage() {
  return <HomeEditor />;
}
