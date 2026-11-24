import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "framer-motion";
import "./styles.css";
import { AppProvider, useApp, useRoute, go } from "./state";
import { Toasts } from "./components/UI";
import { Landing } from "./pages/Landing";
import { Hall } from "./pages/Hall";
import { RoomPage } from "./pages/Room";
import { BlackjackPage } from "./pages/Blackjack";
import { SlotsPage } from "./pages/Slots";
import { ProfilePage } from "./pages/Profile";
import { RulesPage } from "./pages/Rules";
import { useEffect } from "react";

function Router() {
  const { user, loading, prefs } = useApp();
  const r = useRoute();

  // un lien d'invitation est mémorisé pendant la connexion
  useEffect(() => {
    if (r[0] === "join" && r[1]) {
      try {
        sessionStorage.setItem("vc_join", r[1]);
      } catch {
        /* ignoré */
      }
    }
  }, [r]);
  useEffect(() => {
    if (!user) return;
    let code: string | null = null;
    try {
      code = sessionStorage.getItem("vc_join");
      sessionStorage.removeItem("vc_join");
    } catch {
      /* ignoré */
    }
    if (code) go("room/" + code + "/join");
  }, [user]);

  let page;
  if (loading) page = <div className="grid min-h-dvh place-items-center text-gold/70">Ouverture des portes…</div>;
  else if (r[0] === "rules") page = <RulesPage />;
  else if (!user) page = <Landing />;
  else if (r[0] === "room" && r[1]) page = <RoomPage code={r[1].toUpperCase()} autoJoin={r[2] === "join"} />;
  else if (r[0] === "blackjack") page = <BlackjackPage />;
  else if (r[0] === "slots") page = <SlotsPage machineId={r[1]} />;
  else if (r[0] === "profile" || r[0] === "stats") page = <ProfilePage />;
  else page = <Hall />;

  return (
    <MotionConfig reducedMotion={prefs.lowPower || prefs.reducedFx ? "always" : "user"}>
      {page}
      <Toasts />
    </MotionConfig>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <Router />
    </AppProvider>
  </StrictMode>,
);
