import { activeTenant } from "./tenants/registry";

type RouteLoadingScreenProps = {
  source?: "boundary" | "link";
};

export function RouteLoadingScreen({
  source = "boundary",
}: RouteLoadingScreenProps) {
  const liveDeployment =
    activeTenant.activation.status === "active" &&
    activeTenant.activation.publicBookingEnabled &&
    !activeTenant.activation.provisional;

  return (
    <div
      className="route-loading-screen"
      data-loading-source={source}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="route-loading-card">
        <div className="route-loading-court" aria-hidden="true">
          <span className="route-loading-court-line" />
          <span className="route-loading-ball-wrap">
            <span className="route-loading-ball" />
          </span>
          <span className="route-loading-shadow" />
        </div>
        <p>{activeTenant.identity.name} · {liveDeployment ? "Live booking" : "Setup preview"}</p>
        <strong>{liveDeployment ? "Loading live court availability…" : "Loading the venue preview…"}</strong>
        <span>{liveDeployment ? "Checking courts, rates, and open times." : "Details are still being configured."}</span>
      </div>
    </div>
  );
}
