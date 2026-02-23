import EndpointPageClient from "./endpoint/EndpointPageClient";
import { getMachineId } from "@/shared/utils/machine";

export default async function DashboardPage() {
  const machineId = await getMachineId();
  return <EndpointPageClient machineId={machineId} />;
}
