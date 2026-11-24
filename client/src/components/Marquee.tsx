import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "../state";

/**
 * Logo VIRTUAL CASINO encadré d'ampoules de chapiteau.
 * À l'ouverture, les ampoules s'allument une à une (le moment d'entrée),
 * puis une lente vague de lumière parcourt le cadre.
 */
export function Marquee({ compact = false }: { compact?: boolean }) {
  const { prefs } = useApp();
  const fx = !(prefs.lowPower || prefs.reducedFx);
  const perSide = compact ? 14 : 22;
  const total = perSide * 2 + 8;
  const [lit, setLit] = useState(fx ? 0 : total);
  const [wave, setWave] = useState(-1);

  useEffect(() => {
    if (!fx) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setLit(i);
      if (i >= total) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [fx, total]);

  useEffect(() => {
    if (!fx || lit < total) return;
    let w = 0;
    const id = setInterval(() => setWave((w = (w + 1) % total)), 90);
    return () => clearInterval(id);
  }, [fx, lit, total]);

  // ordre des ampoules : haut (gauche→droite), droite, bas (droite→gauche), gauche
  const idx = (n: number) => n;
  const on = (n: number) => n < lit && !(wave >= 0 && (n === wave || n === (wave + total / 2) % total));
  const top = Array.from({ length: perSide }, (_, i) => idx(i));
  const right = Array.from({ length: 4 }, (_, i) => perSide + i);
  const bottom = Array.from({ length: perSide }, (_, i) => perSide + 4 + i).reverse();
  const left = Array.from({ length: 4 }, (_, i) => perSide * 2 + 4 + i).reverse();

  return (
    <div className="relative mx-auto w-fit" role="img" aria-label="VIRTUAL CASINO">
      <div className={`relative rounded-[14px] border-2 border-gold/70 bg-gradient-to-b from-[#1a1407] to-black ${compact ? "px-8 py-5" : "px-10 py-8 sm:px-16 sm:py-10"}`}>
        <div className="absolute inset-x-3 top-1.5 flex justify-between">{top.map((n) => <span key={n} className={`bulb ${on(n) ? "on" : ""}`} />)}</div>
        <div className="absolute inset-x-3 bottom-1.5 flex justify-between">{bottom.map((n) => <span key={n} className={`bulb ${on(n) ? "on" : ""}`} />)}</div>
        <div className="absolute inset-y-6 right-1.5 flex flex-col justify-between">{right.map((n) => <span key={n} className={`bulb ${on(n) ? "on" : ""}`} />)}</div>
        <div className="absolute inset-y-6 left-1.5 flex flex-col justify-between">{left.map((n) => <span key={n} className={`bulb ${on(n) ? "on" : ""}`} />)}</div>
        <motion.div
          className="text-center leading-[0.95]"
          initial={fx ? { opacity: 0, letterSpacing: "0.3em" } : false}
          animate={{ opacity: 1, letterSpacing: "0.04em" }}
          transition={{ duration: 1.4, delay: 0.5, ease: "easeOut" }}
        >
          <div className={`font-marquee text-gold-pale/80 ${compact ? "text-lg" : "text-2xl sm:text-3xl"}`} style={{ textShadow: "0 0 18px rgba(217,180,90,.35)" }}>
            Virtual
          </div>
          <div
            className={`font-marquee ${compact ? "text-4xl" : "text-6xl sm:text-8xl"}`}
            style={{
              background: "linear-gradient(180deg,#fff4cf 0%,#e8c46c 45%,#a87d2a 100%)",
              WebkitBackgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 0 22px rgba(217,180,90,.35))",
            }}
          >
            Casino
          </div>
        </motion.div>
      </div>
    </div>
  );
}
